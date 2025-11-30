// internal/database/database.go - REFACTORED SECURE VERSION
package database

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"os"

	"Monex/config"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

type DB struct {
	*sql.DB
}

// New creates and initializes the database with secure defaults
func New(cfg *config.DatabaseConfig) *DB {
	dsn := fmt.Sprintf("%s?_busy_timeout=%d&_journal_mode=WAL&_foreign_keys=ON", 
		cfg.Path, cfg.BusyTimeout)

	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		log.Fatalf("[CRITICAL] Failed to open database: %v", err)
	}

	// Configure connection pool with secure defaults
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetime)

	// Enable security features
	sqlDB.Exec("PRAGMA query_only = OFF")
	sqlDB.Exec("PRAGMA temp_store = MEMORY")
	sqlDB.Exec("PRAGMA synchronous = FULL") // Changed from NORMAL for data integrity
	sqlDB.Exec("PRAGMA journal_mode = WAL")
	sqlDB.Exec("PRAGMA foreign_keys = ON") // Enforce FK constraints

	// Test connection
	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("[CRITICAL] Failed to ping database: %v", err)
	}

	db := &DB{DB: sqlDB}

	// Initialize schema with security enhancements
	if err := db.initSchema(); err != nil {
		log.Fatalf("[CRITICAL] Failed to initialize schema: %v", err)
	}

	log.Println("[OK] Database initialized successfully with security features")
	return db
}

// initSchema creates all necessary tables with enhanced security
func (db *DB) initSchema() error {
	schema := `
	PRAGMA foreign_keys = ON;

	-- Users table with enhanced security fields
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		email TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
		active BOOLEAN NOT NULL DEFAULT 1,
		locked BOOLEAN NOT NULL DEFAULT 0,
		failed_attempts INTEGER NOT NULL DEFAULT 0,
		temp_bans_count INTEGER NOT NULL DEFAULT 0,
		locked_until DATETIME,
		permanently_locked BOOLEAN NOT NULL DEFAULT 0,
		last_password_change DATETIME, -- NEW: Track password changes
		mfa_enabled BOOLEAN NOT NULL DEFAULT 0, -- NEW: MFA support
		mfa_secret TEXT, -- NEW: TOTP secret
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	-- Transactions table with audit fields
	CREATE TABLE IF NOT EXISTS transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		type TEXT NOT NULL CHECK(type IN ('deposit', 'withdraw', 'expense')),
		amount INTEGER NOT NULL CHECK(amount > 0),
		note TEXT,
		is_edited BOOLEAN NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		created_by_ip TEXT, -- NEW: Track creation IP
		updated_by_ip TEXT, -- NEW: Track update IP
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	-- Enhanced sessions table
	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		device_id TEXT NOT NULL UNIQUE,
		device_name TEXT NOT NULL,
		browser TEXT NOT NULL,
		os TEXT NOT NULL,
		ip_address TEXT NOT NULL,
		refresh_token_hash TEXT NOT NULL,
		access_token_hash TEXT NOT NULL,
		last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		expires_at DATETIME NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		is_suspicious BOOLEAN NOT NULL DEFAULT 0, -- NEW: Flag suspicious sessions
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(user_id, device_id)
	);

	-- Token blacklist with enhanced tracking
	CREATE TABLE IF NOT EXISTS token_blacklist (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		token_hash TEXT NOT NULL UNIQUE,
		token_type TEXT NOT NULL CHECK(token_type IN ('access', 'refresh', 'all')),
		expires_at DATETIME NOT NULL,
		blacklisted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		reason TEXT NOT NULL, -- Now required
		blacklisted_by INTEGER, -- NEW: Track who blacklisted
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (blacklisted_by) REFERENCES users(id) ON DELETE SET NULL
	);

	-- Audit logs with enhanced fields
	CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		action TEXT NOT NULL,
		resource TEXT NOT NULL,
		ip_address TEXT,
		user_agent TEXT,
		success BOOLEAN NOT NULL,
		details TEXT,
		severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'error', 'critical')),
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
	);

	-- NEW: Password history table (prevent reuse)
	CREATE TABLE IF NOT EXISTS password_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		password_hash TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	-- NEW: Login attempts tracking (for analytics)
	CREATE TABLE IF NOT EXISTS login_attempts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL,
		ip_address TEXT NOT NULL,
		user_agent TEXT,
		success BOOLEAN NOT NULL,
		failure_reason TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	-- Indexes for performance
	CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
	CREATE INDEX IF NOT EXISTS idx_users_locked ON users(locked);
	CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
	CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
	CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
	CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
	CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username);
	CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
	CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
	`

	if _, err := db.Exec(schema); err != nil {
		return fmt.Errorf("failed to create schema: %w", err)
	}

	// Create default admin with secure password
	if err := db.createDefaultAdmin(); err != nil {
		return fmt.Errorf("failed to create default admin: %w", err)
	}

	return nil
}

// createDefaultAdmin creates admin user with randomly generated password
func (db *DB) createDefaultAdmin() error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE username = 'admin'").Scan(&count)
	if err != nil {
		return err
	}

	if count > 0 {
		log.Println("[INFO] Admin user already exists")
		return nil
	}

	// ✅ SECURE: Generate random password on first run
	randomPassword, err := generateSecurePassword(16)
	if err != nil {
		return fmt.Errorf("failed to generate admin password: %w", err)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(randomPassword), 12)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	_, err = db.Exec(`
		INSERT INTO users (username, email, password, role, active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`, "admin", "admin@monex.local", string(hashedPassword), "admin", true)

	if err != nil {
		return fmt.Errorf("failed to create admin user: %w", err)
	}

	// ✅ CRITICAL: Display password ONCE on first run
	log.Println("╔════════════════════════════════════════════════════════╗")
	log.Println("║           🔐 INITIAL ADMIN CREDENTIALS                 ║")
	log.Println("╠════════════════════════════════════════════════════════╣")
	log.Printf(" ║ Username: admin                                        ║\n")
	log.Printf(" ║ Password: %-42s║\n", randomPassword)
	log.Println("╠════════════════════════════════════════════════════════╣")
	log.Println("║ ⚠️  SAVE THIS PASSWORD - IT WILL NOT BE SHOWN AGAIN    ║")
	log.Println("║ ⚠️  CHANGE IT IMMEDIATELY AFTER FIRST LOGIN            ║")
	log.Println("╚════════════════════════════════════════════════════════╝")

	// Also write to secure file
	passwordFile := ".admin-password.txt"
	if err := os.WriteFile(passwordFile, []byte(randomPassword), 0600); err != nil {
		log.Printf("[WARNING] Could not save password to file: %v", err)
	} else {
		log.Printf("[INFO] Admin password also saved to: %s (delete after use)", passwordFile)
	}

	return nil
}

// generateSecurePassword creates cryptographically secure random password
func generateSecurePassword(length int) (string, error) {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?"
	
	password := make([]byte, length)
	randomBytes := make([]byte, length)
	
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}
	
	for i := 0; i < length; i++ {
		password[i] = charset[int(randomBytes[i])%len(charset)]
	}
	
	return string(password), nil
}