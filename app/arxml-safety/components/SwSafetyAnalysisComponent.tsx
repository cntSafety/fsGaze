'use client';

import React, { useState } from 'react';
import { Button, Spin, Card, Typography, Divider } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useSwSafetyData } from './safety-analysis/hooks/useSwSafetyData';
import { useCrossComponentCausation } from '../hooks/useCrossComponentCausation';
import SwComponentInfo from './safety-analysis/SwComponentInfo';
import SwFailureModesTable from './safety-analysis/SwFailureModesTable';
import ProviderPortsFailureModesTable from './safety-analysis/ProviderPortsFailureModesTable';
import ReceiverPortsFailureModesTable from './safety-analysis/ReceiverPortsFailureModesTable';
import FMFlow from './safety-analysis/FMFlow';
import SWCAnalysisExport from './SWCAnalysisExport';
import InterfaceCheck from './InterfaceCheck';
import ASILFMCheck from './ASILFMCheck';
import CrossComponentCausationIndicator from './CrossComponentCausationIndicator';
import { SwSafetyAnalysisProps } from './safety-analysis/types';
import ElementDetailsModal from './ElementDetailsModal';

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

  // Use cross-component causation system
  const {
    handleFailureSelection,
    clearSelections,
    isFailureSelected,
    getFailureSelectionState,
    getSelectionDisplayInfo
  } = useCrossComponentCausation(
    swComponentUuid,
    swComponent?.name || 'Unknown Component'
  );

  // Modal state for ElementDetailsModal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);

  const handleModalClose = () => {
    setIsModalVisible(false);
    setSelectedElement(null);
  };

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

  // Get selection display info for the indicator
  const selectionDisplayInfo = getSelectionDisplayInfo();
  const isCauseSelected = !!selectionDisplayInfo.first;

  // Create wrapper for failure selection to match expected interface
  const handleFailureSelectionWrapper = (failure: { uuid: string; name: string }) => {
    handleFailureSelection(failure.uuid, failure.name, 'component');
  };

  // Create selected failures object for backward compatibility
  const selectedFailures = {
    first: selectionDisplayInfo.first ? { 
      uuid: selectionDisplayInfo.first.failureUuid, 
      name: selectionDisplayInfo.first.failureName 
    } : null,
    second: selectionDisplayInfo.second ? { 
      uuid: selectionDisplayInfo.second.failureUuid, 
      name: selectionDisplayInfo.second.failureName 
    } : null
  };

  return (
    <div style={{ padding: '24px' }}>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={handleBackClick}
        style={{ marginBottom: '16px' }}
      >
        Back to Safety Analysis
      </Button>

      {/* Cross-Component Causation Indicator */}
      <CrossComponentCausationIndicator
        first={selectionDisplayInfo.first}
        second={selectionDisplayInfo.second}
        isCrossComponent={selectionDisplayInfo.isCrossComponent}
        isReady={selectionDisplayInfo.isReady}
        statusText={selectionDisplayInfo.statusText}
        onClear={clearSelections}
      />

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
        onFailureSelect={handleFailureSelectionWrapper}
        selectedFailures={selectedFailures}
      />

      {/* Tables Section - Direct Display */}
      <div style={{ marginTop: '16px' }}>
        <SwFailureModesTable 
          swComponentUuid={swComponentUuid}
          swComponent={swComponent}
          failures={failures}
          setFailures={setFailures}
          onFailureSelect={handleFailureSelectionWrapper}
          selectedFailures={selectedFailures}
          refreshData={refreshData}
          getFailureSelectionState={getFailureSelectionState}
          handleFailureSelection={handleFailureSelection}
          isCauseSelected={isCauseSelected}
        />

        {swComponent && (
          <ProviderPortsFailureModesTable 
            swComponent={swComponent}
            providerPorts={providerPorts}
            portFailures={portFailures}
            setPortFailures={setPortFailures}
            onFailureSelect={handleFailureSelectionWrapper}
            selectedFailures={selectedFailures}
            refreshData={refreshData}
            getFailureSelectionState={getFailureSelectionState}
            handleFailureSelection={handleFailureSelection}
            isCauseSelected={isCauseSelected}
          />
        )}
        
        <ReceiverPortsFailureModesTable 
          swComponent={swComponent}
          receiverPorts={receiverPorts}
          portFailures={receiverPortFailures}
          setPortFailures={setReceiverPortFailures}
          onFailureSelect={handleFailureSelectionWrapper}
          selectedFailures={selectedFailures}
          refreshData={refreshData}
          getFailureSelectionState={getFailureSelectionState}
          handleFailureSelection={handleFailureSelection}
          isCauseSelected={isCauseSelected}
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

      <Divider>ASIL Mismatch Check</Divider>
      <div style={{ padding: '20px' }}>
        <ASILFMCheck />
      </div>

      <ElementDetailsModal
        isVisible={isModalVisible}
        onClose={handleModalClose}
        elementDetails={selectedElement}
        getFailureSelectionState={getFailureSelectionState}
        handleFailureSelection={handleFailureSelection as (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>}
        isCauseSelected={isCauseSelected}
      />
    </div>
  );
}
