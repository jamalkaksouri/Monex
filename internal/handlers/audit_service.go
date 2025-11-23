package handlers

import (
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

// AuditService handles audit logging for handlers
type AuditService struct {
	auditRepo *repository.AuditRepository
}

func NewAuditService(auditRepo *repository.AuditRepository) *AuditService {
	return &AuditService{
		auditRepo: auditRepo,
	}
}

// LogAction logs an action with context from echo.Context
func (s *AuditService) LogAction(
	c echo.Context,
	userID int,
	action string,
	resource string,
	success bool,
	details string,
) error {
	// Extract request info
	ipAddress := c.RealIP()
	userAgent := c.Request().Header.Get("User-Agent")

	// Log to database
	return s.auditRepo.LogAction(userID, action, resource, ipAddress, userAgent, success, details)
}

// LogActionNoAuth logs actions for non-authenticated requests (login attempts)
func (s *AuditService) LogActionNoAuth(
	c echo.Context,
	action string,
	resource string,
	success bool,
	details string,
) error {
	ipAddress := c.RealIP()
	userAgent := c.Request().Header.Get("User-Agent")

	return s.auditRepo.LogAction(0, action, resource, ipAddress, userAgent, success, details)
}
