package config

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Security SecurityConfig
	Login    LoginSecurityConfig
}

type ServerConfig struct {
	Port            string
	Host            string
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration

	// 🔥 NEW: TLS config
	TLSCertFile string
	TLSKeyFile  string
}

type DatabaseConfig struct {
	Path            string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	BusyTimeout     int
}

type JWTConfig struct {
	Secret          string
	AccessDuration  time.Duration
	RefreshDuration time.Duration
}

type SecurityConfig struct {
	BcryptCost      int
	RateLimit       int
	RateLimitWindow time.Duration
	AllowedOrigins  []string
}

type LoginSecurityConfig struct {
	MaxFailedAttempts int
	TempBanDuration   time.Duration
	MaxTempBans       int
	AutoUnlockEnabled bool
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️ No .env file found, using environment variables or defaults")
	}

	return &Config{
		Server: ServerConfig{
			Port:            getEnv("PORT", "3040"),
			Host:            getEnv("HOST", "localhost"),
			ReadTimeout:     getDurationEnv("READ_TIMEOUT", 10*time.Second),
			WriteTimeout:    getDurationEnv("WRITE_TIMEOUT", 10*time.Second),
			ShutdownTimeout: getDurationEnv("SHUTDOWN_TIMEOUT", 15*time.Second),

			// 🔥 NEW: TLS values from .env
			TLSCertFile: getEnv("TLS_CERT_FILE", "./localhost.pem"),
			TLSKeyFile:  getEnv("TLS_KEY_FILE", "./localhost-key.pem"),
		},

		Database: DatabaseConfig{
			Path:            getEnv("DB_PATH", "./data.db"),
			MaxOpenConns:    getIntEnv("DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getIntEnv("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: getDurationEnv("DB_CONN_MAX_LIFETIME", 5*time.Minute),
			BusyTimeout:     getIntEnv("DB_BUSY_TIMEOUT", 5000),
		},

		JWT: JWTConfig{
			Secret:          getJWTSecret(),
			AccessDuration:  getDurationEnv("JWT_ACCESS_DURATION", 15*time.Minute),
			RefreshDuration: getDurationEnv("JWT_REFRESH_DURATION", 168*time.Hour),
		},

		Security: SecurityConfig{
			BcryptCost:      getIntEnv("BCRYPT_COST", 12),
			RateLimit:       getIntEnv("RATE_LIMIT", 100),
			RateLimitWindow: getDurationEnv("RATE_LIMIT_WINDOW", 1*time.Minute),
			AllowedOrigins: []string{
				"https://localhost:3040",
				"https://localhost:3000",
			},
		},

		Login: LoginSecurityConfig{
			MaxFailedAttempts: getIntEnv("MAX_FAILED_ATTEMPTS", 5),
			TempBanDuration:   time.Duration(getIntEnv("TEMP_BAN_DURATION", 15)) * time.Minute,
			MaxTempBans:       getIntEnv("MAX_TEMP_BANS", 3),
			AutoUnlockEnabled: getBoolEnv("AUTO_UNLOCK_ENABLED", true),
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
func getIntEnv(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
func getBoolEnv(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}
func getDurationEnv(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")

	if secret == "" {
		log.Println("⚠️ WARNING: JWT_SECRET not set, generating temporary secret")
		secret = generateSecureSecret()
		log.Printf("Generated JWT_SECRET=%s\n", secret)
	}

	if len(secret) < 32 {
		log.Fatalf("🛑 CRITICAL: JWT_SECRET must be at least 32 characters")
	}
	return secret
}

func generateSecureSecret() string {
	b := make([]byte, 64)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("Failed to generate JWT secret: %v", err)
	}
	return base64.StdEncoding.EncodeToString(b)
}
