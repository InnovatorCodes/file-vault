# Builds the whole app into one small image: the Go API server plus the built React app,
# which the server serves itself (STATIC_DIR), so everything runs on one address.

# --- 1. Build the React frontend ---
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. Build the Go server ---
FROM golang:1.25-alpine AS backend
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /server ./cmd/server

# --- 3. Final image: just the binary, the frontend files and TLS certificates ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
COPY --from=backend /server /app/server
COPY --from=frontend /app/frontend/dist /app/public
USER app
ENV STATIC_DIR=/app/public \
    GIN_MODE=release \
    PORT=8080
EXPOSE 8080
CMD ["/app/server"]
