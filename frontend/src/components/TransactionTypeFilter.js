import React from "react";
import { Button } from "antd";

const types = [
  { key: null, label: "همه" },
  { key: "deposit", label: "واریز" },
  { key: "withdraw", label: "برداشت" },
  { key: "expense", label: "هزینه" },
];

const TransactionTypeFilter = ({ selected, onChange }) => {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 12px",
        background: "#f9f9f9",
        borderRadius: 12,
        flexWrap: "wrap",
      }}
    >
      {types.map((type) => {
        const isActive = selected === type.key;
        return (
          <Button
            key={type.key ?? "all"}
            onClick={() => onChange(type.key)}
            style={{
              borderRadius: 10,
              fontWeight: 500,
              minWidth: 70,
              height: 36,
              border: isActive ? "2px solid #01a59e" : "1px solid #d9d9d9",
              backgroundColor: isActive ? "#01a59e" : "#fff",
              color: isActive ? "#fff" : "#333",
              boxShadow: isActive ? "0 4px 8px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.25s ease",
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = "#f0f0f0";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = "#fff";
            }}
          >
            {type.label}
          </Button>
        );
      })}
    </div>
  );
};

export default TransactionTypeFilter;

