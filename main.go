package main

import (
	"context"
	"crypto/tls"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"syscall"
	"time"

	"Monex/config"
	"Monex/internal/database"
	"Monex/internal/handlers"
	"Monex/internal/middleware"
	"Monex/internal/repository"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	echomiddleware "github.com/labstack/echo/v4/middleware"
	"golang.org/x/time/rate"
	"gopkg.in/natefinch/lumberjack.v2"
)

//go:embed frontend/build/*
var staticFiles embed.FS

type Icons struct {
	Rocket   string
	Database string
	Check    string
	Warning  string
	Stop     string
	Lock     string
	Globe    string
	Chart    string
}

var icons Icons
var logFilePath string

func init() {
	if runtime.GOOS == "windows" {
		icons = Icons{
			Rocket:   "[START]",
			Database: "[DB]",
			Check:    "[OK]",
			Warning:  "[!]",
			Stop:     "[STOP]",
			Lock:     "[*]",
			Globe:    "[WEB]",
			Chart:    "[INFO]",
		}
	} else {
		icons = Icons{
			Rocket:   "🚀",
			Database: "💾",
			Check:    "✅",
			Warning:  "⚠️",
			Stop:     "🛑",
			Lock:     "🔒",
			Globe:    "🌐",
			Chart:    "📊",
		}
	}
}

// Load .env values with default fallback
func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// Initialize file logging with rotation reading from .env
func initLogger() error {
	godotenv.Load()
	workDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %v", err)
	}

	logFileName := getEnvOrDefault("LOG_FILENAME", "monex.log")
	logFilePath = filepath.Join(workDir, logFileName)

	maxSize, _ := strconv.Atoi(getEnvOrDefault("LOG_MAX_SIZE", "5"))
	maxBackups, _ := strconv.Atoi(getEnvOrDefault("LOG_MAX_BACKUPS", "5"))
	maxAge, _ := strconv.Atoi(getEnvOrDefault("LOG_MAX_AGE", "30"))
	compress := getEnvOrDefault("LOG_COMPRESS", "true") == "true"

	lumberjackLogger := &lumberjack.Logger{
		Filename:   logFilePath,
		MaxSize:    maxSize,
		MaxBackups: maxBackups,
		MaxAge:     maxAge,
		Compress:   compress,
	}

	var logOutput io.Writer
	if runtime.GOOS == "windows" {
		if _, err := os.Stdout.Write([]byte("")); err != nil {
			logOutput = lumberjackLogger
		} else {
			logOutput = io.MultiWriter(os.Stdout, lumberjackLogger)
		}
	} else {
		logOutput = io.MultiWriter(os.Stdout, lumberjackLogger)
	}

	log.SetOutput(logOutput)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("Logger initialized successfully using .env config")
	return nil
}

func logSystemInfo() {
	log.Printf("\n%s ==========================================", icons.Chart)
	log.Printf("%s  SYSTEM INFORMATION", icons.Chart)
	log.Printf("%s ==========================================", icons.Chart)
	log.Printf("Operating System: %s", runtime.GOOS)
	log.Printf("Architecture: %s", runtime.GOARCH)
	log.Printf("Go Version: %s", runtime.Version())
	log.Printf("Number of CPUs: %d", runtime.NumCPU())

	exePath, err := os.Executable()
	if err != nil {
		log.Printf("%s Failed to get executable path: %v", icons.Warning, err)
	} else {
		log.Printf("Executable Path: %s", exePath)
		log.Printf("Executable Directory: %s", filepath.Dir(exePath))
	}

	workDir, err := os.Getwd()
	if err != nil {
		log.Printf("%s Failed to get working directory: %v", icons.Warning, err)
	} else {
		log.Printf("Working Directory: %s", workDir)
	}
	log.Printf("%s ==========================================\n", icons.Chart)
}

func main() {
	// 1. Initialize logger FIRST
	if err := initLogger(); err != nil {
		fmt.Fprintf(os.Stderr, "CRITICAL: Failed to initialize logger: %v\n", err)
		log.SetOutput(os.Stdout)
	} else {
		log.Printf("%s Log file created: %s", icons.Check, logFilePath)
	}

	// 2. Load configuration immediately to get the correct PORT
	log.Printf("%s Loading configuration...", icons.Lock)
	cfg := config.Load()
	log.Printf("%s Configuration loaded successfully", icons.Check)

	// Wrap everything in recovery
	defer func() {
		if r := recover(); r != nil {
			log.Printf("\n%s PANIC RECOVERED: %v", icons.Stop, r)
			buf := make([]byte, 4096)
			n := runtime.Stack(buf, false)
			log.Printf("%s", buf[:n])
			if runtime.GOOS == "windows" {
				log.Println("\nPress Enter to close...")
				fmt.Scanln()
			}
			os.Exit(1)
		}
	}()

	// 3. Check if another instance is running
	//    We use the configured port, and we strictly use HTTPS for the activation request.
	checkAddr := net.JoinHostPort("localhost", cfg.Server.Port)
	conn, err := net.Dial("tcp", checkAddr)
	if err == nil {
		conn.Close()
		// FIXED: Use HTTPS and skip verify for localhost self-signed certs
		notifyURL := fmt.Sprintf("https://%s/__activate", checkAddr)

		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		client := &http.Client{Timeout: 2 * time.Second, Transport: tr}

		resp, err := client.Get(notifyURL)
		if err == nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			log.Printf("%s Notified running instance to activate browser. Exiting.", icons.Check)
		} else {
			// If we get a connection error here, it might be because the other instance
			// is stuck or not serving HTTPS yet.
			log.Printf("%s Another instance is running but activation request failed: %v", icons.Warning, err)
		}
		os.Exit(0)
	}

	log.Printf("\n%s ==========================================", icons.Rocket)
	log.Printf("%s  MONEX - Transaction Management System", icons.Chart)
	log.Printf("%s ==========================================\n", icons.Rocket)

	logSystemInfo()

	// Validate basic settings
	if cfg.JWT.Secret == "" || len(cfg.JWT.Secret) < 32 {
		log.Fatalf("%s CRITICAL: JWT_SECRET must be set and at least 32 characters long", icons.Stop)
	}

	// Initialize database
	log.Printf("%s Initializing database...", icons.Database)
	dbDir := filepath.Dir(cfg.Database.Path)
	if dbDir == "." || dbDir == "" {
		dbDir, _ = os.Getwd()
	}
	_ = os.MkdirAll(dbDir, 0755)

	db := database.New(&cfg.Database)
	if db == nil {
		log.Fatalf("%s CRITICAL: Database initialization returned nil", icons.Stop)
	}
	defer db.Close()
	log.Printf("%s Database initialized successfully", icons.Check)

	middleware.Blacklist.StartCleanupRoutine(10 * time.Minute)

	// Initialize Server
	log.Printf("%s Initializing HTTP server...", icons.Globe)
	e := echo.New()
	e.HideBanner = true
	e.Logger.SetOutput(io.Discard)

	// Middleware
	e.Use(echomiddleware.Logger())
	e.Use(echomiddleware.Recover())
	e.Use(middleware.SecurityHeadersMiddleware())

	// ✅ CORS Configuration
	e.Use(echomiddleware.CORSWithConfig(echomiddleware.CORSConfig{
		AllowOrigins:     []string{"http://localhost:3040", "http://localhost:3000"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	e.Use(echomiddleware.Gzip())
	e.Use(echomiddleware.RateLimiter(echomiddleware.NewRateLimiterMemoryStore(rate.Limit(cfg.Security.RateLimit))))
	e.Use(echomiddleware.CORSWithConfig(echomiddleware.CORSConfig{
		AllowOrigins:     []string{"http://localhost:3040", "http://localhost:3000"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	// Initialize Repositories & Handlers
	userRepo := repository.NewUserRepository(db)
	transactionRepo := repository.NewTransactionRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	tokenBlacklistRepo := repository.NewTokenBlacklistRepository(db)
	sessionRepo := repository.NewSessionRepository(db)

	jwtManager := middleware.NewJWTManager(&cfg.JWT, tokenBlacklistRepo)
	sessionHandler := handlers.NewSessionHandler(sessionRepo, auditRepo, tokenBlacklistRepo)
	authHandler := handlers.NewAuthHandler(userRepo, auditRepo, sessionRepo, tokenBlacklistRepo, jwtManager, cfg)
	profileHandler := handlers.NewProfileHandler(userRepo, &cfg.Security)
	userHandler := handlers.NewUserHandler(userRepo, auditRepo, sessionRepo, tokenBlacklistRepo, cfg)
	transactionHandler := handlers.NewTransactionHandler(transactionRepo, auditRepo)
	auditHandler := handlers.NewAuditHandler(auditRepo)
	sseHandler := handlers.NewSSEHandler(handlers.GlobalNotificationHub)
	securityWarningsHandler := handlers.NewSecurityWarningsHandler(auditRepo, userRepo)

	// Setup Routes
	api := e.Group("/api")

	// Construct the App URL for internal usage
	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	// We force localhost for the URL link to ensure the browser can resolve it even if host is 0.0.0.0
	browserURL := fmt.Sprintf("https://localhost:%s", cfg.Server.Port)

	// Internal activation endpoint
	e.GET("/__activate", func(c echo.Context) error {
		host, _, _ := net.SplitHostPort(c.Request().RemoteAddr)
		if host != "127.0.0.1" && host != "::1" {
			return c.NoContent(http.StatusForbidden)
		}
		go func() {
			openBrowser(browserURL)
		}()
		return c.JSON(http.StatusOK, map[string]string{"message": "activated"})
	})

	// Public Routes
	api.POST("/auth/login", authHandler.Login)
	api.POST("/auth/register", authHandler.Register)
	api.POST("/auth/refresh", authHandler.RefreshToken)

	// Protected Routes
	protected := api.Group("")
	protected.Use(jwtManager.AuthMiddleware())

	protected.GET("/security/warnings", securityWarningsHandler.GetSecurityWarnings)
	protected.GET("/security/status", securityWarningsHandler.GetAccountStatus)

	protected.Use(middleware.UserStatusMiddleware(userRepo, tokenBlacklistRepo, sessionRepo))
	protected.Use(middleware.SessionActivityMiddleware(sessionRepo))

	// Session & Auth Management
	protected.GET("/sessions", sessionHandler.GetSessions)
	protected.GET("/sessions/:sessionId/validate", sessionHandler.ValidateSession)
	protected.GET("/sessions/:sessionId/wait-invalidation", sessionHandler.WaitForSessionInvalidation)
	protected.DELETE("/sessions/:id", sessionHandler.InvalidateSession)
	protected.DELETE("/sessions/all", sessionHandler.InvalidateAllSessions)
	protected.POST("/logout", authHandler.Logout)

	// App Data
	protected.GET("/profile", profileHandler.GetProfile)
	protected.PUT("/profile", profileHandler.UpdateProfile)
	protected.POST("/profile/change-password", profileHandler.ChangePassword)
	protected.GET("/transactions", transactionHandler.ListTransactions)
	protected.POST("/transactions", transactionHandler.CreateTransaction)
	protected.PUT("/transactions/:id", transactionHandler.UpdateTransaction)
	protected.DELETE("/transactions/:id", transactionHandler.DeleteTransaction)
	protected.GET("/stats", transactionHandler.GetStats)
	protected.GET("/backup", handlers.BackupHandler(db))

	// Notifications
	e.GET("/api/notifications/stream", func(c echo.Context) error {
		tokenStr := c.QueryParam("token")
		if tokenStr == "" {
			return echo.NewHTTPError(http.StatusUnauthorized)
		}
		claims, err := jwtManager.ValidateToken(tokenStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized)
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		return sseHandler.HandleSSE(c)
	})

	// Admin
	admin := protected.Group("/admin")
	admin.Use(middleware.RequireRole("admin"))
	admin.GET("/users", userHandler.ListUsers)
	admin.POST("/users", userHandler.CreateUser)
	admin.GET("/users/:id", userHandler.GetUser)
	admin.PUT("/users/:id", userHandler.UpdateUser)
	admin.DELETE("/users/:id", userHandler.DeleteUser)
	admin.POST("/users/:id/reset-password", userHandler.ResetUserPassword)
	admin.POST("/users/:id/unlock", userHandler.UnlockUser)
	admin.GET("/audit-logs", auditHandler.GetAuditLogs)
	admin.DELETE("/audit-logs/all", auditHandler.DeleteAllAuditLogs)
	admin.GET("/audit-logs/export", auditHandler.ExportAuditLogs)

	// Shutdown
	protected.POST("/shutdown", func(c echo.Context) error {
		userID, _ := middleware.GetUserID(c)
		role, _ := middleware.GetUserRole(c)
		if role != "admin" {
			return echo.NewHTTPError(http.StatusForbidden, "Admin only")
		}
		auditRepo.LogAction(userID, "server_shutdown", "system", c.RealIP(), c.Request().Header.Get("User-Agent"), true, "Server shutdown by admin")
		c.JSON(http.StatusOK, map[string]string{"message": "Server shutting down..."})
		go func() {
			time.Sleep(500 * time.Millisecond)
			os.Exit(0)
		}()
		return nil
	}, middleware.RequireRole("admin"))

	// Periodic Cleanup
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			sessionRepo.DeleteExpiredSessions()
			tokenBlacklistRepo.CleanupExpired()
		}
	}()

	// Static Files
	frontendSubFS, err := fs.Sub(staticFiles, "frontend/build")
	if err != nil {
		log.Printf("%s Warning: Could not load embedded frontend: %v", icons.Warning, err)
	} else {
		staticHandler := http.FileServer(http.FS(frontendSubFS))
		e.GET("/static/*", echo.WrapHandler(http.StripPrefix("/", staticHandler)))
		e.GET("/*", func(c echo.Context) error {
			indexHTML, err := frontendSubFS.Open("index.html")
			if err != nil {
				return echo.NewHTTPError(http.StatusNotFound, "UI not found")
			}
			defer indexHTML.Close()
			return c.Stream(http.StatusOK, "text/html; charset=utf-8", indexHTML)
		})
	}

	// --- SERVER STARTUP ---

	// Validate TLS Certs
	if _, err := os.Stat(cfg.Server.TLSCertFile); err != nil {
		log.Fatalf("%s TLS certificate file not found: %v", icons.Stop, err)
	}
	if _, err := os.Stat(cfg.Server.TLSKeyFile); err != nil {
		log.Fatalf("%s TLS key file not found: %v", icons.Stop, err)
	}

	log.Printf("%s Starting HTTPS server at %s", icons.Rocket, browserURL)

	// Start Server in Goroutine
	go func() {
		if err := e.StartTLS(addr, cfg.Server.TLSCertFile, cfg.Server.TLSKeyFile); err != nil && err != http.ErrServerClosed {
			log.Fatalf("%s Server error: %v", icons.Stop, err)
		}
	}()

	// Browser Waiter
	go func() {
		// FIXED: Waiter must speak HTTPS
		// Since we use localhost with likely self-signed certs, we must skip verify
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		client := &http.Client{Transport: tr, Timeout: 1 * time.Second}

		// Poll until server responds
		for {
			resp, err := client.Get(browserURL)
			if err == nil {
				resp.Body.Close()
				break
			}
			time.Sleep(200 * time.Millisecond)
		}
		openBrowser(browserURL)
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	var shutdownInitiated bool
	shutdownMutex := &sync.Mutex{}

	go func() {
		<-quit
		shutdownMutex.Lock()
		if shutdownInitiated {
			log.Printf("\n%s Force quit requested - terminating immediately", icons.Stop)
			os.Exit(1)
		}
		shutdownInitiated = true
		shutdownMutex.Unlock()

		log.Printf("\n%s ==========================================", icons.Stop)
		log.Printf("%s  Shutting down server gracefully...", icons.Stop)
		log.Printf("%s ==========================================", icons.Stop)
		quit <- os.Interrupt
	}()

	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()

	if err := e.Shutdown(ctx); err != nil {
		log.Printf("%s Error during shutdown: %v", icons.Warning, err)
	}

	log.Printf("%s Server stopped successfully", icons.Check)
	if runtime.GOOS == "windows" {
		log.Println("\nPress Enter to close this window...")
		fmt.Scanln()
	}
}

func openBrowser(url string) {
	var err error
	log.Printf("%s Attempting to open browser...", icons.Globe)

	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default:
		err = fmt.Errorf("unsupported platform")
	}

	if err != nil {
		log.Printf("%s Failed to open browser automatically: %v", icons.Warning, err)
		log.Printf("%s Please open your browser and go to: %s", icons.Globe, url)
	} else {
		log.Printf("%s Browser opened successfully", icons.Check)
	}
}
