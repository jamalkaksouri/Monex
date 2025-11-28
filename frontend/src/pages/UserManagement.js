import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
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
import debounce from "lodash.debounce";
import "./UserManagement.css";

const { Title } = Typography;
const { Option } = Select;

const UserManagement = () => {
  useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [searchText, setSearchText] = useState("");
  const [sorter, setSorter] = useState({
    field: "created_at",
    order: "desc",
  });

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

  // ✅ Debounced search function
  const debouncedSearch = useMemo(
    () =>
      debounce((searchValue) => {
        fetchUsers(
          1,
          pagination.pageSize,
          sorter.field,
          sorter.order,
          searchValue
        );
      }, 400),
    [pagination.pageSize, sorter]
  );

  const fetchUsers = useCallback(
    async (
      page = 1,
      pageSize = 10,
      sortField = "created_at",
      sortOrder = "desc",
      search = ""
    ) => {
      if (!isMountedRef.current) return;
      setLoading(true);

      try {
        const params = {
          page,
          pageSize,
          sortField,
          sortOrder,
        };
        if (search.trim()) params.q = search.trim();

        const res = await axios.get("/api/admin/users", { params });
        if (isMountedRef.current) {
          setUsers(res.data.data || []);
          setPagination({
            current: page,
            pageSize,
            total: res.data.total || 0,
          });

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
    },
    []
  );

  useEffect(() => {
    fetchUsers();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchUsers]);

  // ✅ Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    debouncedSearch(value);
  };

  // ✅ Handle table change (pagination + sorting)
  const handleTableChange = (tablePagination, filters, sorterInfo) => {
    let newSorter = sorter;

    if (sorterInfo?.field) {
      newSorter = {
        field: sorterInfo.field,
        order: sorterInfo.order === "ascend" ? "asc" : "desc",
      };
      setSorter(newSorter);
    }

    const newPagination = {
      current: tablePagination.current || 1,
      pageSize: tablePagination.pageSize || 10,
      total: pagination.total,
    };

    setPagination(newPagination);
    fetchUsers(
      newPagination.current,
      newPagination.pageSize,
      newSorter.field,
      newSorter.order,
      searchText
    );
  };

  // Countdown timer
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
  }, [lockedUsersCountdown, users]);

  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) return `${hours} ساعت و ${mins} دقیقه و ${secs} ثانیه`;
    if (mins > 0) return `${mins} دقیقه و ${secs} ثانیه`;
    return `${secs} ثانیه`;
  };

  const handleUnlockUser = async (username) => {
    try {
      await axios.post(`/api/admin/users/${username}/unlock`);
      message.success("دسترسی کاربر فعال شد");
      fetchUsers(
        pagination.current,
        pagination.pageSize,
        sorter.field,
        sorter.order,
        searchText
      );
    } catch {
      message.error("خطا در فعال‌سازی دسترسی کاربر");
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await axios.delete(`/api/admin/users/${id}`);
      message.success("کاربر حذف شد");
      fetchUsers(
        pagination.current,
        pagination.pageSize,
        sorter.field,
        sorter.order,
        searchText
      );
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
      fetchUsers(
        pagination.current,
        pagination.pageSize,
        sorter.field,
        sorter.order,
        searchText
      );
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

  // ✅ Table columns with sortable flags
  const columns = [
    {
      title: "#",
      dataIndex: "id",
      key: "id",
      align: "center",
      width: 60,
      sorter: true,
    },
    {
      title: "نام کاربری",
      dataIndex: "username",
      key: "username",
      width: 140,
      sorter: true,
    },
    {
      title: "ایمیل",
      dataIndex: "email",
      key: "email",
      width: 160,
      sorter: true,
    },
    {
      title: "نقش کاربری",
      dataIndex: "role",
      key: "role",
      align: "center",
      width: 120,
      sorter: true,
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
      sorter: true,
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
      sorter: true,
      dataIndex: "locked",
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
      sorter: true,
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
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="حذف" placement="bottom">
              <Button danger shape="circle" icon={<DeleteOutlined />} />
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
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() =>
                    fetchUsers(
                      pagination.current,
                      pagination.pageSize,
                      sorter.field,
                      sorter.order,
                      searchText
                    )
                  }
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
                onChange={handleSearchChange}
                allowClear
                style={{ maxWidth: 400, borderRadius: 6, height: 34 }}
              />
              <Table
                columns={columns}
                dataSource={users}
                rowKey="id"
                loading={loading}
                pagination={false}
                scroll={{ x: "max-content" }}
                onChange={handleTableChange}
                style={{ width: "100%" }}
                locale={{
                  triggerAsc: "مرتب‌سازی صعودی",
                  triggerDesc: "مرتب‌سازی نزولی",
                  cancelSort: "لغو مرتب‌سازی",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 16,
                }}
              >
                <Space>
                  <span>تعداد کل: {pagination.total}</span>
                  <Select
                    value={pagination.pageSize}
                    onChange={(value) => {
                      setPagination({
                        ...pagination,
                        pageSize: value,
                        current: 1,
                      });
                      fetchUsers(
                        1,
                        value,
                        sorter.field,
                        sorter.order,
                        searchText
                      );
                    }}
                    style={{ width: 120 }}
                  >
                    <Option value={10}>10 ردیف</Option>
                    <Option value={20}>20 ردیف</Option>
                    <Option value={50}>50 ردیف</Option>
                    <Option value={100}>100 ردیف</Option>
                  </Select>
                  <Button
                    disabled={pagination.current === 1}
                    onClick={() => {
                      const newPage = pagination.current - 1;
                      setPagination({ ...pagination, current: newPage });
                      fetchUsers(
                        newPage,
                        pagination.pageSize,
                        sorter.field,
                        sorter.order,
                        searchText
                      );
                    }}
                  >
                    قبلی
                  </Button>
                  <span>
                    صفحه {pagination.current} از{" "}
                    {Math.ceil(pagination.total / pagination.pageSize)}
                  </span>
                  <Button
                    disabled={
                      pagination.current >=
                      Math.ceil(pagination.total / pagination.pageSize)
                    }
                    onClick={() => {
                      const newPage = pagination.current + 1;
                      setPagination({ ...pagination, current: newPage });
                      fetchUsers(
                        newPage,
                        pagination.pageSize,
                        sorter.field,
                        sorter.order,
                        searchText
                      );
                    }}
                  >
                    بعدی
                  </Button>
                </Space>
              </div>
            </Space>
          </Card>

          {/* Create/Edit Modal */}
          <Modal
            title={editingUser ? "ویرایش کاربر" : "ایجاد کاربر جدید"}
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
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
                        style={{ color: "#ff4d4f", fontSize: 14, marginTop: 4 }}
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
                      style={{ color: "#ff4d4f", fontSize: 14, marginTop: 4 }}
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
                        style={{ color: "#ff4d4f", fontSize: 14, marginTop: 4 }}
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
                    }}
                  >
                    نقش
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
                  <Button onClick={() => setModalVisible(false)} size="large">
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
            title="تغییر رمز عبور"
            open={resetPasswordModalVisible}
            onCancel={() => setResetPasswordModalVisible(false)}
            footer={null}
            width={450}
          >
            <Divider style={{ margin: "16px 0" }} />
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <label
                  style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
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
                  <div style={{ color: "#ff4d4f", fontSize: 14, marginTop: 4 }}>
                    {formErrors.new_password}
                  </div>
                )}
              </div>
              <div>
                <label
                  style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
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
                  <div style={{ color: "#ff4d4f", fontSize: 14, marginTop: 4 }}>
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
                <Button onClick={() => setResetPasswordModalVisible(false)}>
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
