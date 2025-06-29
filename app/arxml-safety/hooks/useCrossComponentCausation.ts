import { useCallback } from 'react';
import { message } from 'antd';
import { useCausationStorage } from './useCausationStorage';
import { createCausationBetweenFailureModes } from '@/app/services/ArxmlToNeoService';
import type { CausationSelection, CausationSelectionState } from './types/causation';

interface SelectionDisplayInfo {
  first: CausationSelection | null;
  second: CausationSelection | null;
  firstDisplay: string | null;
  secondDisplay: string | null;
  statusText: string;
  isReady: boolean;
  isCrossComponent: boolean;
}

interface UseCrossComponentCausationReturn {
  selectionState: CausationSelectionState;
  handleFailureSelection: (
    failureUuid: string,
    failureName: string,
    sourceType?: 'component' | 'provider-port' | 'receiver-port',
    overrideComponentUuid?: string,
    overrideComponentName?: string
  ) => Promise<void>;
  clearSelections: () => void;
  isFailureSelected: (failureUuid: string) => boolean;
  getFailureSelectionState: (failureUuid: string) => 'first' | 'second' | null;
  getSelectionDisplayInfo: () => SelectionDisplayInfo;
}

export const useCrossComponentCausation = (
  currentComponentUuid: string,
  currentComponentName: string
): UseCrossComponentCausationReturn => {
  const {
    selectionState,
    addSelection,
    clearSelections,
    clearAfterCausationCreation,
    isFailureSelected,
    getFailureSelectionState,
    getSelectionInfo
  } = useCausationStorage();

  // Handle failure selection for causation
  const handleFailureSelection = useCallback(async (
    failureUuid: string,
    failureName: string,
    sourceType: 'component' | 'provider-port' | 'receiver-port' = 'component',
    overrideComponentUuid?: string,
    overrideComponentName?: string
  ) => {
    // Add selection to storage
    const newState = addSelection({
      failureUuid,
      failureName,
      componentUuid: overrideComponentUuid || currentComponentUuid,
      componentName: overrideComponentName || currentComponentName,
      sourceType
    });

    // If both selections are ready, create causation
    if (newState.first && newState.second) {
      try {
        const result = await createCausationBetweenFailureModes(
          newState.first.failureUuid,
          newState.second.failureUuid
        );

        if (result.success) {
          const isCrossComponent = newState.first.componentUuid !== newState.second.componentUuid;
          const messageText = isCrossComponent
            ? `Cross-component causation created: "${newState.first.failureName}" (${newState.first.componentName}) → "${newState.second.failureName}" (${newState.second.componentName})`
            : `Causation created: "${newState.first.failureName}" → "${newState.second.failureName}"`;

          message.success(messageText);
          clearAfterCausationCreation();
        } else {
          message.error(result.message || 'Failed to create causation');
        }
      } catch (error) {
        console.error('Error creating causation:', error);
        message.error('An unexpected error occurred while creating causation');
      }
    }
  }, [
    addSelection,
    currentComponentUuid,
    currentComponentName,
    clearAfterCausationCreation
  ]);

  // Get display information for selections
  const getSelectionDisplayInfo = useCallback((): SelectionDisplayInfo => {
    const info = getSelectionInfo();
    
    return {
      ...info,
      firstDisplay: info.first ? `${info.first.failureName} (${info.first.componentName})` : null,
      secondDisplay: info.second ? `${info.second.failureName} (${info.second.componentName})` : null,
      statusText: !info.first 
        ? 'Click a failure to set as Cause'
        : !info.second
        ? 'Click another failure to set as Effect'
        : 'Ready to create causation',
      isReady: Boolean(info.isReady),
      isCrossComponent: Boolean(info.isCrossComponent)
    };
  }, [getSelectionInfo]);

  return {
    selectionState,
    handleFailureSelection,
    clearSelections,
    isFailureSelected,
    getFailureSelectionState,
    getSelectionDisplayInfo
  };
};

export default useCrossComponentCausation;
