package assistant

import (
	"context"
	"fmt"
)

type MockClient struct{}

func NewMockClient() *MockClient {
	return &MockClient{}
}

func (c *MockClient) Generate(
	ctx context.Context,
	req Request,
) (*Response, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	if len(req.Messages) == 0 {
		return nil, fmt.Errorf("messages are required")
	}

	return &Response{
		Content: "Тестовый ответ AI. Сообщение получено, роль пользователя: " + req.TeamRole,
	}, nil
}

var _ Client = (*MockClient)(nil)
