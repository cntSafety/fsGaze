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
    FileTextOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    DownOutlined,
    DownloadOutlined
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

// No props needed since component uses global Jama service
const RequirementsViewer: React.FC = () => {
    const { isConnected, connectionError } = useJamaConnection();
    
    // State
    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, message: '' });
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
            const childrenIds = await globalJamaService.getChildren(numericItemId);
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
        setExportProgress({ current: 0, total: 0, message: 'Initializing export...' });

        // Check if this is a folder (based on item type display name)
        const isFolder = itemTypeInfo?.display?.toLowerCase().includes('folder');

        const generateRstContent = async () => {
            const exportTitle = item.fields.name || 'Unnamed item';
            let content = `${exportTitle}\n${'='.repeat(exportTitle.length)}\n\nRequirements\n------------------------\n\n`;
            
            setExportProgress({ current: 1, total: 5, message: 'Analyzing item type...' });
            
            if (isFolder) {
                setExportProgress({ current: 2, total: 5, message: 'Processing folder structure...' });
                
                // Generate folder block
                content += `.. fld:: ${item.fields.name || 'Unnamed Folder'}\n`;
                content += `   :id: ${item.id}\n`;
                content += `   :collapse: false\n\n`;
                
                // Add folder description
                if (item.fields.description) {
                    content += `   ${stripHtmlTags(item.fields.description)}\n\n`;
                } else {
                    content += `   This folder contains the following elements:\n\n`;
                }
                
                // Add children as nested requirements
                if (children.length > 0) {
                    setExportProgress({ 
                        current: 3, 
                        total: 3 + children.length, 
                        message: `Processing ${children.length} child requirements...` 
                    });
                    
                    for (let i = 0; i < children.length; i++) {
                        const childId = children[i];
                        setExportProgress({ 
                            current: 4 + i, 
                            total: 3 + children.length, 
                            message: `Loading child requirement ${i + 1} of ${children.length} (ID: ${childId})...` 
                        });
                        
                        try {
                            const childItem = await globalJamaService.getItem(childId);
                            const childItemType = await globalJamaService.getItemType(childItem.itemType);
                            
                            // Check if this child is also a folder
                            const isChildFolder = childItemType?.display?.toLowerCase().includes('folder');
                            
                            // Get child's upstream/downstream relations
                            const childUpstream = await globalJamaService.getUpstreamRelated(childId);
                            const childDownstream = await globalJamaService.getDownstreamRelated(childId);
                            
                            // Get child's ASIL info
                            const childAsilData = extractAsilFromFields(childItem.fields, childItem.itemType);
                            let childAsilInfo = null;
                            if (childAsilData) {
                                try {
                                    const picklistOption = await globalJamaService.getPicklistOption(childAsilData.value);
                                    childAsilInfo = { optionName: picklistOption.name };
                                } catch {
                                    childAsilInfo = { optionName: 'Unknown' };
                                }
                            }
                            
                            // Use appropriate directive based on item type
                            if (isChildFolder) {
                                content += `   .. fld:: ${childItem.fields.name || 'Unnamed Folder'}\n`;
                            } else {
                                content += `   .. req:: ${childItem.fields.name || 'Unnamed Requirement'}\n`;
                            }
                            content += `      :id: ${childItem.id}\n`;
                            
                            if (childItem.fields.statuscrnd) {
                                content += `      :status: ${childItem.fields.statuscrnd}\n`;
                            }
                            
                            if (childAsilInfo) {
                                content += `      :asil: ${childAsilInfo.optionName}\n`;
                            }
                            
                            if (childItemType) {
                                content += `      :sreqtype: ${childItemType.display}\n`;
                            }
                            
                            const childAllLinks = [...childUpstream, ...childDownstream];
                            if (childAllLinks.length > 0) {
                                content += `      :related: ${childAllLinks.join(', ')}\n`;
                            }
                            
                            content += `      :collapse: false\n\n`;
                            
                            if (childItem.fields.description) {
                                content += `      ${stripHtmlTags(childItem.fields.description)}\n\n`;
                            } else {
                                content += `      No description available.\n\n`;
                            }
                        } catch (error) {
                            console.error(`Failed to load child item ${childId}:`, error);
                            content += `   .. req:: Failed to load requirement\n`;
                            content += `      :id: ${childId}\n`;
                            content += `      :collapse: false\n\n`;
                            content += `      Error loading requirement data.\n\n`;
                        }
                    }
                }
            } else {
                setExportProgress({ current: 2, total: 5, message: 'Processing requirement data...' });
                
                // Generate regular requirement block
                content += `.. req:: ${item.fields.name || 'Unnamed Requirement'}\n`;
                content += `   :id: ${item.id}\n`;
                
                if (item.fields.statuscrnd) {
                    content += `   :status: ${item.fields.statuscrnd}\n`;
                }
                
                if (asilInfo) {
                    content += `   :asil: ${asilInfo.optionName}\n`;
                }
                
                if (itemTypeInfo) {
                    content += `   :sreqtype: ${itemTypeInfo.display}\n`;
                }
                
                const allLinks = [...upstreamRelated, ...downstreamRelated];
                if (allLinks.length > 0) {
                    content += `   :related: ${allLinks.join(', ')}\n`;
                }
                
                content += `   :collapse: true\n\n`;
                
                if (item.fields.description) {
                    content += `   ${stripHtmlTags(item.fields.description)}\n\n`;
                } else {
                    content += `   No description available.\n\n`;
                }
            }
            
            setExportProgress({ 
                current: isFolder ? 3 + children.length : 4, 
                total: isFolder ? 4 + children.length : 5, 
                message: 'Adding flow diagram...' 
            });
            
            // Add needflow diagram at the end
            content += `.. needflow::\n`;
            content += `   :filter: id == "${item.id}" or parent_need == "${item.id}"\n`;
            content += `   :link_types: links, related\n`;
            content += `   :show_link_names:\n`;
            content += `   :config: lefttoright\n`;
            
            return content;
        };

        try {
            const rstContent = await generateRstContent();
            
            setExportProgress({ 
                current: isFolder ? 4 + children.length : 5, 
                total: isFolder ? 4 + children.length : 5, 
                message: 'Generating file download...' 
            });
            
            // Create filename from item name or fallback to ID
            const sanitizeName = (name: string) => {
                return name.replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
            };
            
            const filename = item.fields.name 
                ? `${sanitizeName(item.fields.name)}.rst`
                : `requirement_${item.id}.rst`;
            
            const blob = new Blob([rstContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            setExportProgress({ 
                current: isFolder ? 4 + children.length : 5, 
                total: isFolder ? 4 + children.length : 5, 
                message: 'Export completed successfully!' 
            });
            
            // Clear progress after a delay
            setTimeout(() => {
                setExportLoading(false);
                setExportProgress({ current: 0, total: 0, message: '' });
            }, 2000);
            
        } catch (error) {
            console.error('Failed to generate RST content:', error);
            setError('Failed to generate RST export');
            setExportLoading(false);
            setExportProgress({ current: 0, total: 0, message: '' });
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
                        <Col xs={24} sm={24} md={6} lg={4}>
                            <Button 
                                type="default"
                                onClick={handleExportToRst}
                                loading={exportLoading}
                                icon={<DownloadOutlined />}
                                style={{ width: '100%' }}
                            >
                                Export to .rst
                            </Button>
                        </Col>
                    )}

                    <Col xs={24} sm={24} md={10} lg={12}>
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
                                <Descriptions.Item label={<><DownOutlined /> Children</>}>
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

            {/* Export Progress Display */}
            {exportLoading && (
                <Card style={{ textAlign: 'center', marginBottom: 16 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>
                        <div style={{ marginBottom: 8 }}>{exportProgress.message}</div>
                        {exportProgress.total > 0 && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
                                Progress: {exportProgress.current} / {exportProgress.total}
                            </div>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default RequirementsViewer;
