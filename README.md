# Monex - Transaction Management System

## 🔒 Enterprise-Grade Transaction Management with Authentication

A production-ready transaction management system built with Go (Echo framework) and React with full user authentication, role-based access control, and enterprise security features.

---

## 🚀 Key Features

### Security & Authentication

- ✅ JWT-based authentication with access & refresh tokens
- ✅ Role-based access control (Admin/User)
- ✅ Bcrypt password hashing (cost 12)
- ✅ Rate limiting (100 req/min)
- ✅ CORS protection
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS protection
- ✅ Audit logging

### User Management

- ✅ User registration & login
- ✅ Profile management
- ✅ Password change
- ✅ Admin user management (CRUD)
- ✅ User activation/deactivation
- ✅ Password reset by admin

### Transaction Features

- ✅ Multi-user support (isolated data per user)
- ✅ Transaction CRUD operations
- ✅ Transaction types: Deposit, Withdraw, Expense
- ✅ Real-time statistics
- ✅ Advanced filtering & search
- ✅ Pagination
- ✅ Custom date/time for transactions

### Architecture

- ✅ Clean Architecture (separation of concerns)
- ✅ Repository pattern
- ✅ Middleware architecture
- ✅ Configuration management
- ✅ Graceful shutdown
- ✅ Connection pooling
- ✅ Database indexes optimization
- ✅ Single instance enforcement

---

## 📋 Prerequisites

- Go 1.24.5 or higher
- Node.js 18+ and npm/yarn
- SQLite3

---

## 🛠️ Installation & Setup

### 2. Environment Configuration

Copy the example environment file and configure it:

\`\`\`bash
cp .env.example .env
\`\`\`

**⚠️ CRITICAL SECURITY STEPS:**

1. Generate a strong JWT secret:
   \`\`\`bash
   openssl rand -base64 32
   \`\`\`

2. Update `.env` with the generated secret:
   \`\`\`env
   JWT_SECRET=<paste-generated-secret-here>
   \`\`\`

3. Never commit `.env` to version control
4. Change database path if needed
5. Adjust rate limiting based on your infrastructure

#### Project Structure

```
Monex/
├── cmd/
│   └── server/
│       └── main.go              # Application entry point
├── config/
│   └── config.go                # Configuration management
├── internal/
│   ├── database/
│   │   └── database.go          # Database initialization
│   ├── models/
│   │   └── models.go            # Domain models
│   ├── repository/
│   │   ├── user_repository.go
│   │   └── transaction_repository.go
│   ├── handlers/
│   │   ├── auth_handler.go
│   │   ├── user_handler.go
│   │   └── transaction_handler.go
│   └── middleware/
│       └── jwt.go               # JWT authentication
├── frontend/                    # React application
└── go.mod
```

#### Environment Variables (Optional)

Create `.env` file in root:

```env
# Server
PORT=3040
HOST=localhost
READ_TIMEOUT=10s
WRITE_TIMEOUT=10s
SHUTDOWN_TIMEOUT=15s

# Database
DB_PATH=./data.db
DB_MAX_OPEN_CONNS=25
DB_MAX_IDLE_CONNS=5
DB_CONN_MAX_LIFETIME=5m
DB_BUSY_TIMEOUT=5000

# JWT (CRITICAL: Change in production)
JWT_SECRET=your-super-secret-key-change-this-immediately
JWT_ACCESS_DURATION=15m
JWT_REFRESH_DURATION=168h

# Security
BCRYPT_COST=12
RATE_LIMIT=100
RATE_LIMIT_WINDOW=1m
```

⚠️ **CRITICAL**: The `JWT_SECRET` MUST be changed in production! Use a strong random string.

### 3. Frontend Setup

```bash
cd frontend
npm install
```

#### Update package.json

Add required dependencies:

```json
{
  "dependencies": {
    "react-router-dom": "^6.20.0"
  }
}
```

Then run:

```bash
npm install
```

---

## 🏃 Running the Application

### Development Mode

#### Backend

```bash
# From project root
go run cmd/server/main.go
```

## 🛑 Shutting Down the Server

### Method 1: Admin Dashboard (Recommended)

1. Login with admin account
2. Click on your username in top-right corner
3. Select "إيقاف الخادم" (Shutdown Server)
4. Confirm the action

### Method 2: API Endpoint

\`\`\`bash
curl -X POST "http://localhost:3040/api/shutdown?token=your-shutdown-token" \
 -H "Authorization: Bearer <admin-token>"
\`\`\`

### Method 3: Graceful Signal (Linux/Mac)

\`\`\`bash
kill -SIGTERM <process-id>
\`\`\`

### Method 4: Windows Task Manager (Last Resort)

- Press Ctrl+Shift+Esc
- Find "Monex.exe"
- Click "End Task"

Server starts at `http://localhost:3040`

#### Frontend

```bash
cd frontend
npm start
```

Frontend dev server starts at `http://localhost:4000`

### Production Build

#### Build Frontend

```bash
cd frontend
npm run build
```

#### Build Backend with Embedded Frontend

```bash
# From project root
go build -o monex.exe cmd/server/main.go
```

#### Run Production Binary

```bash
./monex.exe
```

---

## 🔐 Default Credentials

```
Username: admin
Password: admin123
```

⚠️ **CRITICAL SECURITY WARNING**: Change the default admin password immediately after first login!

---

## 📡 API Documentation

### Public Endpoints (No Authentication)

#### POST `/api/auth/login`

Login with username and password.

**Request:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**

```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@monex.local",
    "role": "admin",
    "active": true,
    "created_at": "2025-01-15T10:00:00Z"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 900
}
```

#### POST `/api/auth/register`

Register a new user account.

**Request:**

```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepassword123"
}
```

### Protected Endpoints (Require Authentication)

All protected endpoints require the `Authorization` header:

```
Authorization: Bearer <access_token>
```

#### GET `/api/profile`

Get current user profile.

#### PUT `/api/profile`

Update current user profile.

**Request:**

```json
{
  "email": "newemail@example.com"
}
```

#### POST `/api/profile/change-password`

Change current user password.

**Request:**

```json
{
  "old_password": "oldpass",
  "new_password": "newpass123"
}
```

#### GET `/api/transactions`

List transactions for current user.

**Query Parameters:**

- `page` (default: 1)
- `pageSize` (default: 10, max: 100)
- `type` (deposit, withdraw, expense)
- `search` (search in notes)
- `sortField` (id, type, amount, created_at)
- `sortOrder` (asc, desc)

#### POST `/api/transactions`

Create a new transaction.

**Request:**

```json
{
  "type": "deposit",
  "amount": 1000000,
  "note": "Monthly salary",
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### PUT `/api/transactions/:id`

Update a transaction.

#### DELETE `/api/transactions/:id`

Delete a transaction.

#### GET `/api/stats`

Get transaction statistics for current user.

**Response:**

```json
{
  "totalDeposit": 5000000,
  "totalWithdraw": 2000000,
  "totalExpense": 1000000,
  "balance": 2000000,
  "transactions": 15
}
```

### Admin Endpoints (Require Admin Role)

#### GET `/api/admin/users`

List all users (admin only).

#### POST `/api/admin/users`

Create a new user (admin only).

**Request:**

```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "role": "user",
  "active": true
}
```

#### GET `/api/admin/users/:id`

Get user by ID (admin only).

#### PUT `/api/admin/users/:id`

Update user (admin only).

**Request:**

```json
{
  "email": "newemail@example.com",
  "role": "admin",
  "active": false
}
```

#### DELETE `/api/admin/users/:id`

Delete user (admin only).

#### POST `/api/admin/users/:id/reset-password`

Reset user password (admin only).

**Request:**

```json
{
  "new_password": "newpassword123"
}
```

---

## 🔒 Security Best Practices

### 1. Password Policy

- Minimum 8 characters
- Bcrypt hashing with cost 12
- No password history (add if needed)

### 2. JWT Tokens

- Access token: 15 minutes (short-lived)
- Refresh token: 7 days
- Store refresh tokens securely
- Implement token rotation (recommended)

### 3. Rate Limiting

- 100 requests per minute per IP
- Prevents brute force attacks

### 4. Database Security

- Parameterized queries (no SQL injection)
- Foreign key constraints enabled
- Indexes for performance
- WAL mode for concurrency

### 5. CORS

- Whitelist allowed origins
- Never use `*` in production

---

## 🗄️ Database Schema

```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

-- Transactions table
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('deposit', 'withdraw', 'expense')),
    amount INTEGER NOT NULL CHECK(amount > 0),
    note TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs table
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    details TEXT,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 🧪 Testing

### Run Tests

```bash
go test ./...
```

### Test Coverage

```bash
go test -cover ./...
```

---

## 📦 Deployment

### Build for Windows

```bash
GOOS=windows GOARCH=amd64 go build -o monex.exe cmd/server/main.go
```

### Build for Linux

```bash
GOOS=linux GOARCH=amd64 go build -o monex cmd/server/main.go
```

### Build for macOS

```bash
GOOS=darwin GOARCH=amd64 go build -o monex cmd/server/main.go
```

---

## 🛡️ Security Checklist for Production

- [ ] Change default admin password
- [ ] Set strong JWT_SECRET environment variable
- [ ] Configure proper CORS origins
- [ ] Enable HTTPS (use reverse proxy like Nginx)
- [ ] Set up proper logging and monitoring
- [ ] Implement backup strategy
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Implement token refresh rotation
- [ ] Set up intrusion detection
- [ ] Regular security updates
- [ ] Penetration testing

---

## 🐛 Troubleshooting

### Database Locked Error

- Increase `DB_BUSY_TIMEOUT`
- Check WAL mode is enabled
- Ensure proper connection pool settings

### Token Expired Error

- Refresh token automatically
- Implement token refresh logic in frontend

### CORS Error

- Check allowed origins in config
- Ensure frontend URL is whitelisted

---

## 📝 License

MIT License

---

## 👨‍💻 Developer

**Jamal Kaksouri**

Developed with ❤️ using Go and React

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

## 📧 Support

For issues and questions, please open an issue on GitHub.
