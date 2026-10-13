package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"file-vault/backend/internal/api"
	"file-vault/backend/internal/database"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// A .env file is optional: on a host the variables come from its settings instead.
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	if os.Getenv("JWT_SECRET") == "" {
		log.Fatal("JWT_SECRET is not set. Set it to a long random string (e.g. `openssl rand -hex 32`).")
	}

	clients, err := database.InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize Supabase clients: %v", err)
	}

	router := gin.Default()
	// Uploads larger than this are spooled to a temp file instead of held in memory.
	router.MaxMultipartMemory = 8 << 20

	api.SetupRoutes(router, clients)

	// In production the built React app (frontend/dist) is served from the same server,
	// so the browser only ever talks to one origin and no CORS setup is needed.
	if dir := os.Getenv("STATIC_DIR"); dir != "" {
		serveFrontend(router, dir)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server listening on :%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}

// serveFrontend serves files from dir and falls back to index.html for any other path,
// so client-side routes like /files or /share/<token> work on a page refresh.
func serveFrontend(router *gin.Engine, dir string) {
	index := filepath.Join(dir, "index.html")
	if _, err := os.Stat(index); err != nil {
		log.Printf("STATIC_DIR is set but %s was not found; not serving the frontend", index)
		return
	}

	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
			return
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Status(http.StatusNotFound)
			return
		}

		// filepath.Clean on a rooted path removes any ".." so requests cannot escape dir.
		path := filepath.Join(dir, filepath.Clean("/"+c.Request.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			c.File(path)
			return
		}
		c.File(index)
	})
}
