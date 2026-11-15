package message

import (
	"time"
	"uuid"
)

type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
)

type Message struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Role      Role
	Content   string
	CreatedAt time.Time
}
