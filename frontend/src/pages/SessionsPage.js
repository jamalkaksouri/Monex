// FILE: frontend/src/pages/SessionsPage.js - OPTIMIZED VERSION

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Divider,
  Popconfirm,
  message,
  Tooltip,
  Alert,
  Spin,
} from "antd";
import {
  LaptopOutlined,
  MobileOutlined,
  TabletOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { formatJalaliDate } from "../utils/formatDate";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const SessionsPage = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [invalidatingSessionId, setInvalidatingSessionId] = useState(null);
  const [invalidatingAll, setInvalidatingAll] = useState(false);
  const { logout, isLoggingOut } = useAuth();

  // ✅ Track if component is mounted to prevent setState on unmount
  const isMountedRef = useRef(true);

  // ✅ Track last fetch time to prevent redundant calls
  const lastFetchTimeRef = useRef(0);
  const MIN_FETCH_INTERVAL = 2000; // Minimum 2 seconds between fetches

  const formatDateTime = (dateString) => {
    if (!dateString) return "نامعلوم";

    try {
      const date = new Date(dateString);

      if (isNaN(date.getTime())) {
        console.warn("[WARN] Invalid date:", dateString);
        return "خطا در تاریخ";
      }

      return formatJalaliDate(date, true);
    } catch (err) {
      console.error("[ERROR] Date parsing failed:", err, dateString);
      return "خطا در تاریخ";
    }
  };

  // ✅ Optimized fetchSessions with debouncing
  // ✅ Initial load + Event-driven updates (for same-tab changes)
  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch
    fetchSessions();

    // ✅ Event listener for session changes in SAME browser
    const handleSessionChange = (event) => {
      console.log("[Sessions] Local event detected:", event.type);
      fetchSessions();
    };

    // Listen for custom events from other parts of the app
    window.addEventListener("session-invalidated", handleSessionChange);
    window.addEventListener("session-created", handleSessionChange);
    window.addEventListener("login-success", handleSessionChange);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("session-invalidated", handleSessionChange);
      window.removeEventListener("session-created", handleSessionChange);
      window.removeEventListener("login-success", handleSessionChange);
    };
  }, []);

  const fetchSessions = useCallback(async () => {
    // ✅ Prevent fetch if logging out
    if (isLoggingOut()) {
      console.log("[Sessions] Skipping fetch - logout in progress");
      return;
    }

    // ✅ Prevent fetch if component unmounted
    if (!isMountedRef.current) {
      console.log("[Sessions] Component unmounted - skipping fetch");
      return;
    }

    // ✅ Debounce: prevent rapid consecutive calls
    const now = Date.now();
    if (now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL) {
      console.log("[Sessions] Fetch throttled - too soon since last fetch");
      return;
    }
    lastFetchTimeRef.current = now;

    setLoading(true);
    try {
      const deviceID = localStorage.getItem("device_id");
      console.log("[DEBUG] Fetching sessions - DeviceID:", deviceID);

      const res = await axios.get("/api/sessions", {
        params: { device_id: deviceID },
      });

      console.log("[DEBUG] Sessions response:", res.data);

      const sessionsWithValidDates = res.data.map((session) => ({
        ...session,
        lastActivity: new Date(session.last_activity || session.lastActivity),
        expiresAt: new Date(session.expires_at || session.expiresAt),
        createdAt: new Date(session.created_at || session.createdAt),
      }));

      if (isMountedRef.current) {
        setSessions(sessionsWithValidDates);
        sessionCountRef.current = sessionsWithValidDates.length; // ✅ Update count
      }
    } catch (err) {
      // ✅ Silently ignore errors during logout
      if (isLoggingOut()) {
        console.log("[Sessions] Ignoring fetch error - logout in progress");
        return;
      }

      console.error("[ERROR] Failed to fetch sessions:", err);

      if (isMountedRef.current) {
        message.error("خطا در دریافت دستگاه‌های فعال");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [isLoggingOut]);

  // ✅ Track session count for change detection
  const sessionCountRef = useRef(0);

  // ✅ Lightweight polling to detect remote changes
  useEffect(() => {
    if (!isMountedRef.current) return;

    const checkForChanges = async () => {
      // Skip if logging out or unmounted
      if (isLoggingOut() || !isMountedRef.current) return;

      try {
        const deviceID = localStorage.getItem("device_id");
        const res = await axios.get("/api/sessions", {
          params: { device_id: deviceID },
        });

        const currentCount = res.data.length;

        // ✅ Only update if count changed (lightweight check)
        if (
          sessionCountRef.current > 0 &&
          sessionCountRef.current !== currentCount
        ) {
          console.log(
            `[Sessions] Count changed: ${sessionCountRef.current} → ${currentCount}`
          );

          // Update full list
          const sessionsWithValidDates = res.data.map((session) => ({
            ...session,
            lastActivity: new Date(
              session.last_activity || session.lastActivity
            ),
            expiresAt: new Date(session.expires_at || session.expiresAt),
            createdAt: new Date(session.created_at || session.createdAt),
          }));

          if (isMountedRef.current) {
            setSessions(sessionsWithValidDates);
            message.info("لیست دستگاه‌ها به‌روز شد");
          }
        }

        sessionCountRef.current = currentCount;
      } catch (err) {
        // Silently ignore errors during polling
        if (!isLoggingOut()) {
          console.warn("[Sessions] Polling check failed:", err);
        }
      }
    };

    // ✅ Check every 10 seconds (lightweight - only compares count)
    const pollInterval = setInterval(checkForChanges, 10000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [isLoggingOut]);

  const handleInvalidateSession = async (sessionId) => {
    setInvalidatingSessionId(sessionId);

    try {
      console.log("[DEBUG] Invalidating session:", sessionId);

      await axios.delete(`/api/sessions/${sessionId}`);

      message.success("سشن با موفقیت ابطال شد");

      // ✅ Immediately update local state (optimistic update)
      setSessions((prevSessions) =>
        prevSessions.filter((s) => s.id !== sessionId)
      );

      // ✅ Dispatch event to notify other components
      window.dispatchEvent(new Event("session-invalidated"));
    } catch (err) {
      const errorMsg = err.response?.data?.message || "خطا در ابطال سشن";
      message.error(errorMsg);
      console.error("[ERROR] Invalidate session failed:", err);

      // ✅ Refresh on error to ensure consistency
      fetchSessions();
    } finally {
      if (isMountedRef.current) {
        setInvalidatingSessionId(null);
      }
    }
  };

  const handleInvalidateAllSessions = async () => {
    setInvalidatingAll(true);

    try {
      await axios.delete("/api/sessions/all");

      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      delete axios.defaults.headers.common["Authorization"];

      logout(false);

      message.error("سشن شما از یک دستگاه دیگر ابطال شده است.");

      setTimeout(() => {
        window.location.href = "/login?reason=session_ended";
      }, 1500);
    } catch (err) {
      // Force logout even on error
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      delete axios.defaults.headers.common["Authorization"];

      logout(false);

      message.error("سشن شما از یک دستگاه دیگر ابطال شده است.");

      setTimeout(() => {
        window.location.href = "/login?reason=session_ended";
      }, 1500);
    } finally {
      if (isMountedRef.current) {
        setInvalidatingAll(false);
      }
    }
  };

  const getDeviceIcon = (deviceName) => {
    const name = (deviceName || "").toLowerCase();

    if (
      name.includes("mobile") ||
      name.includes("android") ||
      name.includes("iphone")
    ) {
      return (
        <MobileOutlined
          style={{
            fontSize: 20,
            color: "#52c41a",
            marginRight: 8,
          }}
        />
      );
    }

    if (name.includes("tablet") || name.includes("ipad")) {
      return (
        <TabletOutlined
          style={{
            fontSize: 20,
            color: "#1890ff",
            marginRight: 8,
          }}
        />
      );
    }

    return (
      <LaptopOutlined
        style={{
          fontSize: 20,
          color: "#722ed1",
          marginRight: 8,
        }}
      />
    );
  };

  const columns = [
    {
      title: "دستگاه",
      key: "device",
      width: 250,
      render: (_, record) => (
        <Space>
          {getDeviceIcon(record.device_name || record.deviceName)}
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {record.device_name || record.deviceName}
            </div>
            <Text type="secondary" style={{ fontSize: 14 }}>
              {record.browser || "نامعلوم"}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "سیستم عامل",
      dataIndex: ["os"],
      key: "os",
      width: 120,
      align: "center",
      render: (os) => (
        <Tag color="blue" style={{ fontSize: 14 }}>
          {os || "نامعلوم"}
        </Tag>
      ),
    },
    {
      title: "آدرس IP",
      dataIndex: ["ip_address", "ipAddress"],
      key: "ip_address",
      width: 140,
      align: "center",
      render: (text, record) => (
        <Text code style={{ fontSize: 14 }}>
          {record.ip_address || record.ipAddress || "نامعلوم"}
        </Text>
      ),
    },
    {
      title: "آخرین فعالیت",
      key: "last_activity",
      width: 160,
      align: "center",
      render: (_, record) => {
        const lastActivity = record.last_activity || record.lastActivity;
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 14 }}>{formatDateTime(lastActivity)}</Text>
          </Space>
        );
      },
    },
    {
      title: "انقضا",
      key: "expires_at",
      width: 160,
      align: "center",
      render: (_, record) => {
        const expiresAt = record.expires_at || record.expiresAt;
        return (
          <Tooltip title={formatDateTime(expiresAt)}>
            <Tag
              icon={<ClockCircleOutlined />}
              color="orange"
              style={{ fontSize: 14 }}
            >
              {formatDateTime(expiresAt)}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "وضعیت",
      key: "status",
      width: 120,
      align: "center",
      render: (_, record) =>
        record.is_current ? (
          <Tag
            icon={<CheckCircleOutlined />}
            color="success"
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            سشن فعلی
          </Tag>
        ) : (
          <Tag color="default" style={{ fontSize: 14 }}>
            سایر دستگاه‌ها
          </Tag>
        ),
    },
    {
      title: "عملیات",
      key: "actions",
      width: 120,
      align: "center",
      render: (_, record) =>
        !record.is_current && (
          <Popconfirm
            title={
              <div>
                <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                  ابطال سشن
                </div>
                <div>
                  آیا از ابطال این سشن (
                  {record.device_name || record.deviceName}) اطمینان دارید؟
                </div>
              </div>
            }
            onConfirm={() => handleInvalidateSession(record.id)}
            okText="تایید"
            cancelText="لغو"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="ابطال سشن">
              <Button
                danger
                shape="circle"
                icon={<DeleteOutlined />}
                loading={invalidatingSessionId === record.id}
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LaptopOutlined style={{ fontSize: 20, color: "#1890ff" }} />
            <Title level={4} style={{ margin: 0 }}>
              مدیریت دستگاه‌های فعال
            </Title>
          </div>
        }
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchSessions}
              loading={loading}
            >
              به‌روزرسانی
            </Button>
            {sessions.length > 1 && (
              <Popconfirm
                title={
                  <div>
                    <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                      ⚠️ ابطال تمام سشن‌ها
                    </div>
                    <div>
                      با ابطال تمام سشن‌ها، از تمام دستگاه‌ها خارج خواهید شد و
                      به صفحه ورود هدایت خواهید شد.
                    </div>
                  </div>
                }
                onConfirm={handleInvalidateAllSessions}
                okText="تایید"
                cancelText="لغو"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<LogoutOutlined />}
                  loading={invalidatingAll}
                >
                  ابطال تمام سشن‌ها
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        <Alert
          message="دستگاه‌های فعال شما"
          description="در این صفحه می‌توانید تمام دستگاه‌هایی که با حساب کاربری شما وارد شده‌اند را مشاهده و مدیریت کنید. با ابطال یک سشن، کاربر دستگاه متناظر خارج خواهد شد."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <Spin size="large" />
          </div>
        ) : sessions.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              color: "#8c8c8c",
            }}
          >
            <Text>هیچ سشن فعالی یافت نشد</Text>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={sessions}
            rowKey="id"
            pagination={false}
            scroll={{ x: "max-content" }}
            locale={{
              emptyText: "هیچ سشن‌ای یافت نشد",
            }}
            style={{ marginTop: 16 }}
          />
        )}

        <Divider />

        <div style={{ textAlign: "center", color: "#8c8c8c", fontSize: 14 }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary">
              تعداد دستگاه‌های فعال: {sessions.length}
            </Text>
            <Text type="secondary" style={{ fontSize: 14 }}>
              ℹ️ این لیست به‌صورت خودکار هر 10 ثانیه چک می‌شود
            </Text>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default SessionsPage;
