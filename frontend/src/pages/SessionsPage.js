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

  const isMountedRef = useRef(true);
  const sessionCountRef = useRef(0);

  // ✅ OPTIMIZATION 1: Remove continuous polling - use event-based updates only
  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch
    fetchSessions();

    // ✅ Event listener for session changes (triggered by actions in THIS browser)
    const handleSessionChange = () => {
      console.log("[Sessions] Local event detected - refreshing");
      fetchSessions();
    };

    window.addEventListener("session-invalidated", handleSessionChange);
    window.addEventListener("session-created", handleSessionChange);

    // ✅ REMOVED: Continuous polling interval
    // ✅ REMOVED: Long-polling mechanism

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("session-invalidated", handleSessionChange);
      window.removeEventListener("session-created", handleSessionChange);
    };
  }, []); // ✅ Empty dependency array - only run once

  const fetchSessions = useCallback(async () => {
    if (isLoggingOut() || !isMountedRef.current) {
      return;
    }

    setLoading(true);
    try {
      const deviceID = localStorage.getItem("device_id");

      const res = await axios.get("/api/sessions", {
        params: { device_id: deviceID },
      });

      const sessionsWithValidDates = res.data.map((session) => ({
        ...session,
        lastActivity: new Date(session.last_activity || session.lastActivity),
        expiresAt: new Date(session.expires_at || session.expiresAt),
        createdAt: new Date(session.created_at || session.createdAt),
      }));

      if (isMountedRef.current) {
        setSessions(sessionsWithValidDates);
        sessionCountRef.current = sessionsWithValidDates.length;
      }
    } catch (err) {
      if (isLoggingOut()) {
        return;
      }

      console.error("[Sessions] Fetch error:", err);
      if (isMountedRef.current) {
        message.error("خطا در دریافت دستگاه‌های فعال");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [isLoggingOut]);

  const handleRefresh = async () => {
    await fetchSessions();
    message.success("لیست به‌روزرسانی شد");
  };

  const handleInvalidateSession = async (sessionId) => {
    setInvalidatingSessionId(sessionId);

    try {
      await axios.delete(`/api/sessions/${sessionId}`);

      message.success("سشن با موفقیت ابطال شد");

      // Optimistic update
      setSessions((prevSessions) =>
        prevSessions.filter((s) => s.id !== sessionId)
      );

      // Dispatch event for other components
      window.dispatchEvent(new Event("session-invalidated"));
    } catch (err) {
      const errorMsg = err.response?.data?.message || "خطا در ابطال سشن";
      message.error(errorMsg);

      // Refresh on error
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

    if (name.includes("mobile") || name.includes("android") || name.includes("iphone")) {
      return <MobileOutlined style={{ fontSize: 20, color: "#52c41a", marginRight: 8 }} />;
    }

    if (name.includes("tablet") || name.includes("ipad")) {
      return <TabletOutlined style={{ fontSize: 20, color: "#1890ff", marginRight: 8 }} />;
    }

    return <LaptopOutlined style={{ fontSize: 20, color: "#722ed1", marginRight: 8 }} />;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "نامعلوم";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "خطا در تاریخ";
      return formatJalaliDate(date, true);
    } catch {
      return "خطا در تاریخ";
    }
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
        return <Text style={{ fontSize: 14 }}>{formatDateTime(lastActivity)}</Text>;
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
                <div style={{ fontWeight: "bold", marginBottom: 8 }}>ابطال سشن</div>
                <div>
                  آیا از ابطال این سشن ({record.device_name || record.deviceName}) اطمینان
                  دارید؟
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
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
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
                      با ابطال تمام سشن‌ها، از تمام دستگاه‌ها خارج خواهید شد و به صفحه ورود
                      هدایت خواهید شد.
                    </div>
                  </div>
                }
                onConfirm={handleInvalidateAllSessions}
                okText="تایید"
                cancelText="لغو"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<LogoutOutlined />} loading={invalidatingAll}>
                  ابطال تمام سشن‌ها
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        <Alert
          message="دستگاه‌های فعال شما"
          description="در این صفحه می‌توانید تمام دستگاه‌هایی که با حساب کاربری شما وارد شده‌اند را مشاهده و مدیریت کنید. تغییرات به صورت خودکار اعمال می‌شوند."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <Spin size="large" />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#8c8c8c" }}>
            <Text>هیچ سشن فعالی یافت نشد</Text>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={sessions}
            rowKey="id"
            pagination={false}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: "هیچ سشن‌ای یافت نشد" }}
            style={{ marginTop: 16 }}
          />
        )}

        <Divider />

        <div style={{ textAlign: "center", color: "#8c8c8c", fontSize: 14 }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary">تعداد دستگاه‌های فعال: {sessions.length}</Text>
            <Text type="secondary" style={{ fontSize: 14 }}>
              ℹ️ تغییرات به صورت خودکار اعمال می‌شوند (Event-Driven)
            </Text>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default SessionsPage;