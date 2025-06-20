'use client';

import React, { useState } from 'react';
import { Button, Spin, Card, Typography, Modal } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useSwSafetyData } from './safety-analysis/hooks/useSwSafetyData';
import SwComponentInfo from './safety-analysis/SwComponentInfo';
import SwFailureModesTable from './safety-analysis/SwFailureModesTable';
import ProviderPortsFailureModesTable from './safety-analysis/ProviderPortsFailureModesTable';
import ReceiverPortsFailureModesTable from './safety-analysis/ReceiverPortsFailureModesTable';
import FMFlow from './safety-analysis/FMFlow';
import SWCAnalysisExport from './SWCAnalysisExport';
import InterfaceCheck from './InterfaceCheck';
import ASILFMCheck from './ASILFMCheck';
import { createCausationBetweenFailureModes } from '@/app/services/ArxmlToNeoService';
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
    setPortFailures,
    receiverPorts,
    receiverPortFailures,
    setReceiverPortFailures,
    refreshData
  } = useSwSafetyData(swComponentUuid);

  // Causation selection state
  const [selectedFailures, setSelectedFailures] = useState<{
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  }>({ first: null, second: null });
  const [creatingCausation, setCreatingCausation] = useState(false);

  const handleBackClick = () => {
    router.push('/arxml-safety');
  };

  const handleFailureSelection = async (failure: { uuid: string; name: string }) => {
    // Prevent multiple simultaneous causation creations
    if (creatingCausation) return;

    const currentSelection = selectedFailures;
    
    if (!currentSelection.first) {
      // First failure selection
      setSelectedFailures({ first: failure, second: null });
    } else if (!currentSelection.second && currentSelection.first.uuid !== failure.uuid) {
      // Second failure selection - create causation immediately
      setCreatingCausation(true);
      setSelectedFailures({ first: currentSelection.first, second: failure });
      
      try {
        const result = await createCausationBetweenFailureModes(
          currentSelection.first.uuid,
          failure.uuid
        );

        if (result.success) {
          Modal.success({
            title: 'Causation Created',
            content: `Successfully created causation between "${currentSelection.first.name}" → "${failure.name}"`,
          });
        } else {
          Modal.error({
            title: 'Causation Creation Failed',
            content: result.message || 'Failed to create causation between failure modes',
          });
        }
      } catch (error) {
        console.error('Error creating causation:', error);
        Modal.error({
          title: 'Causation Creation Failed',
          content: 'An unexpected error occurred while creating the causation',
        });
      } finally {
        // Reset selection and loading state
        setSelectedFailures({ first: null, second: null });
        setCreatingCausation(false);
      }
    } else {
      // Reset and start over (either clicking same failure or third click)
      setSelectedFailures({ first: failure, second: null });
    }
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
              <span>{creatingCausation ? 'Creating Causation...' : 'Creating Causation Link'}</span>
              <div>
                <Button 
                  size="small"
                  disabled={creatingCausation}
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
        receiverPorts={receiverPorts}
        portFailures={portFailures}
        receiverPortFailures={receiverPortFailures}
      />

      {/* Flow Diagram */}
      <FMFlow
        swComponent={swComponent}
        failures={failures}
        providerPorts={providerPorts}
        portFailures={portFailures}
        receiverPorts={receiverPorts}
        receiverPortFailures={receiverPortFailures}
        onFailureSelect={handleFailureSelection}
        selectedFailures={selectedFailures}
      />

      {/* Tables Section - Direct Display */}
      <div style={{ marginTop: '16px' }}>
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
        />        <ReceiverPortsFailureModesTable 
          receiverPorts={receiverPorts}
          portFailures={receiverPortFailures}
          setPortFailures={setReceiverPortFailures}
          onFailureSelect={handleFailureSelection}
          selectedFailures={selectedFailures}
        />
      </div>

      {/* Export Section */}
      <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
        <SWCAnalysisExport 
          componentUuid={swComponentUuid}
          componentName={swComponent?.name}
        />
      </div>

      {/* Interface Check Section */}
      <InterfaceCheck
        swComponentUuid={swComponentUuid}
        swComponentName={swComponent?.name}
        providerPorts={providerPorts}
        receiverPorts={receiverPorts}
        portFailures={portFailures}
        receiverPortFailures={receiverPortFailures}
      />

      {/* ASIL-FM Check Section */}
      <ASILFMCheck
        swComponentUuid={swComponentUuid}
        swComponentName={swComponent?.name}
        failures={failures}
        providerPorts={providerPorts}
        receiverPorts={receiverPorts}
        portFailures={portFailures}
        receiverPortFailures={receiverPortFailures}
      />
    </div>
  );
}
