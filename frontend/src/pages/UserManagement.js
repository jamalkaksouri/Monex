import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Select,
  Switch,
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
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  UserOutlined,
  MailOutlined,
  SearchOutlined,
  TeamOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { formatJalaliDate } from "../utils/formatDate";
import moment from "moment";
import fa_IR from "antd/lib/locale/fa_IR";
import { useAuth } from "../contexts/AuthContext";
import "./UserManagement.css";

// ✅ FIX: Safe date handling for locked_until
const getRemainingLockTime = (lockedUntil) => {
  if (!lockedUntil) return null;

  try {
    const lockDate = moment(lockedUntil);
    if (!lockDate.isValid()) return null;

    const now = moment();
    if (lockDate.isBefore(now)) return null; // Lock expired

    const minutes = lockDate.diff(now, "minutes");
    return Math.max(0, minutes);
  } catch (error) {
    console.error("Error parsing lock date:", error);
    return null;
  }
};

const { Option } = Select;
const { Title } = Typography;

const UserManagement = () => {
  useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] =
    useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [searchText, setSearchText] = useState("");

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "user",
    active: true,
  });

  const [resetPasswordData, setResetPasswordData] = useState({
    new_password: "",
    confirm_password: "",
  });

  const [formErrors, setFormErrors] = useState({});

  // Consolidated fetch with proper cleanup
  // ✅ CONSOLIDATED: Single useEffect for data fetching
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const loadUsers = async () => {
      setLoading(true);
      try {
        const params = {
          page: pagination.current,
          pageSize: pagination.pageSize,
        };

        // Only add search if user entered text
        if (searchText && searchText.trim() !== "") {
          params.q = searchText.trim();
        }

        const res = await axios.get("/api/admin/users", {
          params,
          signal: abortController.signal,
        });

        // Only update state if component is still mounted
        if (isMounted) {
          setUsers(res.data.data || []);
          setPagination((prev) => ({
            ...prev,
            total: res.data.total || 0,
          }));
        }
      } catch (error) {
        // Only show error if not an abort
        if (isMounted && error.name !== "AbortError") {
          message.error("خطا در دریافت لیست کاربران");
          console.error("Fetch users error:", error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Call immediately
    loadUsers();

    // Cleanup - cancel pending requests on unmount or deps change
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [pagination.current, pagination.pageSize, searchText]);

  const fetchUsers = async () => {
    setLoading(true);

    try {
      // Build query parameters
      const params = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };

      // ✅ FIX #3: Only include search if user entered text
      if (searchText && searchText.trim() !== "") {
        params.q = searchText;
      }

      // Fetch users from API
      const res = await axios.get("/api/admin/users", { params });

      // Update state with fetched data
      setUsers(res.data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: res.data.total || 0,
      }));
    } catch (error) {
      message.error("خطا در دریافت لیست کاربران");
      console.error("Fetch users error:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!editingUser) {
      if (!formData.username || formData.username.length < 3) {
        errors.username = "نام کاربری باید حداقل ۳ کاراکتر باشد";
      }
      if (!formData.password || formData.password.length < 8) {
        errors.password = "رمز عبور باید حداقل ۸ کاراکتر باشد";
      }
    }

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "لطفا ایمیل معتبر وارد کنید";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUnlockUser = async (username) => {
    try {
      await axios.post(`/api/admin/users/${username}/unlock`);
      message.success("حساب کاربری با موفقیت باز شد");
      fetchUsers();
    } catch (error) {
      message.error(
        error.response?.data?.message || "خطا در باز کردن حساب کاربری"
      );
    }
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchText(value);

    // ✅ Reset to page 1 when searching
    setPagination((p) => ({ ...p, current: 1 }));
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

  const handleDeleteUser = async (id) => {
    try {
      await axios.delete(`/api/admin/users/${id}`);
      message.success("کاربر با موفقیت حذف شد");
      fetchUsers();
    } catch (error) {
      message.error(error.response?.data?.message || "خطا در حذف کاربر");
    }
  };

  const handleResetPassword = (userId) => {
    setSelectedUserId(userId);
    setResetPasswordData({ new_password: "", confirm_password: "" });
    setFormErrors({});
    setResetPasswordModalVisible(true);
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
        await axios.post("/api/admin/users", {
          username: formData.username,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          active: formData.active,
        });
        message.success("کاربر با موفقیت ایجاد شد");
      }
      setModalVisible(false);
      setFormData({
        username: "",
        email: "",
        password: "",
        role: "user",
        active: true,
      });
      fetchUsers();
    } catch (error) {
      message.error(
        error.response?.data?.message || "خطا در ذخیره اطلاعات کاربر"
      );
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
      setResetPasswordData({ new_password: "", confirm_password: "" });
    } catch (error) {
      message.error(error.response?.data?.message || "خطا در تغییر رمز عبور");
    }
  };

  const columns = [
    {
      title: "#",
      dataIndex: "id",
      key: "id",
      width: 60,
      align: "center",
    },
    {
      title: "نام کاربری",
      dataIndex: "username",
      key: "username",
      width: 140,
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value, record) =>
        record.username.toLowerCase().includes(value.toLowerCase()) ||
        (record.email &&
          record.email.toLowerCase().includes(value.toLowerCase())),
      render: (text, record) => (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: "ایمیل",
      dataIndex: "email",
      key: "email",
      width: 160,
    },
    {
      title: "نقش",
      dataIndex: "role",
      key: "role",
      width: 80,
      align: "center",
      render: (role) => (
        <Tag
          color={role === "admin" ? "#2497F4" : "#607D8B"}
          style={{ fontWeight: 500 }}
        >
          {role === "admin" ? "مدیر" : "کاربر"}
        </Tag>
      ),
    },
    {
      title: "وضعیت",
      dataIndex: "active",
      key: "active",
      width: 100,
      align: "center",
      render: (active) => <span>{active ? "فعال" : "غیرفعال"}</span>,
    },
    {
      title: "تلاش ناموفق",
      dataIndex: "failed_attempts",
      key: "failed_attempts",
      width: 100,
      align: "center",
      render: (count = 0) => (
        <Tag color={count >= 5 ? "orange" : "default"}>{count}</Tag>
      ),
    },
    {
      title: "وضعیت قفل",
      key: "lockStatus",
      width: 120,
      align: "center",
      render: (_, record) => {
        if (record.permanently_locked) {
          return (
            <Tag color="red" style={{ fontSize: "13px" }}>
              مسدودیت دائم
            </Tag>
          );
        }
        if (record.locked) {
          const remainingMinutes = getRemainingLockTime(record.locked_until);

          if (remainingMinutes === null) {
            // Lock expired or invalid date
            return (
              <Tag color="green" style={{ fontSize: "14px" }}>
                آزاد
              </Tag>
            );
          }
          return (
            <Tag color="orange" style={{ fontSize: "14px" }}>
              موقت ({remainingMinutes} دقیقه)
            </Tag>
          );
        }
        return (
          <Tag color="green" style={{ fontSize: "14px" }}>
            آزاد
          </Tag>
        );
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
      fixed: "left",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="ویرایش" placement="bottom">
            <Button
              size="middle"
              shape="circle"
              icon={<EditOutlined />}
              onClick={() => handleEditUser(record)}
            />
          </Tooltip>

          <Tooltip title="رمز جدید" placement="bottom">
            <Button
              size="middle"
              shape="circle"
              icon={<LockOutlined />}
              onClick={() => handleResetPassword(record.id)}
            />
          </Tooltip>

          {(record.locked || record.permanently_locked) && (
            <Tooltip title="باز کردن قفل" placement="bottom">
              <Button
                size="middle"
                shape="circle"
                icon={<UnlockOutlined />}
                onClick={() => handleUnlockUser(record.username)} // ✅ Use username
              />
            </Tooltip>
          )}

          <Popconfirm
            title="حذف کاربر"
            description="آیا از حذف این کاربر اطمینان دارید؟"
            onConfirm={() => handleDeleteUser(record.id)}
            okText="بله"
            cancelText="خیر"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="حذف" placement="bottom">
              <Button
                shape="circle"
                danger
                icon={<DeleteOutlined />}
                size="middle"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreateUser}
                style={{ borderRadius: 6 }}
              >
                کاربر جدید
              </Button>
            }
          >
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Input
                placeholder="جستجو بر اساس نام کاربری یا ایمیل..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={handleSearch}
                // Remove onPressEnter trigger - useEffect handles everything
                allowClear
                onClear={() => {
                  setSearchText("");
                  setPagination((p) => ({ ...p, current: 1 }));
                }}
                size="large"
                style={{ maxWidth: 400, borderRadius: 6 }}
              />

              <Table
                columns={columns}
                dataSource={users}
                loading={loading}
                rowKey="id"
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  onChange: (page, pageSize) => {
                    setPagination((prev) => ({
                      ...prev,
                      current: page,
                      pageSize,
                    }));
                  },
                  showTotal: (total) => `مجموع ${total} کاربر`,
                  showSizeChanger: true,
                  locale: {
                    items_per_page: "/ صفحه",
                  },
                }}
                style={{ width: "100%" }}
              />
            </Space>

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
                  <span>
                    {editingUser ? "ویرایش کاربر" : "ایجاد کاربر جدید"}
                  </span>
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
                {/* Username - Only for new users */}
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

                {/* Email */}
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

                {/* Password - Only for new users */}
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

                {/* Role and Status */}
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

                {/* Footer Buttons */}
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
                    <div
                      style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}
                    >
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
                    <div
                      style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}
                    >
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
          </Card>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default UserManagement;
