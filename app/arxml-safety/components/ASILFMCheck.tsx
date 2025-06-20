'use client';

import React, { useState } from 'react';
import { Button, Card, Typography, Alert, Spin, Table, Tag, Space, Divider } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';

const { Title, Text } = Typography;

interface ASILFMCheckProps {
  swComponentUuid: string;
  swComponentName?: string;
  failures: Array<{
    failureUuid: string;
    failureName: string | null;
    failureDescription: string | null;
    asil: string | null;
    relationshipType?: string;
  }>;
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

interface FailureModeInfo {
  failureUuid: string;
  failureName: string;
  asil: string;
  portName?: string;  // Optional for SW component failures
  portType: 'Provider' | 'Receiver' | 'Component';
  portUuid?: string;  // Optional for SW component failures
}

interface ASILMismatch {
  causeFailure: FailureModeInfo;
  effectFailure: FailureModeInfo;
  causationName: string;
  severity: 'critical' | 'warning' | 'info';
  asilDifference: number;
}

const ASILFMCheck: React.FC<ASILFMCheckProps> = ({
  swComponentUuid,
  swComponentName,
  failures,
  providerPorts,
  receiverPorts,
  portFailures,
  receiverPortFailures
}) => {
  const [checking, setChecking] = useState(false);
  const [failureModes, setFailureModes] = useState<FailureModeInfo[]>([]);
  const [asilMismatches, setAsilMismatches] = useState<ASILMismatch[]>([]);
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

  const compareAsil = (causeAsil: string, effectAsil: string): { severity: 'critical' | 'warning' | 'info'; difference: number } => {
    const causeLevel = getAsilLevel(causeAsil);
    const effectLevel = getAsilLevel(effectAsil);
    
    if (causeLevel === -1 || effectLevel === -1) {
      return { severity: 'warning', difference: 0 }; // TBC or unknown ASIL
    }
    
    const difference = causeLevel - effectLevel; // Positive if cause > effect, negative if cause < effect
    
    if (Math.abs(difference) >= 2) {
      return { severity: 'critical', difference }; // Major ASIL mismatch
    } else if (Math.abs(difference) === 1) {
      return { severity: 'warning', difference }; // Minor ASIL mismatch
    } else {
      return { severity: 'info', difference }; // ASIL match
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

  // Collect all failure modes immediately when component loads
  React.useEffect(() => {
    const allFailureModes: FailureModeInfo[] = [];
    
    // First, collect SW Component Failures (same logic as FMFlow)
    failures.forEach(failure => {
      if (failure.failureName && failure.failureName !== 'No failures defined') {
        allFailureModes.push({
          failureUuid: failure.failureUuid,
          failureName: failure.failureName,
          asil: failure.asil || 'TBC',
          portType: 'Component',
        });
      }
    });
    
    // Collect Provider Port Failures
    providerPorts.forEach(port => {
      const portFailureData = portFailures[port.uuid] || [];
      portFailureData.forEach(failure => {
        if (failure.failureName && failure.failureName !== 'No failures defined') {
          allFailureModes.push({
            failureUuid: failure.failureUuid,
            failureName: failure.failureName,
            asil: failure.asil || 'TBC',
            portName: port.name,
            portType: 'Provider',
            portUuid: port.uuid
          });
        }
      });
    });

    // Collect Receiver Port Failures
    receiverPorts.forEach(port => {
      const portFailureData = receiverPortFailures[port.uuid] || [];
      portFailureData.forEach(failure => {
        if (failure.failureName && failure.failureName !== 'No failures defined') {
          allFailureModes.push({
            failureUuid: failure.failureUuid,
            failureName: failure.failureName,
            asil: failure.asil || 'TBC',
            portName: port.name,
            portType: 'Receiver',
            portUuid: port.uuid
          });
        }
      });
    });

    console.log('✅ ASILFMCheck - All collected failures:', allFailureModes);
    console.log('🔍 SW Component failures received:', failures);
    console.log('🔍 Provider ports:', providerPorts);
    console.log('🔍 Port failures object:', portFailures);
    console.log('🔍 Receiver ports:', receiverPorts);
    console.log('🔍 Receiver port failures object:', receiverPortFailures);

    setFailureModes(allFailureModes);
  }, [failures, providerPorts, portFailures, receiverPorts, receiverPortFailures]);

  const handleASILFMCheck = async () => {
    setChecking(true);
    setAsilMismatches([]);
    
    try {

      // Get causation relationships from getSafetyGraph
      const safetyGraphResult = await getSafetyGraph();
      
      if (!safetyGraphResult.success || !safetyGraphResult.data?.causationLinks) {
        console.warn('Failed to get causation links:', safetyGraphResult.message);
        setShowResults(true);
        return;
      }

      const causationLinks = safetyGraphResult.data.causationLinks;
      console.log(`FMCHECK ${causationLinks.length} causation links for ASIL analysis`);

      // Create a map of failure UUID to failure mode info
      const failureUuidToInfo = new Map<string, FailureModeInfo>();
      failureModes.forEach(fm => {
        failureUuidToInfo.set(fm.failureUuid, fm);
      });

      // Analyze ASIL mismatches in causation relationships
      const mismatches: ASILMismatch[] = [];
      
      causationLinks.forEach(link => {
        const causeFailure = failureUuidToInfo.get(link.causeFailureUuid);
        const effectFailure = failureUuidToInfo.get(link.effectFailureUuid);
        
        // Only analyze causations where both failures are in our component's ports
        if (causeFailure && effectFailure) {
          const comparison = compareAsil(causeFailure.asil, effectFailure.asil);
          
          mismatches.push({
            causeFailure,
            effectFailure,
            causationName: link.causationName || 'Unnamed Causation',
            severity: comparison.severity,
            asilDifference: comparison.difference
          });
        }
      });

      setAsilMismatches(mismatches);
      setShowResults(true);
      
    } catch (error) {
      console.error('Error during ASIL-FM check:', error);
    } finally {
      setChecking(false);
    }
  };

  const renderSummary = () => {
    const totalCausations = asilMismatches.length;
    const criticalMismatches = asilMismatches.filter(m => m.severity === 'critical').length;
    const warningMismatches = asilMismatches.filter(m => m.severity === 'warning').length;
    const compatibleCausations = asilMismatches.filter(m => m.severity === 'info').length;
    
    return (
      <Card size="small" style={{ marginBottom: '16px' }}>
        <Title level={5}>ASIL-FM Check Summary</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Total Failure Modes: </Text>
            <Text>{failureModes.length}</Text>
          </div>
          <div>
            <Text strong>Total Causation Relationships: </Text>
            <Text>{totalCausations}</Text>
          </div>
          {criticalMismatches > 0 && (
            <Alert
              message={`${criticalMismatches} Critical ASIL Mismatch${criticalMismatches > 1 ? 'es' : ''}`}
              description="ASIL difference ≥ 2 levels - requires immediate attention"
              type="error"
              showIcon
            />
          )}
          {warningMismatches > 0 && (
            <Alert
              message={`${warningMismatches} ASIL Mismatch${warningMismatches > 1 ? 'es' : ''}`}
              description="ASIL difference = 1 level - review recommended"
              type="warning"
              showIcon
            />
          )}
          {compatibleCausations > 0 && (
            <Alert
              message={`${compatibleCausations} Compatible Causation${compatibleCausations > 1 ? 's' : ''}`}
              description="ASIL levels are consistent"
              type="success"
              showIcon
            />
          )}
          {totalCausations === 0 && (
            <Alert
              message="No Causation Relationships Found"
              description="No causation relationships exist between failure modes in this component"
              type="info"
              showIcon
            />
          )}
        </Space>
      </Card>
    );
  };

  // Failure modes overview table columns
  const failureModesColumns = [
    {
      title: 'Port',
      dataIndex: 'portInfo',
      key: 'portInfo',
      render: (_: any, record: FailureModeInfo) => (
        <div>
          <Text strong>{record.portName || 'SW Component'}</Text>
          <br />
          <Tag color={
            record.portType === 'Provider' ? 'blue' : 
            record.portType === 'Receiver' ? 'green' : 
            'orange'
          }>
            {record.portType}
          </Tag>
        </div>
      )
    },
    {
      title: 'Failure Mode',
      dataIndex: 'failureName',
      key: 'failureName',
      render: (text: string) => <Text>{text}</Text>
    },
    {
      title: 'ASIL',
      dataIndex: 'asil',
      key: 'asil',
      render: (asil: string) => (
        <Tag color={getAsilColor(asil)}>
          {asil}
        </Tag>
      )
    }
  ];

  // ASIL mismatch analysis table columns
  const asilMismatchColumns = [
    {
      title: 'Causation',
      dataIndex: 'causationName',
      key: 'causationName',
      render: (text: string, record: ASILMismatch) => (
        <div>
          <Text strong style={{ fontSize: '13px' }}>{text}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {record.causeFailure.failureName} → {record.effectFailure.failureName}
          </Text>
        </div>
      )
    },
    {
      title: 'Cause',
      dataIndex: 'causeFailure',
      key: 'causeFailure',
      render: (causeFailure: FailureModeInfo) => (
        <div>
          <Text style={{ fontSize: '12px' }}>{causeFailure.failureName}</Text>
          <br />
          <Tag color={getAsilColor(causeFailure.asil)}>
            ASIL: {causeFailure.asil}
          </Tag>
          <br />
          <Text type="secondary" style={{ fontSize: '10px' }}>
            {causeFailure.portName ? `${causeFailure.portName} (${causeFailure.portType})` : causeFailure.portType}
          </Text>
        </div>
      )
    },
    {
      title: 'Effect',
      dataIndex: 'effectFailure',
      key: 'effectFailure',
      render: (effectFailure: FailureModeInfo) => (
        <div>
          <Text style={{ fontSize: '12px' }}>{effectFailure.failureName}</Text>
          <br />
          <Tag color={getAsilColor(effectFailure.asil)}>
            ASIL: {effectFailure.asil}
          </Tag>
          <br />
          <Text type="secondary" style={{ fontSize: '10px' }}>
            {effectFailure.portName ? `${effectFailure.portName} (${effectFailure.portType})` : effectFailure.portType}
          </Text>
        </div>
      )
    },
    {
      title: 'ASIL Analysis',
      dataIndex: 'analysis',
      key: 'analysis',
      render: (_: any, record: ASILMismatch) => (
        <div style={{ 
          padding: '8px', 
          borderRadius: '4px',
          backgroundColor: record.severity === 'critical' ? '#fff2f0' : 
                          record.severity === 'warning' ? '#fff7e6' : '#f6ffed'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            {getSeverityIcon(record.severity)}
            <Text style={{ fontSize: '12px', fontWeight: 'bold' }}>
              {record.severity.toUpperCase()}
            </Text>
          </div>
          <Text style={{ fontSize: '11px' }}>
            Difference: {record.asilDifference > 0 ? '+' : ''}{record.asilDifference}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: '10px' }}>
            {record.asilDifference > 0 ? 'Cause > Effect' : 
             record.asilDifference < 0 ? 'Cause < Effect' : 'Equal ASIL'}
          </Text>
        </div>
      )
    }
  ];

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SearchOutlined />
          <span>ASIL-FM Consistency Check</span>
        </div>
      }
      style={{ marginTop: '24px' }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <Text type="secondary">
            Analyze ASIL consistency in failure mode causation relationships within the SW component.
            This checks if ASIL levels are appropriate in cause-effect chains.
          </Text>
        </div>

        {/* Debug Info */}
        <div style={{ marginTop: '16px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <Text strong>Debug Info:</Text>
          <div>SW Component Failures: {failures.length}</div>
          <div>Provider Ports: {providerPorts.length}</div>
          <div>Receiver Ports: {receiverPorts.length}</div>
          <div>Total Collected Failure Modes: {failureModes.length}</div>
        </div>

        {/* Failure Modes Overview Table */}
        <div style={{ marginTop: '16px' }}>
          <Title level={5}>Component Failure Modes Overview</Title>
          <Table
            dataSource={failureModes}
            columns={failureModesColumns}
            rowKey="failureUuid"
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
            onClick={handleASILFMCheck}
            loading={checking}
            disabled={checking || failureModes.length === 0}
          >
            {checking ? 'Analyzing ASIL Consistency...' : 'Perform ASIL-FM Check'}
          </Button>
        </div>

        {checking && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>
              <Text type="secondary">Analyzing ASIL consistency in failure mode causations...</Text>
            </div>
          </div>
        )}

        {showResults && !checking && (
          <>
            <Divider />
            {renderSummary()}
            
            {asilMismatches.length > 0 ? (
              <>
                <Title level={5}>ASIL Causation Analysis</Title>
                <Table
                  dataSource={asilMismatches}
                  columns={asilMismatchColumns}
                  rowKey={(record) => `${record.causeFailure.failureUuid}-${record.effectFailure.failureUuid}`}
                  pagination={false}
                  size="small"
                  bordered
                />
              </>
            ) : showResults && (
              <Alert
                message="No Causation Relationships"
                description="No causation relationships were found between failure modes in this component to analyze."
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

export default ASILFMCheck;
