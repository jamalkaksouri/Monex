package repository

import (
	"fmt"

	"Monex/internal/database"
	"Monex/internal/models"
)

type AuditRepository struct {
	db *database.DB
}

func NewAuditRepository(db *database.DB) *AuditRepository {
	return &AuditRepository{db: db}
}

// LogAction logs an audit entry to the database
func (r *AuditRepository) LogAction(
	userID int,
	action string,
	resource string,
	ipAddress string,
	userAgent string,
	success bool,
	details string,
) error {
	query := `
		INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent, success, details, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`

	_, err := r.db.Exec(query, userID, action, resource, ipAddress, userAgent, success, details)
	if err != nil {
		return fmt.Errorf("failed to log audit: %w", err)
	}

	return nil
}

// GetAuditLogs retrieves audit logs (admin only)
func (r *AuditRepository) GetAuditLogs(limit, offset int) ([]*models.AuditLog, int, error) {
	// Get total count
	var total int
	err := r.db.QueryRow("SELECT COUNT(*) FROM audit_logs").Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count audit logs: %w", err)
	}

	// Get logs
	query := `
		SELECT id, user_id, action, resource, ip_address, user_agent, success, details, created_at
		FROM audit_logs
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`

	rows, err := r.db.Query(query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get audit logs: %w", err)
	}
	defer rows.Close()

	logs := make([]*models.AuditLog, 0, limit)
	for rows.Next() {
		log := &models.AuditLog{}
		err := rows.Scan(
			&log.ID,
			&log.UserID,
			&log.Action,
			&log.Resource,
			&log.IPAddress,
			&log.UserAgent,
			&log.Success,
			&log.Details,
			&log.CreatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan audit log: %w", err)
		}
		logs = append(logs, log)
	}

	return logs, total, nil
}
