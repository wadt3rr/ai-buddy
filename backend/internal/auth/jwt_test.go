package auth

import (
	"testing"
	"time"
	"uuid"
)

const testJWTSecret = "0123456789abcdef0123456789abcdef"

func TestNewJWTServiceValidation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		secret string
		ttl    time.Duration
	}{
		{name: "empty secret", secret: "", ttl: time.Hour},
		{name: "short secret", secret: "short", ttl: time.Hour},
		{name: "zero ttl", secret: testJWTSecret, ttl: 0},
		{name: "negative ttl", secret: testJWTSecret, ttl: -time.Second},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NewJWTService(tc.secret, tc.ttl); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestJWTGenerateAndValidate(t *testing.T) {
	service, err := NewJWTService(testJWTSecret, time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	userID := uuid.New()
	token, err := service.Generate(userID)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}

	claims, err := service.Validate(token)
	if err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	if claims.UserID != userID || claims.Subject != userID.String() {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestJWTValidateRejectsInvalidToken(t *testing.T) {
	service, err := NewJWTService(testJWTSecret, time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.Validate("not.a.jwt"); err == nil {
		t.Fatal("expected invalid token error")
	}

	other, err := NewJWTService("abcdef0123456789abcdef0123456789", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	token, err := other.Generate(uuid.New())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Validate(token); err == nil {
		t.Fatal("expected token signed with another secret to be rejected")
	}
}
