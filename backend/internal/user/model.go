package user

import (
	"time"
	"uuid"
)

type User struct {
	ID           uuid.UUID
	Email        string
	PasswordHash string
	TeamRole     string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
