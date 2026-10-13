package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"

	"file-vault/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/supabase-community/postgrest-go"
	"golang.org/x/crypto/bcrypt"
)

// The shared demo account lets visitors try the app without signing up.
// It is only active when DEMO_ACCOUNT=true.
const (
	DemoEmail    = "demo@flux-file-vault.app"
	demoUsername = "demo"
)

// DemoEnabled reports whether the "Try the demo" login is switched on.
func DemoEnabled() bool {
	return os.Getenv("DEMO_ACCOUNT") == "true"
}

// IsDemoUser reports whether user is the shared demo account.
func IsDemoUser(user models.User) bool {
	return user.Email == DemoEmail
}

// EnsureDemoUser creates the demo account if it does not exist yet. Its password is
// random and thrown away, so the only way in is the demo-login endpoint.
func EnsureDemoUser(db *postgrest.Client) error {
	var existing []models.User
	if _, err := db.From("users").Select("user_id", "", false).Eq("email", DemoEmail).ExecuteTo(&existing); err != nil {
		return fmt.Errorf("look up demo user: %w", err)
	}
	if len(existing) > 0 {
		return nil
	}

	randomPassword := make([]byte, 32)
	if _, err := rand.Read(randomPassword); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(hex.EncodeToString(randomPassword)), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	user := map[string]interface{}{
		"username":       demoUsername,
		"email":          DemoEmail,
		"password_hash":  string(hash),
		"first_name":     "Demo",
		"last_name":      "User",
		"storage_quota":  defaultStorageQuota(),
		"email_verified": true,
	}
	if _, _, err := db.From("users").Insert(user, false, "", "", "").Execute(); err != nil {
		return fmt.Errorf("create demo user: %w", err)
	}
	log.Printf("Created demo account %s", DemoEmail)
	return nil
}

// DemoLogin logs the visitor into the shared demo account.
func DemoLogin(db *postgrest.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !DemoEnabled() {
			c.JSON(http.StatusNotFound, gin.H{"error": "The demo account is not enabled on this server"})
			return
		}

		var user models.User
		_, err := db.From("users").Select("*", "", false).Single().Eq("email", DemoEmail).ExecuteTo(&user)
		if err != nil {
			log.Printf("Error loading demo user: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Demo account is unavailable"})
			return
		}

		sendSession(c, user.UserID, user.Username, user.Email, user.FirstName, user.LastName, user.IsAdmin)
	}
}
