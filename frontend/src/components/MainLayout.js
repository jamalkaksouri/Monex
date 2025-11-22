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
} from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import "./MainLayout.css";
import axios from "axios";

const { Header, Sider, Content } = Layout;

const MainLayout = ({ children }) => {
  const { user, logout, changePassword, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [form] = Form.useForm();

  // ✅ Move all menu items OUTSIDE conditional blocks
  const baseMenuItems = [
    {
      key: "/",
      icon: <DashboardOutlined style={{ fontSize: 18 }} />,
      label: "داشبورد",
      onClick: () => navigate("/"),
    },
  ];

  // Add admin items conditionally
  const adminMenuItems = isAdmin()
    ? [
      {
        key: "/users",
        icon: <TeamOutlined style={{ fontSize: 18 }} />,
        label: "مدیریت کاربران",
        onClick: () => navigate("/users"),
      },
    ]
    : [];

  const menuItems = [...baseMenuItems, ...adminMenuItems];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleServerShutdown = async () => {
    Modal.confirm({
      title: "خاموش کردن سرور",
      content: "آیا واقعاً می‌خواهید سرور را خاموش کنید؟",
      okText: "بله",
      cancelText: "خیر",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          // ✅ FIX #2: Use correct endpoint path
          await axios.post("/api/shutdown");

          message.warning("سرور در حال خاموش شدن است...");

          // Wait for server to shutdown then redirect to login
          setTimeout(() => {
            window.location.href = "/login";
          }, 2000);

        } catch (err) {
          // Handle different error types
          if (err.response?.status === 403) {
            message.error("شما مجوز خاموش کردن سرور را ندارید");
          } else {
            message.error(
              err.response?.data?.message || "خطا در خاموش کردن سرور"
            );
          }
        }
      },
    });
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

  // ✅ User menu always includes shutdown if admin
  const userMenuItems = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {user?.username}
          </div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            {user?.email}
          </div>
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
    // ✅ Admin-only items clearly separated
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
      {/* Sidebar */}
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

      {/* Main Layout */}
      <Layout
        style={{ marginRight: collapsed ? 80 : 240, transition: "all 0.2s" }}
      >
        {/* Header */}
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

        {/* Content */}
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
    </Layout>
  );
};

export default MainLayout;
