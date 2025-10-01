import React, { useEffect, useState } from 'react';
import { Typography, Descriptions, Collapse } from 'antd';
import { SwComponent, Failure, ProviderPort, PortFailure } from './types';
import SafetyNoteManager from './SafetyNoteManager';
import { getInternalBehaviourDetails } from '@/app/services/neo4j/queries/general';

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

  // Internal behaviour details state
  const [internalBehavElements, setInternalBehavElements] = useState<Array<{ name: string; types: string[] }>>([]);
  const [internalBehavLoading, setInternalBehavLoading] = useState<boolean>(false);
  const [internalBehavError, setInternalBehavError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadInternal = async () => {
      setInternalBehavLoading(true);
      setInternalBehavError(null);
      try {
        const res = await getInternalBehaviourDetails(swComponent.uuid);
        if (!cancelled) {
          if (res.success && res.data) {
            setInternalBehavElements(res.data);
          } else {
            setInternalBehavElements([]);
            setInternalBehavError(res.message || 'No data');
          }
        }
      } catch (e) {
        if (!cancelled) {
          setInternalBehavError(e instanceof Error ? e.message : 'Unknown error');
          setInternalBehavElements([]);
        }
      } finally {
        if (!cancelled) setInternalBehavLoading(false);
      }
    };
    loadInternal();
    return () => { cancelled = true; };
  }, [swComponent.uuid]);

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
          <Descriptions.Item label="Internal Behavior Elements">
            {internalBehavLoading && <Text type="secondary">Loading...</Text>}
            {!internalBehavLoading && internalBehavError && (
              <Text type="danger">{internalBehavError}</Text>
            )}
            {!internalBehavLoading && !internalBehavError && internalBehavElements.length === 0 && (
              <Text type="secondary">None</Text>
            )}
            {!internalBehavLoading && internalBehavElements.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '2px 4px' }}>Name</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '2px 4px' }}>Type(s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {internalBehavElements.map(el => (
                      <tr key={el.name}>
                        <td style={{ borderBottom: '1px solid #f0f0f0', padding: '2px 4px' }}>{el.name}</td>
                        <td style={{ borderBottom: '1px solid #f0f0f0', padding: '2px 4px' }}>{el.types.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
