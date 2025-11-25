# 💰 Monex - Enterprise Transaction Management System

<div align="center">

**A production-grade, full-stack transaction management system with enterprise-level security, role-based access control, and comprehensive audit logging.**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [API Documentation](#-api-documentation) • [Contributing](#-contributing)

</div>

---

## 📋 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Security](#-security)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

---

## 🎯 About

Monex is a comprehensive financial transaction management system designed for individuals and small businesses. Built with security and scalability in mind, it provides a robust platform for tracking deposits, withdrawals, and expenses with multi-user support and granular access control.

**Perfect for:**

- Personal finance tracking
- Small business accounting
- Freelancer income/expense management
- Team financial collaboration
- Educational projects learning full-stack development

---

## ✨ Features

### 🔐 Security & Authentication

- **JWT-based Authentication** with access + refresh token rotation
- **Bcrypt Password Hashing** (cost factor 12)
- **Role-Based Access Control (RBAC)** - Admin & User roles
- **Progressive Account Lockout** - 5 failed attempts → 15 min ban → permanent lock after 3 bans
- **Token Blacklisting** - Secure logout mechanism
- **Comprehensive Audit Logging** - Track all user actions
- **SQL Injection Prevention** - Parameterized queries throughout
- **XSS Protection** - Input sanitization and secure headers

### 💰 Transaction Management

- **Multi-Type Support** - Deposits, withdrawals, and expenses
- **User Isolation** - Each user sees only their transactions
- **Advanced Filtering** - Filter by type, date range, search notes
- **Real-Time Statistics** - Dashboard with balance calculations
- **Batch Operations** - Delete all transactions with password confirmation
- **Custom Timestamps** - Set custom date/time for transactions
- **Edit History Tracking** - Know which transactions were modified
- **Responsive Design** - Works on desktop and mobile devices

### 👥 User Management (Admin)

- **Complete CRUD Operations** - Create, read, update, delete users
- **Role Management** - Assign admin or user roles
- **Account Control** - Enable/disable user accounts
- **Password Reset** - Admin can reset user passwords
- **Unlock Accounts** - Remove temporary or permanent locks
- **Search & Sort** - Find users quickly with advanced filters

### 📊 Data Management

- **Pagination** - Efficient data loading (10/20/50/100 items per page)
- **Export to Excel** - Download transactions as `.xlsx`
- **Export to Text** - Download as tab-separated `.txt`
- **Database Backup** - One-click full database backup (SQLite + WAL + SHM)
- **Advanced Search** - Search transactions by notes
- **Sorting** - Sort by any column (ID, date, amount, type)

### 🛠️ Developer Features

- **Clean Architecture** - Repository pattern with dependency injection
- **RESTful API** - Well-documented endpoints with consistent responses
- **Embedded Frontend** - Single binary deployment
- **File Logging with Rotation** - Configurable log files with lumberjack
- **Graceful Shutdown** - Proper resource cleanup on exit
- **Auto-Browser Launch** - Opens browser automatically on startup
- **Multi-Platform Support** - Windows, macOS, Linux
- **Persian (Farsi) UI** - RTL support with Jalali calendar

---

## 🛠️ Tech Stack

### Backend

- **Language:** Go 1.24.5+
- **Framework:** Echo v4 (HTTP router)
- **Database:** SQLite 3 with WAL mode
- **Authentication:** JWT (golang-jwt/jwt/v5)
- **Password Hashing:** bcrypt (cost 12)
- **Logging:** Lumberjack (rotating file logs)
- **Rate Limiting:** golang.org/x/time/rate

### Frontend

- **Framework:** React 18.3
- **UI Library:** Ant Design 5
- **Calendar:** Jalali (Persian) calendar support
- **Date Handling:** moment-jalaali, dayjs
- **State Management:** React Context API
- **HTTP Client:** Axios
- **Routing:** React Router v6
- **Animations:** Framer Motion, React Spring
- **Charts:** Recharts
- **Excel Export:** XLSX.js
- **Gestures:** @use-gesture/react (swipe actions)

### DevOps & Tools

- **Build:** Go modules, npm/yarn
- **Version Control:** Git
- **Environment:** .env files
- **Compression:** UPX (optional for release builds)

---

## 🏗️ Architecture

```
Monex/
├── cmd/server/              # Application entry point (empty, not used)
├── main.go                  # Main application entry
├── config/                  # Configuration management
│   └── config.go           # Load from .env with defaults
├── internal/                # Core business logic (not exported)
│   ├── database/           # SQLite initialization & schema
│   │   └── database.go     # Connection pooling, migrations
│   ├── handlers/           # HTTP handlers & endpoints
│   │   ├── auth_handler.go          # Login, register, refresh
│   │   ├── profile_handler.go       # User profile management
│   │   ├── user_handler.go          # Admin user CRUD
│   │   ├── transaction_handler.go   # Transaction operations
│   │   ├── audit_handler.go         # Audit log queries
│   │   └── backup_handler.go        # Database backup
│   ├── middleware/         # Authentication & authorization
│   │   ├── jwt.go          # JWT generation and validation
│   │   ├── blacklist.go    # Token blacklist for logout
│   │   ├── security.go     # Security headers
│   │   └── rate_limit.go   # Rate limiting per user
│   ├── models/            # Domain models & DTOs
│   │   └── models.go      # User, Transaction, AuditLog
│   └── repository/        # Data access layer
│       ├── user_repository.go        # User database operations
│       ├── transaction_repository.go # Transaction queries
│       └── audit_repository.go       # Audit log storage
├── frontend/              # React application
│   ├── public/           # Static assets
│   └── src/
│       ├── components/   # Reusable UI components
│       │   ├── Dashboard.js
│       │   ├── TransactionFormModal.js
│       │   ├── TransactionTableContainer.js
│       │   ├── MainLayout.js
│       │   └── SpiderWebBackground.js
│       ├── pages/       # Page components
│       │   ├── LoginPage.js
│       │   ├── UserManagement.js
│       │   └── AuditLogs.js
│       ├── contexts/    # React contexts
│       │   └── AuthContext.js
│       ├── utils/       # Utility functions
│       │   └── formatDate.js
│       ├── App.js       # Main app component
│       └── index.js     # Entry point
├── .env.example         # Environment variables template
├── go.mod              # Go dependencies
├── go.sum              # Go dependency checksums
└── README.md           # This file
```

### Design Patterns

- **Repository Pattern:** Separates data access logic
- **Dependency Injection:** Handlers receive dependencies via constructor
- **Middleware Chain:** Modular request processing (auth, CORS, rate limiting)
- **Clean Architecture:** Business logic independent of frameworks

---

## 🚀 Installation

### Prerequisites

1. **Go 1.24.5+** - [Download](https://go.dev/dl/)
2. **Node.js 18+** with npm - [Download](https://nodejs.org/)
3. **Git** - [Download](https://git-scm.com/)

### Quick Start

#### 1. Clone Repository

```bash
git clone https://github.com/jamalkaksouri/monex.git
cd monex
```

#### 2. Backend Setup

```bash
# Install Go dependencies
go mod download
```

#### 3. Frontend Setup

```bash
cd frontend
npm install
cd ..
```

#### 4. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and set your JWT_SECRET
# Generate a secure secret:
openssl rand -base64 64
```

#### 5. Run Development Mode

**Option A: Separate Frontend & Backend**

```bash
# Terminal 1 - Backend
go run main.go

# Terminal 2 - Frontend
cd frontend
npm start
```

**Option B: Production Build**

```bash
# Build frontend
cd frontend
npm run build
cd ..

# Build backend with embedded frontend
go build -o monex main.go

# Run
./monex
```

**Windows GUI Build (No Console)**

```bash
# Build without console window
go build -ldflags="-H windowsgui" -o Monex.exe

# Optional: Compress with UPX
upx --best --lzma Monex.exe
```

#### 6. Access Application

```
URL: http://localhost:3040
Default Username: admin
Default Password: admin123
```

⚠️ **CRITICAL:** Change the default admin password immediately after first login!

---

## ⚙️ Configuration

### Environment Variables (.env)

```env
# Server Configuration
PORT=3040                    # Server port
HOST=localhost              # Server host
READ_TIMEOUT=10s            # HTTP read timeout
WRITE_TIMEOUT=10s           # HTTP write timeout
SHUTDOWN_TIMEOUT=15s        # Graceful shutdown timeout

# Database Configuration
DB_PATH=./data.db           # SQLite database file path
DB_MAX_OPEN_CONNS=25        # Maximum open connections
DB_MAX_IDLE_CONNS=5         # Maximum idle connections
DB_CONN_MAX_LIFETIME=5m     # Connection lifetime
DB_BUSY_TIMEOUT=5000        # Busy timeout in milliseconds

# JWT Configuration
JWT_SECRET=YOUR_SECRET_HERE_MIN_32_CHARS  # ⚠️ MUST BE 32+ characters
JWT_ACCESS_DURATION=15m     # Access token expiry
JWT_REFRESH_DURATION=168h   # Refresh token expiry (7 days)

# Security Configuration
BCRYPT_COST=12              # Password hashing cost (10-14 recommended)
RATE_LIMIT=100              # Requests per minute
RATE_LIMIT_WINDOW=1m        # Rate limit window

# Account Security
MAX_FAILED_ATTEMPTS=5       # Failed login attempts before temp ban
TEMP_BAN_DURATION=15        # Temporary ban duration (minutes)
MAX_TEMP_BANS=3            # Temp bans before permanent lock
AUTO_UNLOCK_ENABLED=true    # Auto-unlock after temp ban expires

# Logging Configuration
LOG_FILENAME=monex.log      # Log file name
LOG_MAX_SIZE=5              # Max log file size (MB)
LOG_MAX_BACKUPS=5           # Number of old logs to keep
LOG_MAX_AGE=30              # Max days to keep logs
LOG_COMPRESS=true           # Compress old logs
```

### Security Best Practices

1. **Generate Strong JWT Secret:**

```bash
openssl rand -base64 64
```

2. **Never commit `.env` to Git**
3. **Use HTTPS in production**
4. **Change default admin credentials**
5. **Regularly update dependencies**
6. **Monitor audit logs for suspicious activity**

---

## 📖 Usage

### Basic Workflow

#### 1. Login

- Open `http://localhost:3040`
- Enter username and password
- Click "ورود به سیستم" (Login)

#### 2. View Dashboard

- See real-time statistics (deposits, withdrawals, expenses, balance)
- Browse transaction list with filters
- Search by note content

#### 3. Add Transaction

- Click "تراکنش جدید" (New Transaction)
- Select type (Deposit/Withdrawal/Expense)
- Enter amount
- Add optional note
- Choose date/time (or use current)
- Click "ذخیره" (Save)

#### 4. Edit Transaction

- Click edit icon (pencil) on transaction row
- Modify fields
- Click "ویرایش" (Update)

#### 5. Delete Transaction

- Click delete icon (trash)
- Confirm deletion

#### 6. Export Data

- **Excel:** Click "خروجی Excel" for `.xlsx` file
- **Text:** Click "خروجی Text" for tab-separated `.txt`
- **Backup:** Click "بکاپ دیتابیس" for full database backup (ZIP)

### Admin Features

#### User Management

1. Navigate to "مدیریت کاربران" (User Management)
2. Create/Edit/Delete users
3. Assign roles (Admin/User)
4. Reset passwords
5. Unlock locked accounts

#### Audit Logs

1. Navigate to "لاگ‌های سیستم" (Audit Logs)
2. View all system actions
3. Filter by action, user, date
4. Export logs to Excel

#### Server Shutdown

1. Click username in top-right
2. Select "خاموش کردن سرور" (Shutdown Server)
3. Type confirmation phrase: `server-shutdown`
4. Confirm

---

## 🔌 API Documentation

### Base URL

```
http://localhost:3040/api
```

### Authentication

All protected endpoints require JWT token:

```
Authorization: Bearer <access_token>
```

### Public Endpoints

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

Response 200:
{
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@monex.local",
    "role": "admin",
    "active": true
  },
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "expires_in": 900
}
```

#### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepass123"
}
```

#### Refresh Token

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGc..."
}
```

### Protected Endpoints

#### Get Profile

```http
GET /api/profile
Authorization: Bearer <token>
```

#### Update Profile

```http
PUT /api/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

#### Change Password

```http
POST /api/profile/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "old_password": "currentpass",
  "new_password": "newpass123"
}
```

#### List Transactions

```http
GET /api/transactions?page=1&pageSize=10&type=deposit&search=salary&sortField=created_at&sortOrder=desc
Authorization: Bearer <token>

Query Parameters:
- page: Page number (default: 1)
- pageSize: Items per page (default: 10, max: 100)
- type: Filter by type (deposit/withdraw/expense)
- search: Search in notes
- sortField: Field to sort by (default: created_at)
- sortOrder: asc or desc (default: desc)

Response 200:
{
  "data": [...],
  "total": 42,
  "page": 1,
  "pageSize": 10
}
```

#### Create Transaction

```http
POST /api/transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "deposit",
  "amount": 1000000,
  "note": "Monthly salary",
  "created_at": "2025-01-15T10:00:00Z"  // Optional
}
```

#### Update Transaction

```http
PUT /api/transactions/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "deposit",
  "amount": 1500000,
  "note": "Updated salary",
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### Delete Transaction

```http
DELETE /api/transactions/:id
Authorization: Bearer <token>
```

#### Get Statistics

```http
GET /api/stats
Authorization: Bearer <token>

Response 200:
{
  "totalDeposit": 5000000,
  "totalWithdraw": 2000000,
  "totalExpense": 1000000,
  "balance": 2000000,
  "transactions": 15
}
```

#### Delete All Transactions

```http
POST /api/transactions/delete-all
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "your_password"
}
```

#### Database Backup

```http
GET /api/backup
Authorization: Bearer <token>

Response: ZIP file download
```

### Admin Endpoints

All admin endpoints require `role: admin`

#### List Users

```http
GET /api/admin/users?page=1&pageSize=10&q=john
Authorization: Bearer <admin_token>
```

#### Create User

```http
POST /api/admin/users
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "role": "user",
  "active": true
}
```

#### Update User

```http
PUT /api/admin/users/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "email": "newemail@example.com",
  "role": "admin",
  "active": true
}
```

#### Delete User

```http
DELETE /api/admin/users/:id
Authorization: Bearer <admin_token>
```

#### Reset User Password

```http
POST /api/admin/users/:id/reset-password
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "new_password": "newpass123"
}
```

#### Unlock User Account

```http
POST /api/admin/users/:id/unlock
Authorization: Bearer <admin_token>
```

#### Get Audit Logs

```http
GET /api/admin/audit-logs?page=1&pageSize=20&search=login
Authorization: Bearer <admin_token>
```

#### Delete All Audit Logs

```http
DELETE /api/admin/audit-logs/all
Authorization: Bearer <admin_token>
```

#### Export Audit Logs

```http
GET /api/admin/audit-logs/export
Authorization: Bearer <admin_token>

Response: JSON array of all logs
```

---

## 🔒 Security

### Authentication Flow

1. **Login:** User provides credentials
2. **Verification:** Server validates username/password
3. **Token Generation:** Server creates JWT access + refresh tokens
4. **Response:** Tokens sent to client
5. **Storage:** Client stores tokens (localStorage)
6. **Authorization:** Client sends access token in `Authorization` header
7. **Validation:** Server validates token on each request
8. **Refresh:** When access token expires, client uses refresh token

### Password Security

- **Bcrypt Hashing:** Cost factor 12 (industry standard)
- **Minimum Length:** 8 characters
- **No Plain Text Storage:** Passwords never stored in plain text
- **Admin Reset:** Admins can reset but never view passwords

### Account Lockout

1. **5 Failed Attempts:** Account locked for 15 minutes
2. **3 Temporary Locks:** Account permanently locked (non-admin only)
3. **Admin Unlock:** Admins can unlock any account
4. **Auto-Unlock:** Enabled by default after temp ban expires

### Security Headers

Automatically applied to all responses:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

### Audit Logging

All sensitive actions are logged:

- Login attempts (success/failure)
- User creation/modification/deletion
- Transaction operations
- Password changes
- Account unlocks
- Server shutdowns

Each log includes:

- User ID
- Action type
- Resource affected
- IP address
- User agent
- Success/failure status
- Additional details
- Timestamp

---

## 🚢 Deployment

### Production Build

#### Backend

```bash
# Standard build
go build -o monex main.go

# Windows GUI build (no console)
go build -ldflags="-H windowsgui" -o Monex.exe

# Compress with UPX (optional)
upx --best --lzma Monex.exe
```

#### Frontend

```bash
cd frontend
npm run build
cd ..
```

### Docker Deployment

**Dockerfile:**

```dockerfile
FROM golang:1.24-alpine AS backend
WORKDIR /app
COPY . .
RUN go build -o monex main.go

FROM node:18-alpine AS frontend
WORKDIR /app
COPY frontend/ .
RUN npm install && npm run build

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=backend /app/monex /app/monex
COPY --from=frontend /app/build /app/frontend/build
COPY .env /app/.env
WORKDIR /app
EXPOSE 3040
CMD ["./monex"]
```

**Build & Run:**

```bash
docker build -t monex:latest .
docker run -d -p 3040:3040 \
  -e JWT_SECRET="your-secret-here" \
  -v monex_data:/app/data \
  --name monex \
  monex:latest
```

### Systemd Service (Linux)

**`/etc/systemd/system/monex.service`:**

```ini
[Unit]
Description=Monex Transaction Management System
After=network.target

[Service]
Type=simple
User=monex
WorkingDirectory=/opt/monex
ExecStart=/opt/monex/monex
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

**Enable & Start:**

```bash
sudo systemctl enable monex
sudo systemctl start monex
sudo systemctl status monex
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name monex.yourdomain.com;

    location / {
        proxy_pass http://localhost:3040;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :3040
taskkill /PID <PID> /F

# Linux/macOS
lsof -ti:3040 | xargs kill -9
```

### Database Locked Error

**Solution:** Increase `DB_BUSY_TIMEOUT` in `.env`:

```env
DB_BUSY_TIMEOUT=10000
```

### Login Failed

**Check:**

1. Default credentials: `admin` / `admin123`
2. Database exists and has admin user
3. JWT_SECRET is set correctly
4. Server logs for errors

### Frontend Not Loading

**Solutions:**

1. Build frontend: `cd frontend && npm run build`
2. Check server logs
3. Verify `frontend/build` directory exists
4. Clear browser cache

### Log File Not Created

**Causes:**

- No write permission in directory
- Invalid `LOG_FILENAME` in `.env`
- Running as Windows GUI app (logs still created, just not to console)

**Solution:**
Check file permissions and `.env` configuration

### Token Expired

**Normal Behavior:**

- Access tokens expire after 15 minutes
- Frontend auto-refreshes using refresh token
- If refresh fails, user is logged out

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- **Code Style:** Follow Go and React best practices
- **Comments:** Add comments for complex logic
- **Testing:** Write tests for new features
- **Documentation:** Update README if adding features
- **Commits:** Use conventional commit messages

### Bug Reports

Include:

- Description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Go version, browser)
- Error logs

### Feature Requests

Describe:

- The problem you're solving
- Proposed solution
- Alternatives considered
- Additional context

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### License Summary

✅ **Commercial use**  
✅ **Modification**  
✅ **Distribution**  
✅ **Private use**  
❌ **Liability**  
❌ **Warranty**

---

## 🗺️ Roadmap

### Version 1.1 (Q2 2025)

- [ ] Two-factor authentication (2FA)
- [ ] Email notifications
- [ ] PDF export for reports
- [ ] Dark mode UI theme
- [ ] Recurring transactions

### Version 1.2 (Q3 2025)

- [ ] Budget tracking & alerts
- [ ] Multi-currency support
- [ ] Mobile app (React Native)
- [ ] Advanced charts & visualizations
- [ ] Categories for expenses

### Version 2.0 (Q4 2025)

- [ ] PostgreSQL support
- [ ] Microservices architecture
- [ ] Machine learning (auto-categorization)
- [ ] Real-time notifications (WebSocket)
- [ ] Third-party integrations (bank APIs)

---

## 📞 Support & Contact

### Issues & Bugs

- **GitHub Issues:** [Report a bug](https://github.com/jamalkaksouri/monex/issues)
- **Email:** jamal.kaksouri@gmail.com

### Discussion & Questions

- **GitHub Discussions:** [Ask questions](https://github.com/jamalkaksouri/monex/discussions)

### Documentation

- **API Docs:** See [API Documentation](#-api-documentation) section
- **Migration Guide:** See [MIGRATION_GUID.md](MIGRATION_GUID.md)

---

## 👨‍💻 Author

**Jamal Kaksouri**

- GitHub: [@jamalkaksouri](https://github.com/jamalkaksouri)
- Email: jamal.kaksouri@gmail.com
- LinkedIn: [Jamal Kaksouri](https://linkedin.com/in/jamalkaksouri)

---

## 🙏 Acknowledgments

This project uses these amazing open-source libraries:

**Backend:**

- [Echo](https://echo.labstack.com/) - High performance HTTP framework
- [golang-jwt](https://github.com/golang-jwt/jwt) - JWT implementation
- [go-sqlite3](https://github.com/mattn/go-sqlite3) - SQLite driver
- [bcrypt](https://pkg.go.dev/golang.org/x/crypto/bcrypt) - Password hashing
- [lumberjack](https://github.com/natefinch/lumberjack) - Log rotation

**Frontend:**

- [React](https://react.dev/) - UI library
- [Ant Design](https://ant.design/) - Component library
- [Axios](https://axios-http.com/) - HTTP client
- [Framer Motion](https://www.framer.com/motion/) - Animations
- [XLSX.js](https://github.com/SheetJS/sheetjs) - Excel export

---

## 📊 Project Stats

![GitHub Stars](https://img.shields.io/github/stars/jamalkaksouri/monex?style=social)
![GitHub Forks](https://img.shields.io/github/forks/jamalkaksouri/monex?style=social)
![GitHub Issues](https://img.shields.io/github/issues/jamalkaksouri/monex)
![GitHub Pull Requests](https://img.shields.io/github/issues-pr/jamalkaksouri/monex)
![Last Commit](https://img.shields.io/github/last-commit/jamalkaksouri/monex)

---

<div align="center">

**⭐ If you find this project useful, please consider giving it a star! ⭐**

Made with ❤️ by [Jamal Kaksouri](https://github.com/jamalkaksouri)

_Last Updated: November 2025_

</div>
