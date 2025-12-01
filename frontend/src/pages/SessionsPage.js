import React, { useState } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Divider,
  Popconfirm,
  Alert,
  Tooltip,
  Badge,
} from "antd";
import {
  LaptopOutlined,
  MobileOutlined,
  TabletOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  LogoutOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";
import { formatJalaliDate } from "../utils/formatDate";
import { useRealtimeSessions } from "../hooks/useRealtimeSessions";

const { Title, Text } = Typography;

const SessionsPage = () => {
  const { user } = useAuth();
  const {
    sessions,
    loading,
    lastUpdate,
    deleteSession,
    deleteAllSessions,
    refresh,
  } = useRealtimeSessions(user?.id);

  const [deletingSessionId, setDeletingSessionId] = useState(null);

  const getDeviceIcon = (deviceName) => {
    const name = (deviceName || "").toLowerCase();

    if (
      name.includes("mobile") ||
      name.includes("android") ||
      name.includes("iphone")
    ) {
      return (
        <MobileOutlined
          style={{ fontSize: 20, color: "#52c41a", marginRight: 8 }}
        />
      );
    }

    if (name.includes("tablet") || name.includes("ipad")) {
      return (
        <TabletOutlined
          style={{ fontSize: 20, color: "#1890ff", marginRight: 8 }}
        />
      );
    }

    return (
      <LaptopOutlined
        style={{ fontSize: 20, color: "#722ed1", marginRight: 8 }}
      />
    );
  };

  const handleDeleteSession = async (sessionId, deviceName) => {
    setDeletingSessionId(sessionId);
    await deleteSession(sessionId, deviceName);
    setDeletingSessionId(null);
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
              {record.is_current && (
                <Badge
                  count="فعلی"
                  style={{
                    backgroundColor: "#52c41a",
                    marginRight: 8,
                    fontSize: 12,
                  }}
                />
              )}
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
        const activityTime = new Date(lastActivity);
        const now = new Date();
        const diffMinutes = Math.floor((now - activityTime) / (1000 * 60));

        let statusColor = "#52c41a";
        let statusText = "فعال";

        if (diffMinutes > 30) {
          statusColor = "#ff4d4f";
          statusText = "غیرفعال";
        } else if (diffMinutes > 10) {
          statusColor = "#faad14";
          statusText = "نیمه‌فعال";
        }

        return (
          <div>
            <div>
              <Badge color={statusColor} text={statusText} />
            </div>
            <Text type="secondary" style={{ fontSize: 14 }}>
              {formatJalaliDate(lastActivity, true)}
            </Text>
          </div>
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
                  ⚠️ ابطال سشن
                </div>
                <div>
                  با ابطال این سشن، دستگاه "
                  {record.device_name || record.deviceName}" بلافاصله از حساب
                  شما خارج می‌شود.
                </div>
                <div style={{ marginTop: 8, color: "#ff4d4f" }}>
                  این عملیات قابل بازگشت نیست.
                </div>
              </div>
            }
            onConfirm={() =>
              handleDeleteSession(
                record.id,
                record.device_name || record.deviceName
              )
            }
            okText="تایید و حذف"
            cancelText="لغو"
            okButtonProps={{
              danger: true,
              loading: deletingSessionId === record.id,
            }}
          >
            <Tooltip title="ابطال سشن و خروج از این دستگاه">
              <Button
                danger
                shape="circle"
                icon={<DeleteOutlined />}
                loading={deletingSessionId === record.id}
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
            <Tooltip title="آخرین به‌روزرسانی">
              <Text type="secondary" style={{ fontSize: 14 }}>
                <SyncOutlined spin={loading} />{" "}
                {new Date(lastUpdate).toLocaleTimeString("fa-IR")}
              </Text>
            </Tooltip>
            <Button
              icon={<ReloadOutlined />}
              onClick={refresh}
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
                      با ابطال تمام سشن‌ها، از تمام دستگاه‌ها (شامل این دستگاه)
                      خارج خواهید شد و به صفحه ورود هدایت می‌شوید.
                    </div>
                    <div style={{ marginTop: 8, color: "#ff4d4f" }}>
                      این عملیات بلافاصله اجرا می‌شود و قابل بازگشت نیست.
                    </div>
                  </div>
                }
                onConfirm={deleteAllSessions}
                okText="تایید"
                cancelText="لغو"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<LogoutOutlined />} loading={loading}>
                  ابطال تمام سشن‌ها
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        <Alert
          message="🔄 به‌روزرسانی خودکار فعال است"
          description="لیست دستگاه‌های فعال به صورت خودکار و بلادرنگ (Real-Time) به‌روزرسانی می‌شود. هر تغییری بلافاصله در این صفحه نمایش داده می‌شود."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "هیچ سشن‌ای یافت نشد" }}
          style={{ marginTop: 16 }}
        />

        <Divider />

        <div style={{ textAlign: "center", color: "#8c8c8c", fontSize: 14 }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary">
              تعداد دستگاه‌های فعال: {sessions.length}
            </Text>
            <Text type="secondary" style={{ fontSize: 14 }}>
              ℹ️ تغییرات به صورت خودکار و بلادرنگ اعمال می‌شوند
            </Text>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default SessionsPage;
