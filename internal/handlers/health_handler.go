// internal/handlers/health_handler.go
package handlers

import (
	"net/http"
	"runtime"
	"time"

	"Monex/internal/database"

	"github.com/labstack/echo/v4"
)

type HealthHandler struct {
	db        *database.DB
	startTime time.Time
}

func NewHealthHandler(db *database.DB) *HealthHandler {
	return &HealthHandler{
		db:        db,
		startTime: time.Now(),
	}
}

type HealthResponse struct {
	Status    string                 `json:"status"`
	Timestamp time.Time              `json:"timestamp"`
	Uptime    string                 `json:"uptime"`
	Database  DatabaseHealth         `json:"database"`
	System    SystemHealth           `json:"system"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

type DatabaseHealth struct {
	Status      string `json:"status"`
	Ping        string `json:"ping"`
	Connections int    `json:"open_connections"`
}

type SystemHealth struct {
	GoVersion    string `json:"go_version"`
	NumGoroutine int    `json:"num_goroutine"`
	MemoryAlloc  string `json:"memory_alloc"`
	NumCPU       int    `json:"num_cpu"`
}

// ✅ Comprehensive health check endpoint
func (h *HealthHandler) HealthCheck(c echo.Context) error {
	response := &HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
		Uptime:    time.Since(h.startTime).String(),
	}

	// ✅ Database health check
	dbHealth := h.checkDatabase()
	response.Database = dbHealth

	if dbHealth.Status != "healthy" {
		response.Status = "degraded"
	}

	// ✅ System health metrics
	response.System = h.getSystemMetrics()

	// ✅ Additional details for authenticated users
	if userID, ok := c.Get("user_id").(int); ok && userID > 0 {
		response.Details = map[string]interface{}{
			"user_authenticated": true,
			"user_id":            userID,
		}
	}

	statusCode := http.StatusOK
	if response.Status == "unhealthy" {
		statusCode = http.StatusServiceUnavailable
	} else if response.Status == "degraded" {
		statusCode = http.StatusOK // Still return 200 for degraded
	}

	return c.JSON(statusCode, response)
}

// ✅ Check database connectivity
func (h *HealthHandler) checkDatabase() DatabaseHealth {
	health := DatabaseHealth{
		Status: "unhealthy",
	}

	start := time.Now()
	
	// Ping database
	if err := h.db.Ping(); err != nil {
		health.Ping = "failed"
		return health
	}

	health.Ping = time.Since(start).String()
	health.Status = "healthy"

	// Get connection stats
	stats := h.db.Stats()
	health.Connections = stats.OpenConnections

	return health
}

// ✅ Get system metrics
func (h *HealthHandler) getSystemMetrics() SystemHealth {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	return SystemHealth{
		GoVersion:    runtime.Version(),
		NumGoroutine: runtime.NumGoroutine(),
		MemoryAlloc:  formatBytes(m.Alloc),
		NumCPU:       runtime.NumCPU(),
	}
}

// ✅ Simple health check (fast, for monitoring)
func (h *HealthHandler) SimpleHealthCheck(c echo.Context) error {
	// Just check if server is responding
	return c.JSON(http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now(),
	})
}

// ✅ Readiness check (for load balancers)
func (h *HealthHandler) ReadinessCheck(c echo.Context) error {
	// Check if database is ready
	if err := h.db.Ping(); err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]interface{}{
			"status": "not_ready",
			"reason": "database unavailable",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"status": "ready",
	})
}

// ✅ Liveness check (for Kubernetes)
func (h *HealthHandler) LivenessCheck(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]interface{}{
		"status": "alive",
	})
}

// Helper function to format bytes
func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return string(rune(b)) + " B"
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return string(rune(b/div)) + " " + "KMGTPE"[exp:exp+1] + "B"
}