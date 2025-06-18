import React from 'react';
import { Card, Typography, Descriptions } from 'antd';
import { SwComponent, Failure, ProviderPort, PortFailure } from './types';
import SafetyNoteManager from './SafetyNoteManager';

const { Title, Text } = Typography;

interface SwComponentInfoProps {
  swComponent: SwComponent;
  failures: Failure[];
  providerPorts: ProviderPort[];
  receiverPorts?: ProviderPort[];
  portFailures?: {[portUuid: string]: PortFailure[]};
  receiverPortFailures?: {[portUuid: string]: PortFailure[]};
}

export default function SwComponentInfo({ 
  swComponent, 
  failures, 
  providerPorts, 
  receiverPorts = [], 
  portFailures = {}, 
  receiverPortFailures = {} 
}: SwComponentInfoProps) {
  // Calculate total port failures for display
  const totalProviderPortFailures = Object.values(portFailures).reduce((sum, failures) => sum + failures.length, 0);
  const totalReceiverPortFailures = Object.values(receiverPortFailures).reduce((sum, failures) => sum + failures.length, 0);
  const totalPortFailures = totalProviderPortFailures + totalReceiverPortFailures;
  
  return (
    <div>
      <Card style={{ marginBottom: '16px' }} styles={{ body: { padding: '16px' } }}>
        <Title level={3} style={{ marginBottom: '12px', marginTop: '0' }}>
          SW Component Safety Analysis
        </Title>
        
        <Descriptions 
          bordered 
          column={1} 
          size="small"
          styles={{ 
            label: { 
              fontWeight: 'bold', 
              minWidth: '180px',
              maxWidth: '300px',
              width: 'auto'
            } 
          }}
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
          <Descriptions.Item label="Total SW Failures">
            <Text strong>{failures.length}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Total Provider Ports">
            <Text strong>{providerPorts.length}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Total Receiver Ports">
            <Text strong>{receiverPorts.length}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Total Port Failure Modes">
            <Text strong>{totalPortFailures}</Text>
            <Text type="secondary" style={{ marginLeft: '8px' }}>
              (Provider: {totalProviderPortFailures}, Receiver: {totalReceiverPortFailures} Failure )
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Safety Notes">
            <SafetyNoteManager 
              nodeUuid={swComponent.uuid}
              nodeType="SW Component"
              nodeName={swComponent.name}
              showInline={true}
            />
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
