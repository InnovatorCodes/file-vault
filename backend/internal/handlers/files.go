package handlers

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"time"

	"file-vault/backend/internal/database"
	"file-vault/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// UploadFile handles the core logic for file uploads and deduplication.
func UploadFile(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
			return
		}
		defer file.Close()

		// 1. Validate MIME type
		buffer := make([]byte, 512)
		_, err = file.Read(buffer)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file for MIME type detection"})
			return
		}
		file.Seek(0, 0) // Reset file reader

		detectedMimeType := http.DetectContentType(buffer)
		declaredMimeTypeHeader := header.Header.Get("Content-Type")

		if declaredMimeTypeHeader == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "MIME type for the file part is not declared in Content-Type header"})
			return
		}

		// Parse the media types to ignore parameters like charset and ensure a clean comparison
		parsedDeclaredMimeType, _, err := mime.ParseMediaType(declaredMimeTypeHeader)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid Content-Type header format: %s", declaredMimeTypeHeader)})
			return
		}

		parsedDetectedMimeType, _, err := mime.ParseMediaType(detectedMimeType)
		if err != nil {
			// This is unlikely to fail for http.DetectContentType output, but handle defensively
			log.Printf("Could not parse detected MIME type: %s", detectedMimeType)
			parsedDetectedMimeType = detectedMimeType // Fallback to raw value
		}

		if parsedDetectedMimeType != parsedDeclaredMimeType {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("MIME type mismatch: declared '%s', detected '%s'", parsedDeclaredMimeType, parsedDetectedMimeType)})
			return
		}

		// 2. Calculate SHA256 hash
		hash := sha256.New()
		if _, err := io.Copy(hash, file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate file hash"})
			return
		}
		hashString := fmt.Sprintf("%x", hash.Sum(nil))
		file.Seek(0, 0) // Reset file reader

		ownerID := c.Query("owner_id")
		if ownerID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Owner ID is required"})
			return
		}

		// Check storage quota
		var user models.User
		_, err = clients.Postgrest.From("users").Select("storage_quota", "", false).Single().Eq("user_id", ownerID).ExecuteTo(&user)
		if err != nil {
			log.Printf("Error fetching user for quota check: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		var userFiles []models.UserFile
		_, err = clients.Postgrest.From("files").Select("content_id", "", false).Eq("owner_id", ownerID).Eq("is_deleted", "false").ExecuteTo(&userFiles)
		if err != nil {
			log.Printf("Error fetching user files for quota check: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user files"})
			return
		}

		var allFileContents []models.FileContent
		_, err = clients.Postgrest.From("file_contents").Select("content_id,size", "", false).ExecuteTo(&allFileContents)
		if err != nil {
			log.Printf("Error fetching all file contents for quota check: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate storage usage"})
			return
		}

		contentSizes := make(map[string]int64)
		for _, content := range allFileContents {
			contentSizes[content.ContentID] = content.Size
		}

		var storageUsed int64
		for _, file := range userFiles {
			storageUsed += contentSizes[file.ContentID]
		}

		if storageUsed+header.Size > user.StorageQuota {
			log.Printf("Quota Exceeded: Used(%d) + New(%d) > Quota(%d)", storageUsed, header.Size, user.StorageQuota)
			c.JSON(http.StatusForbidden, gin.H{"error": "Storage quota exceeded"})
			return
		}

		// 2. Check if file content already exists
		var fileContent models.FileContent
		_, err = clients.Postgrest.From("file_contents").Select("*", "", false).Single().Eq("hash_sha256", hashString).ExecuteTo(&fileContent)

		if err != nil {
			// --- NEW FILE CONTENT ---
			// 3a. Upload the physical file
			storagePath := uuid.New().String()
			_, uploadErr := clients.Storage.UploadFile(bucketName, "uploads/"+storagePath, file)
			if uploadErr != nil {
				log.Printf("Error uploading file to storage: %v", uploadErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file"})
				return
			}

			// 3b. Create a new file_contents entry with reference_count = 1
			fileContent = models.FileContent{
				ContentID:      uuid.New().String(),
				HashSHA256:     hashString,
				Size:           header.Size,
				MimeType:       header.Header.Get("Content-Type"),
				StoragePath:    storagePath,
				ReferenceCount: 1, // Start with 1 since we are creating the first reference
				CreatedAt:      models.CustomTime{Time: time.Now()},
			}
			_, _, dbErr := clients.Postgrest.From("file_contents").Insert(fileContent, false, "", "", "").Execute()
			if dbErr != nil {
				log.Printf("Error creating file content entry: %v", dbErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create file content entry"})
				return
			}
		} else {
			// --- DUPLICATE FILE CONTENT ---

			// Safety Check: Ensure the physical file exists by re-uploading it to the existing path.
			// This repairs any "zombie" states where the DB record exists but the file is missing from storage.
			_, uploadErr := clients.Storage.UploadFile(bucketName, "uploads/"+fileContent.StoragePath, file)
			if uploadErr != nil {
				log.Printf("Error ensuring physical file existence (dedup): %v", uploadErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file content"})
				return
			}

			// 3c. Increment the reference_count for the existing content
			newRefCount := fileContent.ReferenceCount + 1
			_, _, updateErr := clients.Postgrest.From("file_contents").Update(map[string]interface{}{"reference_count": newRefCount}, "", "").Eq("content_id", fileContent.ContentID).Execute()
			if updateErr != nil {
				log.Printf("Error incrementing reference count: %v", updateErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to increment reference count"})
				return
			}
		}

		// 4. Create the logical file entry in the 'files' table
		finalFilename := header.Filename
		var existingUserFiles []models.UserFile
		// FIX: Ignore is_deleted=true files when checking for filename collisions
		_, err = clients.Postgrest.From("files").Select("*", "", false).Eq("owner_id", ownerID).Eq("filename", finalFilename).Eq("is_deleted", "false").ExecuteTo(&existingUserFiles)
		if err != nil {
			log.Printf("Error checking for existing filename: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for existing filename"})
			return
		}

		if len(existingUserFiles) > 0 {
			finalFilename = fmt.Sprintf("%s-%s", uuid.New().String()[:8], header.Filename)
		}

		newFile := models.UserFile{
			FileID:    uuid.New().String(),
			OwnerID:   ownerID,
			ContentID: fileContent.ContentID,
			Filename:  finalFilename,
			CreatedAt: models.CustomTime{Time: time.Now()},
		}
		_, _, err = clients.Postgrest.From("files").Insert(newFile, false, "", "", "").Execute()
		if err != nil {
			log.Printf("Error creating file entry: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create file entry"})
			return
		}

		c.JSON(http.StatusOK, newFile)
	}
}

// ListFiles retrieves all non-deleted files for a user.
func ListFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		// In a real app, ownerID would come from a JWT token or session.
		ownerID := c.Query("owner_id")
		if ownerID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Owner ID is required"})
			return
		}

		var filesWithContent []models.FileSearchResult
		_, err := clients.Postgrest.From("files").
			Select("file_id,filename,is_deleted,created_at,file_contents!fk_file_content(size,mime_type)", "", false). // Select specific fields
			Eq("owner_id", ownerID).
			Eq("is_deleted", "false").
			ExecuteTo(&filesWithContent)
		if err != nil {
			log.Printf("Error listing files: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list files"})
			return
		}

		c.JSON(http.StatusOK, filesWithContent)
	}
}

// ShareFile toggles the public status of a file and returns a share token.
func ShareFile(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileID := c.Param("id")
		if fileID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "File ID is required"})
			return
		}

		ownerID := c.GetString("userID") // Get ownerID from context (set by AuthMiddleware)
		if ownerID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// Verify the user owns the file
		var userFile models.UserFile
		_, err := clients.Postgrest.From("files").Select("owner_id", "", false).Single().Eq("file_id", fileID).ExecuteTo(&userFile)
		if err != nil {
			log.Printf("Error fetching file for share: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found or not owned by user"})
			return
		}
		if userFile.OwnerID != ownerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to share this file"})
			return
		}

		var share models.Share
		_, err = clients.Postgrest.From("shares").Select("*", "", false).Single().Eq("file_id", fileID).ExecuteTo(&share)

		if err != nil { // No share record exists or an error occurred
			// Check if it's a "no rows found" error specifically
			// The postgrest-go library returns an error if Single() finds no rows.
			// We assume if err is not nil, it means no record was found, or a real DB error.
			// For simplicity, we'll treat any error here as "no existing share found" for creation.
			log.Printf("No existing share found for file %s, or an error occurred: %v. Attempting to create new share.", fileID, err)

			// No share record exists, create one.
			share = models.Share{
				ShareID:    uuid.New().String(),
				FileID:     fileID,
				IsPublic:   true, // Make public by default on first share
				ShareToken: uuid.New().String(),
				CreatedAt:  models.CustomTime{Time: time.Now()},
			}
			_, _, dbErr := clients.Postgrest.From("shares").Insert(share, false, "", "", "").Execute()
			if dbErr != nil {
				log.Printf("Error creating share entry: %v", dbErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create share entry"})
				return
			}
		} else { // Share record exists (err is nil)
			// Toggle the is_public status
			share.IsPublic = !share.IsPublic
			share.ShareToken = uuid.New().String() // Generate new token on toggle
			_, _, updateErr := clients.Postgrest.From("shares").Update(map[string]interface{}{"is_public": share.IsPublic, "share_token": share.ShareToken}, "", "").Eq("share_id", share.ShareID).Execute()
			if updateErr != nil {
				log.Printf("Error updating share status: %v", updateErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update share status"})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"share_token": share.ShareToken,
			"is_public":   share.IsPublic,
		})
	}
}

// GetPublicShare retrieves a publicly shared file by its share token.
func GetPublicShare(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		shareToken := c.Param("token")
		if shareToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Share token is required"})
			return
		}

		var share models.Share
		_, err := clients.Postgrest.From("shares").Select("*", "", false).Single().Eq("share_token", shareToken).ExecuteTo(&share)
		if err != nil {
			log.Printf("Error fetching share by token: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "Public share not found or invalid token"})
			return
		}

		if !share.IsPublic {
			c.JSON(http.StatusForbidden, gin.H{"error": "This file is not publicly shared"})
			return
		}

		// Increment download count
		newCount := share.DownloadCount + 1
		_, _, updateErr := clients.Postgrest.From("shares").Update(map[string]interface{}{"download_count": newCount}, "", "").Eq("share_id", share.ShareID).Execute()
		if updateErr != nil {
			log.Printf("Error incrementing download count for public share: %v", updateErr)
			// Don't block the download, just log the error
		}

		var userFile models.UserFile
		_, err = clients.Postgrest.From("files").Select("file_id,filename,content_id,owner_id", "", false).Single().Eq("file_id", share.FileID).ExecuteTo(&userFile)
		if err != nil {
			log.Printf("Error fetching file metadata for public share: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "File associated with share not found"})
			return
		}

		var fileContent models.FileContent
		_, err = clients.Postgrest.From("file_contents").Select("*", "", false).Single().Eq("content_id", userFile.ContentID).ExecuteTo(&fileContent)
		if err != nil {
			log.Printf("Error fetching file content metadata for public share: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "File content not found"})
			return
		}

		// Fetch owner's username
		var owner models.User
		_, err = clients.Postgrest.From("users").Select("username", "", false).Single().Eq("user_id", userFile.OwnerID).ExecuteTo(&owner)
		if err != nil {
			log.Printf("Error fetching owner username for public share: %v", err)
			// Proceed without owner name if not found
		}

		c.JSON(http.StatusOK, gin.H{
			"file_id":        userFile.FileID,
			"filename":       userFile.Filename,
			"mime_type":      fileContent.MimeType,
			"size":           fileContent.Size,
			"download_count": newCount,
			"owner_username": owner.Username,
			"created_at":     userFile.CreatedAt,
		})
	}
}

// DownloadPublicShare handles downloading a publicly shared file.
func DownloadPublicShare(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		shareToken := c.Param("token")
		if shareToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Share token is required"})
			return
		}

		var share models.Share
		_, err := clients.Postgrest.From("shares").Select("*", "", false).Single().Eq("share_token", shareToken).ExecuteTo(&share)
		if err != nil {
			log.Printf("Error fetching share by token for download: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "Public share not found or invalid token"})
			return
		}

		if !share.IsPublic {
			c.JSON(http.StatusForbidden, gin.H{"error": "This file is not publicly shared"})
			return
		}

		// Increment download count
		newCount := share.DownloadCount + 1
		_, _, updateErr := clients.Postgrest.From("shares").Update(map[string]interface{}{"download_count": newCount}, "", "").Eq("share_id", share.ShareID).Execute()
		if updateErr != nil {
			log.Printf("Error incrementing download count for public share: %v", updateErr)
			// Don't block the download, just log the error
		}

		var userFile models.UserFile
		_, err = clients.Postgrest.From("files").Select("file_id,filename,content_id", "", false).Single().Eq("file_id", share.FileID).ExecuteTo(&userFile)
		if err != nil {
			log.Printf("Error fetching file metadata for public share download: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "File associated with share not found"})
			return
		}

		var fileContent models.FileContent
		_, err = clients.Postgrest.From("file_contents").Select("*", "", false).Single().Eq("content_id", userFile.ContentID).ExecuteTo(&fileContent)
		if err != nil {
			log.Printf("Error fetching file content metadata for public share download: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "File content not found"})
			return
		}

		file, err := clients.Storage.DownloadFile(bucketName, "uploads/"+fileContent.StoragePath)
		if err != nil {
			log.Printf("Error downloading file from storage for public share: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to download file"})
			return
		}

		c.Header("Content-Disposition", "attachment; filename="+userFile.Filename)
		c.Header("Content-Length", strconv.FormatInt(fileContent.Size, 10))
		c.Data(http.StatusOK, fileContent.MimeType, file)
	}
}

// ListPubliclySharedFiles lists all files publicly shared by the authenticated user.
func ListPubliclySharedFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := c.GetString("userID") // Get ownerID from context (set by AuthMiddleware)
		if ownerID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// var sharedFiles []models.PubliclySharedFileResponse

		respBody, _, err := clients.Postgrest.From("shares").
			Select("*,files!fk_share_file!inner(*,file_contents!fk_file_content(size,mime_type),users!fk_file_owner(username))", "", false). // Use explicit FKs: fk_share_file, fk_file_content, fk_file_owner
			Eq("is_public", "true").
			Execute()

		if err != nil {
			log.Printf("Error listing publicly shared files (DB Request Failed): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list publicly shared files"})
			return
		}

		// DEBUG: Print raw response
		// log.Printf("DEBUG: Raw Supabase Response: %s", string(respBody))

		var sharedFiles []models.PubliclySharedFileResponse
		if err := json.Unmarshal(respBody, &sharedFiles); err != nil {
			log.Printf("Error unmarshalling shared files: %v. Body: %s", err, string(respBody))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse shared files"})
			return
		}

		// Format the response to include necessary details
		var response []gin.H
		for _, sf := range sharedFiles {
			response = append(response, gin.H{
				"share_id":       sf.ShareID,
				"file_id":        sf.File.FileID,
				"filename":       sf.File.Filename,
				"owner_username": sf.File.Owner.Username,
				"mime_type":      sf.File.FileContent.MimeType,
				"size":           sf.File.FileContent.Size,
				"download_count": sf.DownloadCount,
				"share_token":    sf.ShareToken,
				"created_at":     sf.CreatedAt,
			})
		}

		c.JSON(http.StatusOK, response)
	}
}

// GetStats calculates and returns user-specific storage statistics.
func GetStats(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Query("user_id")
		if userID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "User ID is required"})
			return
		}

		// 1. Fetch user's storage quota
		var user models.User
		_, err := clients.Postgrest.From("users").Select("storage_quota", "", false).Single().Eq("user_id", userID).ExecuteTo(&user)
		if err != nil {
			log.Printf("Error fetching user for stats: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		// 2. Fetch all non-deleted files for the user with their content
		var userFilesWithContent []models.FileStatsResult
		_, err = clients.Postgrest.From("files").Select("file_contents!fk_file_content(*)", "", false).Eq("owner_id", userID).Eq("is_deleted", "false").ExecuteTo(&userFilesWithContent)
		if err != nil {
			log.Printf("Error fetching user files for stats: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user files"})
			return
		}

		var originalSize int64
		deduplicatedSizeMap := make(map[string]int64)
		for _, file := range userFilesWithContent {
			originalSize += file.FileContent.Size
			deduplicatedSizeMap[file.FileContent.ContentID] = file.FileContent.Size
		}

		var deduplicatedSize int64
		for _, size := range deduplicatedSizeMap {
			deduplicatedSize += size
		}

		savingsBytes := originalSize - deduplicatedSize
		var savingsPercentage float64
		if originalSize > 0 {
			savingsPercentage = (float64(savingsBytes) / float64(originalSize)) * 100
		}

		c.JSON(http.StatusOK, gin.H{
			"total_files":                     len(userFilesWithContent),
			"storage_quota":                   user.StorageQuota,
			"total_storage_used_deduplicated": deduplicatedSize,
			"original_storage_usage":          originalSize,
			"storage_savings_bytes":           savingsBytes,
			"storage_savings_percentage":      fmt.Sprintf("%.2f%%", savingsPercentage),
		})
	}
}

// AdminListFiles allows admins to view all files and user details.
func AdminListFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		// In a real app, you'd have middleware to check if the user is an admin.
		// For this exercise, we'll assume the check has passed.

		var allFiles []models.FileSearchResult
		_, err := clients.Postgrest.From("files").
			Select("file_id,owner_id,filename,is_deleted,created_at,file_contents!fk_file_content(size,mime_type),users!fk_file_owner(username)", "", false).
			ExecuteTo(&allFiles)
		if err != nil {
			log.Printf("Error listing all files for admin: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list files"})
			return
		}

		c.JSON(http.StatusOK, allFiles)
	}
}

// GetFile handles downloading a specific file.
func GetFile(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileID := c.Param("id")
		if fileID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "File ID is required"})
			return
		}

		var userFile models.UserFile
		_, err := clients.Postgrest.From("files").Select("*", "", false).Single().Eq("file_id", fileID).ExecuteTo(&userFile)
		if err != nil {
			log.Printf("Error fetching file metadata: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
			return
		}

		if userFile.IsDeleted {
			c.JSON(http.StatusNotFound, gin.H{"error": "File has been deleted"})
			return
		}

		// Increment download count for public files
		var share models.Share
		_, err = clients.Postgrest.From("shares").Select("*", "", false).Single().Eq("file_id", fileID).ExecuteTo(&share)
		if err == nil && share.IsPublic {
			newCount := share.DownloadCount + 1
			_, _, updateErr := clients.Postgrest.From("shares").Update(map[string]interface{}{"download_count": newCount}, "", "").Eq("share_id", share.ShareID).Execute()
			if updateErr != nil {
				log.Printf("Error incrementing download count: %v", updateErr)
				// Don't block the download, just log the error
			}
		}

		var fileContent models.FileContent
		_, err = clients.Postgrest.From("file_contents").Select("*", "", false).Single().Eq("content_id", userFile.ContentID).ExecuteTo(&fileContent)
		if err != nil {
			log.Printf("Error fetching file content metadata: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "File content not found"})
			return
		}

		file, err := clients.Storage.DownloadFile(bucketName, "uploads/"+fileContent.StoragePath)
		if err != nil {
			log.Printf("Error downloading file from storage: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to download file"})
			return
		}

		c.Header("Content-Disposition", "attachment; filename="+userFile.Filename)
		c.Header("Content-Length", strconv.FormatInt(fileContent.Size, 10)) // Add Content-Length header
		c.Data(http.StatusOK, fileContent.MimeType, file)
	}
}

// DeleteFile handles the soft delete and reference count logic.
func DeleteFile(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileID := c.Param("id")
		if fileID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "File ID is required"})
			return
		}

		// 1. Verify ownership and soft delete the file
		userID := c.Query("user_id") // In a real app, get this from JWT/session
		if userID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "User ID is required"})
			return
		}

		var userFile models.UserFile
		_, err := clients.Postgrest.From("files").Select("*", "", false).Single().Eq("file_id", fileID).ExecuteTo(&userFile)
		if err != nil {
			log.Printf("Error finding file to delete: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
			return
		}

		if userFile.OwnerID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to delete this file"})
			return
		}

		_, _, err = clients.Postgrest.From("files").Update(map[string]interface{}{"is_deleted": true}, "", "").Eq("file_id", fileID).Execute()
		if err != nil {
			log.Printf("Error soft deleting file: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete file"})
			return
		}

		// 2. Decrement reference count
		var fileContent models.FileContent
		_, err = clients.Postgrest.From("file_contents").Select("*", "", false).Single().Eq("content_id", userFile.ContentID).ExecuteTo(&fileContent)
		if err != nil {
			log.Printf("Error fetching file content for reference count decrement: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update file references"})
			return
		}

		newRefCount := fileContent.ReferenceCount - 1
		_, _, err = clients.Postgrest.From("file_contents").Update(map[string]interface{}{"reference_count": newRefCount}, "", "").Eq("content_id", userFile.ContentID).Execute()
		if err != nil {
			log.Printf("Error decrementing reference count: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update file references"})
			return
		}

		// 3. Cleanup if reference count is 0
		if newRefCount == 0 {
			log.Printf("Reference count is 0 for content_id %s. Deleting physical file.", userFile.ContentID)
			// 3a. Delete from storage
			_, err = clients.Storage.RemoveFile(bucketName, []string{"uploads/" + fileContent.StoragePath})
			if err != nil {
				log.Printf("Error deleting physical file from storage: %v", err)
				// Don't block, but log it. The file becomes an orphan.
			}

			// 3b. Delete the file_contents record
			_, _, err = clients.Postgrest.From("file_contents").Delete("", "").Eq("content_id", fileContent.ContentID).Execute()
			if err != nil {
				log.Printf("Error deleting file_contents record: %v", err)
				// Don't block, but log it.
			}
		}

		c.Status(http.StatusNoContent)
	}
}

// SearchFiles allows users to find files based on various criteria.
// SearchFiles allows users to find files based on various criteria.
func SearchFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := c.Query("owner_id")
		if ownerID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Owner ID is required"})
			return
		}

		// Build the query using FilterBuilder
		selectQuery := "file_id,filename,is_deleted,created_at,file_contents!fk_file_content(size,mime_type)"

		// Determine if an inner join is needed for file_contents based on filters
		needsFileContentsJoin := false
		if c.Query("mime_type") != "" || c.Query("min_size") != "" || c.Query("max_size") != "" {
			needsFileContentsJoin = true
		}

		if needsFileContentsJoin {
			selectQuery = "file_id,filename,is_deleted,created_at,file_contents!fk_file_content!inner(size,mime_type)"
		}

		filter := clients.Postgrest.From("files").
			Select(selectQuery, "", false).
			Eq("owner_id", ownerID).
			Eq("is_deleted", "false")

		// Apply filters for embedded resource (file_contents)
		if mimeType := c.Query("mime_type"); mimeType != "" {
			filter = filter.Filter("file_contents.mime_type", "eq", mimeType)
		}

		minSizeStr := c.Query("min_size")
		maxSizeStr := c.Query("max_size")

		if minSizeStr != "" {
			if _, err := strconv.Atoi(minSizeStr); err == nil {
				filter = filter.Filter("file_contents.size", "gte", minSizeStr)
			}
		}
		if maxSizeStr != "" {
			if _, err := strconv.Atoi(maxSizeStr); err == nil {
				filter = filter.Filter("file_contents.size", "lte", maxSizeStr)
			}
		}

		// Apply other filters
		if filename := c.Query("filename"); filename != "" {
			filter = filter.Like("filename", "%"+filename+"%")
		}
		if startDate := c.Query("start_date"); startDate != "" {
			filter = filter.Gte("created_at", startDate)
		}
		if endDate := c.Query("end_date"); endDate != "" {
			filter = filter.Lte("created_at", endDate)
		}

		var searchResults []models.FileSearchResult
		_, err := filter.ExecuteTo(&searchResults)
		if err != nil {
			log.Printf("Error searching files: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search files"})
			return
		}

		// log.Printf("Search results from DB: %+v", searchResults)
		c.JSON(http.StatusOK, searchResults)
	}
}
