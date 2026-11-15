package handlers

import (
	"errors"
	"net/http"

	"github.com/wadt3rr/ai-buddy/internal/auth"
	"github.com/wadt3rr/ai-buddy/internal/transport/http/response"
	"github.com/wadt3rr/ai-buddy/internal/user"
)

type UserHandler struct {
	users *user.Service
}

func NewUserHandler(users *user.Service) *UserHandler {
	return &UserHandler{
		users: users,
	}
}

type userResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	TeamRole  string `json:"team_role"`
	CreatedAt string `json:"created_at"`
}

func (h *UserHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized,
			"unauthorized", "Authentication required")
		return
	}

	u, err := h.users.GetByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, user.ErrUserNotFound) {
			response.Error(w, http.StatusNotFound,
				"user_not_found", "User not found")
			return
		}

		response.Error(w, http.StatusInternalServerError,
			"internal_error", "Internal server error")
		return
	}

	response.JSON(w, http.StatusOK, userResponse{
		ID:        u.ID.String(),
		Email:     u.Email,
		TeamRole:  u.TeamRole,
		CreatedAt: u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}
