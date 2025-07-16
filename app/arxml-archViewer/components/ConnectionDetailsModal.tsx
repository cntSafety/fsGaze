import React from 'react';
import { Modal, Typography, Card, Space } from 'antd';
import { PortInfo } from '@/app/services/neo4j/types';
import { LinkOutlined } from '@ant-design/icons';

const { Text } = Typography;

// These interfaces are defined to match the structure of data used in this component.
// Ideally, they would be in a shared types file.
export interface SWComponent {
  uuid: string;
  name: string;
  componentType: string;
  arxmlPath: string;
}
export interface PortConnection {
    sourcePort: PortInfo;
    targetPort: PortInfo;
}

interface ConnectionDetailsModalProps {
  isVisible: boolean;
  onClose: () => void;
  connections: PortConnection[];
  sourceComponent: SWComponent | undefined;
  targetComponent: SWComponent | undefined;
}

const ConnectionDetailsModal: React.FC<ConnectionDetailsModalProps> = ({
  isVisible,
  onClose,
  connections,
  sourceComponent,
  targetComponent
}) => {
  if (!connections || connections.length === 0) {
    return null;
  }

  const title = (
    <Space>
      <LinkOutlined />
      <Text>Connections: {sourceComponent?.name || 'Unknown'} ↔ {targetComponent?.name || 'Unknown'}</Text>
    </Space>
  );

  return (
    <Modal
      title={title}
      open={isVisible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <Card style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {connections.map((conn, index) => (
            <Card key={index} size="small">
                <Text strong>{conn.sourcePort.name}</Text>
                {' ↔ '}
                <Text strong>{conn.targetPort.name}</Text>
            </Card>
          ))}
        </Space>
      </Card>
    </Modal>
  );
};

export default ConnectionDetailsModal; 