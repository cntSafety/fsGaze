'use client';

import React, { useEffect, useState } from 'react';
import { Card, Space, Alert, Button, Typography } from 'antd';
import { checkASIL } from '@/app/services/neo4j/queries/safety/causation';
import MismatchTable, { ASILMismatchData } from './components/MismatchTable';

const { Title, Text } = Typography;

const ASILCheckPage: React.FC = () => {
  const [data, setData] = useState<ASILMismatchData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowToHighCount, setLowToHighCount] = useState(0);
  const [otherMismatchCount, setOtherMismatchCount] = useState(0);
  const [tbcCount, setTbcCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const fetchASILData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await checkASIL();
      
      if (result.success && result.data) {
        setData(result.data);
        setLowToHighCount(result.data.filter(item => item.asilStatus === 'LOWTOHIGH').length);
        setOtherMismatchCount(result.data.filter(item => item.asilStatus === 'OTHERMISMATCH').length);
        setTbcCount(result.data.filter(item => item.asilStatus === 'TBC').length);
        setMatchCount(result.data.filter(item => item.asilStatus === 'MATCH').length);
      } else {
        setError(result.message || 'Failed to fetch ASIL data');
      }
    } catch (err) {
      setError('An error occurred while fetching ASIL data');
      console.error('Error fetching ASIL data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchASILData();
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2}>ASIL Consistency Check</Title>
          <Text type="secondary">
            Analyze ASIL level consistency between cause and effect failure modes in causation relationships. 
            Mismatches occur when a lower ASIL failure mode (e.g., QM, A, B, C) propagates to a higher ASIL rating (e.g., A, B, C, D).
          </Text>
        </div>

        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size="large">
                <div>
                  <Text strong>Total Causations:</Text> {data.length}
                </div>
                <div>
                  <Text strong style={{ color: '#ff4d4f' }}>Critical (Low-to-High) Mismatches:</Text> {lowToHighCount}
                </div>
                <div>
                  <Text strong style={{ color: '#fa8c16' }}>TBC (Failure Modes with TBC):</Text> {tbcCount}
                </div>
                <div>
                  <Text strong style={{ color: '#faad14' }}>Other Mismatches:</Text> {otherMismatchCount}
                </div>
                <div>
                  <Text strong style={{ color: '#52c41a' }}>Matches:</Text> {matchCount}
                </div>
              </Space>
              <Button onClick={fetchASILData} loading={loading} type="primary">
                Refresh
              </Button>
            </div>

            {lowToHighCount > 0 && (
              <Alert
                message="Critical ASIL Escalation Detected (Low-to-High)"
                description={`Found ${lowToHighCount} causation(s) where a lower ASIL failure mode propagates to a higher ASIL rating (e.g., QM, A, B, C to D). This indicates potential safety analysis issues where failure modes may have insufficient safety integrity levels for their effects.`}
                type="warning"
                showIcon
              />
            )}
            {tbcCount > 0 && (
              <Alert
                message="TBC: Failure Modes with unassigned ASIL"
                description={`Found ${tbcCount} causation(s) where at least one failure mode has ASIL marked as 'TBC' (To Be Confirmed). This means the ASIL has not yet been assigned to these failure modes and should be reviewed and completed for a thorough safety analysis.`}
                type="info"
                showIcon
                
              />
            )}
            {otherMismatchCount > 0 && (
              <Alert
                message="Other ASIL Mismatches (Non-critical)"
                description={`Found ${otherMismatchCount} causation(s) where a higher ASIL failure mode propagates to a lower ASIL rating (e.g., D to C, C to B, etc.). These are not considered critical mismatches but are shown for completeness.`}
                type="info"
                showIcon
              />
            )}
            {matchCount > 0 && lowToHighCount === 0 && otherMismatchCount === 0 && (
              <Alert
                message="All ASIL Levels Consistent"
                description={`All ${matchCount} causation(s) have consistent ASIL levels between cause and effect failure modes, with no inappropriate ASIL escalations detected.`}
                type="success"
                showIcon
              />
            )}

            {error && (
              <Alert
                message="Error"
                description={error}
                type="error"
                showIcon
              />
            )}
          </Space>
        </Card>

        <Card title="Causation Analysis Results">
          <MismatchTable data={data} loading={loading} />
        </Card>
      </Space>
    </div>
  );
};

export default ASILCheckPage;
