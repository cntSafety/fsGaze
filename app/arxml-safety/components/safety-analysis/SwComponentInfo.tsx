import React from 'react';
import { Card, Typography, Descriptions } from 'antd';
import { SwComponent, Failure, ProviderPort } from './types';

const { Title, Text } = Typography;

interface SwComponentInfoProps {
  swComponent: SwComponent;
  failures: Failure[];
  providerPorts: ProviderPort[];
}

export default function SwComponentInfo({ swComponent, failures, providerPorts }: SwComponentInfoProps) {
  return (
    <Card style={{ marginBottom: '24px' }}>
      <Title level={2} style={{ marginBottom: '16px' }}>
        SW Component Safety Analysis
      </Title>
      
      <Descriptions 
        bordered 
        column={1} 
        size="middle"
        styles={{ label: { fontWeight: 'bold', width: '150px' } }}
      >
        <Descriptions.Item label="Component Name">
          <Text strong style={{ fontSize: '16px' }}>{swComponent.name}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="UUID">
          <Text code>{swComponent.uuid}</Text>
        </Descriptions.Item>
        {swComponent.componentType && (
          <Descriptions.Item label="Component Type">
            <Text>{swComponent.componentType}</Text>
          </Descriptions.Item>
        )}
        {swComponent.arxmlPath && (
          <Descriptions.Item label="ARXML Path">
            <Text code style={{ fontSize: '12px' }}>{swComponent.arxmlPath}</Text>
          </Descriptions.Item>
        )}
        {swComponent.description && (
          <Descriptions.Item label="Description">
            {swComponent.description}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Total Failures">
          <Text strong>{failures.length}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Total Provider Ports">
          <Text strong>{providerPorts.length}</Text>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
