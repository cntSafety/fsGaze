import React, { useState, useEffect } from 'react';
import { Modal, Typography, Descriptions, Tag, Spin, Alert } from 'antd';
import { InfoCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { getAssemblyContextForPPort, getAssemblyContextForRPort, getSourcePackageForModeSwitchInterface } from '@/app/services/neo4j/queries/ports';
import { AssemblyContextInfo } from '@/app/services/neo4j/types';

const { Text } = Typography;

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
}

const ElementDetailsModal: React.FC<ElementDetailsModalProps> = ({
  isVisible,
  onClose,
  elementDetails,
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

        </div>

        {/* Assembly Context Section for Ports */}
        {elementDetails.type === 'port' && (
          <div style={{ marginTop: '24px' }}>
            <Typography.Title level={5} style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LinkOutlined style={{ color: '#1890ff' }} />
              Assembly Context & Connections
            </Typography.Title>
            
            {isLoadingContext ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin size="small" />
                <Text style={{ marginLeft: '8px', color: '#666' }}>Loading assembly context...</Text>
              </div>
            ) : contextError ? (
              <Alert
                message="Error Loading Context"
                description={contextError}
                type="warning"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            ) : assemblyContext.length > 0 || communicationPartners.length > 0 ? (
              <div style={{ 
                padding: '16px', 
                backgroundColor: '#f0f8ff', 
                borderRadius: '8px',
                border: '1px solid #91d5ff'
              }}>
                
                {/* Assembly Context Connections */}
                {assemblyContext.length > 0 && (
                  <>
                    <Text strong style={{ color: '#1890ff', fontSize: '14px', marginBottom: '12px', display: 'block' }}>
                      🔗 Assembly Connector Connections ({assemblyContext.length}):
                    </Text>
                      {assemblyContext.map((context, index) => (
                      <div key={`assembly-${index}`} style={{ 
                        marginBottom: '16px',
                        padding: '12px',
                        backgroundColor: '#fff',
                        borderRadius: '6px',
                        border: '1px solid #d9d9d9'
                      }}>                        <div style={{ marginBottom: '8px' }}>
                          <Text strong style={{ color: '#1890ff' }}>
                            Connected to: 
                          </Text>
                          <Tag color="cyan" style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 'bold' }}>
                            {context.swComponentName || 'Unknown Component'}
                          </Tag>
                        </div>
                        
                        {/* Provider Port Information */}
                        {context.providerPortName && (
                          <div style={{ marginBottom: '6px', fontSize: '12px', color: '#666' }}>
                            <Text type="secondary">
                              <strong>Provider Port:</strong> <Text code style={{ color: '#52c41a' }}>{context.providerPortName}</Text>
                            </Text>
                          </div>
                        )}
                          {/* Failure Mode Information */}
                        {context.failureModeName && (
                          <div style={{ marginBottom: '6px' }}>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              <strong>Failure Mode:</strong> 
                            </Text>
                            <div style={{ marginLeft: '12px', marginTop: '4px' }}>
                              <Tag color="red" style={{ fontSize: '11px' }}>
                                {context.failureModeName}
                              </Tag>
                              {context.failureModeASIL && (
                                <Tag color="orange" style={{ fontSize: '11px', marginLeft: '4px' }}>
                                  ASIL: {context.failureModeASIL}
                                </Tag>
                              )}
                            </div>                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
                
                {/* Communication Partners via Required Interface */}
                {communicationPartners.length > 0 && (
                  <>
                    <Text strong style={{ color: '#595959', fontSize: '14px', marginBottom: '12px', display: 'block' }}>
                      🌐 Relationships based on required interface is of type &quot;MODE_SWITCH_INTERFACE&quot; 
                    </Text>
                    
                    {communicationPartners.map((partner, index) => (
                      <div key={`partner-${index}`} style={{ 
                        marginBottom: index < communicationPartners.length - 1 ? '16px' : '0',
                        padding: '12px',
                        backgroundColor: '#f6ffed',
                        borderRadius: '6px',
                        border: '1px solid #b7eb8f'
                      }}>
                        <div style={{ marginBottom: '8px' }}>
                          <Text strong style={{ color: '#52c41a' }}>
                            Partner: 
                          </Text>
                          <Tag color="green" style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 'bold' }}>
                            {partner.partnerName || 'Unknown Partner'}
                          </Tag>
                        </div>
                        
                        <div style={{ marginBottom: '6px', fontSize: '12px', color: '#666' }}>
                          <Text type="secondary">
                            <strong>Partner UUID:</strong> <Text code style={{ fontSize: '11px' }}>{partner.partnerUUID}</Text>
                          </Text>
                        </div>
                        
                        {partner.partnerPath && (
                          <div style={{ fontSize: '11px', color: '#999' }}>
                            <Text type="secondary">
                              <strong>Partner Path:</strong> <Text code style={{ fontSize: '10px' }}>{partner.partnerPath}</Text>
                            </Text>
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
                
                <div style={{ 
                  marginTop: '12px', 
                  padding: '8px', 
                  backgroundColor: '#f6f8fa', 
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#666'
                }}>
                </div>
              </div>
            ) : (
              <div style={{ 
                padding: '16px', 
                backgroundColor: '#fff7e6', 
                borderRadius: '8px',
                border: '1px solid #ffd591',
                textAlign: 'center'
              }}>
                <Text style={{ color: '#d46b08', fontSize: '14px' }}>
                  🔍 No connections or communication partners found
                </Text>
                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                  <Text type="secondary">
                    This port may not be connected to other components, or it might be using a different connection pattern.
                  </Text>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ElementDetailsModal;
