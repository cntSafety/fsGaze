import React, { useState, useEffect } from 'react';
import { Modal, Typography, Descriptions, Tag, Spin, Alert, Button, Space, Card } from 'antd';
import { InfoCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { getAssemblyContextForPPort, getAssemblyContextForRPort, getSourcePackageForModeSwitchInterface } from '@/app/services/neo4j/queries/ports';
import { AssemblyContextInfo } from '@/app/services/neo4j/types';
import Link from 'next/link';
import { getAsilColor } from '@/app/components/asilColors';

const { Text, Title } = Typography;

export interface ElementDetails {
  uuid: string;
  name: string;
  type: 'port' | 'failure' | 'component' | 'other';
  additionalInfo?: {
    portType?: string;
    type?: string;
    [key: string]: unknown;
  };
}

interface ElementDetailsModalProps {
  isVisible: boolean;
  onClose: () => void;
  elementDetails: ElementDetails | null;
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
}

const ElementDetailsModal: React.FC<ElementDetailsModalProps> = ({
  isVisible,
  onClose,
  elementDetails,
  getFailureSelectionState,
  handleFailureSelection,
  isCauseSelected,
}) => {
  const [assemblyContext, setAssemblyContext] = useState<AssemblyContextInfo[]>([]);
  const [communicationPartners, setCommunicationPartners] = useState<Array<{
    partnerName: string;
    partnerUUID: string;
    partnerPath: string;
  }>>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  // Fetch assembly context when modal opens for port elements
  useEffect(() => {
    if (!elementDetails || !isVisible || elementDetails.type !== 'port') {
      setAssemblyContext([]);
      setCommunicationPartners([]);
      setContextError(null);
      return;
    }

    const fetchAssemblyContext = async () => {
      setIsLoadingContext(true);
      setContextError(null);
      
      try {
        // Determine port type from additionalInfo.portType or additionalInfo.type
        const portTypeFromAdditionalInfo = elementDetails.additionalInfo?.portType || elementDetails.additionalInfo?.type;
        
        // Extract the actual Neo4j node type (P_PORT_PROTOTYPE or R_PORT_PROTOTYPE)
        // This could be in the format "PortName (P_PORT_PROTOTYPE)" or just "P_PORT_PROTOTYPE"
        let actualPortType = 'P_PORT_PROTOTYPE'; // Default to P_PORT
        
        if (portTypeFromAdditionalInfo) {
          if (portTypeFromAdditionalInfo.includes('P_PORT') || portTypeFromAdditionalInfo.includes('Provider')) {
            actualPortType = 'P_PORT_PROTOTYPE';
          } else if (portTypeFromAdditionalInfo.includes('R_PORT') || portTypeFromAdditionalInfo.includes('Receiver')) {
            actualPortType = 'R_PORT_PROTOTYPE';
          }
        }

        // console.log(`Fetching assembly context for port ${elementDetails.name} (${actualPortType})`);
        
        let result;
        if (actualPortType === 'P_PORT_PROTOTYPE') {
          result = await getAssemblyContextForPPort(elementDetails.uuid);
        } else {
          result = await getAssemblyContextForRPort(elementDetails.uuid);
        }

        if (result && result.records) {
          const contextData = result.records.map(record => record.toObject() as unknown as AssemblyContextInfo);
          setAssemblyContext(contextData);
          console.log(`Assembly context found for ${elementDetails.name}:`, contextData);
        } else {
          setAssemblyContext([]);
          // console.log(`No assembly context found for ${elementDetails.name}`);
        }

        // For R-Ports, also check for communication partners without connectors
        if (actualPortType === 'R_PORT_PROTOTYPE') {
          // console.log(`Checking for communication partners without connectors for R-Port ${elementDetails.name}`);
          const partnersResult = await getSourcePackageForModeSwitchInterface(elementDetails.uuid);
          
          if (partnersResult.success && partnersResult.data) {
            setCommunicationPartners(partnersResult.data);
            // console.log(`Communication partners found for ${elementDetails.name}:`, partnersResult.data);
          } else {
            setCommunicationPartners([]);
            // console.log(`No communication partners found for ${elementDetails.name}`);
          }
        } else {
          setCommunicationPartners([]);
        }
        
      } catch (error) {
        console.error('Error fetching assembly context:', error);
        setContextError('Failed to load assembly context information');
        setAssemblyContext([]);
        setCommunicationPartners([]);
      } finally {
        setIsLoadingContext(false);
      }
    };

    fetchAssemblyContext();
  }, [elementDetails, isVisible]);

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
        <Space>
          <InfoCircleOutlined />
          <Text>Element Details</Text>
          <Tag color={getTypeColor(elementDetails.type)}>
            {getTypeIcon(elementDetails.type)} {elementDetails.type.toUpperCase()}
          </Tag>
        </Space>
      }
      open={isVisible}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnClose
    >
      <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1px' }}>
        <Descriptions
          column={1}
          bordered
          size="small"
          styles={{
            label: { fontWeight: 'bold', width: '150px' },
            content: { wordBreak: 'break-all' }
          }}
        >
          <Descriptions.Item label="Name">
            <Text strong style={{ fontSize: '16px' }}>
              {elementDetails.name}
            </Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="UUID">
            <Text code copyable={{ text: elementDetails.uuid }}>
              {elementDetails.uuid}
            </Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Type">
            <Tag color={getTypeColor(elementDetails.type)}>
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

        {/* Assembly Context Section for Ports */}
        {elementDetails.type === 'port' && (
          <div style={{ marginTop: '24px' }}>
            <Title level={5} style={{ marginBottom: '16px' }}>
              <LinkOutlined /> Assembly Context & Connections
            </Title>
            
            {isLoadingContext ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin />
                <Text style={{ display: 'block', marginTop: '8px' }}>Loading assembly context...</Text>
              </div>
            ) : contextError ? (
              <Alert
                message="Error Loading Context"
                description={contextError}
                type="warning"
              />
            ) : assemblyContext.length > 0 || communicationPartners.length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                
                {/* Assembly Context Connections */}
                {assemblyContext.length > 0 && (
                  <Card 
                    type="inner"
                    title={`🔗 Assembly Connector Connections (${assemblyContext.length})`}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {assemblyContext.map((context, index) => ( 
                        <Card key={`assembly-${index}`} size="small">
                          <Descriptions column={1} size="small" labelStyle={{ width: '120px' }}>
                            <Descriptions.Item label="Connected to">
                              {context.swComponentClassUUID ? (
                                <Link href={`/arxml-safety/${context.swComponentClassUUID}`} legacyBehavior>
                                  <a>
                                    <Tag color={getAsilColor(context.failureModeASIL || '') || 'cyan'}>
                                      {context.swComponentName || 'Unknown Component'}
                                    </Tag>
                                  </a>
                                </Link>
                              ) : (
                                <Tag color={getAsilColor(context.failureModeASIL || '') || 'cyan'}>
                                  {context.swComponentName || 'Unknown Component'}
                                </Tag>
                              )}
                            </Descriptions.Item>
                            {context.providerPortName && (
                              <Descriptions.Item label="Provider Port">
                                <Text code>{context.providerPortName}</Text>
                              </Descriptions.Item>
                            )}
                            {context.failureModeName && (
                              <Descriptions.Item label="Failure Mode">
                                <Space>
                                  <Tag color="red">{context.failureModeName}</Tag>
                                  {context.failureModeASIL && (
                                    <Tag color={getAsilColor(context.failureModeASIL || '')}>
                                      ASIL: {context.failureModeASIL}
                                    </Tag>
                                  )}
                                  {context.failureModeUUID && getFailureSelectionState && handleFailureSelection && (() => {
                                    const selectionState = getFailureSelectionState(context.failureModeUUID);
                                    const buttonText =
                                      selectionState === 'first' ? 'Selected as Cause' :
                                      selectionState === 'second' ? 'Selected as Effect' :
                                      isCauseSelected ? 'Set as Effect' : 'Set as Cause';

                                    return (
                                      <Button
                                        icon={<LinkOutlined />}
                                        size="small"
                                        type={selectionState ? 'primary' : 'default'}
                                        onClick={() => handleFailureSelection(
                                          context.failureModeUUID!, 
                                          context.failureModeName!, 
                                          context.providerPortUUID ? 'provider-port' : 'receiver-port',
                                          context.swComponentUUID!,
                                          context.swComponentName!
                                        )}
                                      >
                                        {buttonText}
                                      </Button>
                                    );
                                  })()}
                                </Space>
                              </Descriptions.Item>
                            )}
                          </Descriptions>
                        </Card>
                      ))}
                    </Space>
                  </Card>
                )}
                
                {/* Communication Partners via Required Interface */}
                {communicationPartners.length > 0 && (
                  <Card
                    type="inner"
                    title='🌐 Relationships via "MODE_SWITCH_INTERFACE"'
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {communicationPartners.map((partner) => (
                        <Card key={partner.partnerUUID} size="small">
                          <Descriptions column={1} size="small" labelStyle={{ width: '120px' }}>
                            <Descriptions.Item label="Partner">
                              <Tag color="green">{partner.partnerName || 'Unknown Partner'}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Partner UUID">
                              <Text code>{partner.partnerUUID}</Text>
                            </Descriptions.Item>
                            {partner.partnerPath && (
                              <Descriptions.Item label="Partner Path">
                                <Text code>{partner.partnerPath}</Text>
                              </Descriptions.Item>
                            )}
                          </Descriptions>
                        </Card>
                      ))}
                    </Space>
                  </Card>
                )}
              </Space>
            ) : (
              <Alert
                message="No connections or communication partners found"
                description="This port may not be connected to other components, or it might be using a different connection pattern."
                type="info"
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ElementDetailsModal;
