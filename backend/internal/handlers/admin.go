package handlers

import (
	"file-vault/backend/internal/database"
	"net/http"

	"github.com/gin-gonic/gin"
)

// UpdateConfig godoc
// @Summary Update API configuration
// @Description Update API request rate and storage quota for a user
// @Tags admin
// @Accept  json
// @Produce  json
// @Param   config body UpdateConfigRequest true "Configuration"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /admin/config [post]
func UpdateConfig(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req UpdateConfigRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		updateData := make(map[string]interface{})

		if req.RateLimit != nil {
			updateData["rate_limit"] = *req.RateLimit
		}

		if req.StorageQuota != nil {
			updateData["storage_quota"] = *req.StorageQuota
		}

		if len(updateData) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at least one field (rate_limit or storage_quota) must be provided"})
			return
		}

		// Update user in database
		_, _, err := clients.Postgrest.From("users").Update(updateData, "", "").Eq("user_id", req.UserID).Execute()

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user configuration"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Configuration updated successfully"})
	}
}

type UpdateConfigRequest struct {
	UserID       string `json:"user_id" binding:"required"`
	RateLimit    *int   `json:"rate_limit,omitempty"`
	StorageQuota *int64 `json:"storage_quota,omitempty"`
}
