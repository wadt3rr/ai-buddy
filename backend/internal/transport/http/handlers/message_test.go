package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"uuid"

	"github.com/wadt3rr/ai-buddy/internal/assistant"
	"github.com/wadt3rr/ai-buddy/internal/auth"
	"github.com/wadt3rr/ai-buddy/internal/message"
	"github.com/wadt3rr/ai-buddy/internal/user"
)

type handlerMessageRepository struct {
	created []*message.Message
	listed  []message.Message
	err     error
}

func (r *handlerMessageRepository) Create(_ context.Context, msg *message.Message) error {
	if r.err != nil {
		return r.err
	}
	msg.ID = uuid.New()
	msg.CreatedAt = time.Now().UTC()
	r.created = append(r.created, msg)
	return nil
}

func (r *handlerMessageRepository) List(_ context.Context, _ uuid.UUID, _ *uuid.UUID, _ int) ([]message.Message, error) {
	if r.err != nil {
		return nil, r.err
	}
	return r.listed, nil
}

type handlerUserProvider struct{}

func (handlerUserProvider) GetByID(context.Context, uuid.UUID) (*user.User, error) {
	return &user.User{TeamRole: "intern"}, nil
}

type handlerAssistant struct {
	response *assistant.Response
	err      error
}

func (a handlerAssistant) Generate(context.Context, assistant.Request) (*assistant.Response, error) {
	return a.response, a.err
}

func newMessageHandlerForTest(repo *handlerMessageRepository, ai assistant.Client) *MessageHandler {
	service := message.NewService(repo, handlerUserProvider{}, ai)
	return NewMessageHandler(service)
}

func TestMessageHandlerCreate(t *testing.T) {
	userID := uuid.New()
	repo := &handlerMessageRepository{}
	handler := newMessageHandlerForTest(repo, handlerAssistant{response: &assistant.Response{Content: "answer"}})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/messages", strings.NewReader(`{"content":"question"}`))
	req = req.WithContext(auth.ContextWithUserID(req.Context(), userID))
	rec := httptest.NewRecorder()
	handler.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		UserMessage      messageResponse `json:"user_message"`
		AssistantMessage messageResponse `json:"assistant_message"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.UserMessage.Role != string(message.RoleUser) || body.AssistantMessage.Role != string(message.RoleAssistant) {
		t.Fatalf("unexpected roles: %+v", body)
	}
	if len(repo.created) != 2 || repo.created[0].UserID != userID || repo.created[0].Role != message.RoleUser {
		t.Fatalf("unexpected persisted messages: %+v", repo.created)
	}
}

func TestMessageHandlerCreateRejectsClientSuppliedRole(t *testing.T) {
	repo := &handlerMessageRepository{}
	handler := newMessageHandlerForTest(repo, handlerAssistant{response: &assistant.Response{Content: "answer"}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/messages", strings.NewReader(`{"content":"question","role":"assistant"}`))
	req = req.WithContext(auth.ContextWithUserID(req.Context(), uuid.New()))
	rec := httptest.NewRecorder()
	handler.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if len(repo.created) != 0 {
		t.Fatal("message must not be persisted when client supplies role")
	}
}

func TestMessageHandlerCreateRequiresAuthentication(t *testing.T) {
	repo := &handlerMessageRepository{}
	handler := newMessageHandlerForTest(repo, handlerAssistant{response: &assistant.Response{Content: "answer"}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/messages", strings.NewReader(`{"content":"question"}`))
	rec := httptest.NewRecorder()
	handler.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
	if len(repo.created) != 0 {
		t.Fatal("unauthenticated request must not create a message")
	}
}

func TestMessageHandlerCreateReturnsSavedMessageWhenAIUnavailable(t *testing.T) {
	repo := &handlerMessageRepository{}
	handler := newMessageHandlerForTest(repo, handlerAssistant{err: errors.New("AI unavailable")})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/messages", strings.NewReader(`{"content":"question"}`))
	req = req.WithContext(auth.ContextWithUserID(req.Context(), uuid.New()))
	rec := httptest.NewRecorder()
	handler.Create(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadGateway, rec.Body.String())
	}
	if len(repo.created) != 1 || repo.created[0].Role != message.RoleUser {
		t.Fatalf("user message should be saved despite AI failure: %+v", repo.created)
	}
}
