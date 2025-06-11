'use client';

import React, { useState } from 'react';
import { Button, Spin, Card, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useSwSafetyData } from './safety-analysis/hooks/useSwSafetyData';
import SwComponentInfo from './safety-analysis/SwComponentInfo';
import SwFailureModesTable from './safety-analysis/SwFailureModesTable';
import ProviderPortsFailureModesTable from './safety-analysis/ProviderPortsFailureModesTable';
import CreateCausationModal from '@/app/safety/components/CreateCausationModal';
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

  // Causation modal state
  const [causationModalOpen, setCausationModalOpen] = useState(false);
  const [selectedFailures, setSelectedFailures] = useState<{
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  }>({ first: null, second: null });

  const handleBackClick = () => {
    router.push('/arxml-safety');
  };

  const handleFailureSelection = (failure: { uuid: string; name: string }) => {
    setSelectedFailures(prev => {
      if (!prev.first) {
        return { ...prev, first: failure };
      } else if (!prev.second) {
        // Both failures selected, automatically open modal
        setTimeout(() => setCausationModalOpen(true), 100);
        return { ...prev, second: failure };
      } else {
        // Reset and start over
        return { first: failure, second: null };
      }
    });
  };

  const handleCausationModalClose = () => {
    setCausationModalOpen(false);
  };

  const handleCausationModalSuccess = () => {
    setCausationModalOpen(false);
    setSelectedFailures({ first: null, second: null });
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

      {/* Selected Failures Display */}
      {(selectedFailures.first || selectedFailures.second) && (
        <Card 
          size="small" 
          style={{ marginBottom: '16px', backgroundColor: '#f6f6f6' }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Creating Causation Link</span>
              <div>
                <Button 
                  size="small"
                  onClick={() => setSelectedFailures({ first: null, second: null })}
                >
                  Cancel Linking
                </Button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <Text strong>From (Cause): </Text>
              {selectedFailures.first ? (
                <Text code style={{ color: '#1890ff' }}>{selectedFailures.first.name}</Text>
              ) : (
                <Text type="secondary">Click a link icon to select cause</Text>
              )}
            </div>
            {selectedFailures.first && (
              <span style={{ fontSize: '16px', color: '#52c41a' }}>→</span>
            )}
            <div>
              <Text strong>To (Effect): </Text>
              {selectedFailures.second ? (
                <Text code style={{ color: '#ff7875' }}>{selectedFailures.second.name}</Text>
              ) : selectedFailures.first ? (
                <Text type="secondary">Click another link icon to complete</Text>
              ) : (
                <Text type="secondary">Select cause failure first</Text>
              )}
            </div>
          </div>
        </Card>
      )}

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
        onFailureSelect={handleFailureSelection}
        selectedFailures={selectedFailures}
      />

      <ProviderPortsFailureModesTable 
        providerPorts={providerPorts}
        portFailures={portFailures}
        setPortFailures={setPortFailures}
        onFailureSelect={handleFailureSelection}
        selectedFailures={selectedFailures}
      />

      <CreateCausationModal
        open={causationModalOpen}
        onCancel={handleCausationModalClose}
        onSuccess={handleCausationModalSuccess}
        firstFailure={selectedFailures.first}
        secondFailure={selectedFailures.second}
      />
    </div>
  );
}
