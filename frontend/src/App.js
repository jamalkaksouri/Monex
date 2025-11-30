// frontend/src/App.js - FINAL VERSION

import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout, Spin } from "antd";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useSessionInvalidationDetector } from "./hooks/useSessionInvalidationDetector";
import { useSSENotifications } from "./hooks/useSSENotifications";

import LoginPage from "./pages/LoginPage";
import Dashboard from "./components/Dashboard";
import UserManagement from "./pages/UserManagement";
import MainLayout from "./components/MainLayout";
import SessionsPage from "./pages/SessionsPage";
import AuditLogs from "./pages/AuditLogs";

import OfflineBanner from "./components/OfflineBanner";
import { NetworkEvents } from "./contexts/axiosSetup";

import "./index.css";
import "./dashboard.css";


// Protected Route Component
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
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
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Public Route Component
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
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
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Main Application Content
function AppContent() {
  const [offline, setOffline] = useState(false);

  // Listen to axios network status events
  useEffect(() => {
    const offlineHandler = () => setOffline(true);
    const onlineHandler = () => setOffline(false);

    NetworkEvents.on("offline", offlineHandler);
    NetworkEvents.on("online", onlineHandler);

    return () => {
      NetworkEvents.removeListener("offline", offlineHandler);
      NetworkEvents.removeListener("online", onlineHandler);
    };
  }, []);

  // Hooks
  useSSENotifications();
  useSessionInvalidationDetector();

  return (
    <>
      {/* Always visible at top */}
      <OfflineBanner visible={offline} />

      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

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
    </>
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
