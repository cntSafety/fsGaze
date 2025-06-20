'use client';

import React from 'react';
import { Card, Typography, Space, Button, Tag, Alert } from 'antd';
import { LinkOutlined, CloseOutlined } from '@ant-design/icons';
import type { CausationSelection } from '../hooks/types/causation';

const { Text } = Typography;

interface CrossComponentCausationIndicatorProps {
  first: CausationSelection | null;
  second: CausationSelection | null;
  isCrossComponent: boolean;
  isReady: boolean;
  statusText: string;
  onClear: () => void;
}

export const CrossComponentCausationIndicator: React.FC<CrossComponentCausationIndicatorProps> = ({
  first,
  second,
  isCrossComponent,
  isReady,
  statusText,
  onClear
}) => {
  if (!first && !second) {
    return null;
  }

  return (
    <Card 
      size="small" 
      style={{ 
        marginBottom: '16px',
        backgroundColor: isCrossComponent ? '#f6ffed' : '#f0f8ff',
        border: isCrossComponent ? '1px solid #b7eb8f' : '1px solid #91caff'
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LinkOutlined />
            <span>
              {isCrossComponent ? 'Cross-Component Causation' : 'Causation Link'}
            </span>
            {isCrossComponent && (
              <Tag color="green">Cross-Component</Tag>
            )}
          </div>
          <Button 
            size="small"
            type="text"
            icon={<CloseOutlined />}
            onClick={onClear}
            title="Clear selections"
          />
        </div>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <Text strong>Cause: </Text>
            {first ? (
              <div>
                <Text code style={{ color: '#1890ff' }}>{first.failureName}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {first.componentName} • {first.sourceType}
                </Text>
              </div>
            ) : (
              <Text type="secondary">Click a failure to select cause</Text>
            )}
          </div>
          
          {first && (
            <span style={{ fontSize: '16px', color: '#52c41a' }}>→</span>
          )}
          
          <div>
            <Text strong>Effect: </Text>
            {second ? (
              <div>
                <Text code style={{ color: '#ff7875' }}>{second.failureName}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {second.componentName} • {second.sourceType}
                </Text>
              </div>
            ) : first ? (
              <Text type="secondary">Click another failure to complete</Text>
            ) : (
              <Text type="secondary">Select cause failure first</Text>
            )}
          </div>
        </div>
        
        <Alert
          message={statusText}
          type={isReady ? 'success' : 'info'}
          showIcon
          style={{ marginTop: '8px' }}
        />
      </Space>
    </Card>
  );
};

export default CrossComponentCausationIndicator;
