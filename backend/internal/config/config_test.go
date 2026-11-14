package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoad(t *testing.T) {
	tests := []struct {
		name    string
		content string
		wantErr bool
	}{
		{
			name: "valid config",
			content: `
http:
  addr: ":8080"
  read_timeout: 5s
  write_timeout: 10s
  idle_timeout: 60s
`,
		},
		{
			name: "missing address",
			content: `
http:
  read_timeout: 5s
  write_timeout: 10s
  idle_timeout: 60s
`,
			wantErr: true,
		},
		{
			name: "invalid timeout",
			content: `
http:
  addr: ":8080"
  read_timeout: invalid
  write_timeout: 10s
  idle_timeout: 60s
`,
			wantErr: true,
		},
		{
			name: "unknown field",
			content: `
http:
  addr: ":8080"
  read_timeout: 5s
  write_timeout: 10s
  idle_timeout: 60s
  unknown: value
`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.yaml")

			if err := os.WriteFile(path, []byte(tt.content), 0o600); err != nil {
				t.Fatal(err)
			}

			cfg, err := Load(path)

			if (err != nil) != tt.wantErr {
				t.Fatalf("Load() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err != nil {
				return
			}

			if cfg.HTTP.Addr != ":8080" {
				t.Errorf("unexpected HTTP address: %s", cfg.HTTP.Addr)
			}

			if cfg.HTTP.ReadTimeout != 5*time.Second {
				t.Errorf("unexpected read timeout: %v", cfg.HTTP.ReadTimeout)
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
