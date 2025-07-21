'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Spin, List, Typography, Alert, Card, Row, Col, Tag, Divider } from 'antd';
import { getProviderPortsForSWComponent, getReceiverPortsForSWComponent, getPartnerPort } from '@/app/services/neo4j/queries/ports';
import { PortInfo } from '@/app/services/neo4j/types';
import { getAsilColor } from '@/app/components/asilColors';

const { Text, Paragraph, Title } = Typography;

interface DetailsModalProps {
    componentUuid: string | null;
    componentName: string | null;
    connectionInfo: {
        sourcePort: PortInfo;
        targetPort: PortInfo;
        sourceComponent: string;
        targetComponent: string;
    } | null;
    isVisible: boolean;
    onClose: () => void;
}

interface PortWithPartnerInfo extends PortInfo {
    partnerPortName?: string;
    partnerComponentName?: string;
    failureModeName?: string;
    failureModeASIL?: string;
}

const DetailsModal: React.FC<DetailsModalProps> = ({ 
    componentUuid, 
    componentName, 
    connectionInfo, 
    isVisible, 
    onClose 
}) => {
    const [providerPorts, setProviderPorts] = useState<PortWithPartnerInfo[]>([]);
    const [receiverPorts, setReceiverPorts] = useState<PortWithPartnerInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if ((componentUuid || connectionInfo) && isVisible) {
            if (connectionInfo) {
                // Handle connection details - no need to fetch, we already have the info
                setLoading(false);
                setError(null);
                setProviderPorts([]);
                setReceiverPorts([]);
            } else if (componentUuid) {
                // Handle component details
                const fetchPortsAndPartners = async () => {
                    setLoading(true);
                    setError(null);
                    try {
                        const [providerResult, receiverResult] = await Promise.all([
                            getProviderPortsForSWComponent(componentUuid),
                            getReceiverPortsForSWComponent(componentUuid)
                        ]);

                        const processPorts = async (portResult: { success: boolean; data?: PortInfo[]; message?: string }): Promise<PortWithPartnerInfo[]> => {
                            if (!portResult.success || !portResult.data) {
                                setError(prev => (prev ? `${prev}\n` : '') + (portResult.message || 'Failed to fetch ports.'));
                                return [];
                            }

                            return Promise.all(portResult.data.map(async (port) => {
                                const partnerResult = await getPartnerPort(port.uuid) as any;
                                if (partnerResult.records && partnerResult.records.length > 0) {
                                    const record = partnerResult.records[0];
                                    const partnerPortName = record.get('partnerPortName');
                                    const partnerPortOwner = record.get('partnerPortOwner');
                                    const failureModeName = record.get('failureModeName');
                                    const failureModeASIL = record.get('failureModeASIL');
                                    
                                    return { 
                                        ...port, 
                                        partnerPortName, 
                                        partnerComponentName: partnerPortOwner,
                                        failureModeName,
                                        failureModeASIL
                                    };
                                }
                                return port;
                            }));
                        };

                        setProviderPorts(await processPorts(providerResult));
                        setReceiverPorts(await processPorts(receiverResult));

                    } catch (err) {
                        setError('An error occurred while fetching port details.');
                        console.error(err);
                    } finally {
                        setLoading(false);
                    }
                };
                fetchPortsAndPartners();
            }
        }
    }, [componentUuid, connectionInfo, isVisible]);

    const renderASILTag = (asil: string | undefined) => {
        if (!asil || asil === 'N/A') return null;
        return (
            <Tag color={getAsilColor(asil)} style={{ marginLeft: 8 }}>
                ASIL {asil}
            </Tag>
        );
    };

    const renderPortItem = (item: PortWithPartnerInfo) => (
        <List.Item>
            <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>{item.name}</Text>
                    {item.failureModeASIL && renderASILTag(item.failureModeASIL)}
                </div>
                {item.partnerPortName && (
                    <Paragraph style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                        <Text type="secondary">→ Connected to: {item.partnerPortName}</Text>
                        {item.partnerComponentName && (
                            <Text type="secondary"> ({item.partnerComponentName})</Text>
                        )}
                    </Paragraph>
                )}
                {item.failureModeName && (
                    <Paragraph style={{ margin: '2px 0 0 0', fontSize: '11px' }}>
                        <Text type="warning">⚠️ Failure Mode: {item.failureModeName}</Text>
                    </Paragraph>
                )}
            </div>
        </List.Item>
    );

    const renderConnectionDetails = () => {
        if (!connectionInfo) return null;

        const { sourcePort, targetPort, sourceComponent, targetComponent } = connectionInfo;
        
        return (
            <div>
                <Title level={4}>Connection Details</Title>
                <Card>
                    <Row gutter={16}>
                        <Col span={11}>
                            <Card 
                                title="Source (Provider)" 
                                size="small"
                                style={{ backgroundColor: '#f6ffed' }}
                            >
                                <Text strong>{sourcePort.name}</Text>
                                <br />
                                <Text type="secondary">Component: {sourceComponent}</Text>
                                <br />
                                <Text type="secondary">Type: {sourcePort.type}</Text>
                            </Card>
                        </Col>
                        <Col span={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: '20px' }}>→</Text>
                        </Col>
                        <Col span={11}>
                            <Card 
                                title="Target (Receiver)" 
                                size="small"
                                style={{ backgroundColor: '#fff1f0' }}
                            >
                                <Text strong>{targetPort.name}</Text>
                                <br />
                                <Text type="secondary">Component: {targetComponent}</Text>
                                <br />
                                <Text type="secondary">Type: {targetPort.type}</Text>
                            </Card>
                        </Col>
                    </Row>
                </Card>
            </div>
        );
    };

    const getModalTitle = () => {
        if (connectionInfo) {
            return `Connection Details`;
        }
        return `Component Details: ${componentName}`;
    };

    const getModalWidth = () => {
        return connectionInfo ? 600 : 800;
    };

    return (
        <Modal
            title={getModalTitle()}
            open={isVisible}
            onCancel={onClose}
            footer={null}
            width={getModalWidth()}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spin size="large" />
                </div>
            ) : error ? (
                <Alert message="Error" description={error} type="error" showIcon />
            ) : connectionInfo ? (
                renderConnectionDetails()
            ) : (
                <Row gutter={16}>
                    <Col span={12}>
                        <Card title={`Receiver Ports (${receiverPorts.length})`}>
                            <List
                                dataSource={receiverPorts}
                                renderItem={renderPortItem}
                                locale={{ emptyText: 'No Receiver Ports' }}
                                size="small"
                            />
                        </Card>
                    </Col>
                    <Col span={12}>
                        <Card title={`Provider Ports (${providerPorts.length})`}>
                            <List
                                dataSource={providerPorts}
                                renderItem={renderPortItem}
                                locale={{ emptyText: 'No Provider Ports' }}
                                size="small"
                            />
                        </Card>
                    </Col>
                </Row>
            )}
        </Modal>
    );
};

export default DetailsModal;
