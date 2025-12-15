package models

import "time"

// User represents a user account in the 'users' table.
type User struct {
	UserID        string     `json:"user_id,omitempty"`
	Username      string     `json:"username"`
	Email         string     `json:"email"`
	PasswordHash  string     `json:"-"` // Never expose this field
	IsAdmin       bool       `json:"is_admin"`
	RateLimit     int        `json:"rate_limit,omitempty"`
	StorageQuota  int64      `json:"storage_quota,omitempty"`
	CreatedAt     CustomTime `json:"created_at,omitempty"`
	FirstName     string     `json:"first_name,omitempty"`
	LastName      string     `json:"last_name,omitempty"`
	DateOfBirth   *time.Time `json:"date_of_birth,omitempty"`
	PhoneNumber   string     `json:"phone_number,omitempty"`
	LastLogin     *time.Time `json:"last_login,omitempty"`
	EmailVerified bool       `json:"email_verified"`
	PhoneVerified bool       `json:"phone_verified"`
	Status        string     `json:"status,omitempty"`
	OTP           string     `json:"-"`
	OTPExpiresAt  *time.Time `json:"-"`
}
