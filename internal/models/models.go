package models

import (
	"time"

	"golang.org/x/crypto/bcrypt"
)

// User roles
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

// User represents a system user
type User struct {
	ID                int        `json:"id"`
	Username          string     `json:"username"`
	Email             string     `json:"email"`
	Password          string     `json:"-"`
	Role              string     `json:"role"`
	Active            bool       `json:"active"`
	Locked            bool       `json:"locked"`
	FailedAttempts    int        `json:"failed_attempts"`
	TempBansCount     int        `json:"temp_bans_count"`
	LockedUntil       *time.Time `json:"locked_until"`
	PermanentlyLocked bool       `json:"permanently_locked"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// UserResponse is the public representation of a user
type UserResponse struct {
	ID                int        `json:"id"`
	Username          string     `json:"username"`
	Email             string     `json:"email"`
	Role              string     `json:"role"`
	Active            bool       `json:"active"`
	Locked            bool       `json:"locked"`
	FailedAttempts    int        `json:"failed_attempts"`
	TempBansCount     int        `json:"temp_bans_count"`
	LockedUntil       *time.Time `json:"locked_until"`
	PermanentlyLocked bool       `json:"permanently_locked"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// ToResponse converts User to UserResponse
func (u *User) ToResponse() *UserResponse {
	return &UserResponse{
		ID:                u.ID,
		Username:          u.Username,
		Email:             u.Email,
		Role:              u.Role,
		Active:            u.Active,
		Locked:            u.Locked,
		FailedAttempts:    u.FailedAttempts,
		TempBansCount:     u.TempBansCount,
		LockedUntil:       u.LockedUntil,
		PermanentlyLocked: u.PermanentlyLocked,
		CreatedAt:         u.CreatedAt,
		UpdatedAt:         u.UpdatedAt,
	}
}

// SetPassword hashes and sets the user password
func (u *User) SetPassword(password string, cost int) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		return err
	}
	u.Password = string(hash)
	return nil
}

// CheckPassword verifies the password
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	return err == nil
}

// Transaction represents a financial transaction
type Transaction struct {
    ID        int       `json:"id"`
    UserID    int       `json:"user_id"`
    Type      string    `json:"type"` // deposit, withdraw, expense
    Amount    int       `json:"amount"`
    Note      string    `json:"note"`
    IsEdited  bool      `json:"is_edited"`  // ✅ ADD THIS
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// TransactionStats represents transaction statistics
type TransactionStats struct {
	TotalDeposit  int `json:"totalDeposit"`
	TotalWithdraw int `json:"totalWithdraw"`
	TotalExpense  int `json:"totalExpense"`
	Balance       int `json:"balance"`
	Transactions  int `json:"transactions"`
}

// RefreshToken represents a JWT refresh token
type RefreshToken struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}
