package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
	"uuid"

	"github.com/wadt3rr/ai-buddy/internal/assistant"
	"github.com/wadt3rr/ai-buddy/internal/auth"
	db "github.com/wadt3rr/ai-buddy/internal/infrastructure/postgres"
	"github.com/wadt3rr/ai-buddy/internal/message"
	mp "github.com/wadt3rr/ai-buddy/internal/message/repository/postgres"
	transport "github.com/wadt3rr/ai-buddy/internal/transport/http"
	"github.com/wadt3rr/ai-buddy/internal/transport/http/handlers"
	"github.com/wadt3rr/ai-buddy/internal/user"
	up "github.com/wadt3rr/ai-buddy/internal/user/repository/postgres"
)

// Real PostgreSQL and real Python service; set TEST_DATABASE_URL and AI_SERVICE_URL.
// Skipping without infrastructure is explicit; do not count that as an integration pass.
func TestDatabaseAndAuthenticatedAPI(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL required")
	}
	ctx := context.Background()
	pool, err := db.NewPool(ctx, dsn, 3)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ur := up.NewRepository(pool)
	users := user.NewService(ur)
	email := uuid.New().String() + "@test.example"
	u, err := users.Create(ctx, email, "long-test-password", "intern")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, "DELETE FROM users WHERE id=$1", u.ID)
	if err := ur.Create(ctx, u); err == nil {
		t.Fatal("duplicate email accepted")
	}
	got, err := ur.GetByID(ctx, u.ID)
	if err != nil || got.Email != email {
		t.Fatalf("lookup %v %v", got, err)
	}
	if _, err := ur.GetByID(ctx, uuid.New()); !errors.Is(err, user.ErrUserNotFound) {
		t.Fatal(err)
	}
	if _, err := ur.GetByEmail(ctx, "missing@test.example"); !errors.Is(err, user.ErrUserNotFound) {
		t.Fatal(err)
	}
	mr := mp.NewRepository(pool)
	msg := &message.Message{UserID: u.ID, Role: message.RoleUser, Content: "q"}
	if err := mr.Create(ctx, msg); err != nil {
		t.Fatal(err)
	}
	items, err := mr.List(ctx, u.ID, nil, 10)
	if err != nil || len(items) != 1 {
		t.Fatalf("list: %v %v", items, err)
	}
	items, err = mr.List(ctx, u.ID, &msg.ID, 10)
	if err != nil || len(items) != 0 {
		t.Fatalf("cursor: %v %v", items, err)
	}
	bad := uuid.New()
	if _, err := mr.List(ctx, u.ID, &bad, 10); !errors.Is(err, message.ErrCursorNotFound) {
		t.Fatal(err)
	}
	if foreign, err := mr.List(ctx, uuid.New(), nil, 10); err != nil || len(foreign) != 0 {
		t.Fatal("user isolation failed")
	}
	if err := mr.Create(ctx, &message.Message{UserID: uuid.New(), Role: message.RoleUser, Content: "bad"}); err == nil {
		t.Fatal("foreign key accepted")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := ur.GetByID(cancelled, u.ID); err == nil {
		t.Fatal("cancel ignored")
	}
	if _, err := ur.GetByEmail(cancelled, email); err == nil {
		t.Fatal("cancel ignored")
	}
	if _, err := mr.List(cancelled, u.ID, nil, 10); err == nil {
		t.Fatal("cancel ignored")
	}

	base := os.Getenv("AI_SERVICE_URL")
	if base == "" {
		t.Fatal("AI_SERVICE_URL required for integration")
	}
	ai, err := assistant.NewHTTPClient(base, os.Getenv("AI_SERVICE_TOKEN"), 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	jwt, _ := auth.NewJWTService("integration-secret-32-bytes-at-least", time.Hour)
	ms := message.NewService(mr, users, ai)
	router := transport.NewRouter(handlers.NewAuthHandler(users, jwt), handlers.NewUserHandler(users), handlers.NewMessageHandler(ms), auth.NewMiddleware(jwt), handlers.NewAIHandler(ai, users))
	token, _ := jwt.Generate(u.ID)
	call := func(method, path, body, authToken string, want int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if authToken != "" {
			r.Header.Set("Authorization", "Bearer "+authToken)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s status=%d want=%d body=%s", method, path, w.Code, want, w.Body.String())
		}
		return w
	}
	call("GET", "/health", "", "", 200)
	call("GET", "/api/v1/users/me", "", "", 401)
	call("GET", "/api/v1/users/me", "", token, 200)
	call("POST", "/api/v1/auth/login", `{"email":"`+email+`","password":"long-test-password"}`, "", 200)
	for _, badBody := range []string{`{`, `{}`, `{"email":"x","password":"y","role":"mentor"}`, `{} {}`} {
		call("POST", "/api/v1/auth/login", badBody, "", 400)
	}
	call("POST", "/api/v1/auth/login", `{"email":"`+email+`","password":"wrong"}`, "", 401)
	call("POST", "/api/v1/auth/login", `{"email":"`+strings.Repeat("x", 1<<20)+`"}`, "", 413)
	w := call("POST", "/api/v1/messages", `{"content":"Не запускается listing-search: Python"}`, token, 201)
	var response map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(fmt.Sprint(response["assistant_message"]), "Решено") {
		t.Fatal("missing AI result")
	}
	call("GET", "/api/v1/messages?limit=1", "", token, 200)
	call("GET", "/api/v1/ai/tickets", "", token, 200)
	call("GET", "/api/v1/ai/sources/listing-readme", "", token, 200)
	call("GET", "/api/v1/ai/sources/notifications-private", "", token, 404)
	ghostToken, _ := jwt.Generate(uuid.New())
	call("GET", "/api/v1/users/me", "", ghostToken, 404)
	call("GET", "/api/v1/ai/sources/listing-readme", "", ghostToken, 403)

	// Infrastructure errors are observable, rather than being silently converted to success.
	pool.Close()
	call("POST", "/api/v1/auth/login", `{"email":"x","password":"y"}`, "", 500)
	call("GET", "/api/v1/users/me", "", token, 500)
}

func TestInvalidPoolConfiguration(t *testing.T) {
	if _, err := db.NewPool(context.Background(), "://bad", 1); err == nil {
		t.Fatal("bad DSN accepted")
	}
	if _, err := db.NewPool(context.Background(), "postgres://localhost/postgres", 0); err == nil {
		t.Fatal("bad size accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := db.NewPool(ctx, "postgres://localhost:1/postgres", 1); err == nil {
		t.Fatal("unreachable DB accepted")
	}
}
