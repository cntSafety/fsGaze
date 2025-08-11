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
import { JamaItem } from '../types/jama';
import { globalJamaService } from '../../services/globalJamaService';
import { useJamaConnection } from '../../components/JamaConnectionProvider';

const { Text, Paragraph } = Typography;

// Utility function to strip HTML tags and convert to plain text
const stripHtmlTags = (html: string): string => {
    if (!html) return '';
    
    // Remove HTML tags
    const stripped = html.replace(/<[^>]*>/g, '');
    
    // Decode common HTML entities
    const decoded = stripped
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    
    // Clean up extra whitespace
    return decoded.replace(/\s+/g, ' ').trim();
};

interface RequirementsViewerProps {
    // No longer need connectionConfig prop since we use global service
}

const RequirementsViewer: React.FC<RequirementsViewerProps> = () => {
    const { isConnected, connectionError } = useJamaConnection();
    
    // State
    const [loading, setLoading] = useState(false);
    const [itemId, setItemId] = useState<string>('');
    const [item, setItem] = useState<JamaItem | null>(null);
    const [asilInfo, setAsilInfo] = useState<{ field: string; value: string; optionName: string } | null>(null);
    const [reasonInfo, setReasonInfo] = useState<{ field: string; value: string } | null>(null);
    const [itemTypeInfo, setItemTypeInfo] = useState<{ id: number; display: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleItemIdChange = (value: string) => {
        setItemId(value);
        setItem(null);
        setAsilInfo(null);
        setReasonInfo(null);
        setItemTypeInfo(null);
        setError(null);
    };

    const extractAsilFromFields = (fields: any, itemType: number) => {
        // Look for asil field with the format asil$itemType
        const asilFieldName = `asil$${itemType}`;
        
        if (fields[asilFieldName]) {
            return {
                field: asilFieldName,
                value: fields[asilFieldName]
            };
        }
        
        return null;
    };

    const extractReasonFromFields = (fields: any, itemType: number) => {
        // Look for reason field with the format reason$itemType
        const reasonFieldName = `reason$${itemType}`;
        
        if (fields[reasonFieldName]) {
            return {
                field: reasonFieldName,
                value: fields[reasonFieldName]
            };
        }
        
        return null;
    };

    const handleLoadItem = async () => {
        const numericItemId = parseInt(itemId);
        if (!itemId || isNaN(numericItemId)) {
            setError('Please enter a valid item ID');
            return;
        }

        if (!isConnected) {
            setError('Please connect to Jama first');
            return;
        }

        setLoading(true);
        setError(null);
        setAsilInfo(null);
        setReasonInfo(null);
        setItemTypeInfo(null);
        
        try {
            // Use global service which handles token validation automatically
            const itemData = await globalJamaService.getItem(numericItemId);
            setItem(itemData);

            // Get item type information
            try {
                const itemTypeData = await globalJamaService.getItemType(itemData.itemType);
                setItemTypeInfo({
                    id: itemTypeData.id,
                    display: itemTypeData.display
                });
            } catch (itemTypeError) {
                console.error('Failed to load item type:', itemTypeError);
                setItemTypeInfo({
                    id: itemData.itemType,
                    display: `Type ${itemData.itemType} (Failed to load name)`
                });
            }

            // Extract ASIL information
            const asilData = extractAsilFromFields(itemData.fields, itemData.itemType);
            
            if (asilData) {
                try {
                    // Get the picklist option details
                    const picklistOption = await globalJamaService.getPicklistOption(asilData.value);
                    
                    setAsilInfo({
                        field: asilData.field,
                        value: asilData.value.toString(),
                        optionName: picklistOption.name
                    });
                } catch (picklistError) {
                    console.error('Failed to load ASIL picklist option:', picklistError);
                    setAsilInfo({
                        field: asilData.field,
                        value: asilData.value.toString(),
                        optionName: 'Unknown (Failed to load)'
                    });
                }
            } else {
                setAsilInfo(null);
            }

            // Extract Reason information
            const reasonData = extractReasonFromFields(itemData.fields, itemData.itemType);
            
            if (reasonData) {
                setReasonInfo({
                    field: reasonData.field,
                    value: reasonData.value
                });
            } else {
                setReasonInfo(null);
            }
            
        } catch (error: any) {
            setError(error.message || 'Failed to load item');
            console.error('Failed to load item:', error);
            setItem(null);
            setAsilInfo(null);
            setReasonInfo(null);
            setItemTypeInfo(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {/* Connection Status Alert */}
            {!isConnected && (
                <Alert
                    message="Not Connected"
                    description="Please connect to Jama first using the Connection tab."
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            {connectionError && (
                <Alert
                    message="Connection Error"
                    description={connectionError}
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* Item ID Input */}
            <Card style={{ marginBottom: 16 }}>
                <Row gutter={16} align="middle">
                    <Col span={8}>
                        <Input
                            placeholder="Enter Item ID (e.g., 5093322)"
                            value={itemId}
                            onChange={(e) => handleItemIdChange(e.target.value)}
                            onPressEnter={handleLoadItem}
                            addonBefore={<FileTextOutlined />}
                            disabled={!isConnected}
                        />
                    </Col>
                    
                    <Col span={4}>
                        <Button 
                            type="primary"
                            onClick={handleLoadItem}
                            disabled={!itemId || !isConnected}
                            loading={loading}
                            icon={<SearchOutlined />}
                        >
                            Load Requirements
                        </Button>
                    </Col>

                    <Col span={12}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            {isConnected 
                                ? 'Enter a Jama item ID to load requirement information'
                                : 'Connect to Jama first to load requirement data'
                            }
                        </Text>
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
                    <div style={{ marginTop: 16 }}>Loading requirement information...</div>
                </Card>
            )}

            {/* Requirement Information Display */}
            {item && !loading && (
                <Card title={`Requirement Information for Item ${item.id}`}>
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        {/* Basic Item Information */}
                        <Descriptions bordered size="small" column={1}>
                            <Descriptions.Item label="Item ID">
                                <Text strong>{item.id}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Document Key">
                                <Text code>{item.documentKey}</Text>
                            </Descriptions.Item>
                            {item.fields.name && (
                                <Descriptions.Item label="Name">
                                    <Text strong>{item.fields.name}</Text>
                                </Descriptions.Item>
                            )}
                            <Descriptions.Item label="Item Type">
                                <Text>
                                    {itemTypeInfo ? itemTypeInfo.display : `Type ${item.itemType}`}
                                </Text>
                            </Descriptions.Item>
                            {asilInfo && (
                                <Descriptions.Item label="ASIL Classification">
                                    <Text strong style={{ color: '#52c41a' }}>
                                        ASIL {asilInfo.optionName}
                                    </Text>
                                </Descriptions.Item>
                            )}
                            {reasonInfo && (
                                <Descriptions.Item label="Reason">
                                    <Text>
                                        {stripHtmlTags(reasonInfo.value)}
                                    </Text>
                                </Descriptions.Item>
                            )}
                        </Descriptions>

                        {/* Description if available */}
                        {item.fields.description && (
                            <Card size="small" title="Description">
                                <Paragraph style={{ margin: 0 }}>
                                    {stripHtmlTags(item.fields.description)}
                                </Paragraph>
                            </Card>
                        )}
                    </Space>
                </Card>
            )}
        </div>
    );
};

export default RequirementsViewer;
