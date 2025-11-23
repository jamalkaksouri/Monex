import React, { useState, useEffect } from 'react';
import {
    Table,
    Card,
    Button,
    Typography,
    Divider,
    Tag,
    Pagination,
    ConfigProvider,
} from 'antd';
import {
    EyeOutlined,
    ReloadOutlined,
    AuditOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import fa_IR from 'antd/lib/locale/fa_IR';
import { formatJalaliDate } from '../utils/formatDate';

const { Title } = Typography;

const AuditLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        total: 0,
    });

    const fetchLogs = async (page = 1, pageSize = 20) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/admin/audit-logs', {
                params: { page, pageSize },
            });
            setLogs(res.data.data || []);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: res.data.total || 0,
            });
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
        },
        {
            title: 'کاربر',
            dataIndex: 'user_id',
            key: 'user_id',
            align: 'center',
            render: (id) => id || 'Anonymous',
        },
        {
            title: 'عملیات',
            dataIndex: 'action',
            key: 'action',
            render: (action) => {
                const colorMap = {
                    login_success: 'green',
                    login_attempt: 'orange',
                    create_transaction: 'blue',
                    update_transaction: 'cyan',
                    delete_transaction: 'red',
                    create_user: 'green',
                    delete_user: 'red',
                };
                return <Tag color={colorMap[action] || 'default'}>{action}</Tag>;
            },
        },
        {
            title: 'منبع',
            dataIndex: 'resource',
            key: 'resource',
        },
        {
            title: 'IP Address',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 120,
        },
        {
            title: 'وضعیت',
            dataIndex: 'success',
            key: 'success',
            align: 'center',
            render: (success) => (
                <Tag color={success ? 'green' : 'red'}>
                    {success ? 'موفق' : 'ناموفق'}
                </Tag>
            ),
        },
        {
            title: 'تاریخ و زمان',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 160,
            render: (date) => formatJalaliDate(date, true),
        },
        {
            title: 'جزئیات',
            dataIndex: 'details',
            key: 'details',
            render: (details) => (
                <span style={{ fontSize: 12, color: '#666' }}>
                    {details || '-'}
                </span>
            ),
        },
    ];

    return (
        <ConfigProvider locale={fa_IR} direction="rtl">
            <div style={{ padding: '24px' }}>
                <Card
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AuditOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                            <Title level={4} style={{ margin: 0 }}>
                                لاگ‌های سیستم
                            </Title>
                        </div>
                    }
                    extra={
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => fetchLogs(1, pagination.pageSize)}
                            loading={loading}
                        >
                            به‌روزرسانی
                        </Button>
                    }
                >
                    <Table
                        columns={columns}
                        dataSource={logs}
                        rowKey="id"
                        loading={loading}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        style={{ width: '100%' }}
                    />

                    <Divider />

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Pagination
                            current={pagination.current}
                            pageSize={pagination.pageSize}
                            total={pagination.total}
                            onChange={(page, pageSize) => fetchLogs(page, pageSize)}
                            showTotal={(total) => `مجموع ${total} رکورد`}
                        />
                    </div>
                </Card>
            </div>
        </ConfigProvider>
    );
};

export default AuditLogs;