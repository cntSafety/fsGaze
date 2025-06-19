import { useState } from 'react';
import { message } from 'antd';
import { 
  createSafetyTask, 
  updateSafetyTask, 
  deleteSafetyTask, 
  getSafetyTasksForNode,
  type SafetyTaskData,
  type CreateSafetyTaskInput
} from '@/app/services/neo4j/queries/safety/safetyTasks';

interface SafetyTaskModalState {
  failureUuid: string;
  failureName: string;
  failureDescription?: string;
  mode: 'create' | 'edit' | 'tabs';
  activeTask: SafetyTaskData | null;
  existingTasks: SafetyTaskData[];
  activeTabIndex: number;
}

export const useSafetyTaskManager = () => {
  const [safetyTaskModalVisible, setSafetyTaskModalVisible] = useState(false);
  const [safetyTaskModalLoading, setSafetyTaskModalLoading] = useState(false);
  const [modalState, setModalState] = useState<SafetyTaskModalState>({
    failureUuid: '',
    failureName: '',
    failureDescription: '',
    mode: 'create',
    activeTask: null,
    existingTasks: [],
    activeTabIndex: 0,
  });

  const handleSafetyTaskClick = async (failureUuid: string, failureName: string, failureDescription?: string) => {
    try {
      // Get existing safety tasks for this failure
      const existingTasksResult = await getSafetyTasksForNode(failureUuid);
      
      if (!existingTasksResult.success) {
        message.error(`Error checking existing safety tasks: ${existingTasksResult.message}`);
        return;
      }

      const existingTasks = existingTasksResult.data || [];
      
      if (existingTasks.length === 0) {
        // No existing tasks - show create mode
        setModalState({
          failureUuid,
          failureName,
          failureDescription,
          mode: 'create',
          activeTask: null,
          existingTasks: [],
          activeTabIndex: 0,
        });
      } else if (existingTasks.length === 1) {
        // One existing task - show edit mode
        setModalState({
          failureUuid,
          failureName,
          failureDescription,
          mode: 'edit',
          activeTask: existingTasks[0],
          existingTasks: existingTasks,
          activeTabIndex: 0,
        });
      } else {
        // Multiple existing tasks - show tabs mode
        setModalState({
          failureUuid,
          failureName,
          failureDescription,
          mode: 'tabs',
          activeTask: existingTasks[0],
          existingTasks: existingTasks,
          activeTabIndex: 0,
        });
      }
      
      setSafetyTaskModalVisible(true);
      
    } catch (error) {
      console.error('Error in handleSafetyTaskClick:', error);
      message.error('Failed to load safety tasks');
    }
  };

  const handleCreateSafetyTask = async (taskData: CreateSafetyTaskInput) => {
    try {
      setSafetyTaskModalLoading(true);
      
      const result = await createSafetyTask(modalState.failureUuid, taskData);
      
      if (result.success) {
        message.success('Safety task created successfully');
        setSafetyTaskModalVisible(false);
        // Reset modal state
        setModalState({
          failureUuid: '',
          failureName: '',
          failureDescription: '',
          mode: 'create',
          activeTask: null,
          existingTasks: [],
          activeTabIndex: 0,
        });
      } else {
        message.error(result.message || 'Failed to create safety task');
      }
    } catch (error) {
      console.error('Error creating safety task:', error);
      message.error('Failed to create safety task');
    } finally {
      setSafetyTaskModalLoading(false);
    }
  };

  const handleUpdateSafetyTask = async (taskData: CreateSafetyTaskInput) => {
    try {
      setSafetyTaskModalLoading(true);
      
      if (!modalState.activeTask) {
        message.error('No active task to update');
        return;
      }
      
      const result = await updateSafetyTask(modalState.activeTask.uuid, taskData);
      
      if (result.success) {
        message.success('Safety task updated successfully');
        setSafetyTaskModalVisible(false);
        // Reset modal state
        setModalState({
          failureUuid: '',
          failureName: '',
          failureDescription: '',
          mode: 'create',
          activeTask: null,
          existingTasks: [],
          activeTabIndex: 0,
        });
      } else {
        message.error(result.message || 'Failed to update safety task');
      }
    } catch (error) {
      console.error('Error updating safety task:', error);
      message.error('Failed to update safety task');
    } finally {
      setSafetyTaskModalLoading(false);
    }
  };

  const handleDeleteSafetyTask = async () => {
    try {
      setSafetyTaskModalLoading(true);
      
      if (!modalState.activeTask) {
        message.error('No active task to delete');
        return;
      }
      
      const result = await deleteSafetyTask(modalState.activeTask.uuid);
      
      if (result.success) {
        message.success('Safety task deleted successfully');
        setSafetyTaskModalVisible(false);
        // Reset modal state
        setModalState({
          failureUuid: '',
          failureName: '',
          failureDescription: '',
          mode: 'create',
          activeTask: null,
          existingTasks: [],
          activeTabIndex: 0,
        });
      } else {
        message.error(result.message || 'Failed to delete safety task');
      }
    } catch (error) {
      console.error('Error deleting safety task:', error);
      message.error('Failed to delete safety task');
    } finally {
      setSafetyTaskModalLoading(false);
    }
  };

  const handleCreateNewSafetyTask = () => {
    // Switch to create mode while preserving failure info
    setModalState(prev => ({
      ...prev,
      mode: 'create',
      activeTask: null,
      activeTabIndex: 0,
    }));
  };

  const handleModalTabChange = (index: number) => {
    setModalState(prev => ({
      ...prev,
      activeTabIndex: index,
      activeTask: prev.existingTasks[index] || null,
    }));
  };

  const closeModal = () => {
    setSafetyTaskModalVisible(false);
    setModalState({
      failureUuid: '',
      failureName: '',
      failureDescription: '',
      mode: 'create',
      activeTask: null,
      existingTasks: [],
      activeTabIndex: 0,
    });
  };

  return {
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
  };
};
