package repository

import (
	"fmt"
	"log"
	"strings"

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

// GetAuditLogs retrieves audit logs with optional sorting (admin only)
func (r *AuditRepository) GetAuditLogs(limit, offset int, filters map[string]interface{}) ([]*models.AuditLog, int, error) {
	// Build WHERE clause
	whereClauses := []string{}
	args := []interface{}{}

	if search, ok := filters["search"].(string); ok && search != "" {
		whereClauses = append(whereClauses, "(action LIKE ? OR resource LIKE ? OR details LIKE ?)")
		searchPattern := "%" + search + "%"
		args = append(args, searchPattern, searchPattern, searchPattern)
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM audit_logs %s", whereClause)
	var total int
	err := r.db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		log.Printf("[ERROR] Failed to count audit logs: %v", err)
		return nil, 0, fmt.Errorf("failed to count audit logs: %w", err)
	}

	log.Printf("[DEBUG] Total audit logs: %d", total)

	// Build ORDER BY clause
	sortField := "created_at"
	sortOrder := "DESC"
	if field, ok := filters["sortField"].(string); ok && field != "" {
		// Validate sort field to prevent SQL injection
		validFields := map[string]bool{
			"id": true, "user_id": true, "action": true, "resource": true,
			"ip_address": true, "success": true, "created_at": true,
		}
		if validFields[field] {
			sortField = field
		}
	}
	if order, ok := filters["sortOrder"].(string); ok && order != "" {
		sortOrder = strings.ToUpper(order)
		if sortOrder != "ASC" && sortOrder != "DESC" {
			sortOrder = "DESC"
		}
	}

	// Get logs
	query := fmt.Sprintf(`
		SELECT id, COALESCE(user_id, 0) as user_id, action, resource, 
		       COALESCE(ip_address, '') as ip_address, 
		       COALESCE(user_agent, '') as user_agent, 
		       success, COALESCE(details, '') as details, created_at
		FROM audit_logs
		%s
		ORDER BY %s %s
		LIMIT ? OFFSET ?
	`, whereClause, sortField, sortOrder)

	queryArgs := append(args, limit, offset)

	log.Printf("[DEBUG] Audit query: %s with args: %v", query, queryArgs)

	rows, err := r.db.Query(query, queryArgs...)
	if err != nil {
		log.Printf("[ERROR] Failed to query audit logs: %v", err)
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
			log.Printf("[ERROR] Failed to scan audit log: %v", err)
			return nil, 0, fmt.Errorf("failed to scan audit log: %w", err)
		}
		logs = append(logs, log)
	}

	log.Printf("[DEBUG] Retrieved %d audit logs", len(logs))

	return logs, total, nil
}

// LogActionWithNullUser logs an audit entry with NULL user_id (for unauthenticated requests)
func (r *AuditRepository) LogActionWithNullUser(
	action string,
	resource string,
	ipAddress string,
	userAgent string,
	success bool,
	details string,
) error {
	query := `
		INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent, success, details, created_at)
		VALUES (NULL, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`

	_, err := r.db.Exec(query, action, resource, ipAddress, userAgent, success, details)
	if err != nil {
		return fmt.Errorf("failed to log audit: %w", err)
	}

	return nil
}

// DeleteAll deletes all audit logs (admin only)
func (r *AuditRepository) DeleteAll() error {
	_, err := r.db.Exec("DELETE FROM audit_logs")
	if err != nil {
		return fmt.Errorf("failed to delete all audit logs: %w", err)
	}
	return nil
}
