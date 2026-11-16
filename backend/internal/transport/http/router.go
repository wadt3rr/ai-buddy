package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/wadt3rr/ai-buddy/internal/auth"
	"github.com/wadt3rr/ai-buddy/internal/transport/http/handlers"
)

func NewRouter(
	authHandler *handlers.AuthHandler,
	userHandler *handlers.UserHandler,
	messageHandler *handlers.MessageHandler,
	authMiddleware *auth.Middleware,
	aiHandlers ...*handlers.AIHandler,
) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", authHandler.Login)

		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireAuth)

			r.Get("/users/me", userHandler.Me)
			r.Get("/messages", messageHandler.List)
			r.Post("/messages", messageHandler.Create)
			if len(aiHandlers) > 0 && aiHandlers[0] != nil {
				r.Get("/ai/sources/{sourceID}", aiHandlers[0].Source)
				r.Get("/ai/tickets", aiHandlers[0].Tickets)
			}
		})
	})

	return r
}
