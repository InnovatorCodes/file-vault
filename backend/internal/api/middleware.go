package api

import (
	"file-vault/backend/internal/auth"
	"file-vault/backend/internal/database"
	"file-vault/backend/internal/models"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// UserRateLimiter stores a rate limiter for each user ID (or client IP for anonymous requests).
type UserRateLimiter struct {
	users map[string]*rate.Limiter
	mu    *sync.RWMutex
	r     rate.Limit
	b     int
}

// NewUserRateLimiter creates a new UserRateLimiter.
func NewUserRateLimiter(r rate.Limit, b int) *UserRateLimiter {
	return &UserRateLimiter{
		users: make(map[string]*rate.Limiter),
		mu:    &sync.RWMutex{},
		r:     r,
		b:     b,
	}
}

// AddUser creates a new rate limiter for a key, unless another request created it first.
func (u *UserRateLimiter) AddUser(key string) *rate.Limiter {
	u.mu.Lock()
	defer u.mu.Unlock()

	if limiter, exists := u.users[key]; exists {
		return limiter
	}
	limiter := rate.NewLimiter(u.r, u.b)
	u.users[key] = limiter
	return limiter
}

// GetLimiter returns the rate limiter for a key.
func (u *UserRateLimiter) GetLimiter(key string) *rate.Limiter {
	u.mu.RLock()
	limiter, exists := u.users[key]
	u.mu.RUnlock()

	if !exists {
		return u.AddUser(key)
	}

	return limiter
}

// RateLimitMiddleware limits requests per user. On routes behind AuthMiddleware it uses the
// logged-in user and their rate_limit column; on public routes it falls back to the client IP.
func RateLimitMiddleware(limiter *UserRateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := "ip:" + c.ClientIP()
		if userID := c.GetString("userID"); userID != "" {
			key = "user:" + userID
		}

		userLimiter := limiter.GetLimiter(key)

		// AuthMiddleware already loaded the user, so a custom limit costs no extra query.
		if u, ok := c.Get("user"); ok {
			if user, ok := u.(models.User); ok && user.RateLimit > 0 {
				newLimit := rate.Limit(user.RateLimit)
				// Allow a short burst so a page that fires a few requests at once still loads.
				newBurst := max(user.RateLimit*2, limiter.b)
				if userLimiter.Limit() != newLimit || userLimiter.Burst() != newBurst {
					userLimiter.SetLimit(newLimit)
					userLimiter.SetBurst(newBurst)
				}
			}
		}

		if !userLimiter.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests"})
			return
		}

		c.Next()
	}
}

// AuthMiddleware checks the signed token from the Authorization header and loads the user.
// The user ID always comes from the token, never from a header or query parameter the
// client could change.
func AuthMiddleware(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		tokenString, found := strings.CutPrefix(header, "Bearer ")
		if !found || tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			return
		}

		userID, err := auth.ParseToken(tokenString)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired session, please log in again"})
			return
		}

		var user models.User
		_, err = clients.Postgrest.From("users").Select("*", "", false).Single().Eq("user_id", userID).ExecuteTo(&user)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			return
		}

		// Set the user ID and user model in the context for subsequent handlers
		c.Set("userID", user.UserID)
		c.Set("user", user)
		c.Next()
	}
}

// AdminAuthMiddleware allows the request through only if the logged-in user is an admin.
// It must run after AuthMiddleware.
func AdminAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		u, _ := c.Get("user")
		user, ok := u.(models.User)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			return
		}
		if !user.IsAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
			return
		}
		c.Next()
	}
}
