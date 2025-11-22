import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Select,
  Space,
  Tag,
  Card,
  message,
  Popconfirm,
  Typography,
  Divider,
  ConfigProvider,
  Row,
  Col,
  Switch,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  UnlockOutlined,
  SearchOutlined,
  TeamOutlined,
  ReloadOutlined,
  UserOutlined,
  MailOutlined,
} from "@ant-design/icons";
import axios from "axios";
import moment from "moment";
import fa_IR from "antd/lib/locale/fa_IR";
import { formatJalaliDate } from "../utils/formatDate";
import { useAuth } from "../contexts/AuthContext";
import "./UserManagement.css";

const { Title } = Typography;
const { Option } = Select;

const UserManagement = () => {
  useAuth();

  // ===================== State =====================
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [searchText, setSearchText] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "user",
    active: true,
  });
  const [formErrors, setFormErrors] = useState({});

  const [resetPasswordModalVisible, setResetPasswordModalVisible] =
    useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({
    new_password: "",
    confirm_password: "",
  });
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [lockedUsersCountdown, setLockedUsersCountdown] = useState({});

  const isMountedRef = useRef(true);

  // ===================== Fetch users =====================
  const fetchUsers = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);

    try {
      const params = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };
      if (searchText.trim()) params.q = searchText.trim();

      const res = await axios.get("/api/admin/users", { params });
      if (isMountedRef.current) {
        setUsers(res.data.data || []);
        setPagination((prev) => ({ ...prev, total: res.data.total || 0 }));

        // initialize countdown for locked users
        const newCountdown = {};
        (res.data.data || []).forEach((user) => {
          if (user.locked && !user.permanently_locked) {
            const diffSec = Math.max(
              0,
              Math.floor(moment(user.locked_until).diff(moment()) / 1000)
            );
            newCountdown[user.id] = diffSec;
          }
        });
        setLockedUsersCountdown(newCountdown);
      }
    } catch {
      message.error("خطا در دریافت لیست کاربران");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, searchText]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ===================== Countdown =====================
  useEffect(() => {
    const interval = setInterval(() => {
      setLockedUsersCountdown((prev) => {
        const updated = {};
        Object.keys(prev).forEach((userId) => {
          const seconds = prev[userId];
          if (seconds > 0) updated[userId] = seconds - 1;
        });
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Object.entries(lockedUsersCountdown).forEach(([userId, seconds]) => {
      if (seconds === 0) {
        const user = users.find((u) => u.id.toString() === userId);
        if (user) handleUnlockUser(user.username);
      }
    });
  }, [lockedUsersCountdown]);

  // ===================== Utility =====================
  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) return `${hours} ساعت و ${mins} دقیقه و ${secs} ثانیه`;
    if (mins > 0) return `${mins} دقیقه و ${secs} ثانیه`;
    return `${secs} ثانیه`;
  };

  // ===================== Handlers =====================
  const handleUnlockUser = async (username) => {
    try {
      await axios.post(`/api/admin/users/${username}/unlock`);
      message.success("دسترسی کاربر فعال شد");
      fetchUsers();
    } catch {
      message.error("خطا در فعال‌سازی دسترسی کاربر");
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await axios.delete(`/api/admin/users/${id}`);
      message.success("کاربر حذف شد");
      fetchUsers();
    } catch {
      message.error("خطا در حذف کاربر");
    }
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setFormData({
      username: "",
      email: "",
      password: "",
      role: "user",
      active: true,
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      role: user.role,
      active: user.active,
      password: "",
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleResetPassword = (userId) => {
    setSelectedUserId(userId);
    setResetPasswordData({ new_password: "", confirm_password: "" });
    setFormErrors({});
    setResetPasswordModalVisible(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!editingUser && (!formData.username || formData.username.length < 3))
      errors.username = "نام کاربری باید حداقل ۳ کاراکتر باشد";
    if (!editingUser && (!formData.password || formData.password.length < 8))
      errors.password = "رمز عبور باید حداقل ۸ کاراکتر باشد";
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errors.email = "لطفاً ایمیل معتبر وارد کنید";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    try {
      if (editingUser) {
        await axios.put(`/api/admin/users/${editingUser.id}`, {
          email: formData.email,
          role: formData.role,
          active: formData.active,
        });
        message.success("کاربر با موفقیت به‌روزرسانی شد");
      } else {
        await axios.post("/api/admin/users", formData);
        message.success("کاربر با موفقیت ایجاد شد");
      }
      setModalVisible(false);
      fetchUsers();
    } catch {
      message.error("خطا در ذخیره اطلاعات کاربر");
    }
  };

  const handleResetPasswordSubmit = async () => {
    if (
      !resetPasswordData.new_password ||
      resetPasswordData.new_password.length < 8
    ) {
      setFormErrors({ new_password: "رمز عبور باید حداقل ۸ کاراکتر باشد" });
      return;
    }
    if (resetPasswordData.new_password !== resetPasswordData.confirm_password) {
      setFormErrors({ confirm_password: "رمز عبور و تکرار آن یکسان نیستند" });
      return;
    }
    try {
      await axios.post(`/api/admin/users/${selectedUserId}/reset-password`, {
        new_password: resetPasswordData.new_password,
      });
      message.success("رمز عبور با موفقیت تغییر کرد");
      setResetPasswordModalVisible(false);
    } catch {
      message.error("خطا در تغییر رمز عبور");
    }
  };

  // ===================== Table columns =====================
  const columns = [
    { title: "#", dataIndex: "id", key: "id", align: "center", width: 60 },
    { title: "نام کاربری", dataIndex: "username", key: "username", width: 140 },
    { title: "ایمیل", dataIndex: "email", key: "email", width: 160 },
    {
      title: "نقش کاربری",
      dataIndex: "role",
      key: "role",
      align: "center",
      width: 120,
      render: (role) => (
        <Tag color={role === "admin" ? "#2497F4" : "#607D8B"}>
          {role === "admin" ? "مدیر سیستم" : "کاربر عادی"}
        </Tag>
      ),
    },
    {
      title: "وضعیت حساب",
      dataIndex: "active",
      key: "active",
      align: "center",
      width: 120,
      render: (active) => (
        <Tag color={active ? "green" : "gray"}>
          {active ? "فعال" : "غیرفعال"}
        </Tag>
      ),
    },
    {
      title: "وضعیت دسترسی",
      key: "lockStatus",
      width: 150,
      align: "center",
      render: (_, record) => {
        if (record.permanently_locked)
          return <Tag color="red">دسترسی مسدود دائمی</Tag>;
        if (record.locked) {
          const seconds = lockedUsersCountdown[record.id] ?? 0;
          if (seconds > 0)
            return <Tag color="orange">{formatTime(seconds)}</Tag>;
          return <Tag color="green">فعال</Tag>;
        }
        return <Tag color="green">فعال</Tag>;
      },
    },
    {
      title: "تاریخ ایجاد",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      align: "center",
      render: (date) => formatJalaliDate(date, true),
    },
    {
      title: "عملیات",
      key: "actions",
      width: 250,
      align: "center",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="ویرایش">
            <Button
              shape="circle"
              icon={<EditOutlined />}
              onClick={() => handleEditUser(record)}
            />
          </Tooltip>
          <Tooltip title="رمز جدید">
            <Button
              shape="circle"
              icon={<LockOutlined />}
              onClick={() => handleResetPassword(record.id)}
            />
          </Tooltip>
          {(record.locked || record.permanently_locked) && (
            <Tooltip title="باز کردن دسترسی">
              <Button
                shape="circle"
                icon={<UnlockOutlined />}
                onClick={() => handleUnlockUser(record.username)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title={
              <div>
                <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                  حذف کاربر
                </div>
                <div>آیا از حذف کاربر اطمینان دارید؟</div>
              </div>
            }
            onConfirm={() => handleDeleteUser(record.id)}
            okButtonProps={{
              danger: true,
              style: {
                backgroundColor: "#ff4d4f",
                borderColor: "#ff4d4f",
                fontWeight: 600,
                borderRadius: "4px",
              },
            }}
            cancelButtonProps={{
              style: {
                backgroundColor: "white",
                color: "black",
                borderColor: "#d9d9d9",
                fontWeight: 600,
                borderRadius: "4px",
              },
            }}
          >
            <Tooltip title="حذف" placement="bottom">
              <Button danger shape="circle" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ===================== Render =====================
  return (
    <ConfigProvider locale={fa_IR} direction="rtl">
      <div className="user-management-wrapper">
        <div className="user-management-container">
          <Card
            className="user-management-card"
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TeamOutlined style={{ fontSize: 20, color: "#1890ff" }} />
                <Title level={4} style={{ margin: 0 }}>
                  مدیریت کاربران
                </Title>
              </div>
            }
            extra={
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchUsers}
                  loading={loading}
                >
                  به‌روزرسانی
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleCreateUser}
                >
                  کاربر جدید
                </Button>
              </Space>
            }
          >
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Input
                placeholder="جستجو بر اساس نام کاربری یا ایمیل..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                style={{ maxWidth: 400, borderRadius: 6, height: 34 }}
              />
              <Table
                columns={columns}
                dataSource={users}
                rowKey="id"
                loading={loading}
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  onChange: (page, pageSize) =>
                    setPagination({ ...pagination, current: page, pageSize }),
                  showTotal: (total) => `مجموع ${total} کاربر`,
                  showSizeChanger: true,
                  locale: { items_per_page: "/ صفحه" },
                }}
                scroll={{ x: "max-content" }}
                style={{ width: "100%" }}
              />
            </Space>
          </Card>

          {/* ===================== Modals ===================== */}

          {/* Create/Edit User Modal */}
          <Modal
            title={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 18,
                }}
              >
                <UserOutlined style={{ color: "#1890ff" }} />
                <span>{editingUser ? "ویرایش کاربر" : "ایجاد کاربر جدید"}</span>
              </div>
            }
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false);
              setFormData({
                username: "",
                email: "",
                password: "",
                role: "user",
                active: true,
              });
              setFormErrors({});
            }}
            footer={null}
            width={600}
          >
            <Divider style={{ margin: "16px 0" }} />

            <Row gutter={[16, 16]}>
              {!editingUser && (
                <Col span={24}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: 8,
                        fontWeight: 500,
                        fontSize: 14,
                      }}
                    >
                      نام کاربری <span style={{ color: "#ff4d4f" }}>*</span>
                    </label>
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="نام کاربری"
                      value={formData.username}
                      onChange={(e) =>
                        setFormData({ ...formData, username: e.target.value })
                      }
                      size="large"
                      status={formErrors.username ? "error" : ""}
                    />
                    {formErrors.username && (
                      <div
                        style={{
                          color: "#ff4d4f",
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        {formErrors.username}
                      </div>
                    )}
                  </div>
                </Col>
              )}

              <Col span={24}>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    ایمیل <span style={{ color: "#ff4d4f" }}>*</span>
                  </label>
                  <Input
                    prefix={<MailOutlined />}
                    placeholder="example@domain.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    size="large"
                    status={formErrors.email ? "error" : ""}
                  />
                  {formErrors.email && (
                    <div
                      style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}
                    >
                      {formErrors.email}
                    </div>
                  )}
                </div>
              </Col>

              {!editingUser && (
                <Col span={24}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: 8,
                        fontWeight: 500,
                        fontSize: 14,
                      }}
                    >
                      رمز عبور <span style={{ color: "#ff4d4f" }}>*</span>
                    </label>
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="حداقل 8 کاراکتر"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      size="large"
                      status={formErrors.password ? "error" : ""}
                    />
                    {formErrors.password && (
                      <div
                        style={{
                          color: "#ff4d4f",
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        {formErrors.password}
                      </div>
                    )}
                  </div>
                </Col>
              )}

              <Col span={12}>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    نقش <span style={{ color: "#ff4d4f" }}>*</span>
                  </label>
                  <Select
                    value={formData.role}
                    onChange={(value) =>
                      setFormData({ ...formData, role: value })
                    }
                    size="large"
                    style={{ width: "100%" }}
                  >
                    <Option value="user">کاربر</Option>
                    <Option value="admin">مدیر</Option>
                  </Select>
                </div>
              </Col>

              <Col span={12}>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    وضعیت
                  </label>
                  <Switch
                    checked={formData.active}
                    onChange={(checked) =>
                      setFormData({ ...formData, active: checked })
                    }
                    checkedChildren="فعال"
                    unCheckedChildren="غیرفعال"
                    style={{ marginTop: 8 }}
                  />
                </div>
              </Col>

              <Col span={24}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 16,
                  }}
                >
                  <Button
                    onClick={() => {
                      setModalVisible(false);
                      setFormData({
                        username: "",
                        email: "",
                        password: "",
                        role: "user",
                        active: true,
                      });
                      setFormErrors({});
                    }}
                    size="large"
                  >
                    انصراف
                  </Button>
                  <Button type="primary" onClick={handleSubmit} size="large">
                    {editingUser ? "به‌روزرسانی" : "ایجاد"}
                  </Button>
                </div>
              </Col>
            </Row>
          </Modal>

          {/* Reset Password Modal */}
          <Modal
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <LockOutlined style={{ color: "#faad14" }} />
                <span>تغییر رمز عبور</span>
              </div>
            }
            open={resetPasswordModalVisible}
            onCancel={() => {
              setResetPasswordModalVisible(false);
              setResetPasswordData({
                new_password: "",
                confirm_password: "",
              });
              setFormErrors({});
            }}
            footer={null}
            width={450}
          >
            <Divider style={{ margin: "16px 0" }} />
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    fontWeight: 500,
                  }}
                >
                  رمز عبور جدید <span style={{ color: "#ff4d4f" }}>*</span>
                </label>
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="حداقل 8 کاراکتر"
                  value={resetPasswordData.new_password}
                  onChange={(e) =>
                    setResetPasswordData({
                      ...resetPasswordData,
                      new_password: e.target.value,
                    })
                  }
                  size="large"
                  status={formErrors.new_password ? "error" : ""}
                />
                {formErrors.new_password && (
                  <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>
                    {formErrors.new_password}
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    fontWeight: 500,
                  }}
                >
                  تکرار رمز عبور <span style={{ color: "#ff4d4f" }}>*</span>
                </label>
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="تکرار رمز عبور"
                  value={resetPasswordData.confirm_password}
                  onChange={(e) =>
                    setResetPasswordData({
                      ...resetPasswordData,
                      confirm_password: e.target.value,
                    })
                  }
                  size="large"
                  status={formErrors.confirm_password ? "error" : ""}
                />
                {formErrors.confirm_password && (
                  <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>
                    {formErrors.confirm_password}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <Button
                  onClick={() => {
                    setResetPasswordModalVisible(false);
                    setResetPasswordData({
                      new_password: "",
                      confirm_password: "",
                    });
                    setFormErrors({});
                  }}
                >
                  انصراف
                </Button>
                <Button type="primary" onClick={handleResetPasswordSubmit}>
                  تغییر رمز عبور
                </Button>
              </div>
            </Space>
          </Modal>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default UserManagement;
