package handlers

import (
	"mime"
	"testing"

	"file-vault/backend/internal/auth"
)

func TestMimeCompatible(t *testing.T) {
	ok := [][2]string{
		{"image/png", "image/png"},
		{"text/csv", "text/plain"},
		{"application/json", "text/plain"},
		{"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"},
		{"application/x-zip-compressed", "application/zip"},
		{"image/svg+xml", "text/xml"},
		{"application/x-whatever", "application/octet-stream"},
	}
	for _, c := range ok {
		if !mimeCompatible(c[0], c[1]) {
			t.Errorf("declared %q / detected %q should be accepted", c[0], c[1])
		}
	}

	bad := [][2]string{
		{"image/png", "application/pdf"},
		{"application/pdf", "text/plain"},
		{"image/jpeg", "application/zip"},
	}
	for _, c := range bad {
		if mimeCompatible(c[0], c[1]) {
			t.Errorf("declared %q / detected %q should be rejected", c[0], c[1])
		}
	}
}

func TestAttachmentHeader(t *testing.T) {
	for _, name := range []string{"report.pdf", "my file, final.pdf", `quote"name.txt`, "résumé.pdf"} {
		_, params, err := mime.ParseMediaType(attachmentHeader(name))
		if err != nil || params["filename"] != name {
			t.Errorf("filename %q did not round-trip: got %q, err %v", name, params["filename"], err)
		}
	}
}

func TestTokenRoundTrip(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	token, err := auth.IssueToken("user-123")
	if err != nil {
		t.Fatal(err)
	}
	id, err := auth.ParseToken(token)
	if err != nil || id != "user-123" {
		t.Fatalf("got %q, %v", id, err)
	}

	t.Setenv("JWT_SECRET", "different-secret")
	if _, err := auth.ParseToken(token); err == nil {
		t.Fatal("token signed with another secret was accepted")
	}
}
