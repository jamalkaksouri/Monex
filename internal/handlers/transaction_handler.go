package handlers

import (
	"net/http"
	"strconv"
	"time"

	"Monex/config"
	"Monex/internal/middleware"
	"Monex/internal/models"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

type TransactionHandler struct {
	transactionRepo *repository.TransactionRepository
}

func NewTransactionHandler(transactionRepo *repository.TransactionRepository) *TransactionHandler {
	return &TransactionHandler{
		transactionRepo: transactionRepo,
	}
}

// CreateTransactionRequest represents transaction creation data
type CreateTransactionRequest struct {
	Type      string    `json:"type" validate:"required,oneof=deposit withdraw expense"`
	Amount    int       `json:"amount" validate:"required,gt=0"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"` // Optional custom timestamp
}

// UpdateTransactionRequest represents transaction update data
type UpdateTransactionRequest struct {
	Type      string    `json:"type" validate:"oneof=deposit withdraw expense"`
	Amount    int       `json:"amount" validate:"gt=0"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
}

type DeleteAllTransactionsRequest struct {
	Password string `json:"password" validate:"required"`
}

// ✅ Helper function to validate transaction type
func isValidType(typeStr string) bool {
	return typeStr == "deposit" || typeStr == "withdraw" || typeStr == "expense"
}

func (h *TransactionHandler) ListTransactions(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}

	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	offset := (page - 1) * pageSize

	// Build filters
	filters := make(map[string]interface{})
	if typeFilter := c.QueryParam("type"); typeFilter != "" {
		filters["type"] = typeFilter
	}
	if search := c.QueryParam("search"); search != "" {
		filters["search"] = search
	}
	if sortField := c.QueryParam("sortField"); sortField != "" {
		filters["sortField"] = sortField
	}
	if sortOrder := c.QueryParam("sortOrder"); sortOrder != "" {
		filters["sortOrder"] = sortOrder
	}

	transactions, total, err := h.transactionRepo.List(userID, pageSize, offset, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list transactions")
	}

	return c.JSON(http.StatusOK, map[string]any{
		"data":     transactions,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *TransactionHandler) DeleteAllTransactions(c echo.Context, userRepo *repository.UserRepository, config *config.SecurityConfig) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	req := new(DeleteAllTransactionsRequest)
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
		// ✅ FIX: Return 422 for validation error (wrong password)
		// NOT 401 (which means token issue)
		return echo.NewHTTPError(
			http.StatusUnprocessableEntity,
			"رمز عبور نادرست است",
		)
	}

	if err := h.transactionRepo.DeleteAllByUserID(userID); err != nil {
		return echo.NewHTTPError(
			http.StatusInternalServerError,
			"خطا در حذف تراکنش‌ها",
		)
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "تمام تراکنش‌ها با موفقیت حذف شدند",
	})
}

// CreateTransaction creates a new transaction
func (h *TransactionHandler) CreateTransaction(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	req := new(CreateTransactionRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	// Validate input
	if req.Type == "" || req.Amount <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "نوع تراکنش و مقدار مبلغ را وارد کنید")
	}

	// ✅ Use helper function
	if !isValidType(req.Type) {
		return echo.NewHTTPError(http.StatusBadRequest, "نوع تراکنش نامعتبر است")
	}

	// Create transaction
	transaction := &models.Transaction{
		UserID:    userID,
		Type:      req.Type,
		Amount:    req.Amount,
		Note:      req.Note,
		CreatedAt: req.CreatedAt, // Use custom timestamp if provided
	}

	if err := h.transactionRepo.Create(transaction); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی در ایجاد تراکنش رخ داده است")
	}

	return c.JSON(http.StatusCreated, transaction)
}

// UpdateTransaction updates a transaction
func (h *TransactionHandler) UpdateTransaction(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه تراکنش نامعتبر")
	}

	req := new(UpdateTransactionRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	// Get existing transaction
	transaction, err := h.transactionRepo.GetByID(id, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "تراکنش یافت نشد")
	}

	// ✅ Update fields - only if provided and valid
	if req.Type != "" && isValidType(req.Type) {
		transaction.Type = req.Type
	} else if req.Type != "" && !isValidType(req.Type) {
		return echo.NewHTTPError(http.StatusBadRequest, "نوع تراکنش نامعتبر است")
	}

	if req.Amount > 0 {
		transaction.Amount = req.Amount
	}

	transaction.Note = req.Note

	// ✅ Only update created_at if explicitly provided and not zero
	if !req.CreatedAt.IsZero() {
		transaction.CreatedAt = req.CreatedAt
	}
	// Otherwise keep original created_at

	if err := h.transactionRepo.Update(transaction); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی در بروز رسانی تراکنش رخ داده است")
	}

	return c.JSON(http.StatusOK, transaction)
}

// DeleteTransaction deletes a transaction
func (h *TransactionHandler) DeleteTransaction(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه تراکنش نامعتبر")
	}

	if err := h.transactionRepo.Delete(id, userID); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "تراکنش یافت نشد")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "تراکنش با موفقیت حذف شد"})
}

// GetStats returns transaction statistics for the current user
func (h *TransactionHandler) GetStats(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	stats, err := h.transactionRepo.GetStats(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در دریافت آمار")
	}

	return c.JSON(http.StatusOK, stats)
}
