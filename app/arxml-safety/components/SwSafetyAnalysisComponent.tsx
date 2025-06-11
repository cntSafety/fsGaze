'use client';

import React from 'react';
import { Button, Spin, Card, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useSwSafetyData } from './safety-analysis/hooks/useSwSafetyData';
import SwComponentInfo from './safety-analysis/SwComponentInfo';
import SwFailureModesTable from './safety-analysis/SwFailureModesTable';
import ProviderPortsFailureModesTable from './safety-analysis/ProviderPortsFailureModesTable';
import { SwSafetyAnalysisProps } from './safety-analysis/types';

const { Text } = Typography;

export default function SwSafetyAnalysisComponent({ swComponentUuid }: SwSafetyAnalysisProps) {
  const router = useRouter();
  const { 
    loading, 
    swComponent, 
    failures, 
    setFailures, 
    providerPorts, 
    portFailures, 
    setPortFailures 
  } = useSwSafetyData(swComponentUuid);

  const handleBackClick = () => {
    router.push('/arxml-safety');
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '400px' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!swComponent) {
    return (
      <div style={{ padding: '24px' }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBackClick}
          style={{ marginBottom: '16px' }}
        >
          Back to Safety Analysis
        </Button>
        <Card>
          <Text type="danger">SW Component not found</Text>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={handleBackClick}
        style={{ marginBottom: '16px' }}
      >
        Back to Safety Analysis
      </Button>

      <SwComponentInfo 
        swComponent={swComponent}
        failures={failures}
        providerPorts={providerPorts}
      />

      <SwFailureModesTable 
        swComponentUuid={swComponentUuid}
        swComponent={swComponent}
        failures={failures}
        setFailures={setFailures}
      />

      <ProviderPortsFailureModesTable 
        providerPorts={providerPorts}
        portFailures={portFailures}
        setPortFailures={setPortFailures}
      />
    </div>
  );
}
