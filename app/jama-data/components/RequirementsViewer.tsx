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
    Spin,
    message
} from 'antd';
import { 
    SearchOutlined, 
    FileTextOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    DownOutlined,
    DownloadOutlined,
    TeamOutlined,
    FolderOutlined,
    InfoCircleOutlined
} from '@ant-design/icons';
import { JamaItem } from '../types/jama';
import { globalJamaService } from '../../services/globalJamaService';
import { useJamaConnection } from '../../components/JamaConnectionProvider';
import { useJamaStore } from '../../stores/jamaStore';
import { exportRecursiveToRst } from '../services/exportService';

// Utility function to strip HTML tags and convert to plain text (used for display)
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

const { Text, Paragraph } = Typography;

// No props needed since component uses global Jama service
const RequirementsViewer: React.FC = () => {
    const { isConnected, connectionError } = useJamaConnection();
    
    // State
    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, message: '' });
    const [serverLogs, setServerLogs] = useState<string[]>([]);
    const [itemId, setItemId] = useState<string>('');
    const [item, setItem] = useState<JamaItem | null>(null);
    const [asilInfo, setAsilInfo] = useState<{ field: string; value: string; optionName: string } | null>(null);
    const [reasonInfo, setReasonInfo] = useState<{ field: string; value: string } | null>(null);
    const [itemTypeInfo, setItemTypeInfo] = useState<{ id: number; display: string } | null>(null);
    const [upstreamRelated, setUpstreamRelated] = useState<number[]>([]);
    const [downstreamRelated, setDownstreamRelated] = useState<number[]>([]);
    const [children, setChildren] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleItemIdChange = (value: string) => {
        setItemId(value);
        setItem(null);
        setAsilInfo(null);
        setReasonInfo(null);
        setItemTypeInfo(null);
        setUpstreamRelated([]);
        setDownstreamRelated([]);
        setChildren([]);
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

            // Fetch upstream related items
            const upstreamIds = await globalJamaService.getUpstreamRelated(numericItemId);
            setUpstreamRelated(upstreamIds);

            // Fetch downstream related items
            const downstreamIds = await globalJamaService.getDownstreamRelated(numericItemId);
            setDownstreamRelated(downstreamIds);

            // Fetch children items
            const childrenIds = await globalJamaService.getChildren(numericItemId, {
                onProgress: (current, total, message) => {
                    setExportProgress({ current, total, message });
                }
            });
            setChildren(childrenIds);

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
            setUpstreamRelated([]);
            setDownstreamRelated([]);
            setChildren([]);
        } finally {
            setLoading(false);
        }
    };

    const handleExportToRst = async () => {
        if (!item) return;

        setExportLoading(true);
        setExportProgress({ current: 0, total: 10, message: 'Preparing export request...' });
        setServerLogs([]);

        // Generate unique export ID
        const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Start SSE connection for progress updates
            const eventSource = new EventSource(`/api/jama/export/rst/progress?exportId=${exportId}`);
            
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.message) {
                        setServerLogs(prev => [...prev, data.message]);
                        setExportProgress(prev => ({
                            ...prev,
                            message: data.message
                        }));
                    }
                    if (data.done) {
                        eventSource.close();
                    }
                } catch (error) {
                    console.error('Error parsing SSE data:', error);
                }
            };

            eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                eventSource.close();
            };

            // Get connection config from store
            const jamaStore = useJamaStore.getState();
            const connectionConfig = jamaStore.connectionConfig;

            if (!connectionConfig) {
                throw new Error('No Jama connection configuration found. Please connect to Jama first.');
            }

            setServerLogs(prev => [...prev, '[CLIENT] Starting export request...']);

            // Start the actual export with progress tracking
            const response = await fetch(`/api/jama/export/rst?exportId=${exportId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    item,
                    itemTypeInfo,
                    asilInfo,
                    upstreamRelated,
                    downstreamRelated,
                    children,
                    exportType: 'recursive',
                    connectionConfig
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            setExportProgress({ 
                current: 8, 
                total: 10, 
                message: 'Processing server response...' 
            });

            setServerLogs(prev => [...prev, '[CLIENT] Server processing completed, downloading ZIP...']);

            const zipBlob = await response.blob();
            
            setExportProgress({ 
                current: 10, 
                total: 10, 
                message: 'Generating ZIP download...' 
            });
            
            // Download the ZIP file
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${item.id}_recursive_export.zip`;
            document.body.appendChild(link);
            link.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(link);
            
            setServerLogs(prev => [...prev, '[CLIENT] Export completed successfully!']);
            
            // Close SSE connection
            eventSource.close();

            message.success('Recursive RST export completed successfully!');
            
        } catch (error: any) {
            setServerLogs(prev => [...prev, `[ERROR] Export failed: ${error.message}`]);
            message.error(`Failed to export recursive RST: ${error.message}`);
            console.error('Failed to export recursive RST:', error);
        } finally {
            setExportLoading(false);
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
                <Row gutter={[16, 8]} align="middle">
                    <Col xs={24} sm={24} md={8} lg={8}>
                        <Input
                            placeholder="Enter Item ID (e.g., 5093322)"
                            value={itemId}
                            onChange={(e) => handleItemIdChange(e.target.value)}
                            onPressEnter={handleLoadItem}
                            addonBefore={<FileTextOutlined />}
                            disabled={!isConnected}
                        />
                    </Col>
                    
                    <Col xs={24} sm={24} md={6} lg={4}>
                        <Button 
                            type="primary"
                            onClick={handleLoadItem}
                            disabled={!itemId || !isConnected}
                            loading={loading}
                            icon={<SearchOutlined />}
                            style={{ width: '100%' }}
                        >
                            Load Item
                        </Button>
                    </Col>

                    {item && (
                        <Col xs={24} sm={12} md={6} lg={4}>
                            <Button 
                                type="primary"
                                onClick={handleExportToRst}
                                loading={exportLoading}
                                icon={<DownloadOutlined />}
                                style={{ width: '100%' }}
                            >
                                Export
                            </Button>
                        </Col>
                    )}

                    <Col xs={24} sm={24} md={children.length > 0 && item ? 6 : 10} lg={item ? 8 : 12}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            {isConnected 
                                ? 'Enter a Jama item ID to load requirement information'
                                : 'Connect to Jama first to load requirement data'
                            }
                        </Text>
                    </Col>
                </Row>

                {/* Export Info and Status */}
                {item && (
                    <Row gutter={[16, 8]} style={{ marginTop: 8 }}>
                        <Col xs={24}>
                            <Alert
                                message="Recursive Export Information"
                                description="This export includes all child items and sub-folders. Depending on the number of items and complexity, the export may take a while."
                                type="info"
                                icon={<InfoCircleOutlined />}
                                showIcon
                                style={{ fontSize: '12px' }}
                            />
                        </Col>
                        
                        {exportLoading && (
                            <Col xs={24}>
                                <Alert
                                    message="Export in Progress"
                                    description={
                                        <div>
                                            <div style={{ marginBottom: 8 }}>
                                                <Spin size="small" style={{ marginRight: 8 }} />
                                                <Typography.Text strong>{exportProgress.message}</Typography.Text>
                                            </div>
                                            {exportProgress.total > 0 && (
                                                <div style={{ marginBottom: 12 }}>
                                                    <Typography.Text type="secondary">
                                                        Progress: {exportProgress.current} / {exportProgress.total}
                                                    </Typography.Text>
                                                </div>
                                            )}
                                            {serverLogs.length > 0 && (
                                                <div>
                                                    <Typography.Text strong style={{ fontSize: '12px' }}>
                                                        Server Status:
                                                    </Typography.Text>
                                                    <div style={{ 
                                                        maxHeight: '150px', 
                                                        overflowY: 'auto',
                                                        backgroundColor: 'rgba(0,0,0,0.02)',
                                                        padding: '8px',
                                                        borderRadius: '4px',
                                                        marginTop: '4px',
                                                        fontFamily: 'monospace',
                                                        fontSize: '11px',
                                                        border: '1px solid rgba(0,0,0,0.06)'
                                                    }}>
                                                        {serverLogs.map((log, index) => (
                                                            <div key={index} style={{ marginBottom: '2px' }}>
                                                                <Typography.Text type="secondary">
                                                                    {log}
                                                                </Typography.Text>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    }
                                    type="info"
                                    showIcon={false}
                                />
                            </Col>
                        )}
                    </Row>
                )}
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
                            
                            <Descriptions.Item label="Project">
                                <Text>{item.project}</Text>
                            </Descriptions.Item>
                            
                            <Descriptions.Item label="Created Date">
                                <Text>
                                    {item.createdDate ? new Date(item.createdDate).toLocaleString() : 'N/A'}
                                </Text>
                            </Descriptions.Item>
                            
                            <Descriptions.Item label="Modified Date">
                                <Text>
                                    {item.modifiedDate ? new Date(item.modifiedDate).toLocaleString() : 'N/A'}
                                </Text>
                            </Descriptions.Item>
                            
                            {item.fields.globalId && (
                                <Descriptions.Item label="Global ID">
                                    <Text>{item.fields.globalId}</Text>
                                </Descriptions.Item>
                            )}
                            
                            {item.fields.planned_release$435 && (
                                <Descriptions.Item label="Planned Release">
                                    <Text>{item.fields.planned_release$435}</Text>
                                </Descriptions.Item>
                            )}
                            
                            {upstreamRelated.length > 0 && (
                                <Descriptions.Item label={<><ArrowUpOutlined /> Upstream Related</>}>
                                    <Text>{upstreamRelated.join(', ')}</Text>
                                </Descriptions.Item>
                            )}
                            
                            {downstreamRelated.length > 0 && (
                                <Descriptions.Item label={<><ArrowDownOutlined /> Downstream Related</>}>
                                    <Text>{downstreamRelated.join(', ')}</Text>
                                </Descriptions.Item>
                            )}
                            
                            {children.length > 0 && (
                                <Descriptions.Item label={<><TeamOutlined /> Children ({children.length})</>}>
                                    <Text>{children.join(', ')}</Text>
                                </Descriptions.Item>
                            )}
                            
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
