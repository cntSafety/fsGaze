'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Typography, Descriptions, Tag, Spin, Alert, Card } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { getAssemblyContextForPPort, getAssemblyContextForRPort } from '@/app/services/neo4j/queries/ports';
import { AssemblyContextInfo } from '@/app/services/neo4j/types';

const { Text, Title } = Typography;

interface PortInfo {
    port: {
        uuid: string;
        name: string;
    };
    type: 'provider' | 'receiver';
}

interface PortConnectionDetailsModalProps {
  isVisible: boolean;
  onClose: () => void;
  portInfo: PortInfo | null;
}

const PortConnectionDetailsModal: React.FC<PortConnectionDetailsModalProps> = ({
  isVisible,
  onClose,
  portInfo,
}) => {
  const [assemblyContext, setAssemblyContext] = useState<AssemblyContextInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!portInfo || !isVisible) {
      setAssemblyContext([]);
      setError(null);
      return;
    }

    const fetchAssemblyContext = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const { port, type } = portInfo;
        const result = type === 'provider'
          ? await getAssemblyContextForPPort(port.uuid)
          : await getAssemblyContextForRPort(port.uuid);

        if (result && result.records) {
          const contextData = result.records.map(record => record.toObject() as unknown as AssemblyContextInfo);
          setAssemblyContext(contextData);
        } else {
          setAssemblyContext([]);
        }
      } catch (err) {
        console.error('Error fetching port assembly context:', err);
        setError('Failed to load connection details for the port.');
        setAssemblyContext([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssemblyContext();
  }, [portInfo, isVisible]);
  
  return (
    <Modal
      title={
        <Title level={4} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <LinkOutlined /> Port Connection Details
        </Title>
      }
      open={isVisible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      {portInfo && (
        <Descriptions column={1} bordered size="small" style={{ marginBottom: '24px', marginTop: '16px' }}>
          <Descriptions.Item label="Port Name">
            <Text strong>{portInfo.port.name}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Port Type">
            <Tag color={portInfo.type === 'provider' ? 'blue' : 'green'}>
              {portInfo.type.toUpperCase()}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Port UUID">
            <Text code copyable={{ text: portInfo.port.uuid }}>{portInfo.port.uuid}</Text>
          </Descriptions.Item>
        </Descriptions>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}><Spin /></div>
      ) : error ? (
        <Alert message="Error" description={error} type="error" showIcon />
      ) : assemblyContext.length > 0 ? (
        <div>
          <Title level={5}>Connected To:</Title>
          {assemblyContext.map((context, index) => (
            <Card key={index} size="small" style={{ marginBottom: '12px' }}>
              <Descriptions column={1} size="small" layout="horizontal">
                <Descriptions.Item label="Component">
                  <Tag color="cyan">{context.swComponentName}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Component Type">
                  <Text>{context.swComponentType}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Via Connector">
                  <Text>{context.assemblySWConnectorName}</Text>
                </Descriptions.Item>
                {context.providerPortName && (
                  <Descriptions.Item label="Partner Port">
                    <Text>{context.providerPortName}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          ))}
        </div>
      ) : (
        <Alert message="No connections found for this port via standard assembly connectors." type="info" showIcon />
      )}
    </Modal>
  );
};

export default PortConnectionDetailsModal; 