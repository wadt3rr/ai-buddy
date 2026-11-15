package user

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonMemory      uint32 = 64 * 1024
	argonIterations  uint32 = 3
	argonParallelism uint8  = 2
	argonSaltLength         = 16
	argonKeyLength          = 32
)

func hashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLength)

	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey(
		[]byte(password),
		salt,
		argonIterations,
		argonMemory,
		argonParallelism,
		argonKeyLength,
	)

	b64 := base64.RawStdEncoding

	encoded := fmt.Sprintf(
		"$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory,
		argonIterations,
		argonParallelism,
		b64.EncodeToString(salt),
		b64.EncodeToString(hash),
	)

	return encoded, nil
}

func verifyPassword(password, encodedHash string) bool {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false
	}

	var memory uint32
	var iterations uint32
	var parallelism uint8

	params := strings.Split(parts[3], ",")
	if len(params) != 3 {
		return false
	}

	for _, param := range params {
		key, value, ok := strings.Cut(param, "=")
		if !ok {
			return false
		}

		switch key {
		case "m":
			v, err := strconv.ParseUint(value, 10, 32)
			if err != nil || v == 0 || v > 256*1024 {
				return false
			}
			memory = uint32(v)
		case "t":
			v, err := strconv.ParseUint(value, 10, 32)
			if err != nil || v == 0 || v > 10 {
				return false
			}
			iterations = uint32(v)
		case "p":
			v, err := strconv.ParseUint(value, 10, 8)
			if err != nil || v == 0 || v > 16 {
				return false
			}
			parallelism = uint8(v)
		default:
			return false
		}
	}

	if memory == 0 || iterations == 0 || parallelism == 0 {
		return false
	}

	b64 := base64.RawStdEncoding

	salt, err := b64.DecodeString(parts[4])
	if err != nil || len(salt) < 8 || len(salt) > 64 {
		return false
	}

	expectedHash, err := b64.DecodeString(parts[5])
	if err != nil || len(expectedHash) < 16 || len(expectedHash) > 64 {
		return false
	}

	actualHash := argon2.IDKey(
		[]byte(password),
		salt,
		iterations,
		memory,
		parallelism,
		uint32(len(expectedHash)),
	)

	return subtle.ConstantTimeCompare(actualHash, expectedHash) == 1
}
