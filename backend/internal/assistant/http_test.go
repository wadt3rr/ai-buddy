package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"uuid"
)

func TestHTTPClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Error("missing internal auth")
		}
		switch r.URL.Path {
		case "/generate":
			var req Request
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TeamRole != "intern" {
				t.Error("invalid request")
			}
			_, _ = w.Write([]byte(`{"content":"answer","status":"Решено"}`))
		case "/sources/readme":
			if r.URL.Query().Get("team_role") != "mentor" {
				t.Error("role not forwarded")
			}
			_, _ = w.Write([]byte("source"))
		case "/tickets/user":
			_, _ = w.Write([]byte(`{"tickets":[]}`))
		default:
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	client, err := NewHTTPClient(server.URL, "secret", time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{RequestID: uuid.New(), UserID: uuid.New(), TeamRole: "intern", Messages: []Message{{"user", "q"}}})
	if err != nil || result.Content != "answer" {
		t.Fatalf("result=%v error=%v", result, err)
	}
	if data, err := client.Source(context.Background(), "readme", "mentor"); err != nil || string(data) != "source" {
		t.Fatal(err)
	}
	if _, err := client.Tickets(context.Background(), "user"); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Source(context.Background(), "missing", "intern"); err == nil {
		t.Fatal("expected HTTP failure")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := client.Generate(ctx, Request{}); err == nil {
		t.Fatal("expected cancellation")
	}
}

func TestInvalidHTTPClient(t *testing.T) {
	for _, raw := range []string{"bad", "ftp://host", "://bad"} {
		if _, err := NewHTTPClient(raw, "token", time.Second); err == nil {
			t.Fatal("accepted invalid URL")
		}
	}
	if _, err := NewHTTPClient("http://host", "", time.Second); err == nil {
		t.Fatal("accepted empty token")
	}
	if _, err := NewHTTPClient("http://host", "token", 0); err == nil {
		t.Fatal("accepted zero timeout")
	}
}

func TestHTTPClientInvalidReplies(t *testing.T) {
	for _, reply := range []string{`not-json`, `{"content":"  "}`, strings.Repeat("x", 1024*1024+1)} {
		t.Run(reply[:8], func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(reply)) }))
			defer s.Close()
			c, _ := NewHTTPClient(s.URL, "token", time.Second)
			if _, err := c.Generate(context.Background(), Request{}); err == nil {
				t.Fatal("accepted invalid reply")
			}
		})
	}
}

func TestMock(t *testing.T) {
	m := NewMockClient()
	if _, err := m.Generate(context.Background(), Request{}); err == nil {
		t.Fatal("accepted no messages")
	}
	if _, err := m.Generate(context.Background(), Request{Messages: []Message{{"user", "hello"}}}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := m.Generate(ctx, Request{}); err == nil {
		t.Fatal("ignored cancellation")
	}
}
