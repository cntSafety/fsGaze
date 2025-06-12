import React from 'react';
import { Modal, Typography, Descriptions, Tag } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export interface ElementDetails {
  uuid: string;
  name: string;
  type: 'port' | 'failure' | 'component' | 'other';
  additionalInfo?: Record<string, any>;
}

interface ElementDetailsModalProps {
  isVisible: boolean;
  onClose: () => void;
  elementDetails: ElementDetails | null;
}

const ElementDetailsModal: React.FC<ElementDetailsModalProps> = ({
  isVisible,
  onClose,
  elementDetails,
}) => {
  if (!elementDetails) {
    return null;
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'port':
        return 'blue';
      case 'failure':
        return 'red';
      case 'component':
        return 'green';
      default:
        return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'port':
        return '🔌';
      case 'failure':
        return '⚠️';
      case 'component':
        return '🔧';
      default:
        return '📋';
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <InfoCircleOutlined />
          <span>Element Details</span>
          <Tag color={getTypeColor(elementDetails.type)}>
            {getTypeIcon(elementDetails.type)} {elementDetails.type.toUpperCase()}
          </Tag>
        </div>
      }
      open={isVisible}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnHidden
    >
      <div style={{ padding: '16px 0' }}>
        <Descriptions
          column={1}
          bordered
          size="small"
          styles={{
            label: { fontWeight: 'bold', width: '120px' },
            content: { wordBreak: 'break-all' }
          }}
        >
          <Descriptions.Item label="Name">
            <Text strong style={{ fontSize: '16px', color: '#1890ff' }}>
              {elementDetails.name}
            </Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="UUID">
            <Text code copyable={{ text: elementDetails.uuid }}>
              {elementDetails.uuid}
            </Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Type">
            <Tag color={getTypeColor(elementDetails.type)} style={{ fontSize: '14px' }}>
              {getTypeIcon(elementDetails.type)} {elementDetails.type.charAt(0).toUpperCase() + elementDetails.type.slice(1)}
            </Tag>
          </Descriptions.Item>

          {/* Additional information if available */}
          {elementDetails.additionalInfo && Object.keys(elementDetails.additionalInfo).length > 0 && (
            <>
              {Object.entries(elementDetails.additionalInfo).map(([key, value]) => (
                <Descriptions.Item key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}>
                  {typeof value === 'string' ? (
                    <Text>{value}</Text>
                  ) : (
                    <Text code>{JSON.stringify(value)}</Text>
                  )}
                </Descriptions.Item>
              ))}
            </>
          )}
        </Descriptions>

        {/* Future enhancement placeholder */}
        <div style={{ 
          marginTop: '24px', 
          padding: '12px', 
          backgroundColor: '#f6f8fa', 
          borderRadius: '6px',
          border: '1px solid #e1e4e8'
        }}>
          <Text type="secondary" style={{ fontStyle: 'italic' }}>
            💡 Additional details and relationships will be displayed here in future updates
          </Text>
        </div>
      </div>
    </Modal>
  );
};

export default ElementDetailsModal;
