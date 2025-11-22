import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Button,
  Card,
  message,
  Segmented,
  Typography,
  Space,
  Divider,
  ConfigProvider,
} from "antd";
import {
  EditOutlined,
  SaveOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import jalaliday from "jalaliday";
import { DatePicker as JDatePicker, JalaliLocaleListener } from "antd-jalali";
import fa_IR from "antd/lib/locale/fa_IR";
import { formatJalaliDate } from "../utils/formatDate";
import { motion } from "framer-motion";
import { PlusCircle, MinusCircle, Wallet } from "lucide-react";

dayjs.extend(jalaliday);
const { Text } = Typography;

const createTransaction = (data) => axios.post("/api/transactions", data);
const updateTransaction = (id, data) =>
  axios.put(`/api/transactions/${id}`, data);

const typeOptions = [
  {
    key: "deposit",
    label: "واریز",
    icon: <PlusCircle size={26} />,
    color: "#009688",
  },
  {
    key: "withdraw",
    label: "برداشت",
    icon: <MinusCircle size={26} />,
    color: "#F44336",
  },
  {
    key: "expense",
    label: "هزینه",
    icon: <Wallet size={26} />,
    color: "#2196F3",
  },
];

const AnimatedIcon = ({ children }) => (
  <motion.div
    initial={{ scale: 0.8, rotate: 0 }}
    animate={{ scale: [1, 1.2, 1], rotate: [0, 15, -15, 0] }}
    transition={{ duration: 0.6 }}
    style={{ display: "inline-flex" }}
  >
    {children}
  </motion.div>
);

const TransactionFormModal = ({ visible, onClose, record, onSuccess }) => {
  const [form] = Form.useForm();
  const [selectedType, setSelectedType] = useState(null);
  const [amount, setAmount] = useState("");
  const [dateMode, setDateMode] = useState("now");
  const [dateTime, setDateTime] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      form.resetFields();
      setSelectedType(null);
      setAmount("");
      setDateMode("now");
      setDateTime(null);
    } else if (record) {
      console.log("Editing record:", record);
      setSelectedType(record.type);
      const formattedAmount = Number(record.amount).toLocaleString();
      setAmount(formattedAmount);
      form.setFieldsValue({
        amount: formattedAmount,
        note: record.note || "",
      });

      // ✅ FIX: Use dayjs with jalali calendar for proper date handling
      if (record.created_at) {
        try {
          const dayjsDate = dayjs(record.created_at);
          if (dayjsDate.isValid()) {
            setDateMode("custom");
            setDateTime(dayjsDate);
          } else {
            setDateMode("now");
            setDateTime(null);
          }
        } catch {
          setDateMode("now");
          setDateTime(null);
        }
      } else {
        setDateMode("now");
        setDateTime(null);
      }
    } else {
      form.resetFields();
      setSelectedType(null);
      setAmount("");
      setDateMode("now");
      setDateTime(null);
    }
  }, [visible, record, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (!selectedType || !amount || (dateMode === "custom" && !dateTime)) {
        message.error("لطفا تمام فیلدهای الزامی را پر کنید");
        return;
      }

      const numericAmount = Number(amount.replace(/,/g, ""));

      const payload = {
        note: values.note || "",
        type: selectedType,
        amount: numericAmount,
      };

      // ✅ Only add created_at if explicitly set by user in custom mode
      if (dateMode === "custom" && dateTime) {
        payload.created_at = dateTime.startOf("minute").toISOString();
      }
      // If dateMode is "now", don't include created_at - let backend set current time

      setLoading(true);

      if (record) {
        await updateTransaction(record.id, payload);
        message.success("تراکنش با موفقیت ویرایش شد");
      } else {
        await createTransaction(payload);
        message.success("تراکنش با موفقیت ایجاد شد");
      }

      onClose();
      onSuccess?.();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || "خطا در ذخیره تراکنش");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <ConfigProvider locale={fa_IR} direction="rtl">
      <JalaliLocaleListener />
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {record ? <EditOutlined /> : <SaveOutlined />}
            <span>{record ? "ویرایش تراکنش" : "تراکنش جدید"}</span>
          </div>
        }
        open={visible}
        onCancel={onClose}
        footer={null}
        className="rounded-2xl overflow-hidden"
      >
        <Form form={form} layout="vertical" className="space-y-6">
          {/* نوع تراکنش */}
          <Form.Item label="نوع تراکنش" required>
            <div style={{ display: "flex", gap: 12 }}>
              {typeOptions.map((opt) => (
                <Card
                  key={opt.key}
                  onClick={() => setSelectedType(opt.key)}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    borderRadius: 12,
                    border:
                      selectedType === opt.key
                        ? `2px solid ${opt.color}`
                        : "2px solid #f0f0f0",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    transition: "all 0.3s ease",
                  }}
                >
                  <div
                    className="glass-hover"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      borderRadius: 12,
                      pointerEvents: "none",
                      backgroundColor: `${opt.color}22`,
                      opacity: 0,
                      transition: "opacity 0.3s ease",
                      backdropFilter: "blur(6px)",
                      zIndex: 0,
                    }}
                  />
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div
                      style={{
                        fontSize: 22,
                        color: opt.color,
                        marginBottom: 6,
                      }}
                    >
                      {selectedType === opt.key ? (
                        <AnimatedIcon>{opt.icon}</AnimatedIcon>
                      ) : (
                        opt.icon
                      )}
                    </div>
                    <div style={{ fontWeight: 600 }}>{opt.label}</div>
                  </div>
                </Card>
              ))}
            </div>
          </Form.Item>

          {/* مبلغ */}
          <Form.Item
            label="مبلغ (تومان)"
            name="amount"
            rules={[{ required: true, message: "لطفا مبلغ را وارد کنید" }]}
          >
            <Input
              value={amount}
              onChange={(e) => {
                let raw = e.target.value.replace(/,/g, "").replace(/\D/g, "");
                if (raw.length > 12) raw = raw.slice(0, 12);
                const formatted = raw ? Number(raw).toLocaleString() : "";
                setAmount(formatted);
                form.setFieldsValue({ amount: formatted || undefined });
              }}
              onKeyDown={(e) => {
                if (
                  !/[0-9]/.test(e.key) &&
                  e.key !== "Backspace" &&
                  e.key !== "Delete" &&
                  e.key !== "ArrowLeft" &&
                  e.key !== "ArrowRight"
                ) {
                  e.preventDefault();
                }
              }}
              placeholder="مثلاً 1,000,000"
              inputMode="numeric"
              style={{ borderRadius: 10, fontSize: 16, padding: "8px 12px" }}
            />
          </Form.Item>

          {/* زمان */}
          <Card
            style={{
              borderRadius: 12,
              background: "#fafafa",
              border: "1px solid #f0f0f0",
            }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size={10}>
              <Text strong>زمان ثبت تراکنش</Text>
              <Segmented
                style={{ direction: "rtl" }}
                value={dateMode}
                onChange={setDateMode}
                options={[
                  {
                    label: (
                      <span>
                        <CalendarOutlined /> اکنون
                      </span>
                    ),
                    value: "now",
                  },
                  {
                    label: (
                      <span>
                        <ClockCircleOutlined /> تاریخ دلخواه
                      </span>
                    ),
                    value: "custom",
                  },
                ]}
              />
              {dateMode === "custom" && (
                <>
                  <Divider style={{ margin: "10px 0" }} />
                  <Form.Item
                    label={`تاریخ و ساعت انتخاب شده: ${
                      dateTime ? formatJalaliDate(dateTime, true) : ""
                    }`}
                  >
                    <JDatePicker
                      showTime={{ format: "HH:mm" }}
                      value={dateTime} // ✅ Use dayjs directly
                      onChange={(val) => {
                        if (val && val.isValid?.()) {
                          setDateTime(val);
                        }
                      }}
                      format="YYYY/MM/DD HH:mm"
                      style={{ width: "100%" }}
                      placeholder="انتخاب تاریخ و ساعت"
                      allowClear
                    />
                  </Form.Item>
                </>
              )}
            </Space>
          </Card>

          {/* توضیحات */}
          <Form.Item
            name="note"
            label="توضیحات"
            style={{ marginTop: "10px", paddingBottom: "0" }}
          >
            <Input.TextArea
              rows={3}
              style={{
                borderRadius: 10,
                padding: "8px 12px",
                fontFamily: "estedad-fd",
              }}
              placeholder="توضیحات اختیاری..."
            />
          </Form.Item>

          {/* دکمه‌ها */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button onClick={onClose}>انصراف</Button>
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={loading}
              icon={record ? <EditOutlined /> : <SaveOutlined />}
            >
              {record ? "ویرایش" : "ذخیره"}
            </Button>
          </div>
        </Form>
      </Modal>
    </ConfigProvider>
  );
};

export default TransactionFormModal;
