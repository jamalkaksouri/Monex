// frontend/src/hooks/useSSENotifications.js
import { useEffect, useRef, useCallback } from "react";
import { message, notification } from "antd";
import { useAuth } from "../contexts/AuthContext";

/**
 * Hook for Server-Sent Events (SSE) notifications
 * Replaces polling with event-driven architecture
 */
export const useSSENotifications = () => {
    const { user, logout, isLoggingOut } = useAuth();
    const eventSourceRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;

    const connect = useCallback(() => {
        if (!user || isLoggingOut()) {
            console.log("[SSE] Skipping connect - no user or logging out");
            return;
        }

        // Prevent multiple connections
        if (eventSourceRef.current) {
            console.log("[SSE] Connection already exists");
            return;
        }

        const token = localStorage.getItem("access_token");
        if (!token) {
            console.log("[SSE] No access token available");
            return;
        }

        try {
            // Create SSE connection with auth token
            const url = `http://localhost:3040/api/notifications/stream?token=${token}`;
            const eventSource = new EventSource(url);

            eventSource.onopen = () => {
                console.log("[SSE] Connection established");
                reconnectAttemptsRef.current = 0; // Reset on successful connection
            };

            eventSource.onmessage = (event) => {
                try {
                    const notification = JSON.parse(event.data);
                    console.log("[SSE] Received:", notification);

                    handleNotification(notification);
                } catch (error) {
                    console.error("[SSE] Parse error:", error);
                }
            };

            eventSource.onerror = (error) => {
                console.error("[SSE] Connection error:", error);
                eventSource.close();
                eventSourceRef.current = null;

                // Attempt reconnection with exponential backoff
                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
                    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        connect();
                    }, delay);
                } else {
                    console.error("[SSE] Max reconnection attempts reached");
                    message.error("اتصال به سرور قطع شد. لطفا صفحه را رفرش کنید");
                }
            };

            eventSourceRef.current = eventSource;
        } catch (error) {
            console.error("[SSE] Failed to create connection:", error);
        }
    }, [user, isLoggingOut]);

    const handleNotification = (notif) => {
        const { type, message: msg, severity, data } = notif;

        switch (type) {
            case "connected":
                console.log("[SSE] Connection confirmed");
                break;

            case "heartbeat":
                // Silent heartbeat
                break;

            case "security_warning":
                handleSecurityWarning(msg, severity, data);
                break;

            case "account_status":
                handleAccountStatusChange(data?.status, msg);
                break;

            case "session_invalidated":
                handleSessionInvalidated(msg);
                break;

            default:
                console.log("[SSE] Unknown notification type:", type);
        }
    };

    const handleSecurityWarning = (msg, severity, data) => {
        const severityMap = {
            info: "info",
            warning: "warning",
            critical: "error",
        };

        notification[severityMap[severity] || "warning"]({
            message: "هشدار امنیتی",
            description: msg,
            placement: "topRight",
            duration: severity === "critical" ? 0 : 8,
            style: {
                fontFamily: "estedad-fd, Vazir",
                direction: "rtl",
            },
        });

        // If critical, show additional details
        if (severity === "critical" && data) {
            console.warn("[SECURITY] Critical warning:", data);
        }
    };

    const handleAccountStatusChange = (status, msg) => {
        if (status === "temporarily_locked") {
            notification.warning({
                message: "⚠️ حساب موقتاً مسدود شد",
                description: msg,
                placement: "topRight",
                duration: 0, // Don't auto-close
                style: {
                    fontFamily: "estedad-fd, Vazir",
                    direction: "rtl",
                    backgroundColor: "#fff7e6",
                    border: "2px solid #ffa940",
                },
            });
        } else if (status === "permanently_locked") {
            notification.error({
                message: "🛑 حساب مسدود شد",
                description: msg,
                placement: "topRight",
                duration: 0,
                style: {
                    fontFamily: "estedad-fd, Vazir",
                    direction: "rtl",
                    backgroundColor: "#fff1f0",
                    border: "2px solid #ff4d4f",
                },
            });

            // Force logout after delay
            setTimeout(() => {
                logout(false);
                window.location.href = "/login?reason=account_locked";
            }, 3000);
        }
    };

    const handleSessionInvalidated = (msg) => {
        message.error(msg || "سشن شما از دستگاه دیگری ابطال شد");

        setTimeout(() => {
            logout(false);
            window.location.href = "/login?reason=session_ended";
        }, 1500);
    };

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (eventSourceRef.current) {
            console.log("[SSE] Closing connection");
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    }, []);

    // Auto-connect when user logs in
    useEffect(() => {
        if (user && !isLoggingOut()) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [user, connect, disconnect, isLoggingOut]);

    return {
        isConnected: !!eventSourceRef.current,
        reconnect: connect,
        disconnect,
    };
};