package api

import (
	"file-vault/backend/internal/database" // Import database package for AppClients
	"file-vault/backend/internal/handlers"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

const bucketName = "file-vault-storage"

// SetupRoutes configures the API routes
func SetupRoutes(router *gin.Engine, clients *database.AppClients) {
	// Initialize the rate limiter: 2 requests per second with a burst of 4.
	limiter := NewUserRateLimiter(rate.Limit(2), 4)

	v1 := router.Group("/api/v1")

	// Public routes: no login needed, rate limited per client IP.
	public := v1.Group("")
	public.Use(RateLimitMiddleware(limiter))
	{
		public.POST("/register", handlers.RegisterUser(clients.Postgrest))
		public.POST("/login", handlers.LoginUser(clients.Postgrest))
		public.POST("/demo-login", handlers.DemoLogin(clients.Postgrest))

		// Anyone with a share link can view and download that one file.
		public.GET("/share/:token", handlers.GetPublicShare(clients))
		public.GET("/share/:token/download", handlers.DownloadPublicShare(clients, bucketName))
	}

	// Everything below needs a valid login token. Auth runs first so the rate limiter
	// can key on the user and use their personal rate_limit.
	authed := v1.Group("")
	authed.Use(AuthMiddleware(clients), RateLimitMiddleware(limiter))
	{
		user := authed.Group("/user")
		{
			user.GET("/quota", handlers.GetUserQuota(clients))
			user.POST("/password", handlers.UpdatePassword(clients))
			user.POST("/files/:id/share", handlers.ShareFile(clients))
			user.DELETE("/files/:id/share", handlers.UnshareFile(clients))
			user.GET("/shared-publicly", handlers.ListPubliclySharedFiles(clients))
		}

		authed.POST("/upload", handlers.UploadFile(clients, bucketName))
		authed.GET("/files", handlers.ListFiles(clients))
		authed.GET("/files/:id", handlers.GetFile(clients, bucketName))
		authed.DELETE("/files/:id", handlers.DeleteFile(clients, bucketName))
		authed.GET("/search", handlers.SearchFiles(clients))
		authed.GET("/stats", handlers.GetStats(clients))

		admin := authed.Group("/admin")
		admin.Use(AdminAuthMiddleware())
		{
			admin.GET("/files", handlers.AdminListFiles(clients))
			admin.GET("/stats", handlers.AdminStats(clients))
			admin.POST("/config", handlers.UpdateConfig(clients))
			admin.PUT("/users/:id", handlers.UpdateUser(clients)) // Update user (e.g. quota, rate limit)
		}
	}
}
