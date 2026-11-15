package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"uuid"
)

func TestRequireAuth(t *testing.T) {
	jwtService, err := NewJWTService(testJWTSecret, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	middleware := NewMiddleware(jwtService)
	userID := uuid.New()
	token, err := jwtService.Generate(userID)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name       string
		authorize  string
		wantStatus int
	}{
		{name: "missing header", wantStatus: http.StatusUnauthorized},
		{name: "invalid scheme", authorize: "Basic " + token, wantStatus: http.StatusUnauthorized},
		{name: "malformed header", authorize: "Bearer", wantStatus: http.StatusUnauthorized},
		{name: "invalid token", authorize: "Bearer invalid.token", wantStatus: http.StatusUnauthorized},
		{name: "valid token", authorize: "Bearer " + token, wantStatus: http.StatusNoContent},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotID, ok := UserIDFromContext(r.Context())
				if !ok || gotID != userID {
					t.Errorf("user ID in context = %v, ok = %v", gotID, ok)
				}
				w.WriteHeader(http.StatusNoContent)
			})
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			if tc.authorize != "" {
				req.Header.Set("Authorization", tc.authorize)
			}
			rec := httptest.NewRecorder()
			middleware.RequireAuth(next).ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", rec.Code, tc.wantStatus, rec.Body.String())
			}
		})
	}
}
