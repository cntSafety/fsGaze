import React from 'react';
import SafetyTaskModal from '../SafetyTaskModal';
import { useSafetyTaskManager } from './hooks/useSafetyTaskManager';
import { CreateSafetyTaskInput } from '@/app/services/neo4j/queries/safety/safetyTasks';

interface SafetyTaskManagerProps {
  children: (safetyTaskHandlers: {
    handleSafetyTaskClick: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>;
    safetyTaskModalProps: {
      open: boolean;
      onCancel: () => void;      onSave: (taskData: CreateSafetyTaskInput) => Promise<void>;
      onCreateNew: () => void;
      onDelete: () => Promise<void>;
      onTabChange: (index: number) => void;
      nodeName: string;
      nodeDescription?: string;
      loading: boolean;
      mode: 'create' | 'edit' | 'tabs';
      activeTask: any | null;
      existingTasks: any[];
      activeTabIndex: number;
    };
  }) => React.ReactNode;
  onSaveSuccess?: () => void;
}

export const SafetyTaskManager: React.FC<SafetyTaskManagerProps> = ({ children, onSaveSuccess }) => {
  const {
    safetyTaskModalVisible,
    safetyTaskModalLoading,
    modalState,
    handleSafetyTaskClick,
    handleModalTabChange,
    handleCreateNewSafetyTask,
    handleCreateSafetyTask,
    handleUpdateSafetyTask,
    handleDeleteSafetyTask,
    closeModal,
  } = useSafetyTaskManager(onSaveSuccess);

  const safetyTaskModalProps = {
    open: safetyTaskModalVisible,
    onCancel: closeModal,
    onSave: modalState.mode === 'create' ? handleCreateSafetyTask : handleUpdateSafetyTask,
    onCreateNew: handleCreateNewSafetyTask,
    onDelete: handleDeleteSafetyTask,
    onTabChange: handleModalTabChange,
    nodeName: modalState.failureName,
    nodeDescription: modalState.failureDescription,
    loading: safetyTaskModalLoading,
    mode: modalState.mode,
    activeTask: modalState.activeTask,
    existingTasks: modalState.existingTasks,
    activeTabIndex: modalState.activeTabIndex,
  };

  return (
    <>
      {children({
        handleSafetyTaskClick,
        safetyTaskModalProps,
      })}
      
      <SafetyTaskModal {...safetyTaskModalProps} />
    </>
  );
};
