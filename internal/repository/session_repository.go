// FILE: internal/repository/session_repository.go
package repository

import (
	"fmt"
	"log"
	"time"

	"Monex/internal/database"
	"Monex/internal/models"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

type SessionRepository struct {
	db *database.DB
}

func NewSessionRepository(db *database.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

// GenerateDeviceID creates unique device identifier
func (r *SessionRepository) GenerateDeviceID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashToken creates SHA256 hash
func (r *SessionRepository) hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// CreateSession creates new session
func (r *SessionRepository) CreateSession(
	userID int,
	deviceName string,
	browser string,
	os string,
	ipAddress string,
	accessToken string,
	refreshToken string,
	expiresAt time.Time,
) (*models.Session, error) {
	deviceID, err := r.GenerateDeviceID()
	if err != nil {
		log.Printf("[ERROR] Failed to generate device ID: %v", err)
		return nil, err
	}

	// 🔴 FIX: Format timestamps properly for SQLite
	now := time.Now().UTC()
	expiresAtFormatted := expiresAt.UTC()

	log.Printf("[DEBUG] CreateSession - UserID: %d, DeviceID: %s, DeviceName: %s", userID, deviceID, deviceName)
	log.Printf("[DEBUG] CreateSession - CreatedAt: %v, ExpiresAt: %v", now, expiresAtFormatted)

	query := `
    INSERT INTO sessions 
    (user_id, device_id, device_name, browser, os, ip_address, 
     access_token_hash, refresh_token_hash, last_activity, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `

	result, err := r.db.Exec(
		query,
		userID,
		deviceID,
		deviceName,
		browser,
		os,
		ipAddress,
		r.hashToken(accessToken),
		r.hashToken(refreshToken),
		now.Format("2006-01-02 15:04:05"),     // last_activity
		expiresAtFormatted.Format("2006-01-02 15:04:05"), // expires_at
		now.Format("2006-01-02 15:04:05"),     // created_at
		now.Format("2006-01-02 15:04:05"),     // updated_at
	)
	if err != nil {
		log.Printf("[ERROR] CreateSession Exec failed: %v", err)
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		log.Printf("[ERROR] Failed to get LastInsertId: %v", err)
		return nil, fmt.Errorf("failed to get session ID: %w", err)
	}

	log.Printf("[DEBUG] CreateSession SUCCESS - SessionID: %d", id)

	return &models.Session{
		ID:           int(id),
		UserID:       userID,
		DeviceID:     deviceID,
		DeviceName:   deviceName,
		Browser:      browser,
		OS:           os,
		IPAddress:    ipAddress,
		LastActivity: now,
		ExpiresAt:    expiresAtFormatted,
		CreatedAt:    now,
	}, nil
}

// GetUserSessions retrieves all active sessions for user
func (r *SessionRepository) GetUserSessions(userID int) ([]*models.Session, error) {
	query := `
    SELECT id, user_id, device_id, device_name, browser, os, ip_address,
           last_activity, expires_at, created_at
    FROM sessions
    WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP
    ORDER BY last_activity DESC
  `

	log.Printf("[DEBUG] GetUserSessions query for UserID: %d", userID)

	rows, err := r.db.Query(query, userID)
	if err != nil {
		log.Printf("[ERROR] GetUserSessions Query failed: %v", err)
		return nil, fmt.Errorf("failed to query sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*models.Session
	rowCount := 0

	for rows.Next() {
		rowCount++
		session := &models.Session{}
		var lastActivityStr, expiresAtStr, createdAtStr string

		err := rows.Scan(
			&session.ID,
			&session.UserID,
			&session.DeviceID,
			&session.DeviceName,
			&session.Browser,
			&session.OS,
			&session.IPAddress,
			&lastActivityStr,
			&expiresAtStr,
			&createdAtStr,
		)
		if err != nil {
			log.Printf("[ERROR] GetUserSessions Scan failed: %v", err)
			return nil, fmt.Errorf("failed to scan session: %w", err)
		}

		// 🔴 FIX: Parse timestamp strings
		if lastActivity, err := time.Parse("2006-01-02 15:04:05", lastActivityStr); err == nil {
			session.LastActivity = lastActivity
		}
		if expiresAt, err := time.Parse("2006-01-02 15:04:05", expiresAtStr); err == nil {
			session.ExpiresAt = expiresAt
		}
		if createdAt, err := time.Parse("2006-01-02 15:04:05", createdAtStr); err == nil {
			session.CreatedAt = createdAt
		}

		sessions = append(sessions, session)
		log.Printf("[DEBUG] Session %d - Device: %s, Expires: %s", session.ID, session.DeviceName, expiresAtStr)
	}

	if err = rows.Err(); err != nil {
		log.Printf("[ERROR] GetUserSessions rows iteration error: %v", err)
		return nil, fmt.Errorf("error iterating sessions: %w", err)
	}

	log.Printf("[DEBUG] GetUserSessions - Found %d sessions for UserID %d", rowCount, userID)

	if sessions == nil {
		sessions = make([]*models.Session, 0)
	}

	return sessions, nil
}

// InvalidateSession revokes specific session
func (r *SessionRepository) InvalidateSession(sessionID int, userID int) error {
	query := "DELETE FROM sessions WHERE id = ? AND user_id = ?"
	log.Printf("[DEBUG] InvalidateSession - SessionID: %d, UserID: %d", sessionID, userID)
	
	result, err := r.db.Exec(query, sessionID, userID)
	if err != nil {
		log.Printf("[ERROR] InvalidateSession failed: %v", err)
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	log.Printf("[DEBUG] InvalidateSession - Rows deleted: %d", rowsAffected)

	return nil
}

// InvalidateAllUserSessions revokes all user sessions
func (r *SessionRepository) InvalidateAllUserSessions(userID int) error {
	query := "DELETE FROM sessions WHERE user_id = ?"
	log.Printf("[DEBUG] InvalidateAllUserSessions - UserID: %d", userID)
	
	result, err := r.db.Exec(query, userID)
	if err != nil {
		log.Printf("[ERROR] InvalidateAllUserSessions failed: %v", err)
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	log.Printf("[DEBUG] InvalidateAllUserSessions - Rows deleted: %d", rowsAffected)

	return nil
}

// UpdateActivity updates last activity timestamp
func (r *SessionRepository) UpdateActivity(deviceID string) error {
	query := "UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE device_id = ?"
	log.Printf("[DEBUG] UpdateActivity - DeviceID: %s", deviceID)
	
	_, err := r.db.Exec(query, deviceID)
	return err
}

// DeleteExpiredSessions removes expired sessions
func (r *SessionRepository) DeleteExpiredSessions() error {
	query := "DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"
	
	result, err := r.db.Exec(query)
	if err != nil {
		log.Printf("[ERROR] DeleteExpiredSessions failed: %v", err)
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("[DEBUG] DeleteExpiredSessions - Rows deleted: %d", rowsAffected)
	}

	return nil
}