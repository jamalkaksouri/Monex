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
	"runtime"
	"sync"
	"syscall"
	"time"

	"Monex/config"
	"Monex/internal/database"
	"Monex/internal/handlers"
	"Monex/internal/middleware"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
	echomiddleware "github.com/labstack/echo/v4/middleware"
	"golang.org/x/time/rate"
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
			Lock:     "🔐",
			Globe:    "🌐",
			Chart:    "📊",
		}
	}
}

func main() {
	// ✅ FIX 1: Create log file to prevent console from closing
	logFile, err := os.OpenFile("monex.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Printf("Warning: Could not open log file: %v", err)
	} else {
		defer logFile.Close()
		// Log to both console and file
		log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	}

	log.Printf("\n%s ==========================================", icons.Rocket)
	log.Printf("%s  MONEX - Transaction Management System", icons.Chart)
	log.Printf("%s ==========================================\n", icons.Rocket)

	// Load configuration
	cfg := config.Load()

	// Validate JWT Secret
	if cfg.JWT.Secret == "" || len(cfg.JWT.Secret) < 32 {
		log.Fatalf("%s CRITICAL: JWT_SECRET must be set and at least 32 characters long", icons.Stop)
	}

	log.Printf("%s Initializing database...", icons.Database)
	db := database.New(&cfg.Database)
	defer db.Close()

	// Create Echo instance
	e := echo.New()
	e.HideBanner = true
	e.Logger.SetOutput(io.Discard)

	// Middleware
	e.Use(echomiddleware.Logger())
	e.Use(echomiddleware.Recover())
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
	e.Use(echomiddleware.RateLimiter(echomiddleware.NewRateLimiterMemoryStore(rate.Limit(cfg.Security.RateLimit))))

	log.Printf("%s Initializing repositories...", icons.Lock)
	userRepo := repository.NewUserRepository(db)
	transactionRepo := repository.NewTransactionRepository(db)
	jwtManager := middleware.NewJWTManager(&cfg.JWT)

	log.Printf("%s Setting up handlers...", icons.Check)
	authHandler := handlers.NewAuthHandler(userRepo, jwtManager, cfg)
	profileHandler := handlers.NewProfileHandler(userRepo, &cfg.Security)
	userHandler := handlers.NewUserHandler(userRepo, cfg)
	transactionHandler := handlers.NewTransactionHandler(transactionRepo)

	// API routes
	api := e.Group("/api")

	// Public routes
	api.POST("/auth/login", authHandler.Login)
	api.POST("/auth/register", authHandler.Register)
	api.POST("/auth/refresh", authHandler.RefreshToken)

	// Protected routes
	protected := api.Group("")
	protected.Use(jwtManager.AuthMiddleware())

	protected.POST("/transactions/delete-all", func(c echo.Context) error {
	req := new(handlers.DeleteAllTransactionsRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	if req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "رمز عبور الزامی است")
	}

	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	user, err := userRepo.GetByID(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	// ✅ FIX: Return 422 for wrong password (not 401)
	if !user.CheckPassword(req.Password) {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, "رمز عبور نادرست است")
	}

	if err := transactionRepo.DeleteAllByUserID(userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در حذف تراکنش‌ها")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "تمام تراکنش‌ها با موفقیت حذف شدند",
	})
})

	protected.GET("/profile", profileHandler.GetProfile)
	protected.PUT("/profile", profileHandler.UpdateProfile)
	protected.POST("/profile/change-password", profileHandler.ChangePassword)

	protected.GET("/transactions", transactionHandler.ListTransactions)
	protected.POST("/transactions", transactionHandler.CreateTransaction)
	protected.PUT("/transactions/:id", transactionHandler.UpdateTransaction)
	protected.DELETE("/transactions/:id", transactionHandler.DeleteTransaction)
	protected.GET("/stats", transactionHandler.GetStats)
	protected.GET("/backup", handlers.BackupHandler(db))

	admin := protected.Group("/admin")
	admin.Use(middleware.RequireRole("admin"))
	admin.GET("/users", userHandler.ListUsers)
	admin.POST("/users", userHandler.CreateUser)
	admin.GET("/users/:id", userHandler.GetUser)
	admin.PUT("/users/:id", userHandler.UpdateUser)
	admin.DELETE("/users/:id", userHandler.DeleteUser)
	admin.POST("/users/:id/reset-password", userHandler.ResetUserPassword)
	admin.POST("/users/:username/unlock", userHandler.UnlockUser)
	admin.POST("/users/:id/unlock", userHandler.UnlockUser)

	protected.POST("/shutdown", func(c echo.Context) error {
	// Verify admin role
	role, err := middleware.GetUserRole(c)
	if err != nil || role != "admin" {
		return echo.NewHTTPError(http.StatusForbidden, "فقط مدیران می‌توانند سرور را خاموش کنند")
	}

	// Send success response first
	if err := c.JSON(http.StatusOK, map[string]string{
		"message": "Server shutting down...",
	}); err != nil {
		return err
	}

	// Force shutdown after response is sent
	go func() {
		time.Sleep(500 * time.Millisecond)
		log.Printf("\n%s Shutdown requested via API by admin", icons.Stop)
		log.Printf("%s Terminating server process...", icons.Stop)
		
		// Force exit - works reliably on all platforms
		os.Exit(0)
	}()

	return nil
}, middleware.RequireRole("admin"))

	// Serve embedded frontend
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
	}

	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	url := fmt.Sprintf("http://%s", addr)

	log.Printf("\n%s ==========================================", icons.Check)
	log.Printf("%s  Server started successfully!", icons.Rocket)
	log.Printf("%s  URL: %s", icons.Globe, url)
	log.Printf("%s  Press Ctrl+C to stop the server", icons.Stop)
	log.Printf("%s ==========================================\n", icons.Check)

	// Start server
	go func() {
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("%s Server error: %v", icons.Stop, err)
		}
	}()

	// Open browser
	time.Sleep(1 * time.Second)
	go openBrowser(url)

	// ✅ FIX 3: Better signal handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	// Store whether shutdown was already initiated
	var shutdownInitiated bool
	shutdownMutex := &sync.Mutex{}

	// Handle graceful shutdown with force-quit on second interrupt
	go func() {
		<-quit

		shutdownMutex.Lock()
		if shutdownInitiated {
			// Second interrupt received - force quit
			log.Printf("\n%s Force quit requested - terminating immediately", icons.Stop)
			os.Exit(1)
		}
		shutdownInitiated = true
		shutdownMutex.Unlock()

		log.Printf("\n%s ==========================================", icons.Stop)
		log.Printf("%s  Shutting down server gracefully...", icons.Stop)
		log.Printf("%s  (Press Ctrl+C again to force quit)", icons.Warning)
		log.Printf("%s ==========================================", icons.Stop)

		// Trigger server shutdown
		quit <- os.Interrupt
	}()

	// Wait for shutdown signal
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
	log.Printf("%s Goodbye!", icons.Rocket)

	// ✅ FIX 4: Add small delay before exit on Windows to see final messages
	if runtime.GOOS == "windows" {
		log.Println("\nPress Enter to close this window...")
		fmt.Scanln()
	}
}

func openBrowser(url string) {
	var err error

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
		log.Printf("%s لطفاً مرورگر خود را باز کرده و به آدرس زیر بروید: %s", icons.Globe, url)
	}
}
