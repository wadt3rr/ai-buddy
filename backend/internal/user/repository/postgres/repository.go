package postgres

import (
	"context"
	"errors"
	"fmt"
	"uuid"

	"github.com/wadt3rr/ai-buddy/internal/user"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{
		pool: pool,
	}
}

func (r *Repository) Create(ctx context.Context, u *user.User) error {
	const query = `
		INSERT INTO users (email, password_hash, team_role)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at
	`

	err := r.pool.QueryRow(
		ctx,
		query,
		u.Email,
		u.PasswordHash,
		u.TeamRole,
	).Scan(
		&u.ID,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}

	return nil
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*user.User, error) {
	const query = `
		SELECT id, email, password_hash, team_role, created_at, updated_at
		FROM users
		WHERE email = $1
	`

	var u user.User

	err := r.pool.QueryRow(ctx, query, email).Scan(
		&u.ID,
		&u.Email,
		&u.PasswordHash,
		&u.TeamRole,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, user.ErrUserNotFound
		}

		return nil, fmt.Errorf("get user by email: %w", err)
	}

	return &u, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*user.User, error) {
	const query = `
		SELECT id, email, password_hash, team_role, created_at, updated_at
		FROM users
		WHERE id = $1
	`

	var u user.User

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&u.ID,
		&u.Email,
		&u.PasswordHash,
		&u.TeamRole,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, user.ErrUserNotFound
		}

		return nil, fmt.Errorf("get user by id: %w", err)
	}

	return &u, nil
}
