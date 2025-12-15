package api

import (
	"file-vault/backend/internal/database" // Import database package for AppClients
	"file-vault/backend/internal/handlers"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
	// Import postgrest-go
)

// SetupRoutes configures the API routes
func SetupRoutes(router *gin.Engine, clients *database.AppClients) { // Accept AppClients
	// Initialize the rate limiter: 2 requests per second with a burst of 4.
	limiter := NewUserRateLimiter(rate.Limit(2), 4)

	// Group routes under /api/v1
	v1 := router.Group("/api/v1")
	v1.Use(RateLimitMiddleware(limiter, clients)) // Apply the rate limiting middleware to all v1 routes
	{
		// User routes
		v1.POST("/register", handlers.RegisterUser(clients.Postgrest)) // Pass Postgrest client
		v1.POST("/login", handlers.LoginUser(clients.Postgrest))       // Pass Postgrest client

		// Authenticated user routes
		user := v1.Group("/user")
		user.Use(AuthMiddleware(clients)) // Protect user routes
		{
			user.GET("/quota", handlers.GetUserQuota(clients))
			user.POST("/password", handlers.UpdatePassword(clients))
			user.POST("/files/:id/share", handlers.ShareFile(clients))
			user.GET("/shared-publicly", handlers.ListPubliclySharedFiles(clients))
		}

		// File routes (these should be accessible via v1, not user group)
		v1.POST("/upload", handlers.UploadFile(clients, "file-vault-storage")) // Pass the entire clients object and bucket name
		v1.GET("/files", handlers.ListFiles(clients))
		v1.GET("/files/:id", handlers.GetFile(clients, "file-vault-storage"))
		v1.DELETE("/files/:id", handlers.DeleteFile(clients, "file-vault-storage"))
		v1.POST("/files/:id/share", handlers.ShareFile(clients))

		// Search route (accessible via v1)
		v1.GET("/search", handlers.SearchFiles(clients))
		v1.GET("/stats", handlers.GetStats(clients))

		// Admin routes
		v1.PUT("/admin/users/:id", handlers.UpdateUser(clients)) // Update user (e.g. quota, rate limit)

		// Public share routes
		router.GET("/share/:token", handlers.GetPublicShare(clients, "file-vault-storage"))
		router.GET("/share/:token/download", handlers.DownloadPublicShare(clients, "file-vault-storage"))

		// Admin routes
		admin := v1.Group("/admin")
		admin.Use(AdminAuthMiddleware(clients)) // Protect admin routes
		{
			admin.GET("/files", handlers.AdminListFiles(clients))
			admin.POST("/config", handlers.UpdateConfig(clients))
		}
	}
}
