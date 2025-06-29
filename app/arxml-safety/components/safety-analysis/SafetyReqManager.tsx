import React from 'react';
import SafetyReqModal from '../SafetyReqModal';
import { useSafetyReqManager } from './hooks/useSafetyReqManager';
import { CreateSafetyReqInput } from '@/app/services/neo4j/queries/safety/safetyReq';

interface SafetyReqManagerProps {
  children: (safetyReqHandlers: {
    handleSafetyReqClick: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>;
    safetyReqModalProps: {
      open: boolean;
      onCancel: () => void;
      onSave: (reqData: CreateSafetyReqInput) => Promise<void>;
      onCreateNew: () => void;
      onDelete: () => Promise<void>;
      onTabChange: (index: number) => void;
      nodeName: string;
      nodeDescription?: string;
      loading: boolean;
      mode: 'create' | 'edit' | 'tabs';
      activeReq: any | null;
      existingReqs: any[];
      activeTabIndex: number;
    };
  }) => React.ReactNode;
  onSaveSuccess?: () => void;
}

const SafetyReqManager: React.FC<SafetyReqManagerProps> = ({ children, onSaveSuccess }) => {
  const safetyReqManager = useSafetyReqManager(onSaveSuccess);

  return (
    <>
      {children({
        handleSafetyReqClick: safetyReqManager.handleSafetyReqClick,
        safetyReqModalProps: safetyReqManager.safetyReqModalProps,
      })}
      <SafetyReqModal
        {...safetyReqManager.safetyReqModalProps}
      />
    </>
  );
};

export default SafetyReqManager;
