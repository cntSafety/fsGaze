'use client';

import React from 'react';
import { Card, Typography, Space, Button, Tag, Alert, theme, Flex } from 'antd';
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
  const { token } = theme.useToken();

  if (!first && !second) {
    return null;
  }

  return (
    <Card 
      size="small" 
      style={{ 
        marginBottom: token.marginMD,
        backgroundColor: isCrossComponent ? token.colorSuccessBg : token.colorPrimaryBg,
        border: `1px solid ${isCrossComponent ? token.colorSuccessBorder : token.colorPrimaryBorder}`
      }}
      title={
        <Flex align="center" justify="space-between">
          <Space>
            <LinkOutlined />
            <span>
              {isCrossComponent ? 'Cross-Component Causation' : 'Causation Link'}
            </span>
            {isCrossComponent && (
              <Tag color="green">Cross-Component</Tag>
            )}
          </Space>
          <Button 
            size="small"
            type="text"
            icon={<CloseOutlined />}
            onClick={onClear}
            title="Clear selections"
          />
        </Flex>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Flex align="center" gap="large" wrap="wrap">
          <Space direction="vertical">
            <Text strong>Cause:</Text>
            {first ? (
              <div>
                <Text code style={{ color: token.colorPrimaryText }}>{first.failureName}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {first.componentName} • {first.sourceType}
                </Text>
              </div>
            ) : (
              <Text type="secondary">Click a failure to select cause</Text>
            )}
          </Space>
          
          {first && (
            <Text style={{ fontSize: token.fontSizeLG, color: token.colorSuccess }}>→</Text>
          )}
          
          <Space direction="vertical">
            <Text strong>Effect:</Text>
            {second ? (
              <div>
                <Text code style={{ color: token.colorErrorText }}>{second.failureName}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {second.componentName} • {second.sourceType}
                </Text>
              </div>
            ) : first ? (
              <Text type="secondary">Click another failure to complete</Text>
            ) : (
              <Text type="secondary">Select cause failure first</Text>
            )}
          </Space>
        </Flex>
        
        <Alert
          message={statusText}
          type={isReady ? 'success' : 'info'}
          showIcon
          style={{ marginTop: token.marginSM }}
        />
      </Space>
    </Card>
  );
};

export default CrossComponentCausationIndicator;
