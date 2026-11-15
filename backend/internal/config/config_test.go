package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const validConfig = `
http:
  addr: ":8080"
  read_timeout: 5s
  write_timeout: 10s
  idle_timeout: 60s
database:
  max_conns: 10
auth:
  jwt_secret: "0123456789abcdef0123456789abcdef"
  jwt_ttl: 24h
`

func writeConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoad(t *testing.T) {
	path := writeConfig(t, validConfig)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.HTTP.Addr != ":8080" {
		t.Errorf("HTTP.Addr = %q", cfg.HTTP.Addr)
	}
	if cfg.HTTP.ReadTimeout != 5*time.Second || cfg.HTTP.WriteTimeout != 10*time.Second || cfg.HTTP.IdleTimeout != 60*time.Second {
		t.Errorf("unexpected HTTP timeouts: %+v", cfg.HTTP)
	}
	if cfg.Database.MaxConns != 10 {
		t.Errorf("Database.MaxConns = %d, want 10", cfg.Database.MaxConns)
	}
	if cfg.Auth.JWTTTL != 24*time.Hour || cfg.Auth.JWTSecret != "0123456789abcdef0123456789abcdef" {
		t.Errorf("unexpected auth config: %+v", cfg.Auth)
	}
}

func TestLoadRejectsInvalidConfig(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(string) string
		wantErr string
	}{
		{name: "missing address", mutate: func(s string) string { return strings.Replace(s, "  addr: \":8080\"\n", "", 1) }, wantErr: "http.addr is required"},
		{name: "invalid read timeout", mutate: func(s string) string { return strings.Replace(s, "read_timeout: 5s", "read_timeout: invalid", 1) }, wantErr: "parse http.read_timeout"},
		{name: "zero timeout", mutate: func(s string) string { return strings.Replace(s, "read_timeout: 5s", "read_timeout: 0s", 1) }, wantErr: "must be positive"},
		{name: "short JWT secret", mutate: func(s string) string { return strings.Replace(s, "0123456789abcdef0123456789abcdef", "short", 1) }, wantErr: "jwt_secret"},
		{name: "invalid JWT TTL", mutate: func(s string) string { return strings.Replace(s, "jwt_ttl: 24h", "jwt_ttl: invalid", 1) }, wantErr: "parse auth.jwt_ttl"},
		{name: "zero JWT TTL", mutate: func(s string) string { return strings.Replace(s, "jwt_ttl: 24h", "jwt_ttl: 0s", 1) }, wantErr: "jwt_ttl must be positive"},
		{name: "zero max connections", mutate: func(s string) string { return strings.Replace(s, "max_conns: 10", "max_conns: 0", 1) }, wantErr: "max_conns must be positive"},
		{name: "unknown field", mutate: func(s string) string { return s + "unknown: value\n" }, wantErr: "decode config"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Load(writeConfig(t, tc.mutate(validConfig)))
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("Load() error = %v, want error containing %q", err, tc.wantErr)
			}
		})
	}
}

func TestLoadMissingFile(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "missing.yaml"))
	if err == nil {
		t.Fatal("expected error for missing config file")
	}
}
