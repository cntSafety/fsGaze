import React, { useState, useEffect } from 'react';
import { Modal, Typography, Descriptions, Tag, Spin, Alert, Button, Space, Card, theme, Flex } from 'antd';
import { InfoCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { getAssemblyContextForPPort, getAssemblyContextForRPort, getSourcePackageForModeSwitchInterface, getSRInterfaceBasedConforPPort, SRInterfaceConnectionInfo, getSRInterfaceBasedConforRPort, SRInterfaceConnectionInfoRPort } from '@/app/services/neo4j/queries/ports';
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
  const { token } = theme.useToken();
  const [assemblyContext, setAssemblyContext] = useState<AssemblyContextInfo[]>([]);
  const [srInterfaceConnections, setSrInterfaceConnections] = useState<SRInterfaceConnectionInfo[]>([]);
  const [srInterfaceConnectionsR, setSrInterfaceConnectionsR] = useState<SRInterfaceConnectionInfoRPort[]>([]);
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
      setSrInterfaceConnections([]);
      setSrInterfaceConnectionsR([]);
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
          
          // Also fetch SR Interface-based connections for P-Ports
          const srResult = await getSRInterfaceBasedConforPPort(elementDetails.uuid);
          if (srResult && srResult.records) {
            const srData = srResult.records.map(record => record.toObject() as SRInterfaceConnectionInfo);
            setSrInterfaceConnections(srData);
          } else {
            setSrInterfaceConnections([]);
          }

        } else {
          result = await getAssemblyContextForRPort(elementDetails.uuid);
          // Also fetch SR Interface-based connections for R-Ports
          const srResultR = await getSRInterfaceBasedConforRPort(elementDetails.uuid);
          if (srResultR && srResultR.records) {
            const srDataR = srResultR.records.map(record => record.toObject() as SRInterfaceConnectionInfoRPort);
            setSrInterfaceConnectionsR(srDataR);
          } else {
            setSrInterfaceConnectionsR([]);
          }
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
        setSrInterfaceConnections([]);
        setSrInterfaceConnectionsR([]);
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
      styles={{
        body: { 
          maxHeight: '70vh', 
          overflowY: 'auto', 
          padding: token.paddingSM 
        }
      }}
    >
      <Descriptions
        column={1}
        bordered
        size="small"
        labelStyle={{ fontWeight: 'bold', width: '150px' }}
        contentStyle={{ wordBreak: 'break-all' }}
      >
        <Descriptions.Item label="Name">
          <Text strong style={{ fontSize: token.fontSizeLG }}>
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
        <div style={{ marginTop: token.marginLG }}>
          <Title level={5} style={{ marginBottom: token.marginMD }}>
            <LinkOutlined /> Assembly & Communication Context
          </Title>
          
          {isLoadingContext ? (
            <Flex vertical align="center" justify="center" style={{ padding: token.paddingLG }}>
              <Spin />
              <Text style={{ marginTop: token.marginSM }}>Loading assembly context...</Text>
            </Flex>
          ) : contextError ? (
            <Alert
              message="Error Loading Context"
              description={contextError}
              type="warning"
            />
          ) : assemblyContext.length > 0 || communicationPartners.length > 0 || srInterfaceConnections.length > 0 || srInterfaceConnectionsR.length > 0 ? (
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
                          {context.receiverPortName && (
                            <Descriptions.Item label="Receiver Port">
                              <Text code>{context.receiverPortName}</Text>
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
              
              {/* SR Interface-based Connections for P-Ports */}
              {srInterfaceConnections.length > 0 && (
                <Card
                  type="inner"
                  title={`📡 Connections via shared SENDER_RECEIVER_INTERFACE definitions (${srInterfaceConnections.length})`}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {srInterfaceConnections.map((conn, index) => (
                      <Card key={`sr-conn-${index}`} size="small">
                        <Descriptions column={1} size="small" labelStyle={{ width: '140px' }}>
                          {conn.SRInterfaceName && (
                            <Descriptions.Item label="Interface">
                              <Tag color="purple">{conn.SRInterfaceName}</Tag>
                            </Descriptions.Item>
                          )}
                          <Descriptions.Item label="Component">
                            {conn.swComponentClassUUID ? (
                              <Link href={`/arxml-safety/${conn.swComponentClassUUID}`} legacyBehavior>
                                <a>
                                  <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                    {conn.swComponentClassName || 'Unknown Component'}
                                  </Tag>
                                </a>
                              </Link>
                            ) : (
                              <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                {conn.swComponentClassName || 'Unknown Component'}
                              </Tag>
                            )}
                          </Descriptions.Item>
                          {conn.receiverPortName && (
                            <Descriptions.Item label="Receiver Port">
                              <Text code>{conn.receiverPortName}</Text>
                            </Descriptions.Item>
                          )}
                          {conn.failureModeName && (
                            <Descriptions.Item label="Failure Mode">
                              <Space>
                                <Tag color="red">{conn.failureModeName}</Tag>
                                {conn.failureModeASIL && (
                                  <Tag color={getAsilColor(conn.failureModeASIL)}>
                                    ASIL: {conn.failureModeASIL}
                                  </Tag>
                                )}
                                {conn.failureModeUUID && getFailureSelectionState && handleFailureSelection && (() => {
                                  const selectionState = getFailureSelectionState(conn.failureModeUUID);
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
                                        conn.failureModeUUID!, 
                                        conn.failureModeName!, 
                                        'receiver-port', // SR-interface connections are to receiver ports
                                        conn.swComponentClassUUID!,
                                        conn.swComponentClassName!
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

              {/* SR Interface-based Connections for R-Ports */}
              {srInterfaceConnectionsR.length > 0 && (
                <Card
                  type="inner"
                  title={`📡 Connections via SENDER_RECEIVER_INTERFACE (${srInterfaceConnectionsR.length})`}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {srInterfaceConnectionsR.map((conn, index) => (
                      <Card key={`sr-conn-r-${index}`} size="small">
                        <Descriptions column={1} size="small" labelStyle={{ width: '140px' }}>
                          {conn.SRInterfaceName && (
                            <Descriptions.Item label="Interface">
                              <Tag color="purple">{conn.SRInterfaceName}</Tag>
                            </Descriptions.Item>
                          )}
                          <Descriptions.Item label="Component">
                            {conn.swComponentClassUUID ? (
                              <Link href={`/arxml-safety/${conn.swComponentClassUUID}`} legacyBehavior>
                                <a>
                                  <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                    {conn.swComponentClassName || 'Unknown Component'}
                                  </Tag>
                                </a>
                              </Link>
                            ) : (
                              <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                {conn.swComponentClassName || 'Unknown Component'}
                              </Tag>
                            )}
                          </Descriptions.Item>
                          {conn.providerPortName && (
                            <Descriptions.Item label="Provider Port">
                              <Text code>{conn.providerPortName}</Text>
                            </Descriptions.Item>
                          )}
                          {conn.failureModeName && (
                            <Descriptions.Item label="Failure Mode">
                              <Space>
                                <Tag color="red">{conn.failureModeName}</Tag>
                                {conn.failureModeASIL && (
                                  <Tag color={getAsilColor(conn.failureModeASIL)}>
                                    ASIL: {conn.failureModeASIL}
                                  </Tag>
                                )}
                                {conn.failureModeUUID && getFailureSelectionState && handleFailureSelection && (() => {
                                  const selectionState = getFailureSelectionState(conn.failureModeUUID);
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
                                        conn.failureModeUUID!, 
                                        conn.failureModeName!, 
                                        'provider-port',
                                        conn.swComponentClassUUID!,
                                        conn.swComponentClassName!
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
    </Modal>
  );
};

export default ElementDetailsModal;
