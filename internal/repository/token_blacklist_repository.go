package repository

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"Monex/internal/database"
)

type TokenBlacklistRepository struct {
	db *database.DB
}

func NewTokenBlacklistRepository(db *database.DB) *TokenBlacklistRepository {
	return &TokenBlacklistRepository{db: db}
}

// hashToken creates SHA256 hash of token for storage
func (r *TokenBlacklistRepository) hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// BlacklistToken adds a token to blacklist
func (r *TokenBlacklistRepository) BlacklistToken(
	userID int,
	token string,
	tokenType string, // "access", "refresh", "all"
	expiresAt time.Time,
	reason string,
) error {
	tokenHash := r.hashToken(token)

	query := `
		INSERT INTO token_blacklist (user_id, token_hash, token_type, expires_at, reason)
		VALUES (?, ?, ?, ?, ?)
	`

	_, err := r.db.Exec(query, userID, tokenHash, tokenType, expiresAt, reason)
	if err != nil {
		return fmt.Errorf("failed to blacklist token: %w", err)
	}

	log.Printf("[SECURITY] Token blacklisted - UserID: %d, Type: %s, Reason: %s", userID, tokenType, reason)
	return nil
}

// IsBlacklisted checks if token is blacklisted
func (r *TokenBlacklistRepository) IsBlacklisted(token string) (bool, error) {
	tokenHash := r.hashToken(token)

	query := `
		SELECT COUNT(*) 
		FROM token_blacklist 
		WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP
	`

	var count int
	err := r.db.QueryRow(query, tokenHash).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check blacklist: %w", err)
	}

	return count > 0, nil
}

// BlacklistBySessionID blacklists all tokens for a specific session
func (r *TokenBlacklistRepository) BlacklistBySessionID(sessionID int, userID int) error {
	// Get session tokens
	query := `
		SELECT access_token_hash, refresh_token_hash, expires_at
		FROM sessions
		WHERE id = ? AND user_id = ?
	`

	var accessHash, refreshHash string
	var expiresAt time.Time

	err := r.db.QueryRow(query, sessionID, userID).Scan(&accessHash, &refreshHash, &expiresAt)
	if err != nil {
		return fmt.Errorf("failed to get session tokens: %w", err)
	}

	// Blacklist both tokens
	insertQuery := `
		INSERT INTO token_blacklist (user_id, token_hash, token_type, expires_at, reason)
		VALUES (?, ?, ?, ?, ?)
	`

	reason := fmt.Sprintf("Session %d invalidated", sessionID)

	// Blacklist access token
	_, err = r.db.Exec(insertQuery, userID, accessHash, "access", expiresAt, reason)
	if err != nil {
		log.Printf("[WARN] Failed to blacklist access token: %v", err)
	}

	// Blacklist refresh token
	_, err = r.db.Exec(insertQuery, userID, refreshHash, "refresh", expiresAt, reason)
	if err != nil {
		log.Printf("[WARN] Failed to blacklist refresh token: %v", err)
	}

	log.Printf("[SECURITY] Session tokens blacklisted - SessionID: %d, UserID: %d", sessionID, userID)
	return nil
}

// BlacklistUserTokens blacklists ALL tokens for a user
func (r *TokenBlacklistRepository) BlacklistUserTokens(userID int, reason string) error {
	// Get all active sessions
	query := `
		SELECT id, access_token_hash, refresh_token_hash, expires_at
		FROM sessions
		WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return fmt.Errorf("failed to get user sessions: %w", err)
	}
	defer rows.Close()

	insertQuery := `
		INSERT INTO token_blacklist (user_id, token_hash, token_type, expires_at, reason)
		VALUES (?, ?, ?, ?, ?)
	`

	for rows.Next() {
		var sessionID int
		var accessHash, refreshHash string
		var expiresAt time.Time

		if err := rows.Scan(&sessionID, &accessHash, &refreshHash, &expiresAt); err != nil {
			log.Printf("[WARN] Failed to scan session: %v", err)
			continue
		}

		// Blacklist access token
		_, err = r.db.Exec(insertQuery, userID, accessHash, "access", expiresAt, reason)
		if err != nil {
			log.Printf("[WARN] Failed to blacklist access token: %v", err)
		}

		// Blacklist refresh token
		_, err = r.db.Exec(insertQuery, userID, refreshHash, "refresh", expiresAt, reason)
		if err != nil {
			log.Printf("[WARN] Failed to blacklist refresh token: %v", err)
		}
	}

	log.Printf("[SECURITY] All user tokens blacklisted - UserID: %d, Reason: %s", userID, reason)
	return nil
}

// IsSessionActive checks if session still exists and is valid
func (r *TokenBlacklistRepository) IsSessionActive(sessionID int) (bool, error) {
	query := `
		SELECT COUNT(*) 
		FROM sessions 
		WHERE id = ? AND expires_at > CURRENT_TIMESTAMP
	`

	var count int
	err := r.db.QueryRow(query, sessionID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check session: %w", err)
	}

	return count > 0, nil
}

// CleanupExpired removes expired blacklist entries
func (r *TokenBlacklistRepository) CleanupExpired() error {
	query := `DELETE FROM token_blacklist WHERE expires_at <= CURRENT_TIMESTAMP`

	result, err := r.db.Exec(query)
	if err != nil {
		return fmt.Errorf("failed to cleanup expired tokens: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows > 0 {
		log.Printf("[CLEANUP] Removed %d expired blacklist entries", rows)
	}

	return nil
}