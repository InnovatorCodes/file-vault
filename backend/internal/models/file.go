package models

import (
	"encoding/json"
	"fmt" // Added fmt import
	"strings"
	"time"
)

// CustomTime is a wrapper around time.Time to handle flexible JSON unmarshalling
type CustomTime struct {
	time.Time
}

// UnmarshalJSON implements the json.Unmarshaler interface for CustomTime
func (ct *CustomTime) UnmarshalJSON(b []byte) (err error) {
	s := strings.Trim(string(b), `"`)
	if s == "null" || s == "" {
		ct.Time = time.Time{}
		return nil
	}

	// Try parsing with timezone (RFC3339Nano is a common format for Supabase/PostgreSQL with timezone)
	ct.Time, err = time.Parse(time.RFC3339Nano, s)
	if err == nil {
		return nil
	}

	// Fallback: Try parsing without timezone (assuming it's UTC if no timezone was provided)
	// The format "2006-01-02T15:04:05.999999" matches "2025-09-18T08:44:27.521003" from the error
	ct.Time, err = time.Parse("2006-01-02T15:04:05.999999", s)
	if err == nil {
		ct.Time = ct.Time.UTC() // Treat as UTC if no timezone was specified
		return nil
	}

	return fmt.Errorf("failed to parse time: %s", s)
}

// MarshalJSON implements the json.Marshaler interface for CustomTime
func (ct CustomTime) MarshalJSON() ([]byte, error) {
	if ct.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(ct.Time.Format(time.RFC3339Nano))
}

// FileContent represents the metadata of a unique file blob in the 'file_contents' table
type FileContent struct {
	ContentID      string     `json:"content_id,omitempty"`
	HashSHA256     string     `json:"hash_sha256"` // Needed when inserting; never sent to clients directly
	Size           int64      `json:"size"`
	MimeType       string     `json:"mime_type"`
	StoragePath    string     `json:"storage_path"`
	ReferenceCount int        `json:"reference_count"`
	CreatedAt      CustomTime `json:"created_at,omitempty"`
}

// FileContentSummary is a leaner version of FileContent for display purposes.
type FileContentSummary struct {
	Size     int64  `json:"size"`
	MimeType string `json:"mime_type"`
}

// UserFile represents a logical file uploaded by a user in the 'files' table
type UserFile struct {
	FileID    string     `json:"file_id,omitempty"`
	OwnerID   string     `json:"owner_id"`
	ContentID string     `json:"content_id"`
	Filename  string     `json:"filename"`
	IsDeleted bool       `json:"is_deleted,omitempty"`
	CreatedAt CustomTime `json:"created_at,omitempty"`
}

// FileWithContent combines UserFile and FileContent for a comprehensive file view.
type FileWithContent struct {
	Filename           string             `json:"filename"`
	IsDeleted          bool               `json:"is_deleted"`
	CreatedAt          CustomTime         `json:"created_at"`
	FileContentSummary `json:"file_contents"` // Embed FileContentSummary
}

// FileSearchResult is used for search queries that join file and content data.
type UserSummary struct {
	Username string `json:"username"`
}

type FileSearchResult struct {
	FileID             string             `json:"file_id"`
	OwnerID            string             `json:"owner_id"`
	Filename           string             `json:"filename"`
	IsDeleted          bool               `json:"is_deleted"`
	CreatedAt          CustomTime         `json:"created_at"`
	FileContentSummary `json:"file_contents"` // Embed FileContentSummary for lean API response
	User               *UserSummary       `json:"users,omitempty"` // Embed UserSummary to capture nested user data
}

// FileStatsResult is used internally by GetStats for calculations.
type FileStatsResult struct {
	FileContent FileContent `json:"file_contents"` // Embed the full FileContent for internal use
}

// Share represents a share link for a file or folder.
type Share struct {
	ShareID       string     `json:"share_id"`
	FileID        string     `json:"file_id"`
	FolderID      *string    `json:"folder_id,omitempty"`
	IsPublic      bool       `json:"is_public"`
	SharedWith    *string    `json:"shared_with,omitempty"`
	CreatedAt     CustomTime `json:"created_at,omitempty"`
	ShareToken    string     `json:"share_token,omitempty"`
	DownloadCount int        `json:"download_count,omitempty"`
}

// PubliclySharedFileDetail represents the detailed information for a publicly shared file.
type PubliclySharedFileDetail struct {
	FileID      string             `json:"file_id"`
	Filename    string             `json:"filename"`
	OwnerID     string             `json:"owner_id"`
	CreatedAt   CustomTime         `json:"created_at"`
	FileContent FileContentSummary `json:"file_contents"`
	Owner       UserSummary        `json:"users"`
}

// PubliclySharedFileResponse combines Share information with PubliclySharedFileDetail
type PubliclySharedFileResponse struct {
	ShareID       string                   `json:"share_id"`
	FolderID      *string                  `json:"folder_id,omitempty"`
	IsPublic      bool                     `json:"is_public"`
	SharedWith    *string                  `json:"shared_with,omitempty"`
	CreatedAt     CustomTime               `json:"created_at"` // This is the share creation time
	ShareToken    string                   `json:"share_token"`
	DownloadCount int                      `json:"download_count"`
	File          PubliclySharedFileDetail `json:"files"` // Nested file details
}
