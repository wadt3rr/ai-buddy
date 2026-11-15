package auth

import (
	"errors"
	"fmt"
	"time"

	"uuid"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid token")

type Claims struct {
	UserID uuid.UUID `json:"user_id"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secret []byte
	ttl    time.Duration
}

func NewJWTService(secret string, ttl time.Duration) (*JWTService, error) {
	if secret == "" {
		return nil, errors.New("jwt secret is required")
	}

	if len(secret) < 32 {
		return nil, errors.New("jwt secret must contain at least 32 bytes")
	}

	if ttl <= 0 {
		return nil, errors.New("jwt ttl must be positive")
	}

	return &JWTService{
		secret: []byte(secret),
		ttl:    ttl,
	}, nil
}

func (s *JWTService) Generate(userID uuid.UUID) (string, error) {
	now := time.Now()

	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.ttl)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", fmt.Errorf("sign jwt: %w", err)
	}

	return signed, nil
}

func (s *JWTService) Validate(tokenString string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, ErrInvalidToken
			}

			return s.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
