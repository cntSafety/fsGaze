'use client';

import React, { useState } from 'react';
import { 
    Card, 
    Input, 
    Button, 
    Space, 
    Alert, 
    Descriptions,
    Row,
    Col,
    Typography,
    Spin
} from 'antd';
import { 
    SearchOutlined, 
    FileTextOutlined
} from '@ant-design/icons';
import { JamaConnectionConfig, JamaItem } from '../types/jama';
import { JamaService } from '../services/jamaService';

const { Text } = Typography;

interface RequirementsViewerProps {
    connectionConfig: JamaConnectionConfig;
}

const RequirementsViewer: React.FC<RequirementsViewerProps> = ({ connectionConfig }) => {
    const [jamaService] = useState(() => new JamaService(connectionConfig));
    
    // State
    const [loading, setLoading] = useState(false);
    const [itemId, setItemId] = useState<string>('');
    const [item, setItem] = useState<JamaItem | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleItemIdChange = (value: string) => {
        setItemId(value);
        setItem(null);
        setError(null);
    };

    const handleLoadItem = async () => {
        const numericItemId = parseInt(itemId);
        if (!itemId || isNaN(numericItemId)) {
            setError('Please enter a valid item ID');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const itemData = await jamaService.getItem(numericItemId);
            setItem(itemData);
        } catch (error: any) {
            setError(error.message || 'Failed to load item');
            console.error('Failed to load item:', error);
            setItem(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {/* Item ID Input */}
            <Card style={{ marginBottom: 16 }}>
                <Row gutter={16} align="middle">
                    <Col span={8}>
                        <Input
                            placeholder="Enter Item ID (e.g., 1234567)"
                            value={itemId}
                            onChange={(e) => handleItemIdChange(e.target.value)}
                            onPressEnter={handleLoadItem}
                            addonBefore={<FileTextOutlined />}
                        />
                    </Col>
                    
                    <Col span={4}>
                        <Button 
                            type="primary"
                            onClick={handleLoadItem}
                            disabled={!itemId}
                            loading={loading}
                            icon={<SearchOutlined />}
                        >
                            Load Item
                        </Button>
                    </Col>
                </Row>
            </Card>

            {/* Error Display */}
            {error && (
                <Alert
                    message="Error"
                    description={error}
                    type="error"
                    showIcon
                    closable
                    onClose={() => setError(null)}
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* Loading Spinner */}
            {loading && (
                <Card style={{ textAlign: 'center', marginBottom: 16 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>Loading item...</div>
                </Card>
            )}

            {/* Item Display */}
            {item && !loading && (
                <Card title="Item Details">
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <Descriptions bordered size="small" column={1}>
                            <Descriptions.Item label="ID">
                                <Text strong>{item.id}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Document Key">
                                <Text code>{item.documentKey}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Global ID">
                                <Text code>{item.globalId}</Text>
                            </Descriptions.Item>
                        </Descriptions>

                        {item.fields.description && (
                            <Card size="small" title="Description">
                                <div 
                                    style={{ 
                                        wordBreak: 'break-word',
                                        lineHeight: '1.6'
                                    }}
                                    dangerouslySetInnerHTML={{ 
                                        __html: item.fields.description 
                                    }} 
                                />
                            </Card>
                        )}
                    </Space>
                </Card>
            )}
        </div>
    );
};

export default RequirementsViewer;
