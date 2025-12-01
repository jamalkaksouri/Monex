// ✅ Connection Status Banner Component
import { Alert } from "antd";
import { DisconnectOutlined } from "@ant-design/icons";

export const ConnectionStatusBanner = ({ isConnected, reconnectAttempts }) => {
  if (isConnected) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
    >
      <Alert
        message={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DisconnectOutlined style={{ fontSize: 18 }} />
            <span>اتصال به سرور برقرار نیست</span>
          </div>
        }
        description={
          <div>
            <div>
              لطفاً وضعیت اتصال اینترنت یا دسترس‌پذیری سرور را بررسی کنید.
            </div>
            {reconnectAttempts > 0 && (
              <div style={{ marginTop: 8 }}>
                تلاش برای اتصال مجدد... ({reconnectAttempts} بار)
              </div>
            )}
          </div>
        }
        type="error"
        showIcon={false}
        closable={false}
        style={{
          borderRadius: 0,
          border: "none",
          borderBottom: "2px solid #ff4d4f",
        }}
      />
    </div>
  );
};
