package database

import (
	"database/sql"
	"fmt"
	"log"

	"Monex/config"

	_ "github.com/mattn/go-sqlite3"
)

// DB wraps sql.DB with additional functionality
type DB struct {
	*sql.DB
}

// New creates and initializes the database
func New(cfg *config.DatabaseConfig) *DB {
	dsn := fmt.Sprintf("%s?_busy_timeout=%d&_journal_mode=WAL", cfg.Path, cfg.BusyTimeout)

	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	// Configure connection pool
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetime)

	sqlDB.Exec("PRAGMA query_only = OFF")
	sqlDB.Exec("PRAGMA temp_store = MEMORY")
	sqlDB.Exec("PRAGMA synchronous = NORMAL")

	// Test connection
	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	db := &DB{DB: sqlDB}

	// Initialize schema
	if err := db.initSchema(); err != nil {
		log.Fatalf("Failed to initialize schema: %v", err)
	}

	log.Println("[OK] Database initialized successfully")
	return db
}

// initSchema creates all necessary tables and indexes
func (db *DB) initSchema() error {
	schema := `
	PRAGMA foreign_keys = ON;

	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE,
		email TEXT NOT NULL UNIQUE,
		password TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
		active BOOLEAN NOT NULL DEFAULT 1,
		locked BOOLEAN NOT NULL DEFAULT 0,
		failed_attempts INTEGER NOT NULL DEFAULT 0,
		temp_bans_count INTEGER NOT NULL DEFAULT 0,
		locked_until DATETIME,
		permanently_locked BOOLEAN NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('deposit', 'withdraw', 'expense')),
    amount INTEGER NOT NULL CHECK(amount > 0),
    note TEXT,
    is_edited BOOLEAN NOT NULL DEFAULT 0,  -- ✅ ADD THIS LINE
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

	CREATE TABLE IF NOT EXISTS refresh_tokens (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		token TEXT NOT NULL UNIQUE,
		expires_at DATETIME NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		action TEXT NOT NULL,
		resource TEXT NOT NULL,
		ip_address TEXT,
		user_agent TEXT,
		success BOOLEAN NOT NULL,
		details TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
	);

	CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
	CREATE INDEX IF NOT EXISTS idx_users_locked ON users(locked);
	CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until);

	CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
	CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
	CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
	CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, type);

	CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
	CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
	CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

	CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

	-- ADD THESE INDEXES to database.go initSchema()

	-- Transaction queries
	CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
	CREATE INDEX idx_transactions_user_type_created ON transactions(user_id, type, created_at DESC);
	CREATE INDEX idx_transactions_note ON transactions(user_id, note) WHERE note IS NOT NULL;

	-- User queries  
	CREATE INDEX idx_users_active_created ON users(active, created_at DESC);

	-- Audit log queries
	CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action, created_at DESC);
	CREATE INDEX idx_audit_logs_resource_created ON audit_logs(resource, created_at DESC);

	-- Refresh token cleanup
	CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
	`

	_, err := db.Exec(schema)
	if err != nil {
		return fmt.Errorf("failed to create schema: %w", err)
	}

	if err := db.createDefaultAdmin(); err != nil {
		return fmt.Errorf("failed to create default admin: %w", err)
	}

	return nil
}

// createDefaultAdmin creates the default admin user
func (db *DB) createDefaultAdmin() error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE username = 'admin'").Scan(&count)
	if err != nil {
		return err
	}

	if count > 0 {
		return nil // Admin already exists
	}

	// Hash default password (admin123)
	// Using bcrypt cost 12
	hashedPassword := "$2a$12$1UduSzSKfKEENB1xhFXHeOw4s3WCSJF568/XHuz/hgDppIEadWLMe"

	_, err = db.Exec(`
		INSERT INTO users (username, email, password, role, active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`, "admin", "admin@monex.local", hashedPassword, "admin", true)

	if err != nil {
		return err
	}
	return nil
}
