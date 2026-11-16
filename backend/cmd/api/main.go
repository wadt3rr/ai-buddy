package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/wadt3rr/ai-buddy/internal/assistant"
	"github.com/wadt3rr/ai-buddy/internal/auth"
	"github.com/wadt3rr/ai-buddy/internal/config"
	"github.com/wadt3rr/ai-buddy/internal/infrastructure/postgres"
	"github.com/wadt3rr/ai-buddy/internal/message"
	messagepostgres "github.com/wadt3rr/ai-buddy/internal/message/repository/postgres"
	httptransport "github.com/wadt3rr/ai-buddy/internal/transport/http"
	"github.com/wadt3rr/ai-buddy/internal/transport/http/handlers"
	"github.com/wadt3rr/ai-buddy/internal/user"
	userpostgres "github.com/wadt3rr/ai-buddy/internal/user/repository/postgres"
)

func main() {
	configPath := flag.String(
		"config",
		"config/local.yaml",
		"path to configuration file",
	)
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	dbCtx, dbCancel := context.WithTimeout(
		context.Background(),
		5*time.Second,
	)
	defer dbCancel()

	pool, err := postgres.NewPool(
		dbCtx,
		databaseURL,
		cfg.Database.MaxConns,
	)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	userRepository := userpostgres.NewRepository(pool)
	userService := user.NewService(userRepository)

	messageRepository := messagepostgres.NewRepository(pool)
	aiClient, err := assistant.NewHTTPClient(os.Getenv("AI_SERVICE_URL"), os.Getenv("AI_SERVICE_TOKEN"), 200*time.Second)
	if err != nil {
		log.Fatalf("configure AI service: %v", err)
	}
	messageService := message.NewService(
		messageRepository,
		userService,
		aiClient,
	)
	messageHandler := handlers.NewMessageHandler(messageService)

	jwtService, err := auth.NewJWTService(
		cfg.Auth.JWTSecret,
		cfg.Auth.JWTTTL,
	)
	if err != nil {
		log.Fatalf("initialize jwt service: %v", err)
	}

	authMiddleware := auth.NewMiddleware(jwtService)

	authHandler := handlers.NewAuthHandler(userService, jwtService)
	userHandler := handlers.NewUserHandler(userService)

	router := httptransport.NewRouter(
		authHandler,
		userHandler,
		messageHandler,
		authMiddleware,
		handlers.NewAIHandler(aiClient, userService),
	)

	server := &http.Server{
		Addr:         cfg.HTTP.Addr,
		Handler:      router,
		ReadTimeout:  cfg.HTTP.ReadTimeout,
		WriteTimeout: cfg.HTTP.WriteTimeout,
		IdleTimeout:  cfg.HTTP.IdleTimeout,
	}

	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	serverErr := make(chan error, 1)

	go func() {
		log.Printf("server listening on %s", server.Addr)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}

	case <-ctx.Done():
		log.Println("shutting down server...")

		shutdownCtx, cancel := context.WithTimeout(
			context.Background(),
			10*time.Second,
		)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("graceful shutdown failed: %v", err)
			if closeErr := server.Close(); closeErr != nil {
				log.Printf("server close failed: %v", closeErr)
			}
		}

		if err := <-serverErr; err != nil &&
			!errors.Is(err, http.ErrServerClosed) {
			log.Printf("server error: %v", err)
		}
	}
}
