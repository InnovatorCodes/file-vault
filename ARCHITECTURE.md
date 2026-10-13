# How File Vault Works

This document explains the whole project: what each part does, how a request travels through it, and what every file is for.

## 1. The big picture

File Vault has three parts:

```
 Browser (React app)  ──/api/v1/...──►  Go server (Gin)  ──►  Supabase
   pages, buttons                       checks who you are     ├─ Postgres (tables, via PostgREST)
   keeps login token                    applies the rules      └─ Storage bucket (the actual bytes)
```

- **The React app** (`frontend/`) is what you see. It never talks to Supabase directly; it only calls the Go server's `/api/v1/...` endpoints.
- **The Go server** (`backend/`) is the only part that holds the Supabase **service key**. That key can read and write everything, so the server is where all permission checks happen: who you are, whether you own a file, whether you are over quota.
- **Supabase** stores the data. Postgres holds the metadata (users, files, shares), and a private Storage bucket holds the file bytes.

In development, Vite runs the React app on port 5173 and forwards any `/api` request to the Go server on port 8080 (see `frontend/vite.config.ts`). In production, the Go server serves the built React files itself (`STATIC_DIR`), so everything lives at one address.

## 2. Logging in and staying logged in

1. **Sign up** (`POST /api/v1/register`): the server lower-cases the email, checks the password length, hashes the password with **bcrypt**, and inserts a row in `users`. New accounts get a 25 MB quota (`DEFAULT_QUOTA_MB`).
2. **Log in** (`POST /api/v1/login`): the server finds the user by email and checks the password against the bcrypt hash. If it matches, the server creates a **JWT**, a short string signed with `JWT_SECRET`, that says "this is user X, valid for 24 hours".
3. The browser stores that token in `localStorage` (`frontend/src/utils/api.ts → saveSession`).
4. Every later request goes through `apiFetch`, which adds `Authorization: Bearer <token>`.
5. On the server, `AuthMiddleware` checks the signature and expiry, reads the user ID **from the token**, and loads that user from the database. Handlers then use that user. Nothing the browser sends as a "user ID" is trusted.
6. If the token is missing, forged or expired, the server answers `401`. `apiFetch` then clears the session and sends the browser to `/login`.

Nobody can create a valid token without `JWT_SECRET`, so a token can't be faked or edited to pose as another user.

**The demo account.** When `DEMO_ACCOUNT=true`, the server creates a shared account (`demo@flux-file-vault.app`) at startup with a random password that is never stored or shown. The login page's "Try the demo" button calls `POST /api/v1/demo-login`, which hands out a token for that account. Because nobody knows the password, the only way in is that button, and the account's password can't be changed. Everyone using the demo shares the same files and 25 MB, and is rate-limited by IP address so one visitor can't slow down the others.

## 3. The data model and deduplication

Four tables (see `schema.sql`):

| Table | One row per… | Key columns |
|---|---|---|
| `users` | account | `email`, `password_hash`, `is_admin`, `storage_quota`, `rate_limit` |
| `file_contents` | **distinct file content** | `hash_sha256` (unique), `size`, `storage_path`, `reference_count` |
| `files` | file a user sees in their vault | `owner_id`, `content_id`, `filename`, `is_deleted` |
| `shares` | public link | `file_id`, `share_token`, `is_public`, `download_count` |

**Deduplication** is what `file_contents` is for. Two users uploading the same PDF get two rows in `files` (each with their own name) but only **one** row in `file_contents`, and the bytes are stored once in the bucket. `reference_count` says how many live `files` rows point at a content.

### Upload, step by step (`handlers/files.go → UploadFile`)

1. Reject files over `MAX_UPLOAD_MB` (default 50 MB).
2. **MIME check**: read the first 512 bytes, guess the type (`http.DetectContentType`), and make sure it fits what the browser claimed. For example, a `.docx` really is a zip file inside, so "declared docx, detected zip" is allowed, but "declared PNG, detected PDF" is rejected.
3. Compute the file's **SHA-256** hash.
4. Look up `file_contents` by that hash.
5. **Quota check**: add up the user's current usage, counting each distinct content once. If they already own this exact content, the upload costs 0 bytes.
6. If the content is **new**: upload the bytes to `uploads/<random-uuid>` in the bucket and insert a `file_contents` row with `reference_count = 1`.
   If the content **already exists**: don't upload again, just add 1 to `reference_count`.
7. Insert the `files` row. If the user already has a live file with that name, a short random prefix is added.
8. If step 7 fails, the reference added in step 6 is undone.

### Delete, step by step (`DeleteFile` and `releaseContentReference`)

1. Check that the user owns the file (or is an admin).
2. Mark the `files` row `is_deleted = true` (a "soft delete") and turn off any public share link.
3. Subtract 1 from the content's `reference_count`.
4. If that reaches **0**, nothing uses the content any more, so: delete the bytes from the bucket, delete the soft-deleted `files` rows (and their `shares`) that still point at it, then delete the `file_contents` row.

## 4. Sharing

- **Share** (`POST /user/files/:id/share`) makes a file public and returns a random `share_token`. Pressing Share again returns the **same** token, so a link you already sent keeps working.
- **Stop sharing** (`DELETE /user/files/:id/share`, the button on the "Shared Publicly" page) turns the link off. Sharing again later creates a new token, so the old link stays dead.
- The public page is `/share/<token>` in the React app. It calls `GET /api/v1/share/<token>` (no login needed) for the details and `GET /api/v1/share/<token>/download` for the file. Only actual downloads add to `download_count`.
- Deleting a file turns its share off, so old links stop working.

## 5. Limits and admin

- **Rate limiting** (`api/middleware.go → RateLimitMiddleware`): by default 2 requests/second with a burst of 4. Logged-in users are counted by user ID and can have a personal `rate_limit`. Public routes (login, signup, share links) are counted by IP address, which also slows down password guessing.
- **Admins** (`users.is_admin = true`) see every user's files grouped by owner, a "Total Users" card on the home page, and can download or delete any file. They can change any user's quota and rate limit through `PUT /api/v1/admin/users/:id` or `POST /api/v1/admin/config` (there is no UI for this yet).

## 6. Every API endpoint

| Method & path | Login? | What it does |
|---|---|---|
| `POST /api/v1/register` | no | Create an account |
| `POST /api/v1/login` | no | Check password, return token and profile |
| `POST /api/v1/demo-login` | no | Log into the shared demo account (only if `DEMO_ACCOUNT=true`) |
| `GET /api/v1/share/:token` | no | Public file details |
| `GET /api/v1/share/:token/download` | no | Public file download (+1 download) |
| `POST /api/v1/upload` | yes | Upload a file (form field `file`) |
| `GET /api/v1/files` | yes | List your files |
| `GET /api/v1/files/:id` | yes | Download your file |
| `DELETE /api/v1/files/:id` | yes | Delete your file |
| `GET /api/v1/search` | yes | Your files, filtered by `filename`, `mime_type`, `min_size`, `max_size`, `start_date`, `end_date`, `limit` |
| `GET /api/v1/stats` | yes | Your usage, quota and dedup savings |
| `GET /api/v1/user/quota` | yes | Your quota and rate limit |
| `POST /api/v1/user/password` | yes | Change password (needs the current one) |
| `POST /api/v1/user/files/:id/share` | yes | Make a file public, get its token |
| `DELETE /api/v1/user/files/:id/share` | yes | Stop sharing a file |
| `GET /api/v1/user/shared-publicly` | yes | Your public files (admins see all) |
| `GET /api/v1/admin/files` | admin | Every user's files |
| `GET /api/v1/admin/stats` | admin | Totals across the vault |
| `POST /api/v1/admin/config` | admin | Set a user's quota/rate limit (user ID in the body) |
| `PUT /api/v1/admin/users/:id` | admin | Set a user's quota/rate limit |

## 7. File by file

### Root

| File | Purpose |
|---|---|
| `schema.sql` | Creates the four tables in Supabase. Run once in the SQL Editor. |
| `README.md` | Setup and run instructions. |
| `ARCHITECTURE.md` | This document. |
| `.gitignore` | Keeps `.env` secrets and the compiled server binary out of git. |
| `screenshots/` | Images used in the README. |
| `package-lock.json` | Empty leftover at the root; the real one is in `frontend/`. Safe to delete. |

### Backend (`backend/`)

| File | Purpose |
|---|---|
| `go.mod`, `go.sum` | Go module name (`file-vault/backend`) and pinned dependencies: Gin (web framework), postgrest-go and storage-go (Supabase clients), golang-jwt (tokens), bcrypt, x/time/rate (rate limiter). |
| `cmd/server/main.go` | **Starting point.** Loads `.env`, checks `JWT_SECRET`, connects to Supabase, registers routes, optionally serves the built frontend, and listens on `PORT` (default 8080). |
| `internal/database/database.go` | Creates the PostgREST client (for tables) and the Storage client (for bytes), and creates the private bucket if it is missing. Wraps the Storage client in a lock, because storage-go is not safe to call from two requests at once. |
| `internal/auth/token.go` | Issues and verifies the 24-hour JWT login tokens. |
| `internal/api/routes.go` | **The URL map.** Groups the endpoints into public, logged-in and admin groups, and attaches the right middleware to each. |
| `internal/api/middleware.go` | `AuthMiddleware` (token → user), `AdminAuthMiddleware` (must be admin), `RateLimitMiddleware` (requests per second per user or IP). |
| `internal/api/handlers.go` | An early placeholder upload handler. **Not used** by any route. |
| `internal/api/routes_test.go` | Checks that every protected route returns 401 without a valid token, including the old trick of sending someone else's `user_id`. |
| `internal/handlers/files.go` | Upload (with dedup, MIME check, quota), list, search, download, delete, share/unshare, public share view/download, user stats, admin stats and admin file list. |
| `internal/handlers/files_test.go` | Tests the MIME rules, the download filename header, and the token round-trip. |
| `internal/handlers/users.go` | Register, login, quota lookup, password change, admin user update. |
| `internal/handlers/demo.go` | The shared demo account: created at startup, logged into by the "Try the demo" button, password locked. |
| `internal/handlers/admin.go` | `UpdateConfig`: admin sets a user's quota/rate limit by user ID in the request body. |
| `internal/models/user.go` | Go struct matching the `users` table. `password_hash` and OTP fields never go out in JSON. |
| `internal/models/file.go` | Structs for `file_contents`, `files`, `shares` and the joined results the queries return. `CustomTime` reads Postgres timestamps with or without a time zone. |
| `internal/email/email.go` | Sends a one-time code by SMTP. **Not used**: sign-up currently marks emails as verified straight away. Kept for a future email-verification step. |

### Frontend (`frontend/`)

| File | Purpose |
|---|---|
| `package.json` | Scripts (`dev`, `build`, `lint`) and dependencies: React 19, React Router, Tailwind 4, Framer Motion (animations), lucide-react (icons), sonner (toast messages). |
| `vite.config.ts` | Dev server config: React and Tailwind plugins, and the `/api` → `localhost:8080` proxy. |
| `index.html` | The single HTML page that React fills in. |
| `tsconfig*.json`, `eslint.config.js`, `tailwind.config.js` | TypeScript, lint and Tailwind settings. |
| `src/main.tsx` | Mounts `<App />` into the page. |
| `src/App.tsx` | **Page map.** Logged-in pages (`/`, `/files`, `/shared-publicly`, `/settings`) sit inside `Layout`; `/login` and `/signup` are only for logged-out visitors; `/share/:token` is open to everyone. |
| `src/index.css` | Tailwind import, fonts and the background animations. |
| `src/utils/api.ts` | **Shared helpers**: save/clear the login session, `apiFetch` (adds the token, handles 401), the "files changed" refresh event, and `saveBlob` for downloads. |
| `src/utils/formatBytes.ts` | Turns `1536` into `"1.5 KB"`. |
| `src/components/auth/ProtectedRoute.tsx` | Sends logged-out visitors to `/login`. |
| `src/components/auth/GuestRoute.tsx` | Sends logged-in users away from `/login` and `/signup`. |
| `src/components/LoginPage.tsx` | Login form and the "Try the demo" button; saves the session and goes to `/`. |
| `src/components/SignUpPage.tsx` | Sign-up form; goes to `/login` when done. |
| `src/components/Layout.tsx` | The frame around logged-in pages: sidebar, page content, upload confirmation dialog, loading spinner. |
| `src/components/Sidebar.tsx` | Logo, "New Upload" button, navigation links, storage bar (used of quota, dedup savings), profile button. |
| `src/components/ProfilePopover.tsx` | Shows name and email; Logout button. |
| `src/components/HomePage.tsx` | Welcome, stat cards, drag-and-drop upload area, the 5 most recent files with download/share/delete. |
| `src/components/AllFiles.tsx` | Every file in a grid or list, search box, filter button, details panel, actions menu. Admins see files grouped by owner. |
| `src/components/FilterPopover.tsx` | Filter form (size range with units, MIME type, date range). |
| `src/components/PubliclySharedFiles.tsx` | Your public files with copy-link, download and stop-sharing buttons. |
| `src/components/PublicShareView.tsx` | The page anyone with a share link sees: file details and a download button. |
| `src/components/SettingsPage.tsx` | Change password; shows your rate limit and quota (read-only). |
| `src/components/Loader.tsx` | Full-screen spinner shown during uploads. |
| `src/components/FileDetailSidebar.tsx` | An older details panel. **Not used**: `AllFiles.tsx` has its own. |
| `src/components/EmailVerificationPage.tsx` | OTP entry form. **Not used**: not routed in `App.tsx`, and the backend has no `/verify-otp` endpoint. |
| `src/hooks/useFileUpload.tsx` | Upload logic: hold the chosen files, show a confirm dialog, upload them one by one, report successes and errors. |
| `src/hooks/useConfirmationDialog.tsx` | One app-wide "Are you sure?" dialog that any page can open. |
| `src/hooks/useClickOutside.tsx` | Closes a popover when you click elsewhere. |

## 8. Known limits (fine for a portfolio demo)

- `reference_count` and `download_count` are updated as read-then-write, so two uploads of the same file at the same instant could miscount by one. A Postgres function that increments in one statement would fix this.
- Downloads are read fully into server memory before being sent, so the upload size cap also protects the server's memory.
- The login token lives in `localStorage`. That is common, but an XSS bug could read it; an HttpOnly cookie would be stricter.
- Rate-limiter entries are never cleaned up, so memory grows slowly with the number of distinct users/IPs until the server restarts.
