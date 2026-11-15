package postgres

import (
	"context"
	"fmt"
	"uuid"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/wadt3rr/ai-buddy/internal/message"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Create(ctx context.Context, msg *message.Message) error {
	query := `
		INSERT INTO messages (user_id, role, content)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`

	err := r.pool.QueryRow(
		ctx,
		query,
		msg.UserID,
		msg.Role,
		msg.Content,
	).Scan(&msg.ID, &msg.CreatedAt)

	if err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	return nil
}

func (r *Repository) List(
	ctx context.Context,
	userID uuid.UUID,
	beforeID *uuid.UUID,
	limit int,
) ([]message.Message, error) {
	var rows pgx.Rows
	var err error

	if beforeID == nil {
		rows, err = r.pool.Query(ctx, `
			SELECT id, user_id, role, content, created_at
			FROM messages
			WHERE user_id = $1
			ORDER BY created_at DESC, id DESC
			LIMIT $2
		`, userID, limit)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT id, user_id, role, content, created_at
			FROM messages
			WHERE user_id = $1
			  AND (created_at, id) < (
				  SELECT created_at, id
				  FROM messages
				  WHERE id = $2 AND user_id = $1
			  )
			ORDER BY created_at DESC, id DESC
			LIMIT $3
		`, userID, *beforeID, limit)
	}

	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	messages := make([]message.Message, 0, limit)

	for rows.Next() {
		var msg message.Message

		err := rows.Scan(
			&msg.ID,
			&msg.UserID,
			&msg.Role,
			&msg.Content,
			&msg.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}

		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate messages: %w", err)
	}

	if beforeID != nil && len(messages) == 0 {
		var exists bool

		err := r.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM messages
				WHERE id = $1 AND user_id = $2
			)
		`, *beforeID, userID).Scan(&exists)

		if err != nil {
			return nil, fmt.Errorf("check cursor: %w", err)
		}

		if !exists {
			return nil, message.ErrCursorNotFound
		}
	}

	return messages, nil
}

var _ message.Repository = (*Repository)(nil)
