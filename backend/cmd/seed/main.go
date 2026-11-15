package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/wadt3rr/ai-buddy/internal/config"
	dbpostgres "github.com/wadt3rr/ai-buddy/internal/infrastructure/postgres"
	"github.com/wadt3rr/ai-buddy/internal/user"
	userpostgres "github.com/wadt3rr/ai-buddy/internal/user/repository/postgres"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	email := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_EMAIL")))
	password := os.Getenv("SEED_PASSWORD")
	teamRole := strings.TrimSpace(os.Getenv("SEED_TEAM_ROLE"))

	if email == "" || password == "" || teamRole == "" {
		return errors.New("SEED_EMAIL, SEED_PASSWORD and SEED_TEAM_ROLE are required")
	}

	cfg, err := config.Load("config/local.yaml")
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := dbpostgres.NewPool(ctx, databaseURL, cfg.Database.MaxConns)
	if err != nil {
		return fmt.Errorf("create database pool: %w", err)
	}
	defer pool.Close()

	repository := userpostgres.NewRepository(pool)
	userService := user.NewService(repository)

	// Не создаём дубликат, если пользователь уже существует.
	_, err = repository.GetByEmail(ctx, email)
	if err == nil {
		fmt.Printf("user %s already exists\n", email)
		return nil
	}

	if !errors.Is(err, user.ErrUserNotFound) {
		return fmt.Errorf("check existing user: %w", err)
	}

	createdUser, err := userService.Create(ctx, email, password, teamRole)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}

	fmt.Printf("user created: %s (ID: %s)\n", createdUser.Email, createdUser.ID)

	return nil
}
