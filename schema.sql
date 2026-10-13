-- File Vault database schema.
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Rebuilt from the Go models in backend/internal/models and the queries in
-- backend/internal/handlers. The foreign key names matter: the API embeds related
-- tables by name (e.g. file_contents!fk_file_content), so keep them as written.

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- Accounts. Passwords are stored only as bcrypt hashes.
create table if not exists users (
    user_id         uuid primary key default gen_random_uuid(),
    username        text not null unique,
    email           text not null unique,
    password_hash   text not null,
    is_admin        boolean not null default false,
    rate_limit      integer not null default 2,             -- API requests per second
    storage_quota   bigint  not null default 1073741824,    -- bytes (1 GB)
    created_at      timestamptz not null default now(),
    first_name      text,
    last_name       text,
    date_of_birth   date,
    phone_number    text,
    last_login      timestamptz,
    email_verified  boolean not null default false,
    phone_verified  boolean not null default false,
    status          text not null default 'active',
    otp             text,
    otp_expires_at  timestamptz
);

-- One row per distinct file content (deduplicated by SHA-256).
-- reference_count = how many rows in "files" point at this content and are not deleted.
create table if not exists file_contents (
    content_id       uuid primary key default gen_random_uuid(),
    hash_sha256      text not null unique,
    size             bigint not null,
    mime_type        text not null,
    storage_path     text not null,          -- object name under uploads/ in the storage bucket
    reference_count  integer not null default 1,
    created_at       timestamptz not null default now()
);

-- One row per file a user sees in their vault. Several rows can share one content.
create table if not exists files (
    file_id     uuid primary key default gen_random_uuid(),
    owner_id    uuid not null,
    content_id  uuid not null,
    filename    text not null,
    is_deleted  boolean not null default false,
    created_at  timestamptz not null default now(),
    constraint fk_file_owner   foreign key (owner_id)   references users(user_id) on delete cascade,
    constraint fk_file_content foreign key (content_id) references file_contents(content_id)
);

create index if not exists idx_files_owner   on files(owner_id) where not is_deleted;
create index if not exists idx_files_content on files(content_id);

-- Public share links. One row per shared file; is_public turns the link on and off.
create table if not exists shares (
    share_id        uuid primary key default gen_random_uuid(),
    file_id         uuid not null,
    folder_id       uuid,                  -- reserved for folder sharing (not used yet)
    is_public       boolean not null default true,
    shared_with     uuid,                  -- reserved for sharing with a specific user (not used yet)
    created_at      timestamptz not null default now(),
    share_token     text not null unique,
    download_count  integer not null default 0,
    constraint fk_share_file foreign key (file_id) references files(file_id) on delete cascade
);

create index if not exists idx_shares_file on shares(file_id);

-- Row Level Security on, with no policies: the public "anon" key can read nothing.
-- The Go server uses the service_role key, which bypasses RLS, and does its own
-- permission checks. Never put the service_role key in the frontend.
alter table users         enable row level security;
alter table file_contents enable row level security;
alter table files         enable row level security;
alter table shares        enable row level security;

-- To make yourself an admin after signing up:
--   update users set is_admin = true where email = 'you@example.com';
