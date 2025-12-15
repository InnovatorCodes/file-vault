package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler holds the database connection that all handlers can use.
type Handler struct {
	DB *sql.DB
}

// UploadFileHandler handles the logic for uploading files.
func (h *Handler) UploadFileHandler(c *gin.Context) {
	// For now, we'll just return a success message.
	// The detailed upload and deduplication logic will go here next.

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file was received."})
		return
	}

	// This is where you will add the SHA-256 hashing,
	// database checks for duplicates, and saving the file.

	c.JSON(http.StatusOK, gin.H{
		"message":  "File uploaded successfully!",
		"filename": file.Filename,
	})
}
