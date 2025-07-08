import React from 'react';
import RiskRatingModal from '../RiskRatingModal';
import { useRiskRatingManager } from './hooks/useRiskRatingManager';

interface RiskRatingManagerProps {
  children: (riskRatingHandlers: {
    handleRiskRatingClick: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>;
    riskRatingModalProps: {
      open: boolean;
      onCancel: () => void;
      onOk: (values: { severity: number; occurrence: number; detection: number; ratingComment?: string }) => Promise<void>;
      onCreateNew: () => void;
      onDelete: () => Promise<void>;      failureName: string;
      failureDescription?: string;
      loading: boolean;
      mode: 'create' | 'edit' | 'tabs';
      activeRiskRating: any | null;
      existingRiskRatings: any[];
      activeTabIndex: number;
      onTabChange: (index: number) => void;
    };
  }) => React.ReactNode;
  onSaveSuccess?: () => void;
}

export const RiskRatingManager: React.FC<RiskRatingManagerProps> = ({ children, onSaveSuccess }) => {
  const {
    riskRatingModalVisible,
    riskRatingModalLoading,
    modalState,
    handleRiskRatingClick,
    handleModalTabChange,
    handleCreateNewRiskRating,
    handleCreateRiskRating,
    handleUpdateRiskRating,
    handleDeleteRiskRating,
    closeModal,
  } = useRiskRatingManager(onSaveSuccess);

  const riskRatingModalProps = {
    open: riskRatingModalVisible,
    onCancel: closeModal,
    onOk: modalState.mode === 'create' ? handleCreateRiskRating : handleUpdateRiskRating,
    onCreateNew: handleCreateNewRiskRating,
    onDelete: handleDeleteRiskRating,    failureUuid: modalState.failureUuid,
    failureName: modalState.failureName,
    failureDescription: modalState.failureDescription,
    loading: riskRatingModalLoading,
    mode: modalState.mode,
    activeRiskRating: modalState.activeRiskRating,
    existingRiskRatings: modalState.existingRiskRatings,
    activeTabIndex: modalState.activeTabIndex,
    onTabChange: handleModalTabChange,
  };

  return (
    <>
      {children({
        handleRiskRatingClick,
        riskRatingModalProps,
      })}
      
      <RiskRatingModal {...riskRatingModalProps} />
    </>
  );
};
