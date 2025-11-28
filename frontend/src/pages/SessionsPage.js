// FILE: frontend/src/pages/SessionsPage.js - COMPLETELY REWRITTEN

import React, { useState, useEffect } from "react";
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
  const { logout } = useAuth();

  // ✅ FIX: Proper date parsing and formatting
  const formatDateTime = (dateString) => {
    if (!dateString) return "نامعلوم";

    try {
      // Handle ISO string or standard datetime string
      const date = new Date(dateString);

      if (isNaN(date.getTime())) {
        console.warn("[WARN] Invalid date:", dateString);
        return "خطا در تاریخ";
      }

      // Format: "1403/10/06 14:30"
      return formatJalaliDate(date, true);
    } catch (err) {
      console.error("[ERROR] Date parsing failed:", err, dateString);
      return "خطا در تاریخ";
    }
  };

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const deviceID = localStorage.getItem("device_id");
      console.log("[DEBUG] Fetching sessions - DeviceID:", deviceID);

      const res = await axios.get("/api/sessions", {
        params: { device_id: deviceID },
      });

      console.log("[DEBUG] Sessions response:", res.data);

      // ✅ FIX: Validate and parse dates
      const sessionsWithValidDates = res.data.map((session) => ({
        ...session,
        // Ensure dates are proper Date objects
        lastActivity: new Date(session.last_activity || session.lastActivity),
        expiresAt: new Date(session.expires_at || session.expiresAt),
        createdAt: new Date(session.created_at || session.createdAt),
      }));

      setSessions(sessionsWithValidDates);
    } catch (err) {
      console.error("[ERROR] Failed to fetch sessions:", err);
      message.error("خطا در دریافت دستگاه‌های فعال");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    // Refresh every 30 seconds
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  // ✅ FIX: Proper session invalidation with logout handling
  const handleInvalidateSession = async (sessionId) => {
    setInvalidatingSessionId(sessionId);

    try {
      console.log("[DEBUG] Invalidating session:", sessionId);

      await axios.delete(`/api/sessions/${sessionId}`);

      message.success("سشن با موفقیت ابطال شد");

      // ✅ FIX: Immediately refresh the session list
      await fetchSessions();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "خطا در ابطال سشن";
      message.error(errorMsg);
      console.error("[ERROR] Invalidate session failed:", err);
    } finally {
      setInvalidatingSessionId(null);
    }
  };

  // ✅ FIX: Invalidate all sessions with logout
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
      setInvalidatingAll(false);
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
              برای امنیت بیشتر، پس از استفاده، حتماً سشن‌ها‌ی را که دیگر نیاز
              ندارید ابطال کنید
            </Text>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default SessionsPage;
