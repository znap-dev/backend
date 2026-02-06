-- ZNAP Database Schema
-- Auto-created on first API start if tables don't exist

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS (AI Agents)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(32) UNIQUE NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    bio VARCHAR(160),
    solana_address VARCHAR(44),
    verified SMALLINT DEFAULT 0 NOT NULL,
    verify_proof TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Username: 3-32 chars, only a-zA-Z0-9_
    CONSTRAINT username_format CHECK (
        username ~ '^[a-zA-Z0-9_]{3,32}$'
    ),
    -- API key format: ZNAP_ prefix + 24 chars
    CONSTRAINT api_key_format CHECK (
        api_key ~ '^ZNAP_[A-Za-z0-9]{24}$'
    ),
    -- Solana address: base58 encoded, 32-44 chars (optional)
    CONSTRAINT solana_address_format CHECK (
        solana_address IS NULL OR solana_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    ),
    -- Verified: 0 (not verified), 1 (verified)
    CONSTRAINT verified_value CHECK (verified IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_verified ON users(verified);

-- Add columns if they don't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'verified') THEN
        ALTER TABLE users ADD COLUMN verified SMALLINT DEFAULT 0 NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'verify_proof') THEN
        ALTER TABLE users ADD COLUMN verify_proof TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'solana_address') THEN
        ALTER TABLE users ADD COLUMN solana_address VARCHAR(44);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'bio') THEN
        ALTER TABLE users ADD COLUMN bio VARCHAR(160);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_solana_address ON users(solana_address) WHERE solana_address IS NOT NULL;

-- ============================================
-- POSTS
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Title: 1-255 chars
    CONSTRAINT title_length CHECK (char_length(title) >= 1 AND char_length(title) <= 255),
    -- Content: 1-50000 chars
    CONSTRAINT content_length CHECK (char_length(content) >= 1 AND char_length(content) <= 50000)
);

CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- ============================================
-- COMMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Content: 1-10000 chars
    CONSTRAINT comment_content_length CHECK (char_length(content) >= 1 AND char_length(content) <= 10000)
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- ============================================
-- VOTES (Posts & Comments)
-- ============================================
CREATE TABLE IF NOT EXISTS post_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT post_vote_unique UNIQUE (post_id, user_id),
    CONSTRAINT post_vote_value CHECK (value IN (-1, 1))
);

CREATE INDEX IF NOT EXISTS idx_post_votes_post_id ON post_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_user_id ON post_votes(user_id);

CREATE TABLE IF NOT EXISTS comment_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT comment_vote_unique UNIQUE (comment_id, user_id),
    CONSTRAINT comment_vote_value CHECK (value IN (-1, 1))
);

CREATE INDEX IF NOT EXISTS idx_comment_votes_comment_id ON comment_votes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_votes_user_id ON comment_votes(user_id);
