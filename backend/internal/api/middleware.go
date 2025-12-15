package api

import (
	"file-vault/backend/internal/database"
	"file-vault/backend/internal/models"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// UserRateLimiter stores a rate limiter for each user ID.
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

// AddUser creates a new rate limiter for a user ID.
func (u *UserRateLimiter) AddUser(userID string) *rate.Limiter {
	u.mu.Lock()
	defer u.mu.Unlock()

	limiter := rate.NewLimiter(u.r, u.b)
	u.users[userID] = limiter
	return limiter
}

// GetLimiter returns the rate limiter for a user ID.
func (u *UserRateLimiter) GetLimiter(userID string) *rate.Limiter {
	u.mu.RLock()
	limiter, exists := u.users[userID]
	u.mu.RUnlock()

	if !exists {
		return u.AddUser(userID)
	}

	return limiter
}

// RateLimitMiddleware is a Gin middleware for per-user rate limiting.
func RateLimitMiddleware(limiter *UserRateLimiter, clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Query("owner_id")
		if userID == "" {
			c.Next()
			return
		}

		// Get or create a limiter for the user.
		userLimiter := limiter.GetLimiter(userID)

		// Fetch the user's specific rate limit from the database.
		var user models.User
		_, err := clients.Postgrest.From("users").Select("rate_limit", "", false).Single().Eq("user_id", userID).ExecuteTo(&user)

		// If user is found and has a specific rate limit, update the limiter.
		if err == nil && user.RateLimit > 0 {
			newLimit := rate.Limit(user.RateLimit)
			newBurst := user.RateLimit // Set burst equal to the rate limit for stricter enforcement

			// Update the limiter only if the settings have changed.
			if userLimiter.Limit() != newLimit || userLimiter.Burst() != newBurst {
				userLimiter.SetLimit(newLimit)
				userLimiter.SetBurst(newBurst)
			}
		}

		// Now, check if the request is allowed.
		if !userLimiter.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests"})
			return
		}

		c.Next()
	}
}

// AuthMiddleware checks if a user is authenticated.
func AuthMiddleware(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		// In a real app, you would parse a JWT token from the Authorization header.
		// For this exercise, we'll assume the user ID is passed in a custom header for simplicity.
		userID := c.GetHeader("X-User-ID")
		if userID == "" {
			// Fallback to query parameter for compatibility with existing routes if needed,
			// but prefer header for authenticated requests.
			userID = c.Query("user_id")
		}

		if userID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authentication required: User ID missing"})
			return
		}

		var user models.User
		_, err := clients.Postgrest.From("users").Select("*", "", false).Single().Eq("user_id", userID).ExecuteTo(&user)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID or user not found"})
			return
		}

		// Set the user ID and user model in the context for subsequent handlers
		c.Set("userID", userID)
		c.Set("user", user)
		c.Next()
	}
}

// AdminAuthMiddleware checks if a user has admin privileges by querying the database.
func AdminAuthMiddleware(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Query("user_id") // In a real app, get this from JWT/session
		if userID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "User ID is required"})
			return
		}

		var user models.User
		_, err := clients.Postgrest.From("users").Select("*", "", false).Single().Eq("user_id", userID).ExecuteTo(&user)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		if !user.IsAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
			return
		}

		c.Next()
	}
}
