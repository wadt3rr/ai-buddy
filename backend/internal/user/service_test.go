package user

import (
	"context"
	"errors"
	"testing"
	"uuid"
)

type userRepositoryStub struct {
	created       *User
	byEmail       *User
	byID          *User
	createErr     error
	getByEmailErr error
	getByIDErr    error
}

func (r *userRepositoryStub) Create(_ context.Context, u *User) error {
	if r.createErr != nil {
		return r.createErr
	}
	r.created = u
	u.ID = uuid.New()
	return nil
}

func (r *userRepositoryStub) GetByEmail(_ context.Context, _ string) (*User, error) {
	return r.byEmail, r.getByEmailErr
}

func (r *userRepositoryStub) GetByID(_ context.Context, _ uuid.UUID) (*User, error) {
	return r.byID, r.getByIDErr
}

func TestServiceCreate(t *testing.T) {
	t.Run("normalizes email and hashes password", func(t *testing.T) {
		repo := &userRepositoryStub{}
		service := NewService(repo)

		created, err := service.Create(context.Background(), "  Intern@Example.COM ", "long-enough-password", "intern")
		if err != nil {
			t.Fatalf("Create() error = %v", err)
		}
		if created.Email != "intern@example.com" {
			t.Fatalf("email = %q", created.Email)
		}
		if created.PasswordHash == "long-enough-password" || !verifyPassword("long-enough-password", created.PasswordHash) {
			t.Fatal("password was not correctly hashed")
		}
		if created.ID == uuid.Nil() {
			t.Fatal("expected repository to assign user ID")
		}
	})

	for _, tc := range []struct {
		name, email, password, role string
	}{
		{"empty email", " ", "long-enough-password", "intern"},
		{"empty password", "a@example.com", "", "intern"},
		{"empty role", "a@example.com", "long-enough-password", " "},
		{"short password", "a@example.com", "short", "intern"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &userRepositoryStub{}
			_, err := NewService(repo).Create(context.Background(), tc.email, tc.password, tc.role)
			if err == nil {
				t.Fatal("expected validation error")
			}
			if repo.created != nil {
				t.Fatal("repository must not be called for invalid input")
			}
		})
	}
}

func TestServiceAuthenticate(t *testing.T) {
	hash, err := hashPassword("correct-password")
	if err != nil {
		t.Fatal(err)
	}
	knownUser := &User{Email: "intern@example.com", PasswordHash: hash}

	tests := []struct {
		name      string
		repo      *userRepositoryStub
		password  string
		wantError error
	}{
		{name: "success", repo: &userRepositoryStub{byEmail: knownUser}, password: "correct-password"},
		{name: "wrong password", repo: &userRepositoryStub{byEmail: knownUser}, password: "wrong-password", wantError: ErrInvalidCredentials},
		{name: "unknown user", repo: &userRepositoryStub{getByEmailErr: ErrUserNotFound}, password: "correct-password", wantError: ErrInvalidCredentials},
		{name: "repository failure", repo: &userRepositoryStub{getByEmailErr: errors.New("database unavailable")}, password: "correct-password", wantError: nil},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NewService(tc.repo).Authenticate(context.Background(), " INTERN@EXAMPLE.COM ", tc.password)
			if tc.name == "success" {
				if err != nil || got != knownUser {
					t.Fatalf("Authenticate() = (%v, %v), want known user", got, err)
				}
				return
			}
			if tc.name == "repository failure" {
				if err == nil || errors.Is(err, ErrInvalidCredentials) {
					t.Fatalf("expected wrapped repository error, got %v", err)
				}
				return
			}
			if !errors.Is(err, tc.wantError) || got != nil {
				t.Fatalf("Authenticate() = (%v, %v), want error %v", got, err, tc.wantError)
			}
		})
	}
}

func TestVerifyPasswordRejectsMalformedHash(t *testing.T) {
	for _, encoded := range []string{"", "not-a-hash", "$argon2id$v=19$m=1,t=1,p=1$bad$bad", "$argon2id$v=19$m=999999999,t=1,p=1$bad$bad"} {
		if verifyPassword("password", encoded) {
			t.Errorf("verifyPassword accepted malformed hash %q", encoded)
		}
	}
}
