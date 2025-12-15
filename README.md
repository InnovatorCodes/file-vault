# Flux File Vault

**Flux** is a secure, high-performance file storage and sharing platform designed for privacy, speed, and efficiency. Built with a modern tech stack, it features intelligent file deduplication, granular user management, and secure public sharing capabilities.

## ✨ Key Features

-   **🛡️ Secure Storage**: Robust file storage powered by **Supabase**.
-   **💾 Smart Deduplication**: Intelligent content-addressable storage ensures identical files are stored only once, saving significant space.
-   **🔗 Secure Sharing**: Generate public share links with download tracking and expiration logic.
-   **⚡ High Performance**: Backend powered by **Go (Gin)** for blazing fast API responses.
-   **👤 User Management**: Comprehensive admin dashboard for managing users, quotas, and rate limits.

## 🛠️ Tech Stack

-   **Backend**: Go (Golang), Gin Web Framework
-   **Frontend**: React, TypeScript, Tailwind CSS, Framer Motion, Vite
-   **Database & Auth**: Supabase (PostgreSQL, Storage, Auth)
-   **Security**: bcrypt password hashing, Row Level Security (RLS)

## 🚀 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites

-   [Go](https://go.dev/) (1.21+)
-   [Node.js](https://nodejs.org/) (18+)
-   [Supabase Account](https://supabase.com/)

### 1. Supabase Setup

1.  Create a new project in Supabase.
2.  **Database**: Run the provided SQL schema in the Supabase SQL Editor to create tables (`users`, `files`, etc.) and indexes.
    *   *Schema file is located at `schema.sql` in the artifacts or project root if saved.*
3.  **Storage**: Create a new **public** storage bucket named **`file-vault-storage`**.

### 2. Backend Configuration

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create a `.env` file (copy from `.env.example`):
    ```bash
    cp .env.example .env
    ```
3.  Update `.env` with your credentials:
    ```env
    SUPABASE_REST_URL=https://your-project-id.supabase.co/rest/v1
    SUPABASE_STORAGE_URL=https://your-project-id.supabase.co/storage/v1
    SUPABASE_KEY=your_service_role_key__not_anon
    ```
4.  Run the server:
    ```bash
    go mod tidy
    go run cmd/server/main.go
    ```

### 3. Frontend Configuration

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
4.  Open your browser at `http://localhost:5173`.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
