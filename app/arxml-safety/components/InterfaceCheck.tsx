'use client';

import React, { useState } from 'react';
import { Button, Card, Typography, Alert, Spin, Table, Tag, Space, Divider } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { getAssemblyContextForPPort, getAssemblyContextForRPort } from '@/app/services/neo4j/queries/ports';
import { AssemblyContextInfo } from '@/app/services/neo4j/types';

const { Title, Text } = Typography;

interface InterfaceCheckProps {
  swComponentUuid: string;
  swComponentName?: string;
  providerPorts: Array<{
    uuid: string;
    name: string;
    type: string;
  }>;
  receiverPorts: Array<{
    uuid: string;
    name: string;
    type: string;
  }>;
  // Add the failure data as separate props
  portFailures: {[portUuid: string]: Array<{
    failureUuid: string;
    failureName: string | null;
    failureDescription: string | null;
    asil: string | null;
    failureType?: string | null;
    relationshipType?: string;
  }>};
  receiverPortFailures: {[portUuid: string]: Array<{
    failureUuid: string;
    failureName: string | null;
    failureDescription: string | null;
    asil: string | null;
    failureType?: string | null;
    relationshipType?: string;
  }>};
}

interface InterfaceCheckResult {
  portName: string;
  portType: 'Provider' | 'Receiver';
  portUuid: string;
  localFailures: Array<{
    name: string;
    asil: string;
    uuid: string;
  }>;
  connectedFailures: Array<{
    name: string;
    asil: string;
    uuid: string;
    connectedComponentName: string;
    connectedPortName: string;
  }>;
  asilMismatches: Array<{
    localFailure: string;
    localAsil: string;
    connectedFailure: string;
    connectedAsil: string;
    connectedComponent: string;
    severity: 'critical' | 'warning' | 'info';
  }>;
}

const InterfaceCheck: React.FC<InterfaceCheckProps> = ({
  swComponentUuid,
  swComponentName,
  providerPorts,
  receiverPorts,
  portFailures,
  receiverPortFailures
}) => {
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<InterfaceCheckResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // ASIL level comparison logic
  const getAsilLevel = (asil: string): number => {
    switch (asil?.toUpperCase()) {
      case 'D': return 4;
      case 'C': return 3;
      case 'B': return 2;
      case 'A': return 1;
      case 'QM': return 0;
      default: return -1; // TBC or unknown
    }
  };

  const compareAsil = (localAsil: string, connectedAsil: string): 'critical' | 'warning' | 'info' => {
    const localLevel = getAsilLevel(localAsil);
    const connectedLevel = getAsilLevel(connectedAsil);
    
    if (localLevel === -1 || connectedLevel === -1) {
      return 'warning'; // TBC or unknown ASIL
    }
    
    const difference = Math.abs(localLevel - connectedLevel);
    
    if (difference >= 2) {
      return 'critical'; // Major ASIL mismatch
    } else if (difference === 1) {
      return 'warning'; // Minor ASIL mismatch
    } else {
      return 'info'; // ASIL match
    }
  };

  const getAsilColor = (asil: string) => {
    switch (asil?.toUpperCase()) {
      case 'D': return 'red';
      case 'C': return 'orange';
      case 'B': return 'gold';
      case 'A': return 'green';
      case 'QM': return 'blue';
      case 'TBC': return 'purple';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'warning': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      case 'info': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    }
  };

  const handleInterfaceCheck = async () => {
    setChecking(true);
    setCheckResults([]);
    
    try {
      const results: InterfaceCheckResult[] = [];
      
      // Check Provider Ports
      for (const port of providerPorts) {
        const portFailureData = portFailures[port.uuid] || [];
        if (portFailureData.length === 0) continue;
        
        try {
          const assemblyResult = await getAssemblyContextForPPort(port.uuid);
          const assemblyContexts = assemblyResult?.records?.map(record => 
            record.toObject() as unknown as AssemblyContextInfo
          ) || [];
          
          const localFailures = portFailureData.map(f => ({
            name: f.failureName || 'Unknown',
            asil: f.asil || 'TBC',
            uuid: f.failureUuid
          }));
          
          const connectedFailures = assemblyContexts
            .filter(ctx => ctx.failureModeName && ctx.failureModeASIL)
            .map(ctx => ({
              name: ctx.failureModeName!,
              asil: ctx.failureModeASIL!,
              uuid: ctx.failureModeUUID || '',
              connectedComponentName: ctx.swComponentName || 'Unknown',
              connectedPortName: ctx.providerPortName || 'Unknown'
            }));
          
          // Compare ASIL levels
          const asilMismatches: InterfaceCheckResult['asilMismatches'] = [];
          
          for (const localFailure of localFailures) {
            for (const connectedFailure of connectedFailures) {
              const severity = compareAsil(localFailure.asil || 'TBC', connectedFailure.asil);
              asilMismatches.push({
                localFailure: localFailure.name,
                localAsil: localFailure.asil || 'TBC',
                connectedFailure: connectedFailure.name,
                connectedAsil: connectedFailure.asil,
                connectedComponent: connectedFailure.connectedComponentName,
                severity
              });
            }
          }
          
          results.push({
            portName: port.name,
            portType: 'Provider',
            portUuid: port.uuid,
            localFailures,
            connectedFailures,
            asilMismatches
          });
          
        } catch (error) {
          console.error(`Error checking provider port ${port.name}:`, error);
        }
      }
      
      // Check Receiver Ports
      for (const port of receiverPorts) {
        const portFailureData = receiverPortFailures[port.uuid] || [];
        if (portFailureData.length === 0) continue;
        
        try {
          const assemblyResult = await getAssemblyContextForRPort(port.uuid);
          const assemblyContexts = assemblyResult?.records?.map(record => 
            record.toObject() as unknown as AssemblyContextInfo
          ) || [];
          
          const localFailures = portFailureData.map(f => ({
            name: f.failureName || 'Unknown',
            asil: f.asil || 'TBC',
            uuid: f.failureUuid
          }));
          
          const connectedFailures = assemblyContexts
            .filter(ctx => ctx.failureModeName && ctx.failureModeASIL)
            .map(ctx => ({
              name: ctx.failureModeName!,
              asil: ctx.failureModeASIL!,
              uuid: ctx.failureModeUUID || '',
              connectedComponentName: ctx.swComponentName || 'Unknown',
              connectedPortName: ctx.providerPortName || 'Unknown'
            }));
          
          // Compare ASIL levels
          const asilMismatches: InterfaceCheckResult['asilMismatches'] = [];
          
          for (const localFailure of localFailures) {
            for (const connectedFailure of connectedFailures) {
              const severity = compareAsil(localFailure.asil || 'TBC', connectedFailure.asil);
              asilMismatches.push({
                localFailure: localFailure.name,
                localAsil: localFailure.asil || 'TBC',
                connectedFailure: connectedFailure.name,
                connectedAsil: connectedFailure.asil,
                connectedComponent: connectedFailure.connectedComponentName,
                severity
              });
            }
          }
          
          results.push({
            portName: port.name,
            portType: 'Receiver',
            portUuid: port.uuid,
            localFailures,
            connectedFailures,
            asilMismatches
          });
          
        } catch (error) {
          console.error(`Error checking receiver port ${port.name}:`, error);
        }
      }
      
      setCheckResults(results);
      setShowResults(true);
      
    } catch (error) {
      console.error('Error during interface check:', error);
    } finally {
      setChecking(false);
    }
  };

  const renderSummary = () => {
    const totalMismatches = checkResults.reduce((acc, result) => acc + result.asilMismatches.length, 0);
    const criticalMismatches = checkResults.reduce((acc, result) => 
      acc + result.asilMismatches.filter(m => m.severity === 'critical').length, 0
    );
    const warningMismatches = checkResults.reduce((acc, result) => 
      acc + result.asilMismatches.filter(m => m.severity === 'warning').length, 0
    );
    
    return (
      <Card size="small" style={{ marginBottom: '16px' }}>
        <Title level={5}>Interface Check Summary</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Total Ports Checked: </Text>
            <Text>{checkResults.length}</Text>
          </div>
          <div>
            <Text strong>Total ASIL Comparisons: </Text>
            <Text>{totalMismatches}</Text>
          </div>
          {criticalMismatches > 0 && (
            <Alert
              message={`${criticalMismatches} Critical ASIL Mismatch${criticalMismatches > 1 ? 'es' : ''}`}
              type="error"
              showIcon
            />
          )}
          {warningMismatches > 0 && (
            <Alert
              message={`${warningMismatches} ASIL Mismatch${warningMismatches > 1 ? 'es' : ''}`}
              type="warning"
              showIcon
            />
          )}
          {criticalMismatches === 0 && warningMismatches === 0 && totalMismatches > 0 && (
            <Alert
              message="All ASIL levels are compatible"
              type="success"
              showIcon
            />
          )}
        </Space>
      </Card>
    );
  };

  // Simple port overview table data
  const getPortOverviewData = () => {
    const data: Array<{
      key: string;
      portName: string;
      portType: 'Provider' | 'Receiver';
      portUuid: string;
      failureName: string;
      failureAsil: string;
      failureDescription: string;
      failureUuid?: string;
    }> = [];

    // Add Provider Ports
    providerPorts.forEach(port => {
      const portFailureData = portFailures[port.uuid] || [];
      if (portFailureData.length > 0) {
        portFailureData.forEach((failure, index) => {
          data.push({
            key: `${port.uuid}-${index}`,
            portName: port.name,
            portType: 'Provider',
            portUuid: port.uuid,
            failureName: failure.failureName || 'Unknown',
            failureAsil: failure.asil || 'TBC',
            failureDescription: failure.failureDescription || 'No description',
            failureUuid: failure.failureUuid
          });
        });
      } else {
        data.push({
          key: port.uuid,
          portName: port.name,
          portType: 'Provider',
          portUuid: port.uuid,
          failureName: 'No failure modes',
          failureAsil: '-',
          failureDescription: '-'
        });
      }
    });

    // Add Receiver Ports
    receiverPorts.forEach(port => {
      const portFailureData = receiverPortFailures[port.uuid] || [];
      if (portFailureData.length > 0) {
        portFailureData.forEach((failure, index) => {
          data.push({
            key: `${port.uuid}-${index}`,
            portName: port.name,
            portType: 'Receiver',
            portUuid: port.uuid,
            failureName: failure.failureName || 'Unknown',
            failureAsil: failure.asil || 'TBC',
            failureDescription: failure.failureDescription || 'No description',
            failureUuid: failure.failureUuid
          });
        });
      } else {
        data.push({
          key: port.uuid,
          portName: port.name,
          portType: 'Receiver',
          portUuid: port.uuid,
          failureName: 'No failure modes',
          failureAsil: '-',
          failureDescription: '-'
        });
      }
    });

    return data;
  };

  const portOverviewColumns = [
    {
      title: 'Port Name',
      dataIndex: 'portName',
      key: 'portName',
      render: (text: string, record: any) => (
        <div>
          <Text strong>{text}</Text>
          <br />
          <Tag color={record.portType === 'Provider' ? 'blue' : 'green'}>
            {record.portType}
          </Tag>
        </div>
      )
    },
    {
      title: 'Failure Mode',
      dataIndex: 'failureName',
      key: 'failureName',
      render: (text: string) => (
        <Text style={{ color: text === 'No failure modes' ? '#999' : 'inherit' }}>
          {text}
        </Text>
      )
    },
    {
      title: 'ASIL',
      dataIndex: 'failureAsil',
      key: 'failureAsil',
      render: (asil: string) => (
        asil === '-' ? (
          <Text type="secondary">-</Text>
        ) : (
          <Tag color={getAsilColor(asil)}>
            {asil}
          </Tag>
        )
      )
    },
    {
      title: 'Description',
      dataIndex: 'failureDescription',
      key: 'failureDescription',
      ellipsis: true,
      render: (text: string) => (
        <Text style={{ color: text === '-' ? '#999' : 'inherit' }}>
          {text}
        </Text>
      )
    }
  ];

  const interfaceCheckColumns = [
    {
      title: 'Port',
      dataIndex: 'portInfo',
      key: 'portInfo',
      render: (_: any, record: InterfaceCheckResult) => (
        <div>
          <Text strong>{record.portName}</Text>
          <br />
          <Tag color={record.portType === 'Provider' ? 'blue' : 'green'}>
            {record.portType}
          </Tag>
        </div>
      )
    },
    {
      title: 'Local Failure Modes',
      dataIndex: 'localFailures',
      key: 'localFailures',
      render: (failures: InterfaceCheckResult['localFailures']) => (
        <Space direction="vertical" size="small">
          {failures.map((failure, index) => (
            <div key={index}>
              <Text>{failure.name}</Text>
              <br />
              <Tag color={getAsilColor(failure.asil)}>ASIL: {failure.asil}</Tag>
            </div>
          ))}
        </Space>
      )
    },
    {
      title: 'Connected Failure Modes',
      dataIndex: 'connectedFailures',
      key: 'connectedFailures',
      render: (failures: InterfaceCheckResult['connectedFailures']) => (
        <Space direction="vertical" size="small">
          {failures.map((failure, index) => (
            <div key={index}>
              <Text>{failure.name}</Text>
              <br />
              <Tag color={getAsilColor(failure.asil)}>ASIL: {failure.asil}</Tag>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {failure.connectedComponentName}
              </Text>
            </div>
          ))}
          {failures.length === 0 && (
            <Text type="secondary">No connected failure modes</Text>
          )}
        </Space>
      )
    },
    {
      title: 'ASIL Compatibility',
      dataIndex: 'asilMismatches',
      key: 'asilMismatches',
      render: (mismatches: InterfaceCheckResult['asilMismatches']) => (
        <Space direction="vertical" size="small">
          {mismatches.map((mismatch, index) => (
            <div key={index} style={{ 
              padding: '8px', 
              borderRadius: '4px',
              backgroundColor: mismatch.severity === 'critical' ? '#fff2f0' : 
                              mismatch.severity === 'warning' ? '#fff7e6' : '#f6ffed'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getSeverityIcon(mismatch.severity)}
                <Text style={{ fontSize: '12px' }}>
                  {mismatch.localAsil} ↔ {mismatch.connectedAsil}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: '11px' }}>
                {mismatch.connectedComponent}
              </Text>
            </div>
          ))}
          {mismatches.length === 0 && (
            <Text type="secondary">No failure modes to compare</Text>
          )}
        </Space>
      )
    }
  ];

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SearchOutlined />
          <span>Interface ASIL Compatibility Check</span>
        </div>
      }
      style={{ marginTop: '24px' }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <Text type="secondary">
            Check ASIL compatibility between local port failure modes and connected port failure modes.
            This helps identify potential safety integrity issues in the interface design.
          </Text>
        </div>

        {/* Port Overview Table */}
        <div style={{ marginTop: '16px' }}>
          <Title level={5}>Component Ports Overview</Title>
          <Table
            dataSource={getPortOverviewData()}
            columns={portOverviewColumns}
            rowKey="key"
            pagination={false}
            size="small"
            bordered
            style={{ marginBottom: '16px' }}
          />
        </div>
        
        <Divider />
        
        <div style={{ textAlign: 'center', margin: '16px 0' }}>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleInterfaceCheck}
            loading={checking}
            disabled={checking || (providerPorts.length === 0 && receiverPorts.length === 0)}
          >
            {checking ? 'Checking Interfaces...' : 'Check Interface ASIL Compatibility'}
          </Button>
        </div>

        {checking && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>
              <Text type="secondary">Analyzing port connections and failure mode ASIL levels...</Text>
            </div>
          </div>
        )}

        {showResults && !checking && (
          <>
            <Divider />
            {renderSummary()}
            
            {checkResults.length > 0 ? (
              <Table
                dataSource={checkResults}
                columns={interfaceCheckColumns}
                rowKey="portUuid"
                pagination={false}
                size="small"
                bordered
              />
            ) : (
              <Alert
                message="No Results"
                description="No ports with failure modes were found to check."
                type="info"
                showIcon
              />
            )}
          </>
        )}
      </Space>
    </Card>
  );
};

export default InterfaceCheck;
