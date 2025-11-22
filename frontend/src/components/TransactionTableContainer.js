// src/components/TransactionTableContainer.js
import React, { useState, useEffect, useMemo } from "react";
import {
  Table,
  Button,
  Input,
  Space,
  message,
  Tooltip,
  Typography,
  Divider,
  Empty,
  Card,
  Select,
  Pagination,
  Popconfirm,
  Modal,
  Tag,
  Alert,
  Form,
} from "antd";
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  DollarOutlined,
  FileTextOutlined,
  LockOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import axios from "axios";
import debounce from "lodash.debounce";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import TransactionFormModal from "./TransactionFormModal";
import TransactionTypeFilter from "./TransactionTypeFilter";
import { formatJalaliDate } from "../utils/formatDate";

import { useSpring, animated } from "react-spring";
import { useDrag } from "@use-gesture/react";

const { Paragraph, Text } = Typography;
const { Option } = Select;

// =======================
// Transaction Type Map (Modern)
const transactionTypeMap = {
  deposit: {
    color: "rgb(0, 150, 136)",
    text: "واریز",
    icon: <PlusCircleOutlined />,
  },
  withdraw: {
    color: "rgb(244, 67, 54)",
    text: "برداشت",
    icon: <MinusCircleOutlined />,
  },
  expense: {
    color: "rgb(33, 150, 243)",
    text: "هزینه",
    icon: <DollarOutlined />,
  },
};

// ================= Custom Pagination =================
const CustomPagination = ({
  current,
  pageSize,
  total,
  onChange,
  onShowSizeChange,
  isMobile,
}) => {
  const handleSizeChange = (val) => {
    onShowSizeChange(current, val === "all" ? total : Number(val));
  };
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: isMobile ? "center" : "space-between",
        gap: 8,
      }}
    >
      <Pagination
        current={current}
        pageSize={pageSize}
        total={total}
        showSizeChanger={false}
        onChange={onChange}
        showTotal={(total) => `تعداد کل: ${total}`}
      />
      <Select
        value={pageSize === total ? "all" : String(pageSize)}
        onChange={handleSizeChange}
        style={{ width: 120 }}
      >
        <Option value="10">10 ردیف</Option>
        <Option value="20">20 ردیف</Option>
        <Option value="50">50 ردیف</Option>
        <Option value="100">100 ردیف</Option>
        <Option value="all">همه ردیف‌ها</Option>
      </Select>
    </div>
  );
};

// ================= Transaction Card (iOS-style Swipe Mobile) =================
const TransactionCard = ({ record, onEdit, onDelete, onOpenNote }) => {
  const [gone, setGone] = useState(false);
  const [{ x }, api] = useSpring(() => ({
    x: 0,
    config: { mass: 1, tension: 400, friction: 25 },
  }));

  const bind = useDrag(({ down, movement: [mx], velocity }) => {
    const trigger = velocity > 0.3 && Math.abs(mx) > 80;
    if (!down && trigger && !gone) {
      if (mx > 0) onEdit(record);
      else onDelete(record.id);
      setGone(true);
    }
    api.start({ x: down ? mx : 0, immediate: down });
  });

  const type = transactionTypeMap[record.type] || {
    color: "#555",
    text: record.type,
    icon: null,
  };

  const shortNote =
    record.note?.length > 50 ? record.note.slice(0, 50) + "..." : record.note;

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 14,
          background: "#ff4d4f",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 20px",
          color: "#fff",
          fontWeight: "bold",
          zIndex: 0,
          fontSize: 16,
        }}
      >
        <span>ویرایش →</span>
        <span>← حذف</span>
      </div>

      <animated.div
        {...bind()}
        style={{
          x,
          touchAction: "pan-y",
          zIndex: 1,
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
          padding: 20,
          transform: x.to((x) => `translateX(${x}px)`),
          fontFamily: "estedad-fd, Tahoma, sans-serif",
          direction: "rtl",
          fontSize: 16,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ fontSize: 16 }}>
            #{record.id}
          </Text>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <Text
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 600,
              fontSize: 16,
              color: type.color,
              background: "rgba(0,0,0,0.03)",
              padding: "4px 10px",
              borderRadius: 12,
            }}
          >
            <span
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
              }}
            >
              {type.icon}
            </span>
            {type.text}
          </Text>

          <Text strong style={{ fontSize: 16 }}>
            {Number(record.amount).toLocaleString()} تومان
          </Text>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text
            style={{
              color: "#555",
              cursor: record.note?.length > 50 ? "pointer" : "default",
              fontSize: 16,
            }}
            onClick={() => record.note && onOpenNote(record.note)}
          >
            {shortNote || "-"}
          </Text>
        </div>

        <div style={{ textAlign: "right", color: "#888", fontSize: 14 }}>
          {formatJalaliDate(record.created_at, true)}
        </div>
      </animated.div>
    </div>
  );
};

// ================= Main Component =================
const TransactionTableContainer = ({ onDataChange }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [sorter, setSorter] = useState({
    field: "created_at",
    order: "desc",
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [noteModal, setNoteModal] = useState({ visible: false, content: "" });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [deleteAllModalVisible, setDeleteAllModalVisible] = useState(false);
  const [deleteAllPassword, setDeleteAllPassword] = useState("");
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchData(
        pagination.current,
        pagination.pageSize,
        search,
        typeFilter,
        sorter
      );
      message.success("لیست به‌روزرسانی شد");
    } catch (error) {
      message.error("خطا در به‌روزرسانی لیست");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!deleteAllPassword) {
      message.error("لطفا رمز عبور خود را وارد کنید");
      return;
    }

    setDeleteAllLoading(true);
    try {
      await axios.post("/api/transactions/delete-all", {
        password: deleteAllPassword,
      });
      message.success("تمام تراکنش‌ها حذف شدند");
      setDeleteAllModalVisible(false);
      setDeleteAllPassword("");

      setPagination((prev) => ({ ...prev, current: 1 }));
      fetchData(1, pagination.pageSize, search, typeFilter, sorter);
      onDataChange?.();
    } catch (err) {
      // ✅ FIX: Distinguish between different error types

      // Only logout on REAL auth errors (expired/invalid token)
      if (
        err.response?.status === 401 &&
        !err.config.url.includes("/delete-all")
      ) {
        window.location.href = "/login";
        return;
      }

      // Handle validation errors (wrong password)
      if (err.response?.status === 422) {
        message.error(err.response?.data?.message || "رمز عبور نادرست است");
      }
      // Handle other errors
      else {
        message.error(err.response?.data?.message || "خطا در حذف تراکنش‌ها");
      }
    } finally {
      setDeleteAllLoading(false);
    }
  };

  // ADD Modal at the end, before closing component
  <Modal
    title={
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DeleteOutlined style={{ color: "#ff4d4f" }} />
        <span>حذف تمام تراکنش‌ها</span>
      </div>
    }
    open={deleteAllModalVisible}
    onCancel={() => {
      setDeleteAllModalVisible(false);
      setDeleteAllPassword("");
    }}
    footer={[
      <Button
        key="cancel"
        onClick={() => {
          setDeleteAllModalVisible(false);
          setDeleteAllPassword("");
        }}
      >
        انصراف
      </Button>,
      <Button
        key="delete"
        danger
        type="primary"
        loading={deleteAllLoading}
        onClick={handleDeleteAll}
      >
        تایید و حذف
      </Button>,
    ]}
    width={450}
  >
    <div style={{ marginBottom: 16 }}>
      <Alert
        message="هشدار"
        description="این عملیات تمام تراکنش‌های شما را حذف می‌کند و قابل بازگشت نیست."
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
      />
    </div>
    <Form layout="vertical">
      <Form.Item label="تأیید رمز عبور" required>
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="رمز عبور خود را وارد کنید"
          value={deleteAllPassword}
          onChange={(e) => setDeleteAllPassword(e.target.value)}
          onPressEnter={handleDeleteAll}
        />
      </Form.Item>
    </Form>
  </Modal>;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fetchData = async (
    page = 1,
    pageSize = 10,
    searchTerm = "",
    type = null,
    sort = {}
  ) => {
    setLoading(true);
    try {
      const params = {
        page,
        pageSize,
        search: searchTerm,
        type,
        sortField: sort.field,
        sortOrder: sort.order,
      };
      const res = await axios.get("/api/transactions", { params });
      setData(res.data.data || []);
      setPagination((prev) => ({ ...prev, total: res.data.total || 0 }));
    } catch {
      message.error("خطا در دریافت داده‌ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(
      pagination.current,
      pagination.pageSize,
      search,
      typeFilter,
      sorter
    );
  }, []);

  const handleTableChange = (tablePagination, filters, sorterInfo) => {
    // ✅ FIX: If no sorter info, keep current sorter
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
    fetchData(
      newPagination.current,
      newPagination.pageSize,
      search,
      typeFilter,
      newSorter // ✅ Use updated sorter
    );
  };

  const debouncedSearch = useMemo(
    () =>
      debounce((value) => {
        fetchData(1, pagination.pageSize, value, typeFilter, sorter);
      }, 400),
    [pagination.pageSize, typeFilter, sorter]
  );

  const handleSearch = (e) => {
    setSearch(e.target.value);
    debouncedSearch(e.target.value);
  };
  const handleFilterChange = (val) => {
    setTypeFilter(val);
    fetchData(1, pagination.pageSize, search, val, sorter);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };
  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/transactions/${id}`);
      message.success("تراکنش حذف شد");
      fetchData(
        pagination.current,
        pagination.pageSize,
        search,
        typeFilter,
        sorter
      );
      onDataChange?.();
    } catch {
      message.error("خطا در حذف");
    }
  };
  const handlePageChange = (page, pageSize) => {
    setPagination((prev) => ({ ...prev, current: page, pageSize }));
    fetchData(page, pageSize, search, typeFilter, sorter);
  };
  const handleOpenNote = (note) =>
    setNoteModal({ visible: true, content: note });
  const typeToPersian = (type) => transactionTypeMap[type]?.text || type;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: isMobile ? 12 : 0,
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 1300,
          borderRadius: 8,
          padding: isMobile ? 16 : 24,
        }}
      >
        {/* Top Filters */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 24,
            alignItems: "center",
          }}
        >
          <Input
            placeholder="جستجو در توضیحات"
            prefix={<SearchOutlined />}
            value={search}
            onChange={handleSearch}
            style={{
              flex: 1,
              minWidth: 160,
              borderRadius: 12,
              height: isMobile ? 38 : 40,
              fontSize: 16,
            }}
          />
          <TransactionTypeFilter
            selected={typeFilter}
            onChange={handleFilterChange}
          />
          {data?.length > 0 && (
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={refreshing}
              style={{ borderRadius: 8 }}
            >
              به‌روزرسانی
            </Button>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ borderRadius: 8, minWidth: 120 }}
            onClick={() => {
              setEditingRecord(null);
              setModalVisible(true);
            }}
          >
            تراکنش جدید
          </Button>
        </div>

        {/* Table یا کارت‌ها */}
        {isMobile ? (
          <div>
            {data.map((record) => (
              <TransactionCard
                key={record.id}
                record={record}
                onEdit={(rec) => {
                  setEditingRecord(rec);
                  setModalVisible(true);
                }}
                onDelete={handleDelete}
                onOpenNote={handleOpenNote}
              />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <Table
              columns={[
                { title: "#", dataIndex: "id", sorter: true, width: 70 },
                {
                  title: "شناسه",
                  dataIndex: "id",
                  key: "id",
                  width: 100,
                  align: "center",
                  render: (id) => <Tag color="blue">#{id}</Tag>,
                },
                {
                  title: "تاریخ تراکنش",
                  dataIndex: "created_at",
                  sorter: true,
                  align: "center",
                  render: (text) => (
                    <span style={{ fontSize: 16 }}>
                      {formatJalaliDate(text, true)}
                    </span>
                  ),
                },
                {
                  title: "مبلغ تراکنش",
                  dataIndex: "amount",
                  sorter: true,
                  align: "center",
                  render: (val) => (
                    <span style={{ fontWeight: "bold", fontSize: 16 }}>
                      {Number(val).toLocaleString()} تومان
                    </span>
                  ),
                },
                {
                  title: "نوع تراکنش",
                  dataIndex: "type",
                  sorter: true,
                  align: "center",
                  render: (text) => {
                    const type = transactionTypeMap[text] || {
                      color: "#555",
                      text,
                    };
                    return (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 15, // جمع و جورتر
                          color: type.color,
                          padding: "4px 10px",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            fontSize: 16,
                          }}
                        >
                          {type.icon}
                        </span>
                        {type.text}
                      </span>
                    );
                  },
                },
                {
                  title: "توضیحات",
                  dataIndex: "note",
                  align: "center",
                  render: (text) => {
                    if (!text) return "-";
                    const short =
                      text.length > 40 ? text.slice(0, 40) + "..." : text;
                    return (
                      <span
                        style={{
                          cursor: text.length > 40 ? "pointer" : "default",
                          color: text.length > 40 ? "#1890ff" : "#555",
                          fontSize: 16,
                        }}
                        onClick={() => text.length > 40 && handleOpenNote(text)}
                      >
                        {short}
                      </span>
                    );
                  },
                },
                {
                  title: "آخرین ویرایش",
                  dataIndex: "updated_at",
                  key: "updated_at",
                  width: 160,
                  align: "center",
                  render: (date, record) => (
                    <div>
                      {formatJalaliDate(date, true)}
                      {record.is_edited && (
                        <Tag
                          color="orange"
                          style={{
                            marginRight: 8,
                            marginTop: 4,
                            display: "inline-block",
                          }}
                        >
                          ویرایش شده
                        </Tag>
                      )}
                    </div>
                  ),
                },
                {
                  title: "عملیات",
                  align: "center",
                  render: (_, record) => (
                    <Space>
                      <Tooltip title="ویرایش" placement="bottom">
                        <Button
                          shape="circle"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditingRecord(record);
                            setModalVisible(true);
                          }}
                        />
                      </Tooltip>
                      <Popconfirm
                        title={
                          <div>
                            <div
                              style={{ fontWeight: "bold", marginBottom: 8 }}
                            >
                              حذف تراکنش
                            </div>
                            <div>آیا از حذف تراکنش اطمینان دارید؟</div>
                          </div>
                        }
                        okText="تایید"
                        cancelText="لغو"
                        onConfirm={() => handleDelete(record.id)}
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
                          <Button
                            danger
                            shape="circle"
                            icon={<DeleteOutlined />}
                          />
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
              dataSource={data}
              loading={loading}
              rowKey="id"
              pagination={false}
              scroll={{ x: "max-content" }}
              onChange={handleTableChange}
              style={{ borderRadius: 8, background: "#fff" }}
              tableLayout="fixed"
              locale={{
                triggerAsc: "مرتب‌سازی صعودی",
                triggerDesc: "مرتب‌سازی نزولی",
                cancelSort: "لغو مرتب‌سازی",
                emptyText: (
                  <Empty
                    description="هیچ تراکنشی یافت نشد"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                ),
              }}
            />
          </div>
        )}

        {/* Pagination + Excel + Text */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            gap: 8,
          }}
        >
          <CustomPagination
            current={pagination.current || 1}
            pageSize={pagination.pageSize || 10}
            total={pagination.total || 0}
            onChange={handlePageChange}
            onShowSizeChange={handlePageChange}
            isMobile={isMobile}
          />
          {data?.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="default"
                style={{ minWidth: 120 }}
                onClick={() => {
                  const wb = XLSX.utils.book_new();
                  const wsData = data.map((item) => ({
                    ID: item.id,
                    "نوع تراکنش": typeToPersian(item.type),
                    مبلغ: item.amount,
                    توضیحات: item.note,
                    تاریخ: formatJalaliDate(item.created_at, true),
                  }));
                  const ws = XLSX.utils.json_to_sheet(wsData);
                  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
                  const wbout = XLSX.write(wb, {
                    bookType: "xlsx",
                    type: "array",
                  });
                  saveAs(
                    new Blob([wbout], { type: "application/octet-stream" }),
                    "transactions.xlsx"
                  );
                }}
              >
                خروجی Excel
              </Button>

              <Button
                type="default"
                icon={<FileTextOutlined />}
                style={{ minWidth: 120 }}
                onClick={() => {
                  let txt = "ID\tنوع تراکنش\tمبلغ\tتوضیحات\tتاریخ\n";
                  data.forEach((item) => {
                    txt += `${item.id}\t${typeToPersian(item.type)}\t${
                      item.amount
                    }\t${item.note || "-"}\t${formatJalaliDate(
                      item.created_at,
                      true
                    )}\n`;
                  });
                  const blob = new Blob([txt], {
                    type: "text/plain;charset=utf-8",
                  });
                  saveAs(blob, "transactions.txt");
                }}
              >
                خروجی Text
              </Button>

              <Button
                type="default"
                style={{ minWidth: 120 }}
                icon={<DownloadOutlined />}
                onClick={async () => {
                  try {
                    const res = await axios.get("/api/backup", {
                      responseType: "blob",
                    });

                    // گرفتن نام فایل از هدر Content-Disposition
                    const disposition = res.headers["content-disposition"];
                    let fileName = "backup.zip"; // پیش‌فرض
                    if (disposition && disposition.includes("filename=")) {
                      fileName = disposition
                        .split("filename=")[1]
                        .replace(/["']/g, "") // حذف کوتیشن‌های احتمالی
                        .trim();
                    }

                    // ساخت Blob و URL
                    const url = window.URL.createObjectURL(
                      new Blob([res.data])
                    );

                    // ساخت لینک دانلود
                    const link = document.createElement("a");
                    link.href = url;
                    link.setAttribute("download", fileName);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();

                    // آزاد کردن حافظه
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    message.error("خطا در دریافت بکاپ");
                    console.error(err);
                  }
                }}
              >
                بکاپ دیتابیس
              </Button>
              <Button
                danger
                type="default"
                icon={<DeleteOutlined />}
                style={{ minWidth: 140 }}
                onClick={() => setDeleteAllModalVisible(true)}
              >
                حذف تمام تراکنش‌ها
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24 }}>
          <Divider />
          <div style={{ textAlign: "center", fontSize: 14, color: "#888" }}>
            Developed with ❤️ by <b>Jamal Kaksouri</b>
          </div>
        </div>

        {/* Transaction Form Modal */}
        <TransactionFormModal
          key={editingRecord?.id || "new"} // Force re-render
          visible={modalVisible}
          onClose={() => {
            setModalVisible(false);
            setEditingRecord(null); // Clear editing record
          }}
          record={editingRecord}
          onSuccess={() => {
            fetchData(
              pagination.current,
              pagination.pageSize,
              search,
              typeFilter,
              sorter
            );
            onDataChange?.();
            setEditingRecord(null); // Clear after success
          }}
        />

        {/* Note Modal */}
        <Modal
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileTextOutlined style={{ fontSize: 20, color: "#1890ff" }} />{" "}
              <span
                style={{
                  fontWeight: "bold",
                  fontSize: 16,
                  fontFamily: "estedad-fd",
                }}
              >
                توضیحات کامل
              </span>
            </div>
          }
          open={noteModal.visible}
          onCancel={() => setNoteModal({ visible: false, content: "" })}
          footer={[
            <Button
              key="close"
              type="primary"
              danger
              onClick={() => setNoteModal({ visible: false, content: "" })}
            >
              بستن
            </Button>,
          ]}
          width={isMobile ? "90%" : 450}
          centered
          style={{ fontSize: 16, lineHeight: 1.8 }}
        >
          <Typography>
            <Divider />
            <Paragraph style={{ fontFamily: "estedad-fd" }}>
              {noteModal.content || "هیچ توضیحی ثبت نشده است."}
            </Paragraph>
          </Typography>
        </Modal>
        <Modal
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <DeleteOutlined style={{ color: "#ff4d4f" }} />
              <span>حذف تمام تراکنش‌ها</span>
            </div>
          }
          open={deleteAllModalVisible}
          onCancel={() => {
            setDeleteAllModalVisible(false);
            setDeleteAllPassword("");
          }}
          footer={[
            <Button
              key="cancel"
              onClick={() => {
                setDeleteAllModalVisible(false);
                setDeleteAllPassword("");
              }}
            >
              انصراف
            </Button>,
            <Button
              key="delete"
              danger
              type="primary"
              loading={deleteAllLoading}
              onClick={handleDeleteAll}
            >
              تایید و حذف
            </Button>,
          ]}
          width={450}
        >
          <div style={{ marginBottom: 16 }}>
            <Alert
              message="هشدار"
              description="این عملیات تمام تراکنش‌های شما را حذف می‌کند و قابل بازگشت نیست."
              type="error"
              showIcon
              style={{ marginBottom: 24, marginTop: 20, color: "#444" }}
            />
          </div>
          <Form layout="vertical">
            <Form.Item label="تأیید رمز عبور" required>
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="رمز عبور خود را وارد کنید"
                value={deleteAllPassword}
                onChange={(e) => setDeleteAllPassword(e.target.value)}
                onPressEnter={handleDeleteAll}
              />
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
};

export default TransactionTableContainer;
