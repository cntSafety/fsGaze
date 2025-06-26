'use client';

import React, { useState } from 'react';
import { Button, Card, Typography, Alert, Spin, Table, Tag, Space, Divider } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import { getAsilColor } from '@/app/components/asilColors';

const { Title, Text } = Typography;

interface FailureModeInfo {
  uuid: string;
  name: string;
  asil: string;
  component: string;
  port: string;
}

interface ASILMismatch {
  port: string;
  component: string;
  failureMode: string;
  requiredAsil: string;
  actualAsil: string;
  severity: 'critical' | 'warning' | 'info';
}

interface ASILFMCheckProps {
  // No props needed for this version
}

const ASILFMCheck: React.FC<ASILFMCheckProps> = () => {
  const [loading, setLoading] = useState(false);
  const [failureModes, setFailureModes] = useState<FailureModeInfo[]>([]);
  const [asilMismatches, setAsilMismatches] = useState<ASILMismatch[]>([]);
  const [showResults, setShowResults] = useState(false);

  // ASIL level comparison logic
  const asilLevels: { [key: string]: number } = {
    'QM': 0,
    'A': 1,
    'B': 2,
    'C': 3,
    'D': 4,
    'TBC': -1, // To Be Confirmed
  };

  const getSeverity = (required: string, actual: string): 'critical' | 'warning' | 'info' => {
    const requiredLevel = asilLevels[required] ?? -2;
    const actualLevel = asilLevels[actual] ?? -2;

    if (requiredLevel === -1 || actualLevel === -2) {
      return 'info'; // TBC or unranked ASILs are informational
    }
    if (actualLevel < requiredLevel) {
      return 'critical'; // Lower than required is critical
    }
    return 'warning'; // Higher or equal is a warning (over-engineering)
  };

  const getSeverityIcon = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical':
        return <CloseCircleOutlined style={{ color: 'red' }} />;
      case 'warning':
        return <ExclamationCircleOutlined style={{ color: 'orange' }} />;
      case 'info':
        return <CheckCircleOutlined style={{ color: 'blue' }} />;
      default:
        return null;
    }
  };

  // Collect all failure modes immediately when component loads
  React.useEffect(() => {
    const allFailureModes: FailureModeInfo[] = [];
    
    // This logic is a placeholder. A proper implementation would fetch this from a service.
    // For now, it's empty, and the check button will trigger the fetch and analysis.
    setFailureModes(allFailureModes);
  }, []);

  const handleCheckASILs = async () => {
    setLoading(true);
    setShowResults(false);
    
    try {
      const result = await getSafetyGraph(); // Assuming this fetches the required data
      if (result.success && result.data) {
        const mismatches: ASILMismatch[] = [];
        // The logic to find mismatches would be implemented here,
        // comparing failure modes' ASILs against component/port requirements.
        // This is a complex task dependent on the data model.
        
        // Example placeholder logic:
        // result.data.failures.forEach(fm => {
        //   if (fm.properties.asil !== 'D') { // Mock condition
        //     mismatches.push({
        //       port: 'ExamplePort',
        //       component: 'ExampleComponent',
        //       failureMode: fm.properties.name,
        //       requiredAsil: 'D',
        //       actualAsil: fm.properties.asil,
        //       severity: getSeverity('D', fm.properties.asil),
        //     });
        //   }
        // });
        
        setAsilMismatches(mismatches);
      }
    } catch (error) {
      console.error('Error checking ASILs:', error);
    } finally {
      setLoading(false);
      setShowResults(true);
    }
  };

  // Columns for the results table
  const columns = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: 'critical' | 'warning' | 'info') => getSeverityIcon(severity),
    },
    {
      title: 'Component',
      dataIndex: 'component',
      key: 'component',
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
    },
    {
      title: 'Failure Mode',
      dataIndex: 'failureMode',
      key: 'failureMode',
    },
    {
      title: 'Required ASIL',
      dataIndex: 'requiredAsil',
      key: 'requiredAsil',
      render: (asil: string) => <Tag color={getAsilColor(asil)}>{asil}</Tag>,
    },
    {
      title: 'Actual ASIL',
      dataIndex: 'actualAsil',
      key: 'actualAsil',
      render: (asil: string) => <Tag color={getAsilColor(asil)}>{asil}</Tag>,
    },
  ];

  return (
    <Card
      title={<Title level={4}>ASIL Mismatch Check</Title>}
      extra={
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleCheckASILs}
          loading={loading}
        >
          Check for ASIL Mismatches
        </Button>
      }
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" />
          <p>Analyzing ASIL levels...</p>
        </div>
      )}

      {showResults && !loading && (
        <>
          {asilMismatches.length === 0 ? (
            <Alert
              message="No ASIL mismatches found"
              description="All failure modes meet their required ASIL levels."
              type="success"
              showIcon
            />
          ) : (
            <>
              <Alert
                message={`${asilMismatches.length} ASIL mismatches found`}
                description="The table below lists all failure modes that do not meet their required ASIL."
                type="warning"
                showIcon
                style={{ marginBottom: '16px' }}
              />
              <Table columns={columns} dataSource={asilMismatches} rowKey="failureMode" />
            </>
          )}
        </>
      )}

      {!showResults && !loading && (
        <Alert
          message="Ready to Check"
          description="Click the button above to start the analysis of ASIL ratings across your software components."
          type="info"
          showIcon
        />
      )}
    </Card>
  );
};

export default ASILFMCheck;
