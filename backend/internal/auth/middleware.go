package auth

import (
	"net/http"
	"strings"

	"github.com/wadt3rr/ai-buddy/internal/transport/http/response"
)

type Middleware struct {
	jwt *JWTService
}

func NewMiddleware(jwt *JWTService) *Middleware {
	return &Middleware{jwt: jwt}
}

func (m *Middleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")

		if header == "" {
			response.Error(w, http.StatusUnauthorized,
				"unauthorized", "Authorization header is required")
			return
		}

		scheme, tokenString, found := strings.Cut(header, " ")

		if !found || !strings.EqualFold(scheme, "Bearer") ||
			tokenString == "" || strings.ContainsAny(tokenString, " \t\r\n") {
			response.Error(w, http.StatusUnauthorized,
				"invalid_token", "Invalid authorization header")
			return
		}

		claims, err := m.jwt.Validate(tokenString)
		if err != nil {
			response.Error(w, http.StatusUnauthorized,
				"invalid_token", "Invalid or expired token")
			return
		}

		ctx := ContextWithUserID(r.Context(), claims.UserID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
