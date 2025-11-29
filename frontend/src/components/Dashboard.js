import React, { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, message } from "antd";
import {
  PlusCircleOutlined,
  MinusCircleOutlined,
  DollarCircleOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import axios from "axios";
import TransactionTableContainer from "./TransactionTableContainer";
import "./Dashboard.css";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalDeposit: 0,
    totalWithdraw: 0,
    totalExpense: 0,
    balance: 0,
    transactions: 0,
  });

  const fetchStats = async () => {
    try {
      const res = await axios.get("/api/stats");
      setStats(res.data);
    } catch {
      message.error("خطا در دریافت آمار");
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const statsCards = [
    {
      title: "مجموع واریزی‌ها",
      value: stats.totalDeposit,
      icon: <PlusCircleOutlined />,
      color: "#52c41a",
      bgColor: "#f6ffed",
    },
    {
      title: "مجموع برداشت‌ها",
      value: stats.totalWithdraw,
      icon: <MinusCircleOutlined />,
      color: "#ff4d4f",
      bgColor: "#fff1f0",
    },
    {
      title: "مجموع هزینه‌ها",
      value: stats.totalExpense,
      icon: <DollarCircleOutlined />,
      color: "#1890ff",
      bgColor: "#e6f7ff",
    },
    {
      title: stats.balance >= 0 ? "بدهکاری شما" : "بستانکاری شما",
      value: Math.abs(stats.balance),
      icon: <WalletOutlined />,
      color: stats.balance >= 0 ? "#52c41a" : "#ff4d4f",
      bgColor: stats.balance >= 0 ? "#f6ffed" : "#fff1f0",
    },
  ];

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        {/* Stats Cards - Aligned with table */}
        <Row gutter={[16, 16]} style={{ marginBottom: 10 }}>
          {statsCards.map((card, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Card
                variant={false}
                className="stat-card-minimal"
                style={{
                  backgroundColor: card.bgColor,
                  borderLeft: `4px solid ${card.color}`,
                }}
              >
                <div className="stat-card-header">
                  <span
                    className="stat-icon-minimal"
                    style={{ color: card.color }}
                  >
                    {card.icon}
                  </span>
                  <span
                    className="stat-title-minimal"
                    style={{ color: card.color }}
                  >
                    {card.title}
                  </span>
                </div>
                <Statistic
                  value={card.value}
                  precision={0}
                  valueStyle={{
                    color: card.color,
                    fontWeight: 700,
                    fontSize: 28,
                    fontFamily: "estedad-fd, Vazir, sans-serif",
                  }}
                  suffix={
                    <span style={{ fontSize: 14, color: card.color }}>
                      تومان
                    </span>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>

        {/* Transaction Table */}
        <TransactionTableContainer onDataChange={fetchStats} />
      </div>
    </div>
  );
};

export default Dashboard;
