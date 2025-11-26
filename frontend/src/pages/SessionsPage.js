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
} from "antd";
import {
  LaptopOutlined,
  MobileOutlined,
  TabletOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { formatJalaliDate } from "../utils/formatDate";

const { Title, Text } = Typography;

const SessionsPage = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/sessions");
      setSessions(res.data || []);
    } catch (err) {
      message.error("خطا در دریافت جلسات فعال");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleInvalidateSession = async (sessionId) => {
    try {
      await axios.delete(`/api/sessions/${sessionId}`);
      message.success("جلسه با موفقیت لغو شد");
      fetchSessions();
    } catch (err) {
      message.error(err.response?.data?.message || "خطا در لغو جلسه");
    }
  };

  const handleInvalidateAllSessions = async () => {
    try {
      await axios.delete("/api/sessions/all");
      message.success("تمام جلسات با موفقیت لغو شدند");
      // User will be logged out, redirect to login
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      message.error(err.response?.data?.message || "خطا در لغو جلسات");
    }
  };

  const getDeviceIcon = (deviceName) => {
    const name = deviceName.toLowerCase();
    if (name.includes("mobile") || name.includes("android") || name.includes("iphone")) {
      return <MobileOutlined style={{ fontSize: 20, color: "#52c41a" }} />;
    }
    if (name.includes("tablet") || name.includes("ipad")) {
      return <TabletOutlined style={{ fontSize: 20, color: "#1890ff" }} />;
    }
    return <LaptopOutlined style={{ fontSize: 20, color: "#722ed1" }} />;
  };

  const columns = [
    {
      title: "دستگاه",
      key: "device",
      width: 200,
      render: (_, record) => (
        <Space>
          {getDeviceIcon(record.device_name)}
          <div>
            <div style={{ fontWeight: 600 }}>{record.device_name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.browser}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "سیستم عامل",
      dataIndex: "os",
      key: "os",
      width: 120,
      align: "center",
      render: (os) => (
        <Tag color="blue" style={{ fontSize: 13 }}>
          {os}
        </Tag>
      ),
    },
    {
      title: "آدرس IP",
      dataIndex: "ip_address",
      key: "ip_address",
      width: 140,
      align: "center",
      render: (ip) => (
        <Text code style={{ fontSize: 13 }}>
          {ip}
        </Text>
      ),
    },
    {
      title: "آخرین فعالیت",
      dataIndex: "last_activity",
      key: "last_activity",
      width: 160,
      align: "center",
      render: (date) => (
        <Space direction="vertical" size={0}>
          <Text>{formatJalaliDate(date, true)}</Text>
        </Space>
      ),
    },
    {
      title: "انقضا",
      dataIndex: "expires_at",
      key: "expires_at",
      width: 160,
      align: "center",
      render: (date) => (
        <Tooltip title={formatJalaliDate(date, true)}>
          <Tag
            icon={<ClockCircleOutlined />}
            color="orange"
            style={{ fontSize: 12 }}
          >
            {formatJalaliDate(date, false)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: "وضعیت",
      key: "status",
      width: 100,
      align: "center",
      render: (_, record) =>
        record.is_current ? (
          <Tag
            icon={<CheckCircleOutlined />}
            color="success"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            جلسه فعلی
          </Tag>
        ) : (
          <Tag color="default" style={{ fontSize: 13 }}>
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
                  لغو جلسه
                </div>
                <div>آیا از لغو این جلسه اطمینان دارید؟</div>
              </div>
            }
            onConfirm={() => handleInvalidateSession(record.id)}
            okText="تایید"
            cancelText="لغو"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="لغو جلسه">
              <Button danger shape="circle" icon={<DeleteOutlined />} />
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
              مدیریت جلسات فعال
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
                      لغو تمام جلسات
                    </div>
                    <div>
                      با لغو تمام جلسات، از حساب کاربری خود خارج خواهید شد.
                    </div>
                  </div>
                }
                onConfirm={handleInvalidateAllSessions}
                okText="تایید"
                cancelText="لغو"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  لغو تمام جلسات
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        <Alert
          message="جلسات فعال شما"
          description="در این صفحه می‌توانید تمام دستگاه‌هایی که با حساب کاربری شما وارد شده‌اند را مشاهده و مدیریت کنید. در صورت مشاهده دستگاه ناشناس، می‌توانید آن را لغو کنید."
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
          locale={{
            emptyText: "هیچ جلسه فعالی یافت نشد",
          }}
          style={{ marginTop: 16 }}
        />

        <Divider />

        <div style={{ textAlign: "center", color: "#8c8c8c", fontSize: 13 }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary">
              تعداد کل جلسات فعال: {sessions.length}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              برای امنیت بیشتر، پس از استفاده از حساب خود، حتماً از سیستم خارج
              شوید
            </Text>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default SessionsPage;