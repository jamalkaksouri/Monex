import React from "react";
import { Alert } from "antd";

const OfflineBanner = ({ visible }) => {
  if (!visible) return null;

  return (
    <div style={{ 
      position: "fixed",
      top: 0,
      width: "100%",
      zIndex: 9999
    }}>
      <Alert
        message="ارتباط با سرور برقرار نیست"
        description="لطفاً وضعیت اتصال اینترنت یا دسترس‌پذیری سرور را بررسی کنید."
        type="error"
        showIcon
        closable={false}
      />
    </div>
  );
};

export default OfflineBanner;
