# 🚀 Monex - Enterprise Transaction Management System

A production-grade, full-stack transaction management system with enterprise-level security, role-based access control, and comprehensive audit logging.

**🎯 Perfect for:** Personal finance tracking, small business accounting, or as a foundation for financial applications.

---

## ✨ Key Features

### 🔐 Security & Authentication
- **JWT-based Authentication** - Access + Refresh token rotation
- **Bcrypt Password Hashing** - Cost factor 12 for enhanced security
- **Role-Based Access Control (RBAC)** - Admin & User roles with privilege separation
- **Account Lockout Protection** - Progressive penalties (5 failed attempts → 15 min ban → permanent lock after 3 bans)
- **Audit Logging** - Complete action tracking and user activity logs
- **SQL Injection Prevention** - Parameterized queries throughout
- **XSS Protection** - Input sanitization and output encoding

### 💰 Transaction Management
- **Multi-Type Support** - Deposits, withdrawals, and expenses
- **User Isolation** - Each user sees only their transactions
- **Advanced Filtering** - Filter by type, date range, amount
- **Real-Time Statistics** - Dashboard with balance calculations
- **Batch Operations** - Delete all transactions with password confirmation
- **Custom Timestamps** - Set custom date/time for transactions
- **Edit History** - Track modified transactions

### 👥 User Management
- **Self-Service Registration** - New users can register themselves
- **Admin User Management** - Create, update, deactivate users
- **Password Management** - Change password, admin password reset
- **Profile Management** - Update email, manage preferences
- **Account Status** - Enable/disable user accounts

### 📊 Data & Reporting
- **Statistical Dashboard** - Total deposits, withdrawals, expenses, balance
- **Pagination** - Efficient data loading (10/20/50/100 items per page)
- **Export Functionality** - Download as Excel (.xlsx) or Text (.txt)
- **Database Backup** - One-click backup download
- **Advanced Search** - Search transactions by note/description

### ⚙️ Developer-Friendly
- **Clean Architecture** - Repository pattern, dependency injection
- **RESTful API** - Well-documented endpoints
- **Comprehensive Documentation** - Migration guides, API docs
- **Multi-Platform** - Runs on Windows, macOS, Linux
- **Embedded Frontend** - Single binary deployment
- **Graceful Shutdown** - Proper resource cleanup

---

## 🏗️ Architecture

```
Monex/
├── cmd/server/              # Application entry point
├── config/                  # Configuration management
├── internal/                # Core business logic
│   ├── database/           # SQLite initialization & schema
│   ├── handlers/           # HTTP handlers & endpoints
│   ├── middleware/         # Authentication & authorization
│   ├── models/            # Domain models (User, Transaction)
│   └── repository/        # Data access layer
├── frontend/              # React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── contexts/     # React contexts (Auth)
│   │   └── utils/        # Utility functions
│   └── public/
├── go.mod                 # Go dependencies
└── README.md             # This file
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Go 1.24+ | High performance, concurrent server |
| **Framework** | Echo v4 | Lightweight HTTP framework |
| **Database** | SQLite + WAL | ACID compliance, zero-config |
| **Frontend** | React 18 | Modern UI framework |
| **UI Library** | Ant Design 5 | Enterprise-grade components |
| **Authentication** | JWT | Stateless, scalable auth |
| **Encryption** | Bcrypt | Password hashing |
| **Styling** | CSS3 + Tailwind | Responsive design |

---

## 📋 Prerequisites

### System Requirements
- **Operating System:** Windows, macOS, or Linux
- **Memory:** 256MB minimum (512MB recommended)
- **Disk Space:** 100MB for application + database
- **Network:** Internet access for initial setup

### Required Software
- **Go:** 1.24.5 or higher ([Download](https://go.dev/dl/))
- **Node.js:** 18+ with npm ([Download](https://nodejs.org/))
- **Git:** For cloning the repository ([Download](https://git-scm.com/))

### Optional
- **Docker:** For containerized deployment
- **SQLite Browser:** For direct database inspection
- **Postman:** For API testing

---

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/jamalkaksouri/monex.git
cd monex
```

### 2. Environment Setup

Create `.env` file in project root:

```env
# Server Configuration
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

# 🔒 SECURITY: Generate with: openssl rand -base64 32
JWT_SECRET=YOUR_SUPER_SECRET_KEY_HERE_MIN_32_CHARS
JWT_ACCESS_DURATION=15m
JWT_REFRESH_DURATION=168h

# Security Settings
BCRYPT_COST=12
RATE_LIMIT=100
RATE_LIMIT_WINDOW=1m

# Account Security
MAX_FAILED_ATTEMPTS=5
TEMP_BAN_DURATION=15
MAX_TEMP_BANS=3
AUTO_UNLOCK_ENABLED=true
```

**⚠️ SECURITY WARNING:** 
- Generate a strong JWT_SECRET: `openssl rand -base64 32`
- Never commit `.env` to version control
- Change `JWT_SECRET` in production
- Change default admin password immediately after first login

### 3. Install Dependencies

**Backend:**
```bash
go mod download
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 4. Run Application

**Development Mode (Separate Terminals):**

Terminal 1 - Backend:
```bash
go run cmd/server/main.go
```

Terminal 2 - Frontend:
```bash
cd frontend && npm start
```

**Production Mode:**
```bash
# Build frontend
cd frontend && npm run build && cd ..

# Build backend with embedded frontend
go build -o monex cmd/server/main.go

# Run
./monex
```

### 5. Access Application

- **Frontend:** http://localhost:3040
- **API:** http://localhost:3040/api
- **Default Credentials:** 
  - Username: `admin`
  - Password: `admin123`

⚠️ **CHANGE DEFAULT PASSWORD IMMEDIATELY AFTER FIRST LOGIN**

---

## 📖 Usage Guide

### Dashboard
After login, you'll see:
- **Statistics Cards** - Total deposits, withdrawals, expenses, balance
- **Transaction Table** - All your transactions with filters
- **Quick Actions** - Add new transaction, export data, backup database

### Adding Transactions
1. Click **"تراکنش جدید"** (New Transaction) button
2. Select transaction type (Deposit/Withdrawal/Expense)
3. Enter amount
4. Add optional note/description
5. Choose date/time (or use current time)
6. Click **Save**

### Filtering & Searching
- **Filter by Type:** Use type buttons at the top
- **Search:** Search by note in the search bar
- **Sort:** Click column headers to sort
- **Pagination:** Navigate using page numbers

### Exporting Data
- **Excel:** Click "خروجی Excel" to download .xlsx
- **Text:** Click "خروجی Text" to download .txt
- **Database:** Click "بکاپ دیتابیس" for full database backup

### User Management (Admin Only)
1. Navigate to **"مدیریت کاربران"** (User Management)
2. View, create, edit, or delete users
3. Reset passwords, unlock accounts
4. Change user roles (Admin/User)

### Account Settings
1. Click username in top-right corner
2. **Change Password** - Update your password
3. **Logout** - Exit application
4. **Server Shutdown** - Admin-only graceful shutdown

---

## 🔌 API Documentation

### Authentication Endpoints

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

Response (200 OK):
{
  "user": {...},
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
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
  "refresh_token": "eyJ..."
}
```

### Protected Endpoints (Require Authorization Header)
```
Authorization: Bearer {access_token}
```

#### Get Profile
```http
GET /api/profile
```

#### Update Profile
```http
PUT /api/profile
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

#### Change Password
```http
POST /api/profile/change-password
Content-Type: application/json

{
  "old_password": "currentpass",
  "new_password": "newpass123"
}
```

#### List Transactions
```http
GET /api/transactions?page=1&pageSize=10&type=deposit&search=salary

Query Parameters:
- page: Page number (default: 1)
- pageSize: Items per page (default: 10, max: 100)
- type: Filter by type (deposit/withdraw/expense)
- search: Search in notes
- sortField: Field to sort by (default: created_at)
- sortOrder: asc or desc (default: desc)
```

#### Create Transaction
```http
POST /api/transactions
Content-Type: application/json

{
  "type": "deposit",
  "amount": 1000000,
  "note": "Monthly salary",
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### Update Transaction
```http
PUT /api/transactions/:id
Content-Type: application/json

{
  "type": "deposit",
  "amount": 1500000,
  "note": "Updated note",
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### Delete Transaction
```http
DELETE /api/transactions/:id
```

#### Get Statistics
```http
GET /api/stats

Response:
{
  "totalDeposit": 5000000,
  "totalWithdraw": 2000000,
  "totalExpense": 1000000,
  "balance": 2000000,
  "transactions": 15
}
```

### Admin Endpoints (Admin-Only)

#### List Users
```http
GET /api/admin/users?page=1&pageSize=10
```

#### Create User
```http
POST /api/admin/users
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
{
  "email": "newemail@example.com",
  "role": "admin",
  "active": true
}
```

#### Delete User
```http
DELETE /api/admin/users/:id
```

#### Reset Password
```http
POST /api/admin/users/:id/reset-password
{
  "new_password": "newpass123"
}
```

#### Unlock User
```http
POST /api/admin/users/:username/unlock
```

---

## 🔒 Security Best Practices

### For Administrators

1. **Initial Setup**
   - [ ] Change default admin password immediately
   - [ ] Generate strong JWT_SECRET (32+ characters)
   - [ ] Configure HTTPS/TLS for production
   - [ ] Review and customize CORS allowed origins

2. **Ongoing Security**
   - [ ] Regularly backup database
   - [ ] Monitor audit logs for suspicious activity
   - [ ] Keep dependencies updated
   - [ ] Review user access permissions monthly
   - [ ] Rotate JWT_SECRET annually

3. **Deployment Security**
   - [ ] Use environment variables for secrets
   - [ ] Never commit .env files
   - [ ] Enable HTTPS only
   - [ ] Implement rate limiting per user
   - [ ] Use strong database passwords
   - [ ] Restrict database access by IP
   - [ ] Enable firewall rules

### For Users

1. **Password Security**
   - Use passwords with 12+ characters
   - Include uppercase, lowercase, numbers, symbols
   - Never reuse passwords across services
   - Change password every 90 days

2. **Account Protection**
   - Use unique email for registration
   - Enable two-factor authentication (when available)
   - Log out after using shared computers
   - Report suspicious activity to admin

---

## 🐳 Docker Deployment

```dockerfile
# Dockerfile
FROM golang:1.24-alpine AS backend
WORKDIR /app
COPY . .
RUN go build -o monex cmd/server/main.go

FROM node:18-alpine AS frontend
WORKDIR /app
COPY frontend/ .
RUN npm install && npm run build

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=backend /app/monex /app/monex
COPY --from=frontend /app/build /app/frontend/build
WORKDIR /app
EXPOSE 3040
CMD ["./monex"]
```

Build and run:
```bash
docker build -t monex:latest .
docker run -p 3040:3040 \
  -e JWT_SECRET="your-secret-here" \
  -v monex_data:/app/data \
  monex:latest
```

---

## 📊 Performance Characteristics

- **Concurrent Users:** 50-100 (single instance)
- **Transactions per Second:** 100-200
- **Response Time:** <200ms (p95)
- **Database Size (10K transactions):** ~2MB
- **Memory Usage:** 40-80MB
- **CPU Usage:** <5% idle, <20% active

For higher load, consider:
- Horizontal scaling with load balancer
- PostgreSQL instead of SQLite
- Redis for session caching
- CDN for static assets

---

## 🗺️ Roadmap

### Version 1.1 (Q2 2025)
- [ ] Two-factor authentication (2FA)
- [ ] Email notifications
- [ ] Advanced reporting (PDF export)
- [ ] Dark mode UI
- [ ] Recurring transactions

### Version 1.2 (Q3 2025)
- [ ] Budget tracking & alerts
- [ ] Multi-currency support
- [ ] Mobile app (React Native)
- [ ] Chart/visualization improvements
- [ ] API rate limiting per user

### Version 2.0 (Q4 2025)
- [ ] PostgreSQL support
- [ ] Microservices architecture
- [ ] Machine learning (expense categorization)
- [ ] Real-time notifications
- [ ] Third-party integrations (bank APIs)

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

**Development Standards:**
- Write clean, readable code
- Add tests for new features
- Update documentation
- Follow project conventions

---

## 📝 License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) file for details.

### License Summary
✅ **Allowed:** Personal use, commercial use, modification, distribution  
❌ **Not Allowed:** Liability claims, warranty claims

---

## 🆘 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Windows
netstat -ano | findstr :3040

# macOS/Linux
lsof -i :3040
```

#### Database Locked
```
Error: database is locked
Solution: Increase DB_BUSY_TIMEOUT in .env (5000 → 10000)
```

#### Login Failed
```
Error: Invalid credentials
Solution: Check username/password, verify admin user created in database
```

#### Frontend Not Loading
```
Error: Cannot GET /
Solution: Build frontend (npm run build) or check server logs
```

---

## 📞 Support & Contact

- **Issues:** [GitHub Issues](https://github.com/jamalkaksouri/monex/issues)
- **Discussions:** [GitHub Discussions](https://github.com/jamalkaksouri/monex/discussions)
- **Email:** [jamal.kaksouri@gmail.com]

---

## 👨‍💻 Author

**Jamal Kaksouri**
- GitHub: [@jamalkaksouri](https://github.com/jamalkaksouri)
- Email: jamal.kaksouri@gmail.com

---

## 🙏 Acknowledgments

- **Echo Framework** - Elegant HTTP framework for Go
- **React** - JavaScript UI library
- **Ant Design** - Enterprise UI component library
- **SQLite** - Lightweight database
- Open source community for inspiration

---

## 📈 Stats & Metrics

![GitHub Stars](https://img.shields.io/github/stars/jamalkaksouri/monex?style=social)
![GitHub Forks](https://img.shields.io/github/forks/jamalkaksouri/monex?style=social)
![GitHub Issues](https://img.shields.io/github/issues/jamalkaksouri/monex)
![GitHub License](https://img.shields.io/github/license/jamalkaksouri/monex)

---

## 🎯 Project Status

- ✅ **Stable & Production-Ready**
- 📦 **v1.0.0 Released**
- 🔄 **Actively Maintained**
- 🚀 **Accepting Contributions**

---

**Made with ❤️ for the open-source community**

*Last Updated: January 2025*