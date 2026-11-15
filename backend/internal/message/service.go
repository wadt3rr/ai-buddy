package message

import (
	"context"
	"fmt"
	"strings"
	"uuid"

	"github.com/wadt3rr/ai-buddy/internal/assistant"
	"github.com/wadt3rr/ai-buddy/internal/user"
)

const (
	DefaultPageSize = 50
	MaxPageSize     = 100
	MaxContentSize  = 10000
	AIContextSize   = 20
)

type Repository interface {
	Create(ctx context.Context, message *Message) error
	List(ctx context.Context, userID uuid.UUID, beforeID *uuid.UUID, limit int) ([]Message, error)
}

type UserProvider interface {
	GetByID(ctx context.Context, id uuid.UUID) (*user.User, error)
}

type Service struct {
	repo      Repository
	users     UserProvider
	assistant assistant.Client
}

func NewService(
	repo Repository,
	users UserProvider,
	assistantClient assistant.Client,
) *Service {
	return &Service{
		repo:      repo,
		users:     users,
		assistant: assistantClient,
	}
}

type SendResult struct {
	UserMessage      *Message
	AssistantMessage *Message
}

func (s *Service) Create(
	ctx context.Context,
	userID uuid.UUID,
	content string,
) (*Message, error) {
	content = strings.TrimSpace(content)

	if content == "" {
		return nil, ErrEmptyContent
	}

	if len(content) > MaxContentSize {
		return nil, ErrContentTooLong
	}

	msg := &Message{
		UserID:  userID,
		Role:    RoleUser,
		Content: content,
	}

	if err := s.repo.Create(ctx, msg); err != nil {
		return nil, fmt.Errorf("create message: %w", err)
	}

	return msg, nil
}

func (s *Service) SendMessage(
	ctx context.Context,
	userID uuid.UUID,
	content string,
) (*SendResult, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	userMessage, err := s.Create(ctx, userID, content)
	if err != nil {
		return nil, err
	}

	result := &SendResult{
		UserMessage: userMessage,
	}

	history, err := s.repo.List(ctx, userID, nil, AIContextSize)
	if err != nil {
		return result, fmt.Errorf("load AI context: %w", err)
	}

	// Repository returns newest messages first.
	// AI receives them in chronological order.
	aiMessages := make([]assistant.Message, 0, len(history))

	for i := len(history) - 1; i >= 0; i-- {
		aiMessages = append(aiMessages, assistant.Message{
			Role:    string(history[i].Role),
			Content: history[i].Content,
		})
	}

	aiResponse, err := s.assistant.Generate(ctx, assistant.Request{
		RequestID: uuid.New(),
		UserID:    userID,
		TeamRole:  u.TeamRole,
		Messages:  aiMessages,
	})
	if err != nil {
		return result, fmt.Errorf("generate assistant response: %w", err)
	}

	if aiResponse == nil || strings.TrimSpace(aiResponse.Content) == "" {
		return result, ErrEmptyAssistantResponse
	}

	assistantMessage := &Message{
		UserID:  userID,
		Role:    RoleAssistant,
		Content: strings.TrimSpace(aiResponse.Content),
	}

	if err := s.repo.Create(ctx, assistantMessage); err != nil {
		return result, fmt.Errorf("save assistant response: %w", err)
	}

	result.AssistantMessage = assistantMessage

	return result, nil
}

func (s *Service) List(
	ctx context.Context,
	userID uuid.UUID,
	beforeID *uuid.UUID,
	limit int,
) ([]Message, bool, error) {
	if limit == 0 {
		limit = DefaultPageSize
	}

	if limit < 1 || limit > MaxPageSize {
		return nil, false, ErrInvalidLimit
	}

	messages, err := s.repo.List(ctx, userID, beforeID, limit+1)
	if err != nil {
		return nil, false, fmt.Errorf("list messages: %w", err)
	}

	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}

	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, hasMore, nil
}
