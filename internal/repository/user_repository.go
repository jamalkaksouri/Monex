package repository

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"Monex/internal/database"
	"Monex/internal/models"
)

type UserRepository struct {
	db *database.DB
}

func NewUserRepository(db *database.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create creates a new user
func (r *UserRepository) Create(user *models.User) error {
	query := `
		INSERT INTO users (username, email, password, role, active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	now := time.Now()
	result, err := r.db.Exec(query, user.Username, user.Email, user.Password, user.Role, user.Active, now, now)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert id: %w", err)
	}

	user.ID = int(id)
	user.CreatedAt = now
	user.UpdatedAt = now
	return nil
}

// GetByID retrieves a user by ID
func (r *UserRepository) GetByID(id int) (*models.User, error) {
	query := `SELECT 
		id, username, email, password, role, active, 
		locked, failed_attempts, temp_bans_count, locked_until, permanently_locked,
		created_at, updated_at 
		FROM users WHERE id = ?`

	user := &models.User{}
	err := r.db.QueryRow(query, id).Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.Role, &user.Active,
		&user.Locked, &user.FailedAttempts, &user.TempBansCount,
		&user.LockedUntil, &user.PermanentlyLocked,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// GetByUsername retrieves a user by username
func (r *UserRepository) GetByUsername(username string) (*models.User, error) {
	query := `SELECT id, username, email, password, role, active, locked, 
	          failed_attempts, temp_bans_count, locked_until, permanently_locked,
	          created_at, updated_at 
	          FROM users WHERE username = ?`
	user := &models.User{}
	err := r.db.QueryRow(query, username).Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.Role, &user.Active, &user.Locked, &user.FailedAttempts,
		&user.TempBansCount, &user.LockedUntil, &user.PermanentlyLocked,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

func (r *UserRepository) UpdateLockStatus(user *models.User) error {
	query := `
		UPDATE users 
		SET locked = ?, failed_attempts = ?, temp_bans_count = ?, 
		    locked_until = ?, permanently_locked = ?, updated_at = ?
		WHERE id = ?
	`
	now := time.Now()
	_, err := r.db.Exec(query,
		user.Locked, user.FailedAttempts, user.TempBansCount,
		user.LockedUntil, user.PermanentlyLocked, now, user.ID,
	)
	return err
}

// GetByEmail retrieves a user by email
func (r *UserRepository) GetByEmail(email string) (*models.User, error) {
	query := `SELECT 
		id, username, email, password, role, active,
		locked, failed_attempts, temp_bans_count, locked_until, permanently_locked,
		created_at, updated_at 
		FROM users WHERE email = ?`

	user := &models.User{}
	err := r.db.QueryRow(query, email).Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.Role, &user.Active,
		&user.Locked, &user.FailedAttempts, &user.TempBansCount,
		&user.LockedUntil, &user.PermanentlyLocked,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// List retrieves users with search and sorting
func (r *UserRepository) List(limit, offset int, filters map[string]interface{}) ([]*models.User, int, error) {
	// Validate inputs
	if limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	// Build WHERE clause
	whereClauses := []string{}
	args := []interface{}{}

	if search, ok := filters["search"].(string); ok && search != "" {
		whereClauses = append(whereClauses, "(username LIKE ? OR email LIKE ?)")
		searchPattern := "%" + search + "%"
		args = append(args, searchPattern, searchPattern)
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM users %s", whereClause)
	var total int
	err := r.db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count users: %w", err)
	}

	// Build ORDER BY clause
	sortField := "created_at"
	sortOrder := "DESC"
	if field, ok := filters["sortField"].(string); ok && field != "" {
		// Validate sort field to prevent SQL injection
		validFields := map[string]bool{
			"id": true, "username": true, "email": true, "role": true,
			"active": true, "locked": true, "created_at": true,
		}
		if validFields[field] {
			sortField = field
		}
	}
	if order, ok := filters["sortOrder"].(string); ok && order != "" {
		sortOrder = strings.ToUpper(order)
		if sortOrder != "ASC" && sortOrder != "DESC" {
			sortOrder = "DESC"
		}
	}

	query := fmt.Sprintf(`
		SELECT id, username, email, password, role, active, 
			locked, failed_attempts, temp_bans_count, locked_until, permanently_locked,
			created_at, updated_at 
		FROM users 
		%s
		ORDER BY %s %s 
		LIMIT ? OFFSET ?
	`, whereClause, sortField, sortOrder)

	queryArgs := append(args, limit, offset)
	rows, err := r.db.Query(query, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	users := make([]*models.User, 0, limit)
	for rows.Next() {
		user := &models.User{}
		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &user.Password,
			&user.Role, &user.Active,
			&user.Locked, &user.FailedAttempts, &user.TempBansCount,
			&user.LockedUntil, &user.PermanentlyLocked,
			&user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}

	// Return empty slice instead of nil for consistency
	if users == nil {
		users = make([]*models.User, 0)
	}

	return users, total, nil
}

// Update updates a user
func (r *UserRepository) Update(user *models.User) error {
	query := `
		UPDATE users 
		SET username = ?, email = ?, password = ?, role = ?, active = ?,
		    locked = ?, failed_attempts = ?, temp_bans_count = ?, 
		    locked_until = ?, permanently_locked = ?, updated_at = ?
		WHERE id = ?
	`
	now := time.Now()
	result, err := r.db.Exec(query,
		user.Username, user.Email, user.Password, user.Role, user.Active,
		user.Locked, user.FailedAttempts, user.TempBansCount,
		user.LockedUntil, user.PermanentlyLocked, now,
		user.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("user not found")
	}

	return nil
}

// Delete deletes a user
func (r *UserRepository) Delete(id int) error {
	result, err := r.db.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("user not found")
	}

	return nil
}

// ExistsByUsername checks if a username exists
func (r *UserRepository) ExistsByUsername(username string) (bool, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check username: %w", err)
	}
	return count > 0, nil
}

// ExistsByEmail checks if an email exists
func (r *UserRepository) ExistsByEmail(email string) (bool, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM users WHERE email = ?", email).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check email: %w", err)
	}
	return count > 0, nil
}

func (r *UserRepository) IsUserValid(userID int) (bool, string) {
	user, err := r.GetByID(userID)
	if err != nil {
		return false, "کاربر یافت نشد"
	}

	if !user.Active {
		return false, "حساب کاربری غیرفعال است"
	}

	if user.PermanentlyLocked {
		return false, "حساب کاربری به دلیل نقض امنیتی مسدود شده است"
	}

	if user.Locked {
		if user.LockedUntil != nil && time.Now().After(*user.LockedUntil) {
			return true, "" // Lock expired, user can try again
		}
		return false, "حساب موقتاً قفل است"
	}

	return true, ""
}

// InvalidateUserSessions invalidates all active sessions for a user
func (r *UserRepository) InvalidateUserSessions(userID int) error {
	// This should be called when user is disabled
	log.Printf("[SECURITY] Invalidating all sessions for user %d", userID)

	// Note: Actual invalidation is done in session repository
	// This is just a marker function for documentation
	return nil
}
