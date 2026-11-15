package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/wadt3rr/ai-buddy/internal/auth"
	"github.com/wadt3rr/ai-buddy/internal/transport/http/response"
	"github.com/wadt3rr/ai-buddy/internal/user"
)

type AuthHandler struct {
	users *user.Service
	jwt   *auth.JWTService
}

func NewAuthHandler(users *user.Service, jwt *auth.JWTService) *AuthHandler {
	return &AuthHandler{
		users: users,
		jwt:   jwt,
	}
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	var req loginRequest

	if err := decoder.Decode(&req); err != nil {
		var maxBytesError *http.MaxBytesError

		switch {
		case errors.As(err, &maxBytesError):
			response.Error(w, http.StatusRequestEntityTooLarge,
				"request_too_large", "Request body is too large")

		default:
			response.Error(w, http.StatusBadRequest,
				"invalid_request", "Invalid request body")
		}

		return
	}

	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		response.Error(w, http.StatusBadRequest,
			"invalid_request", "Request body must contain a single JSON object")
		return
	}

	if req.Email == "" || req.Password == "" {
		response.Error(w, http.StatusBadRequest,
			"validation_error", "Email and password are required")
		return
	}

	u, err := h.users.Authenticate(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, user.ErrInvalidCredentials) {
			response.Error(w, http.StatusUnauthorized,
				"invalid_credentials", "Invalid email or password")
			return
		}

		response.Error(w, http.StatusInternalServerError,
			"internal_error", "Internal server error")
		return
	}

	token, err := h.jwt.Generate(u.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError,
			"internal_error", "Internal server error")
		return
	}

	response.JSON(w, http.StatusOK, loginResponse{
		AccessToken: token,
		TokenType:   "Bearer",
	})
}
