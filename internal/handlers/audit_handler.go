package handlers

import (
	"log"
	"net/http"
	"strconv"

	"Monex/internal/middleware"
	"Monex/internal/models"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

type AuditHandler struct {
	auditRepo *repository.AuditRepository
}

func NewAuditHandler(auditRepo *repository.AuditRepository) *AuditHandler {
	return &AuditHandler{
		auditRepo: auditRepo,
	}
}

// GetAuditLogs retrieves audit logs (admin only)
func (h *AuditHandler) GetAuditLogs(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}

	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	// Build filters
	filters := make(map[string]interface{})
	if sortField := c.QueryParam("sortField"); sortField != "" {
		filters["sortField"] = sortField
	}
	if sortOrder := c.QueryParam("sortOrder"); sortOrder != "" {
		filters["sortOrder"] = sortOrder
	}
	if search := c.QueryParam("search"); search != "" {
		filters["search"] = search
	}

	logs, total, err := h.auditRepo.GetAuditLogs(pageSize, offset, filters)
	if err != nil {
		log.Printf("[ERROR] GetAuditLogs failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, map[string]interface{}{
			"message": "خطا در دریافت لاگ‌های سیستم",
			"error":   err.Error(),
		})
	}

	log.Printf("[DEBUG] GetAuditLogs - Found %d logs (total: %d)", len(logs), total)

	// ✅ Always return valid array, never null
	if logs == nil {
		logs = make([]*models.AuditLog, 0)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"data":     logs,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// DeleteAllAuditLogs deletes all audit logs (admin only)
func (h *AuditHandler) DeleteAllAuditLogs(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	// Delete all logs
	if err := h.auditRepo.DeleteAll(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در حذف لاگ‌ها")
	}

	// Log this action (to new empty log table)
	_ = h.auditRepo.LogAction(
		userID,
		"delete_all_logs",
		"audit",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		"Deleted all audit logs",
	)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "تمام لاگ‌ها با موفقیت حذف شدند",
	})
}

// ExportAuditLogs exports all audit logs (admin only)
func (h *AuditHandler) ExportAuditLogs(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	// Get all logs without pagination
	logs, _, err := h.auditRepo.GetAuditLogs(100000, 0, nil)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در دریافت لاگ‌ها")
	}

	// Log export action
	_ = h.auditRepo.LogAction(
		userID,
		"export_logs",
		"audit",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		"Exported audit logs",
	)

	return c.JSON(http.StatusOK, logs)
}
