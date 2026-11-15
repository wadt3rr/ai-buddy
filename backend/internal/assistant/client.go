package assistant

import (
	"context"
	"uuid"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Request struct {
	RequestID uuid.UUID `json:"request_id"`
	UserID    uuid.UUID `json:"user_id"`
	TeamRole  string    `json:"team_role"`
	Messages  []Message `json:"messages"`
}

type Response struct {
	Content string `json:"content"`
}

type Client interface {
	Generate(ctx context.Context, req Request) (*Response, error)
}
