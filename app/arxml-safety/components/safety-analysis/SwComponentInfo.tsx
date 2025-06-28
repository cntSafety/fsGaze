import React from 'react';
import { Typography, Descriptions, Collapse } from 'antd';
import { SwComponent, Failure, ProviderPort, PortFailure } from './types';
import SafetyNoteManager from './SafetyNoteManager';

const { Title, Text } = Typography;

interface SwComponentInfoProps {
  swComponent: SwComponent;
  failures: Failure[];
  providerPorts: ProviderPort[];
  receiverPorts?: ProviderPort[];
  portFailures?: {[portUuid:string]: PortFailure[]};
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

  const items = [
    {
      key: '1',
      label: (
        <Title level={4} style={{ margin: 0 }}>
          SW Component: {swComponent.name}
        </Title>
      ),
      children: (
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
      )
    }
  ];
  
  return (
    <Collapse 
      bordered={true} 
      defaultActiveKey={[]}
      style={{ marginBottom: '16px' }}
      items={items}
    />
  );
}
