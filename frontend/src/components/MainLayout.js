import React, { useState } from "react";
import {
  Layout,
  Menu,
  Dropdown,
  Avatar,
  Button,
  Modal,
  Form,
  Input,
  message,
} from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
  DashboardOutlined,
  TeamOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  PoweroffOutlined,
  AuditOutlined,
  LaptopOutlined,
} from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import "./MainLayout.css";
import axios from "axios";
import { setAxiosLoggingOut } from "../axios";

const { Header, Sider, Content } = Layout;

const MainLayout = ({ children }) => {
  const { user, logout, changePassword, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [form] = Form.useForm();

  const [shutdownModalVisible, setShutdownModalVisible] = useState(false);
  const [shutdownCode, setShutdownCode] = useState("");

  // Base menu items
  const baseMenuItems = [
    {
      key: "/",
      icon: <DashboardOutlined style={{ fontSize: 18 }} />,
      label: "داشبورد",
      onClick: () => navigate("/"),
    },
    {
      key: "/sessions",
      icon: <LaptopOutlined style={{ fontSize: 18 }} />,
      label: "دستگاه‌های فعال",
      onClick: () => navigate("/sessions"),
    },
  ];

  // Admin menu items
  const adminMenuItems = isAdmin()
    ? [
        {
          key: "/users",
          icon: <TeamOutlined style={{ fontSize: 18 }} />,
          label: "مدیریت کاربران",
          onClick: () => navigate("/users"),
        },
        {
          key: "/audit-logs",
          icon: <AuditOutlined style={{ fontSize: 18 }} />,
          label: "لاگ‌های سیستم",
          onClick: () => navigate("/audit-logs"),
        },
      ]
    : [];

  const menuItems = [...baseMenuItems, ...adminMenuItems];

  const handleLogout = async () => {
    setAxiosLoggingOut(true);
    await logout(true);

    setTimeout(() => {
      setAxiosLoggingOut(false);
      navigate("/login");
    }, 800);
  };

  const handleServerShutdown = () => {
    setShutdownModalVisible(true);
    setShutdownCode("");
  };

  const executeServerShutdown = async () => {
    if (shutdownCode !== "server-shutdown" && shutdownCode !== "server-down") {
      message.error("عبارت وارد شده صحیح نیست");
      return;
    }

    try {
      await axios.post("/api/shutdown");
      message.success("سرور در حال خاموش شدن است...");

      setTimeout(() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        delete axios.defaults.headers.common["Authorization"];
        window.location.href = "/login";
      }, 2000);
    } catch (err) {
      if (err.response?.status === 403) {
        message.error("شما مجوز خاموش کردن سرور را ندارید");
      } else if (err.code === "ERR_NETWORK") {
        message.success("سرور خاموش شد");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1000);
      } else {
        message.error(err.response?.data?.message || "خطا در خاموش کردن سرور");
      }
    }
  };

  const handleChangePassword = async (values) => {
    const success = await changePassword(
      values.old_password,
      values.new_password
    );
    if (success) {
      setPasswordModalVisible(false);
      form.resetFields();
    }
  };

  const userMenuItems = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.username}</div>
          <div style={{ fontSize: 14, color: "#8c8c8c" }}>{user?.email}</div>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" },
    {
      key: "change-password",
      icon: <LockOutlined />,
      label: "تغییر رمز عبور",
      onClick: () => setPasswordModalVisible(true),
    },
    ...(isAdmin()
      ? [
          { type: "divider" },
          {
            key: "shutdown",
            icon: <PoweroffOutlined />,
            label: "خاموش کردن سرور",
            danger: true,
            onClick: handleServerShutdown,
          },
        ]
      : []),
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "خروج",
      danger: true,
      onClick: handleLogout,
    },
  ];

  const selectedKey = location.pathname;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        collapsedWidth={80}
        width={240}
        style={{
          overflow: "auto",
          height: "100vh",
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          boxShadow: "2px 0 8px rgba(0,0,0,0.08)",
          background: "#001529",
          zIndex: 100,
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255, 255, 255, 0.08)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {!collapsed ? (
            <h2
              style={{
                color: "#fff",
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              Monex
            </h2>
          ) : (
            <h2
              style={{
                color: "#fff",
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              M
            </h2>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{
            border: "none",
            fontSize: 15,
            fontWeight: 500,
          }}
        />
      </Sider>

      <Layout
        style={{ marginRight: collapsed ? 80 : 240, transition: "all 0.2s" }}
      >
        <Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            height: 64,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: 18,
              width: 48,
              height: 48,
            }}
          />

          <Dropdown
            menu={{ items: userMenuItems }}
            placement="bottomLeft"
            trigger={["click"]}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: 8,
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f5f5f5")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <Avatar
                style={{
                  backgroundColor: "#1890ff",
                  fontSize: 16,
                  fontWeight: 600,
                }}
                size={40}
                icon={<UserOutlined />}
              />
              <div style={{ textAlign: "right" }}>
                <div
                  style={{ fontWeight: 600, fontSize: 14, color: "#262626" }}
                >
                  {user?.username}
                </div>
              </div>
            </div>
          </Dropdown>
        </Header>

        <Content
          style={{ background: "#f5f7fb", minHeight: "calc(100vh - 64px)" }}
        >
          {children}
        </Content>
      </Layout>

      {/* Change Password Modal */}
      <Modal
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 16,
            }}
          >
            <LockOutlined style={{ color: "#1890ff" }} />
            <span>تغییر رمز عبور</span>
          </div>
        }
        open={passwordModalVisible}
        onCancel={() => {
          setPasswordModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={450}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleChangePassword}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="old_password"
            label="رمز عبور فعلی"
            rules={[{ required: true, message: "رمز عبور فعلی را وارد کنید" }]}
          >
            <Input.Password prefix={<LockOutlined />} size="large" />
          </Form.Item>

          <Form.Item
            name="new_password"
            label="رمز عبور جدید"
            rules={[
              { required: true, message: "رمز عبور جدید را وارد کنید" },
              { min: 8, message: "رمز عبور باید حداقل 8 کاراکتر باشد" },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} size="large" />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="تکرار رمز عبور جدید"
            dependencies={["new_password"]}
            rules={[
              { required: true, message: "تکرار رمز عبور را وارد کنید" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("new_password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("رمز عبور یکسان نیست"));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} size="large" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <Button
                onClick={() => {
                  setPasswordModalVisible(false);
                  form.resetFields();
                }}
              >
                انصراف
              </Button>
              <Button type="primary" htmlType="submit">
                تغییر رمز عبور
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Shutdown Modal */}
      <Modal
        open={shutdownModalVisible}
        onCancel={() => setShutdownModalVisible(false)}
        footer={null}
        width={560}
        centered
        styles={{ body: { paddingTop: 10 } }}
      >
        <style>
          {`
      @keyframes shakeInput {
        0% { transform: translateX(0); }
        20% { transform: translateX(-5px); }
        40% { transform: translateX(5px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
        100% { transform: translateX(0); }
      }
      .shake {
        animation: shakeInput 0.3s ease;
      }
    `}
        </style>

        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <svg
              width="58"
              height="58"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#d32f2f"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                padding: 8,
                borderRadius: "14px",
                background: "#fff4f4",
                border: "1px solid #ffd4d4",
              }}
            >
              <rect x="3" y="3" width="18" height="6" rx="2"></rect>
              <rect x="3" y="15" width="18" height="6" rx="2"></rect>
              <path d="M3 9h18"></path>
              <circle cx="18" cy="6" r="1" fill="#d32f2f"></circle>
              <circle cx="18" cy="18" r="1" fill="#d32f2f"></circle>
              <line
                x1="8"
                y1="12"
                x2="16"
                y2="12"
                stroke="#d32f2f"
                strokeWidth="2"
              ></line>
            </svg>
          </div>

          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            تأیید خاموش کردن سرور
          </h2>

          <div
            style={{
              background: "#fff4f4",
              border: "1px solid #ffdddd",
              padding: "12px 16px",
              borderRadius: 6,
              marginBottom: 16,
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "#d93025",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              ⚠
            </span>

            <div style={{ fontSize: 14, lineHeight: "24px", color: "#b10000" }}>
              این یک عملیات حساس و غیرقابل بازگشت است. با اجرای آن، سرویس برای
              تمام کاربران قطع خواهد شد.
            </div>
          </div>

          <p
            style={{
              fontSize: 15.5,
              lineHeight: "29px",
              marginBottom: 14,
              color: "#3a3a3a",
            }}
          >
            برای تأیید خاموش کردن سرور، لطفاً عبارت{" "}
            <span
              style={{
                fontWeight: 800,
                padding: "3px 8px",
                borderRadius: 8,
                background: "#f0f2f5",
                color: "#000",
                margin: "0px 4px",
                fontSize: 14,
              }}
            >
              server-shutdown
            </span>{" "}
            را تایپ کنید.
          </p>

          <Input
            size="large"
            placeholder="عبارت تأیید را تایپ کنید"
            value={shutdownCode}
            id="shutdownInput"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="search"
            onChange={(e) => setShutdownCode(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            style={{
              direction: "ltr",
              marginBottom: 20,
              letterSpacing: "0.5px",
            }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button onClick={() => setShutdownModalVisible(false)}>
              انصراف
            </Button>

            <Button
              type="primary"
              danger
              disabled={
                shutdownCode.trim() !== "server-shutdown" &&
                shutdownCode.trim() !== "server-down"
              }
              onClick={executeServerShutdown}
            >
              تأیید و خاموش کردن سرور
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default MainLayout;
