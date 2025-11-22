package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"Monex/internal/database"
	"Monex/internal/models"
)

type TransactionRepository struct {
	db *database.DB
}

func (r *TransactionRepository) DeleteAllByUserID(userID int) error {
	if userID <= 0 {
		return fmt.Errorf("invalid user ID")
	}

	result, err := r.db.Exec("DELETE FROM transactions WHERE user_id = ?", userID)
	if err != nil {
		return fmt.Errorf("failed to delete all transactions: %w", err)
	}

	// Verify deletion succeeded (even if 0 rows were deleted, it's not an error)
	_, err = result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to confirm deletion: %w", err)
	}

	return nil
}

func NewTransactionRepository(db *database.DB) *TransactionRepository {
	return &TransactionRepository{db: db}
}

// Create creates a new transaction
func (r *TransactionRepository) Create(transaction *models.Transaction) error {
	query := `
        INSERT INTO transactions (user_id, type, amount, note, is_edited, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `
	now := time.Now()
	if transaction.CreatedAt.IsZero() {
		transaction.CreatedAt = now
	}
	transaction.UpdatedAt = now
	transaction.IsEdited = false // ✅ NEW TRANSACTIONS ARE NOT EDITED

	result, err := r.db.Exec(query,
		transaction.UserID,
		transaction.Type,
		transaction.Amount,
		transaction.Note,
		transaction.IsEdited, // ✅ ADD THIS
		transaction.CreatedAt,
		transaction.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create transaction: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert id: %w", err)
	}

	transaction.ID = int(id)
	return nil
}

// GetByID retrieves a transaction by ID (only if it belongs to the user)
func (r *TransactionRepository) GetByID(id, userID int) (*models.Transaction, error) {
	query := `
        SELECT id, user_id, type, amount, note, is_edited, created_at, updated_at
        FROM transactions 
        WHERE id = ? AND user_id = ?
    `
	transaction := &models.Transaction{}
	err := r.db.QueryRow(query, id, userID).Scan(
		&transaction.ID,
		&transaction.UserID,
		&transaction.Type,
		&transaction.Amount,
		&transaction.Note,
		&transaction.IsEdited, // ✅ ADD THIS
		&transaction.CreatedAt,
		&transaction.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("transaction not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}
	return transaction, nil
}

// List retrieves transactions with filters and pagination
func (r *TransactionRepository) List(userID, limit, offset int, filters map[string]interface{}) ([]*models.Transaction, int, error) {
	// Build WHERE clause
	whereClauses := []string{"user_id = ?"}
	args := []interface{}{userID}

	if typeFilter, ok := filters["type"].(string); ok && typeFilter != "" {
		whereClauses = append(whereClauses, "type = ?")
		args = append(args, typeFilter)
	}

	if search, ok := filters["search"].(string); ok && search != "" {
		whereClauses = append(whereClauses, "note LIKE ?")
		args = append(args, "%"+search+"%")
	}

	whereClause := strings.Join(whereClauses, " AND ")

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM transactions WHERE %s", whereClause)
	var total int
	err := r.db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count transactions: %w", err)
	}

	// Build ORDER BY clause
	sortField := "created_at"
	sortOrder := "DESC"
	if field, ok := filters["sortField"].(string); ok && field != "" {
		sortField = field
	}
	if order, ok := filters["sortOrder"].(string); ok && order != "" {
		sortOrder = strings.ToUpper(order)
	}

	// Get transactions
	query := fmt.Sprintf(`
        SELECT id, user_id, type, amount, note, is_edited, created_at, updated_at
        FROM transactions 
        WHERE %s 
        ORDER BY %s %s 
        LIMIT ? OFFSET ?
    `, whereClause, sortField, sortOrder)

	args = append(args, limit, offset)
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list transactions: %w", err)
	}
	defer rows.Close()

	transactions := make([]*models.Transaction, 0, limit)
	for rows.Next() {
		transaction := &models.Transaction{}
		err := rows.Scan(
			&transaction.ID,
			&transaction.UserID,
			&transaction.Type,
			&transaction.Amount,
			&transaction.Note,
			&transaction.IsEdited, // ✅ ADD THIS
			&transaction.CreatedAt,
			&transaction.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan transaction: %w", err)
		}
		transactions = append(transactions, transaction)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating transactions: %w", err)
	}

	return transactions, total, nil
}

// Update updates a transaction
func (r *TransactionRepository) Update(transaction *models.Transaction) error {
	query := `
        UPDATE transactions 
        SET type = ?, amount = ?, note = ?, created_at = ?, 
            is_edited = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
    `
	transaction.UpdatedAt = time.Now()
	transaction.IsEdited = true // ✅ MARK AS EDITED WHEN UPDATING

	result, err := r.db.Exec(query,
		transaction.Type,
		transaction.Amount,
		transaction.Note,
		transaction.CreatedAt,
		transaction.IsEdited, // ✅ ADD THIS
		transaction.UpdatedAt,
		transaction.ID,
		transaction.UserID,
	)
	if err != nil {
		return fmt.Errorf("failed to update transaction: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("transaction not found")
	}

	return nil
}

// Delete deletes a transaction
func (r *TransactionRepository) Delete(id, userID int) error {
	result, err := r.db.Exec("DELETE FROM transactions WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		return fmt.Errorf("failed to delete transaction: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("transaction not found")
	}

	return nil
}

// GetStats retrieves transaction statistics for a user
func (r *TransactionRepository) GetStats(userID int) (*models.TransactionStats, error) {
	query := `
		SELECT 
			COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) as total_deposit,
			COALESCE(SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END), 0) as total_withdraw,
			COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
			COUNT(*) as transactions
		FROM transactions 
		WHERE user_id = ?
	`

	stats := &models.TransactionStats{}
	err := r.db.QueryRow(query, userID).Scan(
		&stats.TotalDeposit,
		&stats.TotalWithdraw,
		&stats.TotalExpense,
		&stats.Transactions,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get stats: %w", err)
	}

	// Calculate balance: deposits - (withdraws + expenses)
	stats.Balance = stats.TotalDeposit - (stats.TotalWithdraw + stats.TotalExpense)

	return stats, nil
}
