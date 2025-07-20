'use client';

import React, { useState } from 'react';
import { Button, Spin, Card, Typography, Divider } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

import { useSwComponentInfo } from './safety-analysis/hooks/useSwComponentInfo';
import { useComponentFailures } from './safety-analysis/hooks/useComponentFailures';
import { useProviderPortFailures } from './safety-analysis/hooks/useProviderPortFailures';
import { useReceiverPortFailures } from './safety-analysis/hooks/useReceiverPortFailures';
import { useCrossComponentCausation } from '../hooks/useCrossComponentCausation';

import SwComponentInfo from './safety-analysis/SwComponentInfo';
import SwFailureModesTable from './safety-analysis/SwFailureModesTable';
import ProviderPortsFailureModesTable from './safety-analysis/ProviderPortsFailureModesTable';
import ReceiverPortsFailureModesTable from './safety-analysis/ReceiverPortsFailureModesTable';
import FMFlow from './safety-analysis/FMFlow';
import CrossComponentCausationIndicator from './CrossComponentCausationIndicator';
import { SwSafetyAnalysisProps } from './safety-analysis/types';
import ElementDetailsModal from './ElementDetailsModal';

const { Text } = Typography;

export default function SwSafetyAnalysisComponent({ swComponentUuid }: SwSafetyAnalysisProps) {
  const router = useRouter();

  // New granular data hooks
  const { swComponent, loading: loadingInfo } = useSwComponentInfo(swComponentUuid);
  const { failures, loading: loadingFailures } = useComponentFailures(swComponentUuid);
  const { providerPorts, portFailures: providerPortFailures, loading: loadingProvider } = useProviderPortFailures(swComponentUuid);
  const { receiverPorts, portFailures: receiverPortFailures, loading: loadingReceiver } = useReceiverPortFailures(swComponentUuid);

  // Cross-component causation system
  const {
    handleFailureSelection,
    clearSelections,
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

  const isLoading = loadingInfo || loadingFailures || loadingProvider || loadingReceiver;

  if (isLoading && !swComponent) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!swComponent) {
    return (
      <div style={{ padding: '24px' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={handleBackClick} style={{ marginBottom: '16px' }}>
          Back to Safety Analysis
        </Button>
        <Card>
          <Text type="danger">SW Component not found</Text>
        </Card>
      </div>
    );
  }

  const selectionDisplayInfo = getSelectionDisplayInfo();
  const isCauseSelected = !!selectionDisplayInfo.first;

  const handleFailureSelectionWrapper = (failure: { uuid: string; name: string }) => {
    handleFailureSelection(failure.uuid, failure.name, 'component');
  };

  const selectedFailures = {
    first: selectionDisplayInfo.first ? { uuid: selectionDisplayInfo.first.failureUuid, name: selectionDisplayInfo.first.failureName } : null,
    second: selectionDisplayInfo.second ? { uuid: selectionDisplayInfo.second.failureUuid, name: selectionDisplayInfo.second.failureName } : null
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
        portFailures={providerPortFailures}
        receiverPortFailures={receiverPortFailures}
      />

      <FMFlow
        swComponent={swComponent}
        failures={failures}
        providerPorts={providerPorts}
        portFailures={providerPortFailures}
        receiverPorts={receiverPorts}
        receiverPortFailures={receiverPortFailures}
        onFailureSelect={handleFailureSelectionWrapper}
        selectedFailures={selectedFailures}
      />

      <div style={{ marginTop: '16px' }}>
        <SwFailureModesTable 
          swComponentUuid={swComponentUuid}
          swComponent={swComponent}
          onFailureSelect={handleFailureSelectionWrapper}
          selectedFailures={selectedFailures}
          getFailureSelectionState={getFailureSelectionState}
          handleFailureSelection={handleFailureSelection}
          isCauseSelected={isCauseSelected}
        />

        {swComponent && (
          <ProviderPortsFailureModesTable 
            swComponent={swComponent}
            onFailureSelect={handleFailureSelectionWrapper}
            selectedFailures={selectedFailures}
            getFailureSelectionState={getFailureSelectionState}
            handleFailureSelection={handleFailureSelection}
            isCauseSelected={isCauseSelected}
          />
        )}
        
        <ReceiverPortsFailureModesTable 
          swComponent={swComponent}
          onFailureSelect={handleFailureSelectionWrapper}
          selectedFailures={selectedFailures}
          getFailureSelectionState={getFailureSelectionState}
          handleFailureSelection={handleFailureSelection}
          isCauseSelected={isCauseSelected}
        />
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
