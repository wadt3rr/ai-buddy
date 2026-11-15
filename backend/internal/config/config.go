package config

import (
	"bytes"
	"fmt"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	HTTP     HTTPConfig     `yaml:"http"`
	Database DatabaseConfig `yaml:"database"`
	Auth     AuthConfig     `yaml:"auth"`
}

type DatabaseConfig struct {
	MaxConns int32 `yaml:"max_conns"`
}

type HTTPConfig struct {
	Addr         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

type AuthConfig struct {
	JWTSecret string
	JWTTTL    time.Duration
}

type rawConfig struct {
	HTTP struct {
		Addr         string `yaml:"addr"`
		ReadTimeout  string `yaml:"read_timeout"`
		WriteTimeout string `yaml:"write_timeout"`
		IdleTimeout  string `yaml:"idle_timeout"`
	} `yaml:"http"`

	Database struct {
		MaxConns int32 `yaml:"max_conns"`
	} `yaml:"database"`

	Auth struct {
		JWTSecret string `yaml:"jwt_secret"`
		JWTTTL    string `yaml:"jwt_ttl"`
	} `yaml:"auth"`
}

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config: %w", err)
	}

	var raw rawConfig

	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)

	if err := decoder.Decode(&raw); err != nil {
		return Config{}, fmt.Errorf("decode config: %w", err)
	}

	if raw.HTTP.Addr == "" {
		return Config{}, fmt.Errorf("http.addr is required")
	}

	readTimeout, err := time.ParseDuration(raw.HTTP.ReadTimeout)
	if err != nil {
		return Config{}, fmt.Errorf("parse http.read_timeout: %w", err)
	}

	writeTimeout, err := time.ParseDuration(raw.HTTP.WriteTimeout)
	if err != nil {
		return Config{}, fmt.Errorf("parse http.write_timeout: %w", err)
	}

	idleTimeout, err := time.ParseDuration(raw.HTTP.IdleTimeout)
	if err != nil {
		return Config{}, fmt.Errorf("parse http.idle_timeout: %w", err)
	}

	if readTimeout <= 0 || writeTimeout <= 0 || idleTimeout <= 0 {
		return Config{}, fmt.Errorf("HTTP timeouts must be positive")
	}

	jwtTTL, err := time.ParseDuration(raw.Auth.JWTTTL)
	if err != nil {
		return Config{}, fmt.Errorf("parse auth.jwt_ttl: %w", err)
	}

	if jwtTTL <= 0 {
		return Config{}, fmt.Errorf("auth.jwt_ttl must be positive")
	}

	jwtSecret := strings.TrimSpace(raw.Auth.JWTSecret)
	if len(jwtSecret) < 32 {
		return Config{}, fmt.Errorf("auth.jwt_secret must contain at least 32 bytes")
	}

	if raw.Database.MaxConns <= 0 {
		return Config{}, fmt.Errorf("database.max_conns must be positive")
	}

	return Config{
		HTTP: HTTPConfig{
			Addr:         raw.HTTP.Addr,
			ReadTimeout:  readTimeout,
			WriteTimeout: writeTimeout,
			IdleTimeout:  idleTimeout,
		},
		Database: DatabaseConfig{
			MaxConns: raw.Database.MaxConns,
		},
		Auth: AuthConfig{
			JWTSecret: jwtSecret,
			JWTTTL:    jwtTTL,
		},
	}, nil
}
