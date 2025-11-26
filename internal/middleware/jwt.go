package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"Monex/config"
	"Monex/internal/models"
	"Monex/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

type JWTManager struct {
	config        *config.JWTConfig
	blacklistRepo *repository.TokenBlacklistRepository
}

func (jm *JWTManager) ParseToken(token string) (any, any) {
	panic("unimplemented")
}

func NewJWTManager(
	cfg *config.JWTConfig,
	blacklistRepo *repository.TokenBlacklistRepository,
) *JWTManager {
	return &JWTManager{
		config:        cfg,
		blacklistRepo: blacklistRepo,
	}
}

// Config returns the JWT configuration
func (jm *JWTManager) Config() *config.JWTConfig {
	return jm.config
}

// GenerateAccessToken generates a new access token
func (jm *JWTManager) GenerateAccessToken(user *models.User) (string, error) {
	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(jm.config.AccessDuration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Subject:   fmt.Sprintf("%d", user.ID),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(jm.config.Secret))
}

// GenerateRefreshToken generates a new refresh token (simpler, longer-lived)
func (jm *JWTManager) GenerateRefreshToken(user *models.User) (string, error) {
	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(jm.config.RefreshDuration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   fmt.Sprintf("%d", user.ID),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(jm.config.Secret))
}

// ValidateToken validates a JWT token and returns claims
func (jm *JWTManager) ValidateToken(tokenString string) (*Claims, error) {
	// First check in-memory for speed
	if Blacklist.Contains(tokenString) {
		return nil, fmt.Errorf("توکن نامعتبر است")
	}

	// Then check database
	isBlacklisted, err := jm.blacklistRepo.IsBlacklisted(tokenString)
	if err == nil && isBlacklisted {
		return nil, fmt.Errorf("توکن نامعتبر است")
	}

	// Standard JWT validation
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(jm.config.Secret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("توکن نامعتبر است")
}

// AuthMiddleware is the Echo middleware for JWT authentication
func (jm *JWTManager) AuthMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Extract token from Authorization header
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "هدر مجوز یافت نشد")
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				return echo.NewHTTPError(http.StatusUnauthorized, "هدر مجوز نامعتبر است")
			}

			tokenString := parts[1]

			// ✅ Check if token is blacklisted
			if Blacklist.Contains(tokenString) {
				return echo.NewHTTPError(http.StatusUnauthorized, "توکن نامعتبر است")
			}

			// Validate token
			claims, err := jm.ValidateToken(tokenString)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "توکن دسترسی منقضی شده است")
			}

			// Store claims in context
			c.Set("user_id", claims.UserID)
			c.Set("username", claims.Username)
			c.Set("role", claims.Role)
			c.Set("claims", claims)

			return next(c)
		}
	}
}

// RequireRole middleware checks if user has the required role
func RequireRole(roles ...string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			userRole, ok := c.Get("role").(string)
			if !ok {
				return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
			}

			for _, role := range roles {
				if userRole == role {
					return next(c)
				}
			}

			return echo.NewHTTPError(http.StatusForbidden, "مجوز دسترسی ندارید")
		}
	}
}

// GetUserID extracts user ID from context
func GetUserID(c echo.Context) (int, error) {
	userID, ok := c.Get("user_id").(int)
	if !ok {
		return 0, fmt.Errorf("شناسه کاربری یافت نشد")
	}
	return userID, nil
}

// GetUserRole extracts user role from context
func GetUserRole(c echo.Context) (string, error) {
	role, ok := c.Get("role").(string)
	if !ok {
		return "", fmt.Errorf("نقش کاربری یافت نشد")
	}
	return role, nil
}
