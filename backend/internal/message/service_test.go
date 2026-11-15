package message

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	"uuid"

	"github.com/wadt3rr/ai-buddy/internal/assistant"
	"github.com/wadt3rr/ai-buddy/internal/user"
)

type messageRepositoryStub struct {
	created    []*Message
	listed     []Message
	createErr  error
	listErr    error
	listLimit  int
	listUserID uuid.UUID
	listBefore *uuid.UUID
}

func (r *messageRepositoryStub) Create(_ context.Context, msg *Message) error {
	if r.createErr != nil {
		return r.createErr
	}
	msg.ID = uuid.New()
	msg.CreatedAt = time.Now().UTC()
	r.created = append(r.created, msg)
	return nil
}

func (r *messageRepositoryStub) List(_ context.Context, userID uuid.UUID, beforeID *uuid.UUID, limit int) ([]Message, error) {
	r.listLimit = limit
	r.listUserID = userID
	r.listBefore = beforeID
	if r.listErr != nil {
		return nil, r.listErr
	}
	if len(r.listed) > limit {
		return append([]Message(nil), r.listed[:limit]...), nil
	}
	return append([]Message(nil), r.listed...), nil
}

type userProviderStub struct {
	user *user.User
	err  error
}

func (p userProviderStub) GetByID(context.Context, uuid.UUID) (*user.User, error) {
	return p.user, p.err
}

type assistantClientStub struct {
	response *assistant.Response
	err      error
	request  assistant.Request
	calls    int
}

func (c *assistantClientStub) Generate(_ context.Context, req assistant.Request) (*assistant.Response, error) {
	c.calls++
	c.request = req
	return c.response, c.err
}

func TestServiceCreate(t *testing.T) {
	userID := uuid.New()
	repo := &messageRepositoryStub{}
	service := NewService(repo, userProviderStub{}, &assistantClientStub{})

	msg, err := service.Create(context.Background(), userID, "  hello  ")
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if msg.Content != "hello" || msg.Role != RoleUser || msg.UserID != userID {
		t.Fatalf("unexpected message: %+v", msg)
	}

	for _, content := range []string{"", " \n\t "} {
		if _, err := service.Create(context.Background(), userID, content); !errors.Is(err, ErrEmptyContent) {
			t.Errorf("Create(%q) error = %v, want ErrEmptyContent", content, err)
		}
	}

	if _, err := service.Create(context.Background(), userID, strings.Repeat("a", MaxContentSize+1)); !errors.Is(err, ErrContentTooLong) {
		t.Fatalf("oversized content error = %v, want ErrContentTooLong", err)
	}
}

func TestServiceListPaginationAndOrder(t *testing.T) {
	userID := uuid.New()
	oldest := Message{ID: uuid.New(), Content: "old"}
	middle := Message{ID: uuid.New(), Content: "middle"}
	newest := Message{ID: uuid.New(), Content: "new"}
	repo := &messageRepositoryStub{listed: []Message{newest, middle, oldest}}
	service := NewService(repo, userProviderStub{}, &assistantClientStub{})

	got, hasMore, err := service.List(context.Background(), userID, nil, 2)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !hasMore || len(got) != 2 {
		t.Fatalf("List() returned %d messages, hasMore=%v", len(got), hasMore)
	}
	if got[0].Content != "middle" || got[1].Content != "new" {
		t.Fatalf("messages are not chronological: %+v", got)
	}
	if repo.listLimit != 3 || repo.listUserID != userID {
		t.Fatalf("repository called with limit=%d userID=%s", repo.listLimit, repo.listUserID)
	}
}

func TestServiceListRejectsInvalidLimit(t *testing.T) {
	service := NewService(&messageRepositoryStub{}, userProviderStub{}, &assistantClientStub{})
	for _, limit := range []int{-1, MaxPageSize + 1} {
		if _, _, err := service.List(context.Background(), uuid.New(), nil, limit); !errors.Is(err, ErrInvalidLimit) {
			t.Errorf("List(limit=%d) error = %v, want ErrInvalidLimit", limit, err)
		}
	}
}

func TestServiceSendMessage(t *testing.T) {
	userID := uuid.New()
	createdAt := time.Now().UTC()
	repo := &messageRepositoryStub{
		listed: []Message{
			{ID: uuid.New(), Role: RoleUser, Content: "question", CreatedAt: createdAt.Add(time.Minute)},
			{ID: uuid.New(), Role: RoleAssistant, Content: "previous answer", CreatedAt: createdAt},
			{ID: uuid.New(), Role: RoleUser, Content: "previous question", CreatedAt: createdAt.Add(-time.Minute)},
		},
	}
	ai := &assistantClientStub{response: &assistant.Response{Content: "  answer  "}}
	service := NewService(repo, userProviderStub{user: &user.User{TeamRole: "intern"}}, ai)

	result, err := service.SendMessage(context.Background(), userID, "question")
	if err != nil {
		t.Fatalf("SendMessage() error = %v", err)
	}
	if result.UserMessage == nil || result.AssistantMessage == nil {
		t.Fatalf("expected both messages, got %+v", result)
	}
	if result.UserMessage.Role != RoleUser || result.AssistantMessage.Role != RoleAssistant {
		t.Fatalf("unexpected message roles: %+v", result)
	}
	if result.AssistantMessage.Content != "answer" {
		t.Fatalf("assistant content = %q", result.AssistantMessage.Content)
	}
	if len(repo.created) != 2 {
		t.Fatalf("created %d messages, want 2", len(repo.created))
	}
	if ai.calls != 1 || ai.request.UserID != userID || ai.request.TeamRole != "intern" {
		t.Fatalf("unexpected AI request: %+v", ai.request)
	}
	if len(ai.request.Messages) != 3 || ai.request.Messages[0].Content != "previous question" || ai.request.Messages[2].Content != "question" {
		t.Fatalf("AI context has unexpected order/content: %+v", ai.request.Messages)
	}
}

func TestServiceSendMessagePreservesUserMessageWhenAIFails(t *testing.T) {
	userID := uuid.New()
	repo := &messageRepositoryStub{}
	ai := &assistantClientStub{err: errors.New("AI unavailable")}
	service := NewService(repo, userProviderStub{user: &user.User{TeamRole: "intern"}}, ai)

	result, err := service.SendMessage(context.Background(), userID, "question")
	if err == nil {
		t.Fatal("expected AI error")
	}
	if result == nil || result.UserMessage == nil {
		t.Fatalf("user message should remain persisted: %+v", result)
	}
	if result.AssistantMessage != nil || len(repo.created) != 1 {
		t.Fatalf("unexpected result after AI failure: %+v, created=%d", result, len(repo.created))
	}
}

func TestServiceSendMessageRejectsEmptyAIResponse(t *testing.T) {
	repo := &messageRepositoryStub{}
	ai := &assistantClientStub{response: &assistant.Response{Content: "  "}}
	service := NewService(repo, userProviderStub{user: &user.User{TeamRole: "intern"}}, ai)

	result, err := service.SendMessage(context.Background(), uuid.New(), "question")
	if !errors.Is(err, ErrEmptyAssistantResponse) {
		t.Fatalf("error = %v, want ErrEmptyAssistantResponse", err)
	}
	if result == nil || result.UserMessage == nil || len(repo.created) != 1 {
		t.Fatal("user message should be preserved when AI response is empty")
	}
}

func TestServiceSendMessageDoesNotCallAIWhenUserLookupFails(t *testing.T) {
	repo := &messageRepositoryStub{}
	ai := &assistantClientStub{response: &assistant.Response{Content: "answer"}}
	service := NewService(repo, userProviderStub{err: user.ErrUserNotFound}, ai)

	result, err := service.SendMessage(context.Background(), uuid.New(), "question")
	if err == nil || result != nil {
		t.Fatalf("expected user lookup failure, result=%+v err=%v", result, err)
	}
	if ai.calls != 0 || len(repo.created) != 0 {
		t.Fatal("AI and message repository must not be called when user lookup fails")
	}
}
