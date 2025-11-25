package main

import (
	"context"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"log"
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
	// Load .env from current working directory
	godotenv.Load()

	// Use current working directory instead of executable path
	// This ensures logs are created where the exe is run from
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

	// Check if we're running as a Windows GUI app (no console)
	// If stdout is not available, only write to file
	var logOutput io.Writer
	if runtime.GOOS == "windows" {
		// Try to write to stdout, if it fails, we're in GUI mode
		if _, err := os.Stdout.Write([]byte("")); err != nil {
			// GUI mode - no console, only log to file
			logOutput = lumberjackLogger
		} else {
			// Console mode - log to both stdout and file
			logOutput = io.MultiWriter(os.Stdout, lumberjackLogger)
		}
	} else {
		// Non-Windows: always use both
		logOutput = io.MultiWriter(os.Stdout, lumberjackLogger)
	}

	log.SetOutput(logOutput)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	log.Println("Logger initialized successfully using .env config")

	return nil
}

// Log system information
func logSystemInfo() {
	log.Printf("\n%s ==========================================", icons.Chart)
	log.Printf("%s SYSTEM INFORMATION", icons.Chart)
	log.Printf("%s ==========================================", icons.Chart)
	log.Printf("Operating System: %s", runtime.GOOS)
	log.Printf("Architecture: %s", runtime.GOARCH)
	log.Printf("Go Version: %s", runtime.Version())
	log.Printf("Number of CPUs: %d", runtime.NumCPU())

	// Get executable path
	exePath, err := os.Executable()
	if err != nil {
		log.Printf("%s Failed to get executable path: %v", icons.Warning, err)
	} else {
		log.Printf("Executable Path: %s", exePath)
		log.Printf("Executable Directory: %s", filepath.Dir(exePath))
	}

	// Get working directory
	workDir, err := os.Getwd()
	if err != nil {
		log.Printf("%s Failed to get working directory: %v", icons.Warning, err)
	} else {
		log.Printf("Working Directory: %s", workDir)
	}

	log.Printf("%s ==========================================\n", icons.Chart)
}

func main() {
	// Initialize logger FIRST - before any other operation
	if err := initLogger(); err != nil {
		// If logging fails, write to stdout only
		fmt.Fprintf(os.Stderr, "CRITICAL: Failed to initialize logger: %v\n", err)
		log.SetOutput(os.Stdout)
	} else {
		log.Printf("%s Log file created: %s", icons.Check, logFilePath)
	}

	// Wrap everything in recovery to catch panics
	defer func() {
		if r := recover(); r != nil {
			log.Printf("\n%s PANIC RECOVERED: %v", icons.Stop, r)
			log.Printf("Stack trace:")
			buf := make([]byte, 4096)
			n := runtime.Stack(buf, false)
			log.Printf("%s", buf[:n])

			// Keep window open on Windows
			if runtime.GOOS == "windows" {
				log.Println("\nPress Enter to close...")
				fmt.Scanln()
			}
			os.Exit(1)
		}
	}()

	log.Printf("\n%s ==========================================", icons.Rocket)
	log.Printf("%s  MONEX - Transaction Management System", icons.Chart)
	log.Printf("%s ==========================================\n", icons.Rocket)

	// Log system information
	logSystemInfo()

	// Load configuration with error logging
	log.Printf("%s Loading configuration...", icons.Lock)
	cfg := config.Load()
	log.Printf("%s Configuration loaded successfully", icons.Check)
	log.Printf("  - Server Port: %s", cfg.Server.Port)
	log.Printf("  - Server Host: %s", cfg.Server.Host)
	log.Printf("  - Database Path: %s", cfg.Database.Path)
	log.Printf("  - JWT Secret Length: %d characters", len(cfg.JWT.Secret))

	// Validate JWT secret
	if cfg.JWT.Secret == "" || len(cfg.JWT.Secret) < 32 {
		log.Fatalf("%s CRITICAL: JWT_SECRET must be set and at least 32 characters long", icons.Stop)
	}
	log.Printf("%s JWT secret validation: PASSED", icons.Check)

	// Initialize database with detailed logging
	log.Printf("%s Initializing database...", icons.Database)
	log.Printf("  - Database file: %s", cfg.Database.Path)
	log.Printf("  - Max open connections: %d", cfg.Database.MaxOpenConns)
	log.Printf("  - Max idle connections: %d", cfg.Database.MaxIdleConns)
	log.Printf("  - Connection lifetime: %v", cfg.Database.ConnMaxLifetime)
	log.Printf("  - Busy timeout: %d ms", cfg.Database.BusyTimeout)

	// Check if database directory is writable
	dbDir := filepath.Dir(cfg.Database.Path)
	if dbDir == "." || dbDir == "" {
		dbDir, _ = os.Getwd()
	}
	log.Printf("  - Database directory: %s", dbDir)

	// Try to create directory if it doesn't exist
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Printf("%s WARNING: Failed to create database directory: %v", icons.Warning, err)
	}

	// Initialize database
	db := database.New(&cfg.Database)
	if db == nil {
		log.Fatalf("%s CRITICAL: Database initialization returned nil", icons.Stop)
	}
	defer db.Close()
	log.Printf("%s Database initialized successfully", icons.Check)

	// Verify database files were created
	if _, err := os.Stat(cfg.Database.Path); os.IsNotExist(err) {
		log.Printf("%s ERROR: Database file was not created: %s", icons.Stop, cfg.Database.Path)
	} else {
		log.Printf("%s Database file exists: %s", icons.Check, cfg.Database.Path)

		// Check for WAL and SHM files
		walPath := cfg.Database.Path + "-wal"
		shmPath := cfg.Database.Path + "-shm"

		if _, err := os.Stat(walPath); err == nil {
			log.Printf("%s WAL file exists: %s", icons.Check, walPath)
		}
		if _, err := os.Stat(shmPath); err == nil {
			log.Printf("%s SHM file exists: %s", icons.Check, shmPath)
		}
	}

	// Start token blacklist cleanup routine
	middleware.Blacklist.StartCleanupRoutine(10 * time.Minute)
	log.Printf("%s Token blacklist cleanup routine started", icons.Check)

	// Initialize Echo with logging
	log.Printf("%s Initializing HTTP server...", icons.Globe)
	e := echo.New()
	e.HideBanner = true
	e.Logger.SetOutput(io.Discard)

	// Setup middleware with logging
	log.Printf("%s Setting up middleware...", icons.Lock)
	e.Use(echomiddleware.Logger())
	e.Use(echomiddleware.Recover())
	e.Use(middleware.SecurityHeadersMiddleware())
	e.Use(echomiddleware.CORSWithConfig(echomiddleware.CORSConfig{
		AllowOrigins: cfg.Security.AllowedOrigins,
		AllowMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodDelete,
			http.MethodOptions,
		},
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
			echo.HeaderAuthorization,
		},
		AllowCredentials: true,
	}))
	e.Use(echomiddleware.Gzip())
	e.Use(echomiddleware.RateLimiter(echomiddleware.NewRateLimiterMemoryStore(rate.Limit(cfg.Security.RateLimit))))
	log.Printf("%s Middleware configured successfully", icons.Check)

	// Initialize repositories with logging
	log.Printf("%s Initializing repositories...", icons.Lock)
	userRepo := repository.NewUserRepository(db)
	transactionRepo := repository.NewTransactionRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	jwtManager := middleware.NewJWTManager(&cfg.JWT)
	log.Printf("%s Repositories initialized successfully", icons.Check)

	// Setup handlers with logging
	log.Printf("%s Setting up handlers...", icons.Check)
	authHandler := handlers.NewAuthHandler(userRepo, auditRepo, jwtManager, cfg)
	profileHandler := handlers.NewProfileHandler(userRepo, &cfg.Security)
	userHandler := handlers.NewUserHandler(userRepo, auditRepo, cfg)
	transactionHandler := handlers.NewTransactionHandler(transactionRepo, auditRepo)
	auditHandler := handlers.NewAuditHandler(auditRepo)
	log.Printf("%s Handlers configured successfully", icons.Check)

	// Setup routes
	log.Printf("%s Setting up API routes...", icons.Globe)
	api := e.Group("/api")

	// Public routes
	api.POST("/auth/login", authHandler.Login)
	api.POST("/auth/register", authHandler.Register)
	api.POST("/auth/refresh", authHandler.RefreshToken)

	// Protected routes
	protected := api.Group("")
	protected.Use(jwtManager.AuthMiddleware())

	protected.POST("/transactions/delete-all", func(c echo.Context) error {
		userID, err := middleware.GetUserID(c)
		if err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
		}

		req := new(handlers.DeleteAllTransactionsRequest)
		if err := c.Bind(req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
		}

		if req.Password == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "رمز عبور الزامی است")
		}

		user, err := userRepo.GetByID(userID)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
		}

		if !user.CheckPassword(req.Password) {
			_ = auditRepo.LogAction(
				userID,
				"delete_all_transactions",
				"transaction",
				c.RealIP(),
				c.Request().Header.Get("User-Agent"),
				false,
				"Wrong password",
			)
			return echo.NewHTTPError(http.StatusUnprocessableEntity, "رمز عبور نادرست است")
		}

		if err := transactionRepo.DeleteAllByUserID(userID); err != nil {
			_ = auditRepo.LogAction(
				userID,
				"delete_all_transactions",
				"transaction",
				c.RealIP(),
				c.Request().Header.Get("User-Agent"),
				false,
				fmt.Sprintf("Failed: %v", err),
			)
			return echo.NewHTTPError(http.StatusInternalServerError, "خطا در حذف تراکنش‌ها")
		}

		_ = auditRepo.LogAction(
			userID,
			"delete_all_transactions",
			"transaction",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			true,
			"Deleted all transactions",
		)

		return c.JSON(http.StatusOK, map[string]string{
			"message": "تمام تراکنش‌ها با موفقیت حذف شدند",
		})
	})

	protected.POST("/logout", authHandler.Logout)
	protected.GET("/profile", profileHandler.GetProfile)
	protected.PUT("/profile", profileHandler.UpdateProfile)
	protected.POST("/profile/change-password", profileHandler.ChangePassword)

	protected.GET("/transactions", transactionHandler.ListTransactions)
	protected.POST("/transactions", transactionHandler.CreateTransaction)
	protected.PUT("/transactions/:id", transactionHandler.UpdateTransaction)
	protected.DELETE("/transactions/:id", transactionHandler.DeleteTransaction)
	protected.GET("/stats", transactionHandler.GetStats)
	protected.GET("/backup", handlers.BackupHandler(db))

	// Admin routes
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

	protected.POST("/shutdown", func(c echo.Context) error {
		userID, err := middleware.GetUserID(c)
		if err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
		}

		role, err := middleware.GetUserRole(c)
		if err != nil || role != "admin" {
			return echo.NewHTTPError(http.StatusForbidden, "فقط مدیران می‌توانند سرور را خاموش کنند")
		}

		_ = auditRepo.LogAction(
			userID,
			"server_shutdown",
			"system",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			true,
			"Server shutdown initiated by admin",
		)

		if err := c.JSON(http.StatusOK, map[string]string{
			"message": "Server shutting down...",
		}); err != nil {
			return err
		}

		go func() {
			time.Sleep(500 * time.Millisecond)
			log.Printf("\n%s Shutdown requested via API by admin", icons.Stop)
			log.Printf("%s Terminating server process...", icons.Stop)
			os.Exit(0)
		}()

		return nil
	}, middleware.RequireRole("admin"))

	api.POST("/shutdown/browser", func(c echo.Context) error {
		userID, _ := middleware.GetUserID(c)

		auditRepo.LogAction(
			userID,
			"server_shutdown",
			"system",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			true,
			"Server shutdown because browser tab was closed",
		)

		log.Printf("\n%s Shutdown triggered because browser tab was closed", icons.Stop)

		go func() {
			time.Sleep(1200 * time.Millisecond)
			os.Exit(0)
		}()

		return c.NoContent(200)
	})

	log.Printf("%s API routes configured successfully", icons.Check)

	// Serve embedded frontend with logging
	log.Printf("%s Loading embedded frontend...", icons.Globe)
	frontendSubFS, err := fs.Sub(staticFiles, "frontend/build")
	if err != nil {
		log.Printf("%s Warning: Could not load embedded frontend: %v", icons.Warning, err)
	} else {
		staticHandler := http.FileServer(http.FS(frontendSubFS))
		e.GET("/static/*", echo.WrapHandler(http.StripPrefix("/", staticHandler)))
		e.GET("/favicon.ico", echo.WrapHandler(staticHandler))
		e.GET("/logo192.png", echo.WrapHandler(staticHandler))
		e.GET("/logo512.png", echo.WrapHandler(staticHandler))
		e.GET("/manifest.json", echo.WrapHandler(staticHandler))
		e.GET("/robots.txt", echo.WrapHandler(staticHandler))

		e.GET("/*", func(c echo.Context) error {
			indexHTML, err := frontendSubFS.Open("index.html")
			if err != nil {
				return echo.NewHTTPError(http.StatusNotFound, "رابط کاربری یافت نشد")
			}
			defer indexHTML.Close()
			return c.Stream(http.StatusOK, "text/html; charset=utf-8", indexHTML)
		})
		log.Printf("%s Frontend loaded successfully", icons.Check)
	}

	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	url := fmt.Sprintf("http://%s", addr)

	log.Printf("\n%s ==========================================", icons.Check)
	log.Printf("%s  Server started successfully!", icons.Rocket)
	log.Printf("%s  URL: %s", icons.Globe, url)
	log.Printf("%s  Log file: %s", icons.Chart, logFilePath)
	log.Printf("%s  Press Ctrl+C to stop the server", icons.Stop)
	log.Printf("%s ==========================================\n", icons.Check)

	// Start server with error logging
	go func() {
		log.Printf("%s Starting HTTP server on %s...", icons.Globe, addr)
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("%s Server error: %v", icons.Stop, err)
		}
	}()

	time.Sleep(500 * time.Millisecond)
	go openBrowser(url)

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
		log.Printf("%s  (Press Ctrl+C again to force quit)", icons.Warning)
		log.Printf("%s ==========================================", icons.Stop)

		quit <- os.Interrupt
	}()

	<-quit

	log.Printf("\n%s ==========================================", icons.Stop)
	log.Printf("%s  Initiating graceful shutdown...", icons.Stop)
	log.Printf("%s ==========================================", icons.Stop)

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()

	if err := e.Shutdown(ctx); err != nil {
		log.Printf("%s Error during shutdown: %v", icons.Warning, err)
	}

	log.Printf("%s Server stopped successfully", icons.Check)
	log.Printf("%s Log file saved: %s", icons.Check, logFilePath)
	log.Printf("%s Goodbye!", icons.Rocket)

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