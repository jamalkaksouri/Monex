package handlers

import (
	"net/http"
	"strconv"

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
		pageSize = 10
	}

	offset := (page - 1) * pageSize

	logs, total, err := h.auditRepo.GetAuditLogs(pageSize, offset)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در دریافت لاگ‌های سیستم")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"data":     logs,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}
