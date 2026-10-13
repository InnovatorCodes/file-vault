package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// tokenLifetime is how long a login stays valid before the user must log in again.
const tokenLifetime = 24 * time.Hour

// Claims is the payload stored inside a signed login token.
type Claims struct {
	UserID string `json:"uid"`
	jwt.RegisteredClaims
}

func secret() ([]byte, error) {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		return nil, errors.New("JWT_SECRET is not set")
	}
	return []byte(s), nil
}

// IssueToken creates a signed token that proves the holder logged in as userID.
func IssueToken(userID string) (string, error) {
	key, err := secret()
	if err != nil {
		return "", err
	}
	now := time.Now()
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenLifetime)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(key)
}

// ParseToken verifies the token's signature and expiry and returns the user ID inside it.
func ParseToken(tokenString string) (string, error) {
	key, err := secret()
	if err != nil {
		return "", err
	}
	var claims Claims
	_, err = jwt.ParseWithClaims(tokenString, &claims, func(t *jwt.Token) (interface{}, error) {
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		return "", err
	}
	if claims.UserID == "" {
		return "", errors.New("token has no user ID")
	}
	return claims.UserID, nil
}
