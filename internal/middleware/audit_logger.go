package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"strings"
	"time"

	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

// ✅ COMPREHENSIVE AUDIT LOGGING MIDDLEWARE
type AuditLoggerMiddleware struct {
	auditRepo *repository.AuditRepository
}

func NewAuditLoggerMiddleware(auditRepo *repository.AuditRepository) *AuditLoggerMiddleware {
	return &AuditLoggerMiddleware{
		auditRepo: auditRepo,
	}
}

type RequestInfo struct {
	Method      string
	Path        string
	RemoteAddr  string
	UserAgent   string
	RequestBody string
	UserID      int
	Duration    time.Duration
	StatusCode  int
	Error       string
}

// Middleware function
func (m *AuditLoggerMiddleware) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Skip health checks and static files
			if m.shouldSkipPath(c.Path()) {
				return next(c)
			}

			start := time.Now()
			
			// Capture request body for POST/PUT/DELETE
			var requestBody string
			if c.Request().Method != "GET" {
				bodyBytes, _ := io.ReadAll(c.Request().Body)
				c.Request().Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
				requestBody = m.sanitizeRequestBody(string(bodyBytes))
			}

			// Get user ID if authenticated
			userID := 0
			if id, ok := c.Get("user_id").(int); ok {
				userID = id
			}

			// Process request
			err := next(c)

			// Collect request info
			info := &RequestInfo{
				Method:      c.Request().Method,
				Path:        c.Path(),
				RemoteAddr:  c.RealIP(),
				UserAgent:   c.Request().Header.Get("User-Agent"),
				RequestBody: requestBody,
				UserID:      userID,
				Duration:    time.Since(start),
				StatusCode:  c.Response().Status,
			}

			if err != nil {
				info.Error = err.Error()
			}

			// Log to database
			m.logRequest(info)

			return err
		}
	}
}

// ✅ Determine if path should be audited
func (m *AuditLoggerMiddleware) shouldSkipPath(path string) bool {
	skipPaths := []string{
		"/api/health",
		"/static/",
		"/favicon.ico",
		"/__activate",
	}

	for _, skip := range skipPaths {
		if strings.HasPrefix(path, skip) {
			return true
		}
	}

	return false
}

// ✅ Sanitize sensitive data from request body
func (m *AuditLoggerMiddleware) sanitizeRequestBody(body string) string {
	if body == "" {
		return ""
	}

	// Limit body size
	if len(body) > 1000 {
		body = body[:1000] + "... (truncated)"
	}

	// Parse JSON and remove sensitive fields
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(body), &data); err == nil {
		sensitiveFields := []string{"password", "old_password", "new_password", "token", "secret"}
		
		for _, field := range sensitiveFields {
			if _, exists := data[field]; exists {
				data[field] = "***REDACTED***"
			}
		}

		sanitized, _ := json.Marshal(data)
		return string(sanitized)
	}

	return body
}

// ✅ Log request to database
func (m *AuditLoggerMiddleware) logRequest(info *RequestInfo) {
	action := m.determineAction(info)
	resource := m.determineResource(info)
	success := info.StatusCode < 400

	details := fmt.Sprintf(
		"Method: %s, Path: %s, Status: %d, Duration: %v",
		info.Method, info.Path, info.StatusCode, info.Duration,
	)

	if info.RequestBody != "" {
		details += fmt.Sprintf(", Body: %s", info.RequestBody)
	}

	if info.Error != "" {
		details += fmt.Sprintf(", Error: %s", info.Error)
	}

	// Log to database (async to avoid blocking request)
	go func() {
		err := m.auditRepo.LogAction(
			info.UserID,
			action,
			resource,
			info.RemoteAddr,
			info.UserAgent,
			success,
			details,
		)
		if err != nil {
			log.Printf("[Audit] Failed to log: %v", err)
		}
	}()
}

// ✅ Determine action from request
func (m *AuditLoggerMiddleware) determineAction(info *RequestInfo) string {
	path := info.Path
	method := info.Method

	// Login/Auth
	if strings.Contains(path, "/login") {
		if info.StatusCode == 200 {
			return "login_success"
		}
		return "login_failed"
	}
	if strings.Contains(path, "/logout") {
		return "logout"
	}
	if strings.Contains(path, "/register") {
		return "register"
	}

	// Transactions
	if strings.Contains(path, "/transactions") {
		if strings.Contains(path, "/delete-all") {
			return "delete_all_transactions"
		}
		switch method {
		case "POST":
			return "create_transaction"
		case "PUT":
			return "update_transaction"
		case "DELETE":
			return "delete_transaction"
		case "GET":
			return "view_transactions"
		}
	}

	// Users (Admin)
	if strings.Contains(path, "/users") {
		if strings.Contains(path, "/reset-password") {
			return "reset_user_password"
		}
		if strings.Contains(path, "/unlock") {
			return "unlock_user"
		}
		switch method {
		case "POST":
			return "create_user"
		case "PUT":
			return "update_user"
		case "DELETE":
			return "delete_user"
		case "GET":
			return "view_users"
		}
	}

	// Sessions
	if strings.Contains(path, "/sessions") {
		switch method {
		case "DELETE":
			if strings.Contains(path, "/all") {
				return "invalidate_all_sessions"
			}
			return "invalidate_session"
		case "GET":
			return "view_sessions"
		}
	}

	// Profile
	if strings.Contains(path, "/profile") {
		if strings.Contains(path, "/change-password") {
			return "change_password"
		}
		switch method {
		case "PUT":
			return "update_profile"
		case "GET":
			return "view_profile"
		}
	}

	// Audit logs
	if strings.Contains(path, "/audit-logs") {
		if strings.Contains(path, "/all") {
			return "delete_all_logs"
		}
		if strings.Contains(path, "/export") {
			return "export_logs"
		}
		return "view_audit_logs"
	}

	// Backup
	if strings.Contains(path, "/backup") {
		return "download_backup"
	}

	// Shutdown
	if strings.Contains(path, "/shutdown") {
		return "server_shutdown"
	}

	return "unknown_action"
}

// ✅ Determine resource from request
func (m *AuditLoggerMiddleware) determineResource(info *RequestInfo) string {
	path := info.Path

	if strings.Contains(path, "/auth") || strings.Contains(path, "/login") || strings.Contains(path, "/logout") {
		return "auth"
	}
	if strings.Contains(path, "/transactions") {
		return "transaction"
	}
	if strings.Contains(path, "/users") {
		return "user"
	}
	if strings.Contains(path, "/sessions") {
		return "session"
	}
	if strings.Contains(path, "/profile") {
		return "profile"
	}
	if strings.Contains(path, "/audit-logs") {
		return "audit"
	}
	if strings.Contains(path, "/backup") {
		return "backup"
	}
	if strings.Contains(path, "/shutdown") {
		return "system"
	}

	return "unknown"
}