import React, { useState, useEffect } from "react";
import {
  Table,
  Card,
  Button,
  Typography,
  Divider,
  Tag,
  Pagination,
  ConfigProvider,
  message,
  Popconfirm,
  Input,
} from "antd";
import {
  ReloadOutlined,
  AuditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import axios from "axios";
import fa_IR from "antd/lib/locale/fa_IR";
import { formatJalaliDate } from "../utils/formatDate";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const { Title } = Typography;

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [sorter, setSorter] = useState({
    field: "created_at",
    order: "desc",
  });
  const [searchText, setSearchText] = useState("");

  const fetchLogs = async (
    page = 1,
    pageSize = 20,
    sortField = "created_at",
    sortOrder = "desc",
    search = ""
  ) => {
    setLoading(true);
    try {
      const res = await axios.get("/api/admin/audit-logs", {
        params: {
          page,
          pageSize,
          sortField,
          sortOrder,
          search: search.trim(),
        },
      });
      setLogs(res.data.data || []);
      setPagination({
        current: page,
        pageSize: pageSize,
        total: res.data.total || 0,
      });
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
      message.error("خطا در دریافت لاگ‌ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

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
      pageSize: tablePagination.pageSize || 20,
      total: pagination.total,
    };

    setPagination(newPagination);
    fetchLogs(
      newPagination.current,
      newPagination.pageSize,
      newSorter.field,
      newSorter.order,
      searchText
    );
  };

  const handleSearch = (value) => {
    setSearchText(value);
    fetchLogs(1, pagination.pageSize, sorter.field, sorter.order, value);
  };

  const handleDeleteAll = async () => {
    setDeleteAllLoading(true);
    try {
      await axios.delete("/api/admin/audit-logs/all");
      message.success("تمام لاگ‌ها با موفقیت حذف شدند");
      fetchLogs(1, pagination.pageSize, sorter.field, sorter.order, searchText);
    } catch (err) {
      message.error(err.response?.data?.message || "خطا در حذف لاگ‌ها");
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      message.loading({ content: "در حال آماده‌سازی فایل...", key: "export" });
      const res = await axios.get("/api/admin/audit-logs/export");
      const logs = res.data || [];

      // Prepare data for Excel
      const excelData = logs.map((log) => ({
        شناسه: log.id,
        "شناسه کاربر": log.user_id || "Anonymous",
        عملیات: log.action,
        منبع: log.resource,
        "IP Address": log.ip_address,
        وضعیت: log.success ? "موفق" : "ناموفق",
        جزئیات: log.details || "-",
        "تاریخ و زمان": formatJalaliDate(log.created_at, true),
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Audit Logs");

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(
        new Blob([wbout], { type: "application/octet-stream" }),
        `audit_logs_${new Date().getTime()}.xlsx`
      );

      message.success({ content: "فایل با موفقیت ایجاد شد", key: "export" });
    } catch (err) {
      message.error({ content: "خطا در ایجاد فایل", key: "export" });
    }
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
      sorter: true,
    },
    {
      title: "کاربر",
      dataIndex: "user_id",
      key: "user_id",
      align: "center",
      width: 100,
      sorter: true,
      render: (id) => id || "Anonymous",
    },
    {
      title: "عملیات",
      dataIndex: "action",
      key: "action",
      width: 160,
      sorter: true,
      render: (action) => {
        const colorMap = {
          login_success: "green",
          login_attempt: "orange",
          create_transaction: "blue",
          update_transaction: "cyan",
          delete_transaction: "red",
          create_user: "green",
          update_user: "geekblue",
          delete_user: "red",
          reset_password: "purple",
          unlock_user: "lime",
          delete_all_transactions: "volcano",
          delete_all_logs: "magenta",
          export_logs: "gold",
          server_shutdown: "red",
        };
        return <Tag color={colorMap[action] || "default"}>{action}</Tag>;
      },
    },
    {
      title: "منبع",
      dataIndex: "resource",
      key: "resource",
      width: 100,
      sorter: true,
    },
    {
      title: "IP Address",
      dataIndex: "ip_address",
      key: "ip_address",
      width: 140,
      sorter: true,
    },
    {
      title: "وضعیت",
      dataIndex: "success",
      key: "success",
      align: "center",
      width: 100,
      sorter: true,
      render: (success) => (
        <Tag color={success ? "green" : "red"}>
          {success ? "موفق" : "ناموفق"}
        </Tag>
      ),
    },
    {
      title: "تاریخ و زمان",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      sorter: true,
      render: (date) => formatJalaliDate(date, true),
    },
    {
      title: "جزئیات",
      dataIndex: "details",
      key: "details",
      render: (details) => (
        <span style={{ fontSize: 14, color: "#666" }}>{details || "-"}</span>
      ),
    },
  ];

  return (
    <ConfigProvider locale={fa_IR} direction="rtl">
      <div style={{ padding: "24px" }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AuditOutlined style={{ fontSize: 20, color: "#1890ff" }} />
              <Title level={4} style={{ margin: 0 }}>
                لاگ‌های سیستم
              </Title>
            </div>
          }
          extra={
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
                disabled={logs.length === 0}
              >
                خروجی Excel
              </Button>
              <Popconfirm
                title={
                  <div>
                    <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                      حذف تمام لاگ‌ها
                    </div>
                    <div>آیا از حذف تمام لاگ‌ها اطمینان دارید؟</div>
                  </div>
                }
                onConfirm={handleDeleteAll}
                okText="تایید"
                cancelText="لغو"
                okButtonProps={{
                  danger: true,
                  loading: deleteAllLoading,
                }}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={logs.length === 0}
                >
                  حذف تمام لاگ‌ها
                </Button>
              </Popconfirm>
              <Button
                icon={<ReloadOutlined />}
                onClick={() =>
                  fetchLogs(
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
            </div>
          }
        >
          <Input
            placeholder="جستجو در عملیات، منبع یا جزئیات..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            allowClear
            style={{ marginBottom: 16, maxWidth: 400 }}
          />

          <Table
            columns={columns}
            dataSource={logs}
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

          <Divider />

          <div style={{ display: "flex", justifyContent: "center" }}>
            <Pagination
              current={pagination.current}
              pageSize={pagination.pageSize}
              total={pagination.total}
              onChange={(page, pageSize) => {
                setPagination({ ...pagination, current: page, pageSize });
                fetchLogs(
                  page,
                  pageSize,
                  sorter.field,
                  sorter.order,
                  searchText
                );
              }}
              showTotal={(total) => `مجموع ${total} رکورد`}
              showSizeChanger
              pageSizeOptions={["10", "20", "50", "100"]}
            />
          </div>
        </Card>
      </div>
    </ConfigProvider>
  );
};

export default AuditLogs;
