package handlers

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"file-vault/backend/internal/database"
	"file-vault/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/supabase-community/postgrest-go"
	storage_go "github.com/supabase-community/storage-go"
)

// defaultMaxUploadBytes caps a single upload when MAX_UPLOAD_MB is not set.
const defaultMaxUploadBytes = 50 << 20

func maxUploadBytes() int64 {
	if mb, err := strconv.ParseInt(os.Getenv("MAX_UPLOAD_MB"), 10, 64); err == nil && mb > 0 {
		return mb << 20
	}
	return defaultMaxUploadBytes
}

// currentUser returns the logged-in user that AuthMiddleware put in the context.
func currentUser(c *gin.Context) models.User {
	u, _ := c.Get("user")
	user, _ := u.(models.User)
	return user
}

// attachmentHeader builds a Content-Disposition value that is safe for any filename,
// including ones with spaces, quotes or non-ASCII characters.
func attachmentHeader(filename string) string {
	if v := mime.FormatMediaType("attachment", map[string]string{"filename": filename}); v != "" {
		return v
	}
	return "attachment"
}

// mimeCompatible reports whether the type the browser declared fits what the file's
// first bytes look like. http.DetectContentType only knows a few dozen types, so a
// plain equality check would reject ordinary files (.docx looks like a zip, .csv
// looks like text/plain, and so on).
func mimeCompatible(declared, detected string) bool {
	if declared == detected || detected == "application/octet-stream" {
		return true
	}
	switch detected {
	case "text/plain":
		return strings.HasPrefix(declared, "text/") ||
			strings.HasSuffix(declared, "+json") || strings.HasSuffix(declared, "+xml") ||
			declared == "application/json" || declared == "application/xml" ||
			declared == "application/javascript" || declared == "application/x-sh" ||
			declared == "application/sql" || declared == "application/x-yaml" ||
			declared == "application/yaml" || declared == "image/svg+xml"
	case "text/xml":
		return declared == "application/xml" || strings.HasSuffix(declared, "+xml")
	case "application/zip":
		return declared == "application/x-zip-compressed" ||
			strings.HasPrefix(declared, "application/vnd.openxmlformats-officedocument.") ||
			strings.HasPrefix(declared, "application/vnd.oasis.opendocument.") ||
			declared == "application/epub+zip" || declared == "application/java-archive"
	}
	return false
}

// storageUsage is what a user's live files take up.
type storageUsage struct {
	fileCount    int
	original     int64           // sum of every file's size, counting duplicates each time
	deduplicated int64           // each distinct content counted once
	contentIDs   map[string]bool // distinct content the user already owns
}

func getStorageUsage(clients *database.AppClients, userID string) (storageUsage, error) {
	var rows []models.FileStatsResult
	_, err := clients.Postgrest.From("files").
		Select("file_contents!fk_file_content(content_id,size)", "", false).
		Eq("owner_id", userID).
		Eq("is_deleted", "false").
		ExecuteTo(&rows)
	if err != nil {
		return storageUsage{}, err
	}

	usage := storageUsage{fileCount: len(rows), contentIDs: map[string]bool{}}
	for _, row := range rows {
		usage.original += row.FileContent.Size
		if !usage.contentIDs[row.FileContent.ContentID] {
			usage.contentIDs[row.FileContent.ContentID] = true
			usage.deduplicated += row.FileContent.Size
		}
	}
	return usage, nil
}

// UploadFile handles the core logic for file uploads and deduplication.
func UploadFile(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := c.GetString("userID")
		limit := maxUploadBytes()

		// Stop reading the body once it is clearly too large, instead of buffering all of it.
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit+1<<20)
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": fmt.Sprintf("File is larger than the %d MB limit", limit>>20)})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
			return
		}
		defer file.Close()

		if header.Size > limit {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": fmt.Sprintf("File is larger than the %d MB limit", limit>>20)})
			return
		}

		// 1. Validate MIME type
		buffer := make([]byte, 512)
		n, err := file.Read(buffer)
		if err != nil && err != io.EOF { // io.EOF just means the file is empty
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file for MIME type detection"})
			return
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
			return
		}

		detectedMimeType, _, _ := mime.ParseMediaType(http.DetectContentType(buffer[:n]))
		declaredMimeTypeHeader := header.Header.Get("Content-Type")
		if declaredMimeTypeHeader == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "MIME type for the file part is not declared in Content-Type header"})
			return
		}

		// Parse the media types to ignore parameters like charset and ensure a clean comparison
		declaredMimeType, _, err := mime.ParseMediaType(declaredMimeTypeHeader)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid Content-Type header format: %s", declaredMimeTypeHeader)})
			return
		}

		if !mimeCompatible(declaredMimeType, detectedMimeType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("MIME type mismatch: declared '%s', detected '%s'", declaredMimeType, detectedMimeType)})
			return
		}

		// 2. Calculate SHA256 hash
		hash := sha256.New()
		if _, err := io.Copy(hash, file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate file hash"})
			return
		}
		hashString := fmt.Sprintf("%x", hash.Sum(nil))
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
			return
		}

		// 3. Check if file content already exists anywhere in the vault
		var existing []models.FileContent
		_, err = clients.Postgrest.From("file_contents").Select("*", "", false).Eq("hash_sha256", hashString).ExecuteTo(&existing)
		if err != nil {
			log.Printf("Error looking up file content by hash: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for duplicate content"})
			return
		}

		// 4. Check storage quota. Usage is counted the same way the sidebar shows it:
		// each distinct content once, so re-uploading something you already have is free.
		user := currentUser(c)
		usage, err := getStorageUsage(clients, ownerID)
		if err != nil {
			log.Printf("Error calculating storage usage: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate storage usage"})
			return
		}
		addedBytes := header.Size
		if len(existing) > 0 && usage.contentIDs[existing[0].ContentID] {
			addedBytes = 0
		}
		if usage.deduplicated+addedBytes > user.StorageQuota {
			log.Printf("Quota Exceeded: Used(%d) + New(%d) > Quota(%d)", usage.deduplicated, addedBytes, user.StorageQuota)
			c.JSON(http.StatusForbidden, gin.H{"error": "Storage quota exceeded"})
			return
		}

		upsert := true
		uploadOptions := storage_go.FileOptions{ContentType: &declaredMimeType, Upsert: &upsert}

		var fileContent models.FileContent
		if len(existing) == 0 {
			// --- NEW FILE CONTENT ---
			// 5a. Upload the physical file
			storagePath := uuid.New().String()
			if _, err := clients.Storage.UploadFile(bucketName, "uploads/"+storagePath, file, uploadOptions); err != nil {
				log.Printf("Error uploading file to storage: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file"})
				return
			}

			// 5b. Create a new file_contents entry with reference_count = 1
			fileContent = models.FileContent{
				ContentID:      uuid.New().String(),
				HashSHA256:     hashString,
				Size:           header.Size,
				MimeType:       declaredMimeType,
				StoragePath:    storagePath,
				ReferenceCount: 1, // Start with 1 since we are creating the first reference
				CreatedAt:      models.CustomTime{Time: time.Now()},
			}
			if _, _, err := clients.Postgrest.From("file_contents").Insert(fileContent, false, "", "", "").Execute(); err != nil {
				log.Printf("Error creating file content entry: %v", err)
				clients.Storage.RemoveFile(bucketName, []string{"uploads/" + storagePath})
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create file content entry"})
				return
			}
		} else {
			// --- DUPLICATE FILE CONTENT ---
			fileContent = existing[0]

			// A content row with no references left may have lost its physical file
			// (older versions of the delete code could leave it behind), so restore it.
			if fileContent.ReferenceCount <= 0 {
				if _, err := clients.Storage.UploadFile(bucketName, "uploads/"+fileContent.StoragePath, file, uploadOptions); err != nil {
					log.Printf("Error restoring physical file (dedup): %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file content"})
					return
				}
				fileContent.ReferenceCount = 0
			}

			// 5c. Increment the reference_count for the existing content
			fileContent.ReferenceCount++
			_, _, err := clients.Postgrest.From("file_contents").Update(map[string]interface{}{"reference_count": fileContent.ReferenceCount}, "", "").Eq("content_id", fileContent.ContentID).Execute()
			if err != nil {
				log.Printf("Error incrementing reference count: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to increment reference count"})
				return
			}
		}

		// 6. Create the logical file entry in the 'files' table
		finalFilename := header.Filename
		var existingUserFiles []models.UserFile
		// Ignore is_deleted=true files when checking for filename collisions
		_, err = clients.Postgrest.From("files").Select("file_id", "", false).Eq("owner_id", ownerID).Eq("filename", finalFilename).Eq("is_deleted", "false").ExecuteTo(&existingUserFiles)
		if err != nil {
			log.Printf("Error checking for existing filename: %v", err)
			releaseContentReference(clients, bucketName, fileContent.ContentID)
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
		if _, _, err := clients.Postgrest.From("files").Insert(newFile, false, "", "", "").Execute(); err != nil {
			log.Printf("Error creating file entry: %v", err)
			// Undo the reference we just added so the content is not kept alive forever.
			releaseContentReference(clients, bucketName, fileContent.ContentID)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create file entry"})
			return
		}

		c.JSON(http.StatusOK, newFile)
	}
}

// releaseContentReference drops one reference to a content blob. When nothing refers to
// it any more, the physical file, the soft-deleted file rows that still point at it (and
// their shares), and the content row itself are all removed.
func releaseContentReference(clients *database.AppClients, bucketName, contentID string) error {
	var fileContent models.FileContent
	_, err := clients.Postgrest.From("file_contents").Select("*", "", false).Single().Eq("content_id", contentID).ExecuteTo(&fileContent)
	if err != nil {
		return fmt.Errorf("fetch content: %w", err)
	}

	newRefCount := fileContent.ReferenceCount - 1
	if newRefCount > 0 {
		_, _, err = clients.Postgrest.From("file_contents").Update(map[string]interface{}{"reference_count": newRefCount}, "", "").Eq("content_id", contentID).Execute()
		if err != nil {
			return fmt.Errorf("decrement reference count: %w", err)
		}
		return nil
	}

	log.Printf("Reference count is 0 for content_id %s. Deleting physical file.", contentID)
	if _, err := clients.Storage.RemoveFile(bucketName, []string{"uploads/" + fileContent.StoragePath}); err != nil {
		log.Printf("Error deleting physical file from storage: %v", err)
		// Keep going: an orphaned object in storage is harmless, an orphaned row is not.
	}

	// The soft-deleted file rows still reference this content through a foreign key, so
	// they (and any shares pointing at them) have to go before the content row can.
	var deadFiles []models.UserFile
	_, err = clients.Postgrest.From("files").Select("file_id", "", false).Eq("content_id", contentID).ExecuteTo(&deadFiles)
	if err != nil {
		return fmt.Errorf("list files for content: %w", err)
	}
	if len(deadFiles) > 0 {
		ids := make([]string, len(deadFiles))
		for i, f := range deadFiles {
			ids[i] = f.FileID
		}
		if _, _, err := clients.Postgrest.From("shares").Delete("", "").In("file_id", ids).Execute(); err != nil {
			return fmt.Errorf("delete shares: %w", err)
		}
		if _, _, err := clients.Postgrest.From("files").Delete("", "").Eq("content_id", contentID).Execute(); err != nil {
			return fmt.Errorf("delete file rows: %w", err)
		}
	}

	if _, _, err := clients.Postgrest.From("file_contents").Delete("", "").Eq("content_id", contentID).Execute(); err != nil {
		return fmt.Errorf("delete content row: %w", err)
	}
	return nil
}

// ListFiles retrieves all non-deleted files for the logged-in user.
func ListFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := c.GetString("userID")

		var filesWithContent []models.FileSearchResult
		_, err := clients.Postgrest.From("files").
			Select("file_id,filename,is_deleted,created_at,file_contents!fk_file_content(size,mime_type)", "", false). // Select specific fields
			Eq("owner_id", ownerID).
			Eq("is_deleted", "false").
			Order("created_at", &postgrest.OrderOpts{Ascending: false}).
			ExecuteTo(&filesWithContent)
		if err != nil {
			log.Printf("Error listing files: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list files"})
			return
		}

		c.JSON(http.StatusOK, filesWithContent)
	}
}

// getOwnedFile loads a live file and checks the logged-in user owns it.
// It writes the error response itself and returns ok=false when the caller should stop.
func getOwnedFile(c *gin.Context, clients *database.AppClients, fileID string) (models.UserFile, bool) {
	var userFile models.UserFile
	_, err := clients.Postgrest.From("files").Select("*", "", false).Single().Eq("file_id", fileID).ExecuteTo(&userFile)
	if err != nil || userFile.IsDeleted {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return userFile, false
	}
	if userFile.OwnerID != c.GetString("userID") {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to share this file"})
		return userFile, false
	}
	return userFile, true
}

// ShareFile makes a file public and returns its share token. Calling it again on a file
// that is already shared returns the same token, so a copied link keeps working.
func ShareFile(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileID := c.Param("id")
		if _, ok := getOwnedFile(c, clients, fileID); !ok {
			return
		}

		var shares []models.Share
		_, err := clients.Postgrest.From("shares").Select("*", "", false).Eq("file_id", fileID).ExecuteTo(&shares)
		if err != nil {
			log.Printf("Error fetching share for file %s: %v", fileID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to look up share"})
			return
		}

		var share models.Share
		switch {
		case len(shares) == 0:
			// No share record exists, create one.
			share = models.Share{
				ShareID:    uuid.New().String(),
				FileID:     fileID,
				IsPublic:   true,
				ShareToken: uuid.New().String(),
				CreatedAt:  models.CustomTime{Time: time.Now()},
			}
			if _, _, err := clients.Postgrest.From("shares").Insert(share, false, "", "", "").Execute(); err != nil {
				log.Printf("Error creating share entry: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create share entry"})
				return
			}
		case !shares[0].IsPublic:
			// Re-sharing after an unshare gets a fresh token, so the old link stays dead.
			share = shares[0]
			share.IsPublic = true
			share.ShareToken = uuid.New().String()
			_, _, err := clients.Postgrest.From("shares").Update(map[string]interface{}{"is_public": true, "share_token": share.ShareToken}, "", "").Eq("share_id", share.ShareID).Execute()
			if err != nil {
				log.Printf("Error updating share status: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update share status"})
				return
			}
		default:
			share = shares[0]
		}

		c.JSON(http.StatusOK, gin.H{
			"share_token": share.ShareToken,
			"is_public":   share.IsPublic,
		})
	}
}

// UnshareFile turns off the public link for a file.
func UnshareFile(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileID := c.Param("id")
		if _, ok := getOwnedFile(c, clients, fileID); !ok {
			return
		}

		_, _, err := clients.Postgrest.From("shares").Update(map[string]interface{}{"is_public": false}, "", "").Eq("file_id", fileID).Execute()
		if err != nil {
			log.Printf("Error disabling share for file %s: %v", fileID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stop sharing"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"is_public": false})
	}
}

// loadPublicShare resolves a share token to its file and content, checking the share is
// still public and the file has not been deleted. It writes the error response itself.
func loadPublicShare(c *gin.Context, clients *database.AppClients) (models.Share, models.UserFile, models.FileContent, bool) {
	var share models.Share
	var userFile models.UserFile
	var fileContent models.FileContent

	_, err := clients.Postgrest.From("shares").Select("*", "", false).Single().Eq("share_token", c.Param("token")).ExecuteTo(&share)
	if err != nil || !share.IsPublic {
		c.JSON(http.StatusNotFound, gin.H{"error": "Public share not found or invalid token"})
		return share, userFile, fileContent, false
	}

	_, err = clients.Postgrest.From("files").Select("*", "", false).Single().Eq("file_id", share.FileID).ExecuteTo(&userFile)
	if err != nil || userFile.IsDeleted {
		c.JSON(http.StatusNotFound, gin.H{"error": "File associated with share not found"})
		return share, userFile, fileContent, false
	}

	_, err = clients.Postgrest.From("file_contents").Select("*", "", false).Single().Eq("content_id", userFile.ContentID).ExecuteTo(&fileContent)
	if err != nil {
		log.Printf("Error fetching file content metadata for public share: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "File content not found"})
		return share, userFile, fileContent, false
	}
	return share, userFile, fileContent, true
}

// GetPublicShare returns the details of a publicly shared file by its share token.
// Viewing the page does not count as a download; only DownloadPublicShare does.
func GetPublicShare(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		share, userFile, fileContent, ok := loadPublicShare(c, clients)
		if !ok {
			return
		}

		// Fetch owner's username
		var owner models.User
		_, err := clients.Postgrest.From("users").Select("username", "", false).Single().Eq("user_id", userFile.OwnerID).ExecuteTo(&owner)
		if err != nil {
			log.Printf("Error fetching owner username for public share: %v", err)
			// Proceed without owner name if not found
		}

		c.JSON(http.StatusOK, gin.H{
			"file_id":        userFile.FileID,
			"filename":       userFile.Filename,
			"mime_type":      fileContent.MimeType,
			"size":           fileContent.Size,
			"download_count": share.DownloadCount,
			"owner_username": owner.Username,
			"created_at":     userFile.CreatedAt,
		})
	}
}

// DownloadPublicShare handles downloading a publicly shared file.
func DownloadPublicShare(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		share, userFile, fileContent, ok := loadPublicShare(c, clients)
		if !ok {
			return
		}

		file, err := clients.Storage.DownloadFile(bucketName, "uploads/"+fileContent.StoragePath)
		if err != nil {
			log.Printf("Error downloading file from storage for public share: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to download file"})
			return
		}

		// Increment download count
		_, _, updateErr := clients.Postgrest.From("shares").Update(map[string]interface{}{"download_count": share.DownloadCount + 1}, "", "").Eq("share_id", share.ShareID).Execute()
		if updateErr != nil {
			log.Printf("Error incrementing download count for public share: %v", updateErr)
			// Don't block the download, just log the error
		}

		c.Header("Content-Disposition", attachmentHeader(userFile.Filename))
		c.Data(http.StatusOK, fileContent.MimeType, file)
	}
}

// ListPubliclySharedFiles lists the logged-in user's public files. Admins see everyone's.
func ListPubliclySharedFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := currentUser(c)

		query := clients.Postgrest.From("shares").
			Select("*,files!fk_share_file!inner(*,file_contents!fk_file_content(size,mime_type),users!fk_file_owner(username))", "", false). // Use explicit FKs: fk_share_file, fk_file_content, fk_file_owner
			Eq("is_public", "true").
			Eq("files.is_deleted", "false")
		if !user.IsAdmin {
			query = query.Eq("files.owner_id", user.UserID)
		}

		respBody, _, err := query.Execute()
		if err != nil {
			log.Printf("Error listing publicly shared files (DB Request Failed): %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list publicly shared files"})
			return
		}

		var sharedFiles []models.PubliclySharedFileResponse
		if err := json.Unmarshal(respBody, &sharedFiles); err != nil {
			log.Printf("Error unmarshalling shared files: %v. Body: %s", err, string(respBody))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse shared files"})
			return
		}

		// Format the response to include necessary details
		response := []gin.H{}
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

// GetStats calculates and returns the logged-in user's storage statistics.
func GetStats(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := currentUser(c)

		usage, err := getStorageUsage(clients, user.UserID)
		if err != nil {
			log.Printf("Error fetching user files for stats: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user files"})
			return
		}

		savingsBytes := usage.original - usage.deduplicated
		var savingsPercentage float64
		if usage.original > 0 {
			savingsPercentage = (float64(savingsBytes) / float64(usage.original)) * 100
		}

		c.JSON(http.StatusOK, gin.H{
			"total_files":                     usage.fileCount,
			"storage_quota":                   user.StorageQuota,
			"total_storage_used_deduplicated": usage.deduplicated,
			"original_storage_usage":          usage.original,
			"storage_savings_bytes":           savingsBytes,
			"storage_savings_percentage":      fmt.Sprintf("%.2f%%", savingsPercentage),
		})
	}
}

// AdminStats returns totals across the whole vault for the admin home page.
func AdminStats(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		var users []models.User
		if _, err := clients.Postgrest.From("users").Select("user_id", "", false).ExecuteTo(&users); err != nil {
			log.Printf("Error counting users for admin stats: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load stats"})
			return
		}

		var files []models.FileStatsResult
		_, err := clients.Postgrest.From("files").
			Select("file_contents!fk_file_content(content_id,size)", "", false).
			Eq("is_deleted", "false").
			ExecuteTo(&files)
		if err != nil {
			log.Printf("Error loading files for admin stats: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load stats"})
			return
		}

		var original, deduplicated int64
		seen := map[string]bool{}
		for _, f := range files {
			original += f.FileContent.Size
			if !seen[f.FileContent.ContentID] {
				seen[f.FileContent.ContentID] = true
				deduplicated += f.FileContent.Size
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"total_users":                     len(users),
			"total_files":                     len(files),
			"original_storage_usage":          original,
			"total_storage_used_deduplicated": deduplicated,
		})
	}
}

// AdminListFiles allows admins to view all live files and who owns them.
func AdminListFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		var allFiles []models.FileSearchResult
		_, err := clients.Postgrest.From("files").
			Select("file_id,owner_id,filename,is_deleted,created_at,file_contents!fk_file_content(size,mime_type),users!fk_file_owner(username)", "", false).
			Eq("is_deleted", "false").
			Order("created_at", &postgrest.OrderOpts{Ascending: false}).
			ExecuteTo(&allFiles)
		if err != nil {
			log.Printf("Error listing all files for admin: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list files"})
			return
		}

		c.JSON(http.StatusOK, allFiles)
	}
}

// GetFile downloads a file. Only its owner (or an admin) may download it.
func GetFile(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileID := c.Param("id")
		user := currentUser(c)

		var userFile models.UserFile
		_, err := clients.Postgrest.From("files").Select("*", "", false).Single().Eq("file_id", fileID).ExecuteTo(&userFile)
		if err != nil || userFile.IsDeleted {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
			return
		}
		if userFile.OwnerID != user.UserID && !user.IsAdmin {
			// Same answer as a missing file, so file IDs cannot be probed.
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
			return
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

		c.Header("Content-Disposition", attachmentHeader(userFile.Filename))
		c.Data(http.StatusOK, fileContent.MimeType, file)
	}
}

// DeleteFile handles the soft delete and reference count logic.
func DeleteFile(clients *database.AppClients, bucketName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		fileID := c.Param("id")
		user := currentUser(c)

		// 1. Verify ownership and soft delete the file
		var userFile models.UserFile
		_, err := clients.Postgrest.From("files").Select("*", "", false).Single().Eq("file_id", fileID).ExecuteTo(&userFile)
		if err != nil || userFile.IsDeleted {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
			return
		}

		if userFile.OwnerID != user.UserID && !user.IsAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to delete this file"})
			return
		}

		_, _, err = clients.Postgrest.From("files").Update(map[string]interface{}{"is_deleted": true}, "", "").Eq("file_id", fileID).Execute()
		if err != nil {
			log.Printf("Error soft deleting file: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete file"})
			return
		}

		// A deleted file must not stay downloadable through an old share link.
		if _, _, err := clients.Postgrest.From("shares").Update(map[string]interface{}{"is_public": false}, "", "").Eq("file_id", fileID).Execute(); err != nil {
			log.Printf("Error disabling share for deleted file %s: %v", fileID, err)
		}

		// 2. Decrement reference count, cleaning up the content when nothing uses it.
		if err := releaseContentReference(clients, bucketName, userFile.ContentID); err != nil {
			log.Printf("Error releasing content %s: %v", userFile.ContentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update file references"})
			return
		}

		c.Status(http.StatusNoContent)
	}
}

// SearchFiles allows users to find their files based on various criteria.
func SearchFiles(clients *database.AppClients) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := c.GetString("userID")

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

		if minSize := c.Query("min_size"); minSize != "" {
			if _, err := strconv.ParseInt(minSize, 10, 64); err == nil {
				filter = filter.Filter("file_contents.size", "gte", minSize)
			}
		}
		if maxSize := c.Query("max_size"); maxSize != "" {
			if _, err := strconv.ParseInt(maxSize, 10, 64); err == nil {
				filter = filter.Filter("file_contents.size", "lte", maxSize)
			}
		}

		// Apply other filters
		if filename := c.Query("filename"); filename != "" {
			filter = filter.Ilike("filename", "*"+filename+"*") // case-insensitive "contains"
		}
		if startDate := c.Query("start_date"); startDate != "" {
			filter = filter.Gte("created_at", startDate)
		}
		if endDate := c.Query("end_date"); endDate != "" {
			filter = filter.Lte("created_at", endDate)
		}

		filter = filter.Order("created_at", &postgrest.OrderOpts{Ascending: false})
		if limit, err := strconv.Atoi(c.Query("limit")); err == nil && limit > 0 {
			filter = filter.Limit(limit, "")
		}

		var searchResults []models.FileSearchResult
		_, err := filter.ExecuteTo(&searchResults)
		if err != nil {
			log.Printf("Error searching files: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search files"})
			return
		}

		c.JSON(http.StatusOK, searchResults)
	}
}
