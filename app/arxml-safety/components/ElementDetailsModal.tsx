import React, { useState, useEffect } from 'react';
import { Modal, Typography, Descriptions, Tag, Spin, Alert, Button, Space, Card, theme, Flex } from 'antd';
import { InfoCircleOutlined, LinkOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { 
  getAssemblyContextForPPort, 
  getAssemblyContextForRPort, 
  getSourcePackageForModeSwitchInterface, 
  getSRInterfaceBasedConforPPort, 
  SRInterfaceConnectionInfo, 
  getSRInterfaceBasedConforRPort, 
  SRInterfaceConnectionInfoRPort,
  getPartnerPort,
  PartnerPortInfo,
  getClientServerOperation,
  ClientServerOperationRelation
} from '@/app/services/neo4j/queries/ports';
import { AssemblyContextInfo } from '@/app/services/neo4j/types';
import { getDataElementDetailsForPort, DataElementDetail } from '@/app/services/neo4j/queries/ports';
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
  const [partnerPorts, setPartnerPorts] = useState<PartnerPortInfo[]>([]);
  const [showSrInterfaces, setShowSrInterfaces] = useState(false);
  const [showClientServerOps, setShowClientServerOps] = useState(false);
  const [showCompositions, setShowCompositions] = useState(false);
  const [communicationPartners, setCommunicationPartners] = useState<Array<{
    partnerName: string;
    partnerUUID: string;
    partnerPath: string;
  }>>([]);
  const [clientServerOps, setClientServerOps] = useState<ClientServerOperationRelation[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  // Data Elements for ports
  const [dataElements, setDataElements] = useState<DataElementDetail[]>([]);
  const [isLoadingDataElements, setIsLoadingDataElements] = useState(false);
  const [dataElementsError, setDataElementsError] = useState<string | null>(null);

  // Fetch assembly context when modal opens for port elements
  useEffect(() => {
    if (!elementDetails || !isVisible || elementDetails.type !== 'port') {
      setAssemblyContext([]);
      setCommunicationPartners([]);
      setSrInterfaceConnections([]);
      setSrInterfaceConnectionsR([]);
      setPartnerPorts([]);
      setShowSrInterfaces(false);
  setShowClientServerOps(false);
      setShowCompositions(false);
  setClientServerOps([]);
      setContextError(null);
      setDataElements([]);
      setDataElementsError(null);
      return;
    }

    const fetchAssemblyContext = async () => {
      setIsLoadingContext(true);
      setContextError(null);
      
      try {
        // Fetch partner port using the new generic query
        const partnerPortResult = await getPartnerPort(elementDetails.uuid);
        if (partnerPortResult && partnerPortResult.records) {
          const partnerData = partnerPortResult.records.map(record => record.toObject() as PartnerPortInfo);
          setPartnerPorts(partnerData);
        } else {
          setPartnerPorts([]);
        }

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

        // Fetch Client-Server Operation for this port (if any)
        try {
          const csoRes = await getClientServerOperation(elementDetails.uuid);
          if (csoRes.success && csoRes.data) {
            setClientServerOps(csoRes.data);
          } else {
            setClientServerOps([]);
          }
        } catch (e) {
          console.warn('Failed to fetch Client-Server Operation:', e);
          setClientServerOps([]);
        }

        // Fetch Data Elements for this port
        setIsLoadingDataElements(true);
        setDataElementsError(null);
        try {
          const deRes = await getDataElementDetailsForPort(elementDetails.uuid);
          if (deRes.success && deRes.data) {
            setDataElements(deRes.data);
          } else {
            setDataElements([]);
            if (deRes.message) setDataElementsError(deRes.message);
          }
        } catch (e) {
          setDataElements([]);
          setDataElementsError(e instanceof Error ? e.message : 'Unknown error fetching data elements');
        } finally {
          setIsLoadingDataElements(false);
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
        setPartnerPorts([]);
        setDataElements([]);
        setDataElementsError('Failed to load');
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
  width={910}
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

        {/* Data Elements (only for ports) */}
        {elementDetails.type === 'port' && (
          <Descriptions.Item label="Data Elements">
            {isLoadingDataElements && <Spin size="small" />}
            {!isLoadingDataElements && dataElementsError && (
              <Text type="danger">{dataElementsError}</Text>
            )}
            {!isLoadingDataElements && !dataElementsError && dataElements.length === 0 && (
              <Text type="secondary">None</Text>
            )}
            {!isLoadingDataElements && !dataElementsError && dataElements.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '2px 4px' }}>Data Element Name</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '2px 4px' }}>Data Element Type</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '2px 4px' }}>Type Reference Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataElements.map((el, idx) => (
                      <tr key={`${el.dataElementName}-${idx}`}>
                        <td style={{ borderBottom: '1px solid #f0f0f0', padding: '2px 4px', whiteSpace: 'nowrap' }}>{el.dataElementName}</td>
                        <td style={{ borderBottom: '1px solid #f0f0f0', padding: '2px 4px' }}>{(el.dataElementType || []).join(', ')}</td>
                        <td style={{ borderBottom: '1px solid #f0f0f0', padding: '2px 4px' }}>{el.typeReferencesName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Descriptions.Item>
        )}

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
          
          {isLoadingContext && <Spin tip="Loading context..." />}
          {contextError && <Alert message={contextError} type="error" showIcon />}
          
          {!isLoadingContext && !contextError && (
            <>
              
              {/* Partner Port Connections */}
              {partnerPorts.length > 0 && (() => {
                const renderPortCard = (partner: PartnerPortInfo, index: number, keyPrefix: string) => (
                  <Card key={`${keyPrefix}-${index}`} size="small">
                    <Descriptions column={1} size="small" labelStyle={{ width: '120px' }}>
                      <Descriptions.Item label="Partner Port">
                        <Flex vertical align="flex-start">
                          <Text code>{partner.partnerPortName}</Text>
                          <Tag>{partner.partnerPortType}</Tag>
                        </Flex>
                      </Descriptions.Item>
                      <Descriptions.Item label="Owned by">
                        <Flex vertical align="flex-start">
                          {partner.partnerPortOwnerUUID ? (
                            <Link href={`/arxml-safety/${partner.partnerPortOwnerUUID}`} legacyBehavior>
                              <a><Tag color="purple">{partner.partnerPortOwner}</Tag></a>
                            </Link>
                          ) : (
                            <Tag color="purple">{partner.partnerPortOwner || 'N/A'}</Tag>
                          )}
                          {partner.partnerPortOwnerType && <Text type="secondary">({partner.partnerPortOwnerType.join(', ')})</Text>}
                        </Flex>
                      </Descriptions.Item>
                      {partner.failureModeName && (
                        <Descriptions.Item label="Failure Mode">
                          <Space>
                            <Tag color="red">{partner.failureModeName}</Tag>
                            {partner.failureModeASIL && (
                              <Tag color={getAsilColor(partner.failureModeASIL)}>
                                ASIL: {partner.failureModeASIL}
                              </Tag>
                            )}
                            {partner.failureModeUUID && getFailureSelectionState && handleFailureSelection && (() => {
                              const selectionState = getFailureSelectionState(partner.failureModeUUID!);
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
                                    partner.failureModeUUID!,
                                    partner.failureModeName!,
                                    partner.partnerPortType === 'P_PORT_PROTOTYPE' ? 'provider-port' : 'receiver-port',
                                    partner.partnerPortOwnerUUID,
                                    partner.partnerPortOwner
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
                );

                // Data-driven grouping based on actual component relationships
                const groupPortsByOwnerHierarchy = (ports: PartnerPortInfo[]) => {
                  // Group all ports by their owner UUID and type
                  const ownerGroups = new Map<string, {
                    owner: {
                      name: string;
                      uuid: string;
                      type: string[];
                    };
                    ports: PartnerPortInfo[];
                  }>();

                  ports.forEach(port => {
                    const ownerUUID = port.partnerPortOwnerUUID;
                    if (!ownerUUID) return;

                    if (!ownerGroups.has(ownerUUID)) {
                      ownerGroups.set(ownerUUID, {
                        owner: {
                          name: port.partnerPortOwner || 'Unknown',
                          uuid: ownerUUID,
                          type: port.partnerPortOwnerType || []
                        },
                        ports: []
                      });
                    }
                    ownerGroups.get(ownerUUID)!.ports.push(port);
                  });

                  // Separate compositions from applications and others
                  const compositions: Array<{owner: {name: string; uuid: string; type: string[]}, ports: PartnerPortInfo[]}> = [];
                  const applications: Array<{owner: {name: string; uuid: string; type: string[]}, ports: PartnerPortInfo[]}> = [];
                  const others: Array<{owner: {name: string; uuid: string; type: string[]}, ports: PartnerPortInfo[]}> = [];

                  ownerGroups.forEach((group) => {
                    if (group.owner.type.includes('COMPOSITION_SW_COMPONENT_TYPE')) {
                      compositions.push(group);
                    } else if (group.owner.type.includes('APPLICATION_SW_COMPONENT_TYPE')) {
                      applications.push(group);
                    } else {
                      others.push(group);
                    }
                  });

                  return { compositions, applications, others };
                };

                const { compositions, applications, others } = groupPortsByOwnerHierarchy(partnerPorts);

                return (
                  <Card type="inner" title="Partner Port(s)" size="small" style={{ marginTop: token.marginSM }}>
                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {/* Toggle for Compositions */}
                        {compositions.length > 0 && (
                          <div style={{ marginBottom: token.marginMD }}>
                            <Button onClick={() => setShowCompositions(!showCompositions)}>
                              {showCompositions ? 'Hide' : 'Show'} Compositions ({compositions.length})
                            </Button>
                          </div>
                        )}

                        {/* Render Composition Components and their ports */}
                        {showCompositions && compositions.map((compositionGroup, compIndex) => (
                          <div key={`comp-group-${compositionGroup.owner.uuid}`}>
                            {/* Composition header/info could go here if needed */}
                            <div style={{ marginBottom: token.marginXS }}>
                              <Text strong style={{ color: token.colorPrimary }}>
                                📦 {compositionGroup.owner.name}
                              </Text>
                              <Text type="secondary" style={{ marginLeft: token.marginXS }}>
                                ({compositionGroup.owner.type.join(', ')})
                              </Text>
                            </div>
                            
                            {/* Render all ports belonging to this composition */}
                            <div style={{ 
                              paddingLeft: token.paddingMD, 
                              borderLeft: `3px solid ${token.colorPrimary}`,
                              marginBottom: token.marginMD
                            }}>
                              <Space direction="vertical" style={{ width: '100%' }}>
                                {compositionGroup.ports.map((port, portIndex) => 
                                  renderPortCard(port, portIndex, `comp-${compositionGroup.owner.uuid}-port`)
                                )}
                              </Space>
                            </div>
                          </div>
                        ))}

                        {/* Render Application Components and their ports */}
                        {applications.map((applicationGroup, appIndex) => (
                          <div key={`app-group-${applicationGroup.owner.uuid}`}>
                            <div style={{ marginBottom: token.marginXS }}>
                              <Text strong style={{ color: token.colorWarning }}>
                                ⚙️ {applicationGroup.owner.name}
                              </Text>
                              <Text type="secondary" style={{ marginLeft: token.marginXS }}>
                                ({applicationGroup.owner.type.join(', ')})
                              </Text>
                            </div>
                            
                            <div style={{ 
                              paddingLeft: token.paddingMD, 
                              borderLeft: `3px solid ${token.colorWarning}`,
                              marginBottom: token.marginMD
                            }}>
                              <Space direction="vertical" style={{ width: '100%' }}>
                                {applicationGroup.ports.map((port, portIndex) => 
                                  renderPortCard(port, portIndex, `app-${applicationGroup.owner.uuid}-port`)
                                )}
                              </Space>
                            </div>
                          </div>
                        ))}

                        {/* Render Other Component Types */}
                        {others.map((otherGroup, otherIndex) => (
                          <div key={`other-group-${otherGroup.owner.uuid}`}>
                            <div style={{ marginBottom: token.marginXS }}>
                              <Text strong style={{ color: token.colorText }}>
                                🔧 {otherGroup.owner.name}
                              </Text>
                              <Text type="secondary" style={{ marginLeft: token.marginXS }}>
                                ({otherGroup.owner.type.join(', ')})
                              </Text>
                            </div>
                            
                            <div style={{ 
                              paddingLeft: token.paddingMD, 
                              borderLeft: `3px solid ${token.colorBorder}`,
                              marginBottom: token.marginMD
                            }}>
                              <Space direction="vertical" style={{ width: '100%' }}>
                                {otherGroup.ports.map((port, portIndex) => 
                                  renderPortCard(port, portIndex, `other-${otherGroup.owner.uuid}-port`)
                                )}
                              </Space>
                            </div>
                          </div>
                        ))}
                      </Space>
                    </div>
                  </Card>
                );
              })()}

              {/* Collapsible Card: SR Interfaces (render only when filtered lists have content) */}
              {(() => {
                const srPFiltered = srInterfaceConnections.filter(conn =>
                  Boolean(conn.SRInterfaceName || conn.swComponentClassName || conn.receiverPortName || conn.failureModeName)
                );
                const srRFiltered = srInterfaceConnectionsR.filter(conn =>
                  Boolean(conn.SRInterfaceName || conn.swComponentClassName || conn.providerPortName || conn.failureModeName)
                );
                if (srPFiltered.length === 0 && srRFiltered.length === 0) return null;
                return (
                <Card
                  size="small"
                  style={{ marginTop: token.marginMD }}
                  title={
                    <div
                      onClick={() => setShowSrInterfaces(!showSrInterfaces)}
                      style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span>📡 Shared SENDER-RECEIVER Interfaces</span>
                      <Text type="secondary">({srPFiltered.length + srRFiltered.length})</Text>
                    </div>
                  }
                  extra={
                    <span onClick={() => setShowSrInterfaces(!showSrInterfaces)} style={{ cursor: 'pointer' }}>
                      {showSrInterfaces ? <DownOutlined /> : <RightOutlined />}
                    </span>
                  }
                  bodyStyle={{ display: showSrInterfaces ? 'block' : 'none', paddingTop: token.paddingXS }}
                >
                  {/* SR Interface-based Connections for P-Ports */}
                  {srPFiltered.length > 0 && (
                    <Card
                      type="inner"
                      title={`📡 Shared SENDER_RECEIVER_INTERFACE definitions (${srPFiltered.length})`}
                      style={{ marginTop: token.marginSM }}
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {srPFiltered.map((conn, index) => (
                          <Card key={`sr-conn-${index}`} size="small">
                            <Descriptions column={1} size="small" labelStyle={{ width: '140px' }}>
                              {conn.SRInterfaceName && (
                                <Descriptions.Item label="Interface">
                                  <Tag color="purple">{conn.SRInterfaceName}</Tag>
                                </Descriptions.Item>
                              )}
                              {conn.swComponentClassName && (
                                <Descriptions.Item label="Component">
                                  {conn.swComponentClassUUID ? (
                                    <Link href={`/arxml-safety/${conn.swComponentClassUUID}`} legacyBehavior>
                                      <a>
                                        <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                          {conn.swComponentClassName}
                                        </Tag>
                                      </a>
                                    </Link>
                                  ) : (
                                    <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                      {conn.swComponentClassName}
                                    </Tag>
                                  )}
                                </Descriptions.Item>
                              )}
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
                  {srRFiltered.length > 0 && (
                    <Card
                      type="inner"
                      title={`📡 Shared SENDER_RECEIVER_INTERFACE definitions (${srRFiltered.length})`}
                      style={{ marginTop: token.marginSM }}
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {srRFiltered.map((conn, index) => (
                          <Card key={`sr-conn-r-${index}`} size="small">
                            <Descriptions column={1} size="small" labelStyle={{ width: '140px' }}>
                              {conn.SRInterfaceName && (
                                <Descriptions.Item label="Interface">
                                  <Tag color="purple">{conn.SRInterfaceName}</Tag>
                                </Descriptions.Item>
                              )}
                              {conn.swComponentClassName && (
                                <Descriptions.Item label="Component">
                                  {conn.swComponentClassUUID ? (
                                    <Link href={`/arxml-safety/${conn.swComponentClassUUID}`} legacyBehavior>
                                      <a>
                                        <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                          {conn.swComponentClassName}
                                        </Tag>
                                      </a>
                                    </Link>
                                  ) : (
                                    <Tag color={getAsilColor(conn.failureModeASIL || '') || 'cyan'}>
                                      {conn.swComponentClassName}
                                    </Tag>
                                  )}
                                </Descriptions.Item>
                              )}
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
                </Card>
              )})()}

              
              {/* Collapsible Card: Client-Server Operation for this Port (render only with meaningful data) */}
              {(() => {
                const filteredCsoRows = clientServerOps.filter(r =>
                  Boolean(r.clientServerOpUuid || r.clientServerOpName || r.partnerPortOwnerName || r.partnerPortName)
                );
                if (filteredCsoRows.length === 0) return null;
                // Compute count of unique operations from filtered rows
                const uniqueOps = new Set(filteredCsoRows.map(r => r.clientServerOpUuid || r.clientServerOpName));
                return (
                <Card
                  size="small"
                  style={{ marginTop: token.marginSM }}
                  title={
                    <div
                      onClick={() => setShowClientServerOps(!showClientServerOps)}
                      style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span>🔁 Client Server Operations</span>
                      <Text type="secondary">({uniqueOps.size})</Text>
                    </div>
                  }
                  extra={
                    <span onClick={() => setShowClientServerOps(!showClientServerOps)} style={{ cursor: 'pointer' }}>
                      {showClientServerOps ? <DownOutlined /> : <RightOutlined />}
                    </span>
                  }
                  bodyStyle={{ display: showClientServerOps ? 'block' : 'none', paddingTop: token.paddingXS }}
                >
                  {(() => {
                    // Group rows by operation UUID (fallback to name)
                    const groups = new Map<string, { name?: string; uuid?: string; partners: Array<{ ownerName?: string | null; portName?: string | null }> }>();
                    filteredCsoRows.forEach(r => {
                      const key = r.clientServerOpUuid || r.clientServerOpName;
                      if (!key) return; // skip rows with no operation id/name
                      if (!groups.has(key)) {
                        groups.set(key, { name: r.clientServerOpName || undefined, uuid: r.clientServerOpUuid || undefined, partners: [] });
                      }
                      // push partner only if at least one field present
                      if (r.partnerPortOwnerName || r.partnerPortName) {
                        groups.get(key)!.partners.push({ ownerName: r.partnerPortOwnerName, portName: r.partnerPortName });
                      }
                    });

                    return (
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {Array.from(groups.values())
                          .filter(g => Boolean(g.name || g.uuid || (g.partners && g.partners.length)))
                          .map((group, idx) => (
                          <Card key={`cso-group-${group.uuid || idx}`} size="small">
                            <Descriptions column={1} size="small" labelStyle={{ width: '160px' }}>
                              {group.name && (
                                <Descriptions.Item label="Operation">
                                  <Tag color="gold" style={{ whiteSpace: 'nowrap' }}>{group.name}</Tag>
                                </Descriptions.Item>
                              )}
                              {group.uuid && (
                                <Descriptions.Item label="UUID">
                                  <Text code>{group.uuid}</Text>
                                </Descriptions.Item>
                              )}
                            </Descriptions>
                            <div style={{ marginTop: 6 }}>
                              <Text strong>Related Partners:</Text>
                              <div style={{ marginTop: 6 }}>
                                {group.partners
                                  .filter(p => Boolean(p.ownerName || p.portName))
                                  .map((p, pi) => (
                                    <div key={`partner-${pi}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
                                      {p.ownerName && <Tag color="purple" style={{ whiteSpace: 'nowrap' }}>{p.ownerName}</Tag>}
                                      {p.ownerName && p.portName && <span>—</span>}
                                      {p.portName && <Tag style={{ whiteSpace: 'nowrap' }}>{p.portName}</Tag>}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </Space>
                    );
                  })()}
                </Card>
              )})()}

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
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ElementDetailsModal;