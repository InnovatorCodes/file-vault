package database

import (
	"io"
	"log"
	"os"
	"sync"

	"github.com/supabase-community/postgrest-go"
	storage_go "github.com/supabase-community/storage-go"
)

// AppClients holds the PostgREST and Storage clients
type AppClients struct {
	Postgrest *postgrest.Client
	Storage   *LockedStorage
}

// LockedStorage wraps the storage-go client so only one call runs at a time.
// storage-go keeps its request headers in a single shared map and changes it during
// uploads, so two requests at once can crash the process with a concurrent map write.
type LockedStorage struct {
	mu     sync.Mutex
	client *storage_go.Client
}

func (s *LockedStorage) UploadFile(bucketID, path string, data io.Reader, opts ...storage_go.FileOptions) (storage_go.FileUploadResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.client.UploadFile(bucketID, path, data, opts...)
}

func (s *LockedStorage) DownloadFile(bucketID, path string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.client.DownloadFile(bucketID, path)
}

func (s *LockedStorage) RemoveFile(bucketID string, paths []string) ([]storage_go.FileUploadResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.client.RemoveFile(bucketID, paths)
}

// InitDB initializes and returns a custom struct containing PostgREST and Storage clients
func InitDB() (*AppClients, error) {
	supabaseRestURL := os.Getenv("SUPABASE_REST_URL")
	supabaseStorageURL := os.Getenv("SUPABASE_STORAGE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")

	if supabaseRestURL == "" || supabaseStorageURL == "" || supabaseKey == "" {
		log.Fatal("SUPABASE_REST_URL, SUPABASE_STORAGE_URL, or SUPABASE_KEY is not set in .env or is empty")
	}

	// Initialize PostgREST client
	postgrestClient := postgrest.NewClient(supabaseRestURL, "", map[string]string{
		"apikey":        supabaseKey,
		"Authorization": "Bearer " + supabaseKey,
	})

	if postgrestClient.ClientError != nil {
		return nil, postgrestClient.ClientError
	}

	// Initialize Storage client
	storageClient := storage_go.NewClient(supabaseStorageURL, supabaseKey, map[string]string{
		"Authorization": "Bearer " + supabaseKey,
	})

	// Make sure the bucket exists. It stays private: every download goes through the API,
	// which checks who is asking.
	_, err := storageClient.GetBucket("file-vault-storage")
	if err != nil {
		_, err = storageClient.CreateBucket("file-vault-storage", storage_go.BucketOptions{
			Public: false,
		})
		if err != nil {
			log.Printf("FATAL: Could not create bucket 'file-vault-storage'")
			return nil, err
		}
	}

	return &AppClients{
		Postgrest: postgrestClient,
		Storage:   &LockedStorage{client: storageClient},
	}, nil
}
