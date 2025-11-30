// frontend/src/components/SecurityWarnings.js
import React, { useState, useEffect } from "react";
import { Alert, Badge, Button, Modal, Typography, Divider } from "antd";
import {
    WarningOutlined,
    InfoCircleOutlined,
    CloseCircleOutlined,
    LockOutlined,
} from "@ant-design/icons";
import axios from "axios";

const { Text, Paragraph } = Typography;

const SecurityWarnings = () => {
    const [warnings, setWarnings] = useState([]);
    const [accountStatus, setAccountStatus] = useState(null);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchSecurityWarnings();

        // Poll every 30 seconds for new warnings
        const interval = setInterval(fetchSecurityWarnings, 30000);

        return () => clearInterval(interval);
    }, []);

    const fetchSecurityWarnings = async () => {
        try {
            const [warningsRes, statusRes] = await Promise.all([
                axios.get("/api/security/warnings"),
                axios.get("/api/security/status"),
            ]);

            setWarnings(warningsRes.data.warnings || []);
            setAccountStatus(statusRes.data);

            // Auto-show modal if there are critical warnings
            const hasCritical = warningsRes.data.warnings?.some(
                (w) => w.severity === "critical"
            );
            if (hasCritical && !visible) {
                setVisible(true);
            }
        } catch (error) {
            console.error("Failed to fetch security warnings:", error);
        }
    };

    const getSeverityIcon = (severity) => {
        switch (severity) {
            case "critical":
                return <CloseCircleOutlined style={{ color: "#ff4d4f" }} />;
            case "warning":
                return <WarningOutlined style={{ color: "#faad14" }} />;
            default:
                return <InfoCircleOutlined style={{ color: "#1890ff" }} />;
        }
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case "critical":
                return "error";
            case "warning":
                return "warning";
            default:
                return "info";
        }
    };

    if (!warnings.length && !accountStatus?.locked) {
        return null; // No warnings to display
    }

    return (
        <>
            {/* Security Badge in Header */}
            {warnings.length > 0 && (
                <Badge
                    count={warnings.length}
                    style={{ backgroundColor: "#ff4d4f" }}
                    onClick={() => setVisible(true)}
                >
                    <Button
                        type="text"
                        icon={<LockOutlined style={{ fontSize: 20 }} />}
                        style={{ fontSize: 20 }}
                    />
                </Badge>
            )}

            {/* Security Warnings Modal */}
            <Modal
                title={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <LockOutlined style={{ color: "#ff4d4f", fontSize: 20 }} />
                        <span>هشدارهای امنیتی</span>
                    </div>
                }
                open={visible}
                onCancel={() => setVisible(false)}
                footer={[
                    <Button key="close" type="primary" onClick={() => setVisible(false)}>
                        متوجه شدم
                    </Button>,
                ]}
                width={600}
            >
                <Divider style={{ margin: "16px 0" }} />

                {/* Account Status Summary */}
                {accountStatus && (
                    <Alert
                        message="وضعیت حساب کاربری"
                        description={
                            <div>
                                {accountStatus.locked && (
                                    <Paragraph>
                                        <Text strong style={{ color: "#ff4d4f" }}>
                                            ⚠️ حساب شما موقتاً قفل است
                                        </Text>
                                        <br />
                                        <Text>
                                            سشن فعلی شما همچنان فعال است، اما نمی‌توانید از دستگاه
                                            جدیدی وارد شوید.
                                        </Text>
                                        {accountStatus.lock_remaining_seconds > 0 && (
                                            <>
                                                <br />
                                                <Text type="secondary">
                                                    زمان باقیمانده:{" "}
                                                    {Math.floor(accountStatus.lock_remaining_seconds / 60)}{" "}
                                                    دقیقه و {accountStatus.lock_remaining_seconds % 60}{" "}
                                                    ثانیه
                                                </Text>
                                            </>
                                        )}
                                    </Paragraph>
                                )}

                                {accountStatus.failed_attempts > 0 && (
                                    <Paragraph>
                                        <Text strong>تلاش‌های ناموفق ورود:</Text>{" "}
                                        {accountStatus.failed_attempts} از 5
                                    </Paragraph>
                                )}
                            </div>
                        }
                        type={accountStatus.locked ? "warning" : "info"}
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

                {/* Individual Warnings */}
                {warnings.map((warning, index) => (
                    <Alert
                        key={index}
                        message={
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {getSeverityIcon(warning.severity)}
                                <Text strong>{warning.type}</Text>
                            </div>
                        }
                        description={
                            <div>
                                <Text>{warning.message}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {new Date(warning.created_at).toLocaleString("fa-IR")}
                                </Text>
                            </div>
                        }
                        type={getSeverityColor(warning.severity)}
                        showIcon={false}
                        style={{ marginBottom: 12 }}
                    />
                ))}

                {/* Security Tips */}
                <Divider style={{ margin: "16px 0" }} />
                <Alert
                    message="توصیه‌های امنیتی"
                    description={
                        <ul style={{ marginBottom: 0, paddingRight: 20 }}>
                            <li>رمز عبور خود را با کسی به اشتراک نگذارید</li>
                            <li>از دستگاه‌های قابل اعتماد استفاده کنید</li>
                            <li>پس از استفاده از سیستم، حتماً خارج شوید</li>
                            <li>
                                اگر فعالیت مشکوکی مشاهده کردید، رمز عبور خود را تغییر دهید
                            </li>
                        </ul>
                    }
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                />
            </Modal>

            {/* Inline Warning Banner (always visible if account is locked) */}
            {accountStatus?.locked && !visible && (
                <Alert
                    message="حساب شما موقتاً قفل است"
                    description={
                        <span>
                            به دلیل تلاش‌های ناموفق ورود، ورود جدید از دستگاه دیگر امکان‌پذیر نیست.
                            سشن فعلی شما فعال است.{" "}
                            <Button type="link" size="small" onClick={() => setVisible(true)}>
                                جزئیات بیشتر
                            </Button>
                        </span>
                    }
                    type="warning"
                    showIcon
                    closable
                    style={{
                        margin: "16px 24px",
                        borderRadius: 8,
                    }}
                />
            )}
        </>
    );
};

export default SecurityWarnings;