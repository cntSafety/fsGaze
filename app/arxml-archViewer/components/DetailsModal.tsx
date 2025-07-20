'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Spin, List, Typography, Alert, Card, Row, Col } from 'antd';
import { getProviderPortsForSWComponent, getReceiverPortsForSWComponent, getPartnerPort } from '@/app/services/neo4j/queries/ports';
import { PortInfo } from '@/app/services/neo4j/types';

const { Text, Paragraph } = Typography;

interface DetailsModalProps {
    componentUuid: string | null;
    componentName: string | null;
    isVisible: boolean;
    onClose: () => void;
}

interface PortWithPartnerInfo extends PortInfo {
    partnerPortName?: string;
    partnerComponentName?: string;
}

const DetailsModal: React.FC<DetailsModalProps> = ({ componentUuid, componentName, isVisible, onClose }) => {
    const [providerPorts, setProviderPorts] = useState<PortWithPartnerInfo[]>([]);
    const [receiverPorts, setReceiverPorts] = useState<PortWithPartnerInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (componentUuid && isVisible) {
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
                                const partnerPortUUID = record.get('partnerPortUUID');
                                const partnerComponentName = record.get('partnerComponentName');
                                if (partnerPortUUID) {
                                    return { 
                                        ...port, 
                                        partnerPortUUID, 
                                        partnerComponentName 
                                    };
                                }
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
    }, [componentUuid, isVisible]);

    const renderPortItem = (item: PortWithPartnerInfo) => (
        <List.Item>
            <div>
                <Text strong>{item.name}</Text>
                {item.partnerPortName && (
                    <Paragraph style={{ margin: 0, paddingLeft: 10 }}>
                        <Text type="secondary">→ {item.partnerPortName} ({item.partnerComponentName})</Text>
                    </Paragraph>
                )}
            </div>
        </List.Item>
    );

    return (
        <Modal
            title={`Port Details for ${componentName}`}
            open={isVisible}
            onCancel={onClose}
            footer={null}
            width={800}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spin size="large" />
                </div>
            ) : error ? (
                <Alert message="Error" description={error} type="error" showIcon />
            ) : (
                <Row gutter={16}>
                    <Col span={12}>
                        <Card title="Receiver Ports">
                            <List
                                dataSource={receiverPorts}
                                renderItem={renderPortItem}
                                locale={{ emptyText: 'No Receiver Ports' }}
                            />
                        </Card>
                    </Col>
                    <Col span={12}>
                        <Card title="Provider Ports">
                            <List
                                dataSource={providerPorts}
                                renderItem={renderPortItem}
                                locale={{ emptyText: 'No Provider Ports' }}
                            />
                        </Card>
                    </Col>
                </Row>
            )}
        </Modal>
    );
};

export default DetailsModal;
