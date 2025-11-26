package repository

import (
	"Monex/internal/database"
	"Monex/internal/models"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"time"
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
		return nil, err
	}

	query := `
    INSERT INTO sessions 
    (user_id, device_id, device_name, browser, os, ip_address, 
     access_token_hash, refresh_token_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		expiresAt,
	)
	if err != nil {
		return nil, err
	}

	id, _ := result.LastInsertId()
	return &models.Session{
		ID:       int(id),
		UserID:   userID,
		DeviceID: deviceID,
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

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*models.Session
	for rows.Next() {
		session := &models.Session{}
		err := rows.Scan(
			&session.ID, &session.UserID, &session.DeviceID, &session.DeviceName,
			&session.Browser, &session.OS, &session.IPAddress,
			&session.LastActivity, &session.ExpiresAt, &session.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, nil
}

// InvalidateSession revokes specific session
func (r *SessionRepository) InvalidateSession(sessionID int, userID int) error {
	query := "DELETE FROM sessions WHERE id = ? AND user_id = ?"
	_, err := r.db.Exec(query, sessionID, userID)
	return err
}

// InvalidateAllUserSessions revokes all user sessions
func (r *SessionRepository) InvalidateAllUserSessions(userID int) error {
	query := "DELETE FROM sessions WHERE user_id = ?"
	_, err := r.db.Exec(query, userID)
	return err
}

// UpdateActivity updates last activity timestamp
func (r *SessionRepository) UpdateActivity(deviceID string) error {
	query := "UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE device_id = ?"
	_, err := r.db.Exec(query, deviceID)
	return err
}

// DeleteExpiredSessions removes expired sessions
func (r *SessionRepository) DeleteExpiredSessions() error {
	query := "DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"
	_, err := r.db.Exec(query)
	return err
}
