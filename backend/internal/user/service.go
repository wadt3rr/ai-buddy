package user

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"uuid"
)

type Repository interface {
	Create(ctx context.Context, u *User) error
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*User, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Create(
	ctx context.Context,
	email string,
	password string,
	teamRole string,
) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	if email == "" || password == "" || teamRole == "" {
		return nil, errors.New("email, password and team role are required")
	}

	if len(password) < 12 {
		return nil, errors.New("password must contain at least 12 characters")
	}

	hash, err := hashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	u := &User{
		Email:        email,
		PasswordHash: hash,
		TeamRole:     teamRole,
	}

	if err := s.repo.Create(ctx, u); err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	return u, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	u, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}

	return u, nil
}

func (s *Service) Authenticate(
	ctx context.Context,
	email string,
	password string,
) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	u, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, ErrInvalidCredentials
		}

		return nil, fmt.Errorf("get user: %w", err)
	}

	if !verifyPassword(password, u.PasswordHash) {
		return nil, ErrInvalidCredentials
	}

	return u, nil
}
