import React from 'react';
import SafetyTaskModal from '../SafetyTaskModal';
import { useSafetyTaskManager } from './hooks/useSafetyTaskManager';

interface SafetyTaskManagerProps {
  children: (safetyTaskHandlers: {
    handleSafetyTaskClick: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>;
    safetyTaskModalProps: {
      open: boolean;
      onCancel: () => void;
      onSave: (values: {
        name: string;
        description: string;
        status: string;
        responsible: string;
        reference: string;
        taskType: string;
      }) => Promise<void>;
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
}

export const SafetyTaskManager: React.FC<SafetyTaskManagerProps> = ({ children }) => {
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
  } = useSafetyTaskManager();

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
