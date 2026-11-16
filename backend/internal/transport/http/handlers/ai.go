package handlers

import (
	"context"
	"net/http"
	"uuid"

	"github.com/go-chi/chi/v5"
	"github.com/wadt3rr/ai-buddy/internal/auth"
	"github.com/wadt3rr/ai-buddy/internal/transport/http/response"
	"github.com/wadt3rr/ai-buddy/internal/user"
)

type AIResourceClient interface {
	Source(context.Context, string, string) ([]byte, error)
	Tickets(context.Context, string) ([]byte, error)
}
type AIRoleProvider interface {
	GetByID(context.Context, uuid.UUID) (*user.User, error)
}
type AIHandler struct {
	client AIResourceClient
	users  AIRoleProvider
}

func NewAIHandler(client AIResourceClient, users AIRoleProvider) *AIHandler {
	return &AIHandler{client, users}
}

func (h *AIHandler) Source(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		response.Error(w, 401, "unauthorized", "Authentication required")
		return
	}
	u, err := h.users.GetByID(r.Context(), id)
	if err != nil {
		response.Error(w, 403, "forbidden", "Access denied")
		return
	}
	body, err := h.client.Source(r.Context(), chi.URLParam(r, "sourceID"), u.TeamRole)
	if err != nil {
		response.Error(w, 404, "source_not_found", "Source unavailable")
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (h *AIHandler) Tickets(w http.ResponseWriter, r *http.Request) {
	id, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		response.Error(w, 401, "unauthorized", "Authentication required")
		return
	}
	body, err := h.client.Tickets(r.Context(), id.String())
	if err != nil {
		response.Error(w, 502, "tracker_unavailable", "Tracker unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
