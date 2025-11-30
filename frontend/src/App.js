import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Spin } from "antd";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useSessionInvalidationDetector } from "./hooks/useSessionInvalidationDetector";
import { useSSENotifications } from "./hooks/useSSENotifications";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./components/Dashboard";
import UserManagement from "./pages/UserManagement";
import MainLayout from "./components/MainLayout";
import SessionsPage from "./pages/SessionsPage";
import AuditLogs from "./pages/AuditLogs";
import "./index.css";
import "./dashboard.css";


const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();

  if (loading) return <CenteredSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;

  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <CenteredSpinner />;
  if (user) return <Navigate to="/" replace />;

  return children;
};

const CenteredSpinner = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
    }}
  >
    <Spin size="large" />
  </div>
);

function AppContent() {
  useSSENotifications();
  useSessionInvalidationDetector();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Dashboard />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions"
          element={
            <ProtectedRoute>
              <MainLayout>
                <SessionsPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute adminOnly>
              <MainLayout>
                <UserManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute adminOnly>
              <MainLayout>
                <AuditLogs />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
