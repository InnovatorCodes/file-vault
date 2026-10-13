package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"file-vault/backend/internal/database"

	"github.com/gin-gonic/gin"
	"github.com/supabase-community/postgrest-go"
)

// Every protected route must reject a request before touching the database when there is
// no token, a forged token, or only the old-style user ID header/query parameter.
func TestProtectedRoutesRequireToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("JWT_SECRET", "test-secret")

	router := gin.New()
	// The Postgrest client points nowhere; the test fails if any handler reaches it.
	SetupRoutes(router, &database.AppClients{Postgrest: postgrest.NewClient("http://127.0.0.1:1", "", nil)})

	routes := []struct{ method, path string }{
		{"GET", "/api/v1/files"},
		{"GET", "/api/v1/files/some-id"},
		{"DELETE", "/api/v1/files/some-id"},
		{"POST", "/api/v1/upload"},
		{"GET", "/api/v1/search"},
		{"GET", "/api/v1/stats"},
		{"GET", "/api/v1/user/quota"},
		{"POST", "/api/v1/user/password"},
		{"POST", "/api/v1/user/files/some-id/share"},
		{"DELETE", "/api/v1/user/files/some-id/share"},
		{"GET", "/api/v1/user/shared-publicly"},
		{"GET", "/api/v1/admin/files"},
		{"GET", "/api/v1/admin/stats"},
		{"POST", "/api/v1/admin/config"},
		{"PUT", "/api/v1/admin/users/some-id"},
	}

	cases := []struct {
		name  string
		setup func(r *http.Request)
	}{
		{"no token", func(r *http.Request) {}},
		{"forged token", func(r *http.Request) { r.Header.Set("Authorization", "Bearer not-a-real-token") }},
		{"old user id header", func(r *http.Request) { r.Header.Set("X-User-ID", "victim-id") }},
	}

	for _, route := range routes {
		for _, tc := range cases {
			req := httptest.NewRequest(route.method, route.path+"?user_id=victim-id&owner_id=victim-id", nil)
			tc.setup(req)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Errorf("%s %s with %s: got status %d, want 401", route.method, route.path, tc.name, w.Code)
			}
		}
	}
}
