import React, { useState } from "react";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { UserOutlined, LockOutlined, HeartFilled } from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";
import SpiderWebBackground from "../components/SpiderWebBackground";
import "./LoginPage.css";

const { Title, Text } = Typography;

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const [form] = Form.useForm();

  // After login success, ensure session_id is stored
  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const success = await login(values.username, values.password);
      if (success) {
        // ✅ Verify session_id exists before navigating
        const sessionId = localStorage.getItem("session_id");
        if (!sessionId) {
          message.error("سشن ایجاد نشد. لطفا دوباره تلاش کنید.");
          return;
        }
        message.success("خوش آمدید!");
        // Navigate happens automatically via AuthContext
      }
    } catch (error) {
      message.error("خطا در ورود به سیستم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <SpiderWebBackground />
      <div className="login-background"></div>
      <Card className="login-card" variant={false}>
        <div className="login-header">
          <Title
            level={2}
            style={{
              margin: 0,
              fontFamily: "estedad-fd",
              color: "#172749",
              textShadow: "rgb(0 0 0 / 14%) 2px 3px 3px",
              letterSpacing: 5,
            }}
          >
            MONEX
          </Title>
          <Text
            type="secondary"
            style={{
              fontFamily: "estedad-fd",
              fontSize: 15,
              color: "#172749",
            }}
          >
            سیستم مدیریت مالی
          </Text>
        </div>

        <Form
          form={form}
          onFinish={handleLogin}
          layout="vertical"
          style={{ marginTop: 32 }}
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: "لطفا نام کاربری را وارد کنید" },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: "#999" }} />}
              placeholder="نام کاربری"
              size="large"
              style={{
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                padding: "12px 16px",
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: "لطفا رمز عبور را وارد کنید" }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#999" }} />}
              placeholder="رمز عبور"
              size="large"
              style={{
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                padding: "12px 16px",
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              style={{
                height: 48,
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                background: "#172749",
                border: "none",
              }}
            >
              ورود به سیستم
            </Button>
          </Form.Item>
        </Form>

        <div className="login-footer">
          <Text
            type="secondary"
            style={{
              fontSize: 14,
              fontFamily: "estedad-fd",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            by Jamal Kaksouri
            <HeartFilled
              className="heartbeat"
              style={{
                fontSize: 14,
                margin: "0 4px",
              }}
            />
            Developed with
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
