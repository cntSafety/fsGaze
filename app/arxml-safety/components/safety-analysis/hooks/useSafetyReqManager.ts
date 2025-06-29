import { useState } from 'react';
import { message } from 'antd';
import { 
  createSafetyReq, 
  getSafetyReqsForNode, 
  updateSafetyReq, 
  deleteSafetyReq, 
  SafetyReqData, 
  CreateSafetyReqInput 
} from '@/app/services/neo4j/queries/safety/safetyReq';

export const useSafetyReqManager = (onSaveSuccess?: () => void) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'tabs'>('create');
  const [selectedFailureForSafetyReq, setSelectedFailureForSafetyReq] = useState<{
    failureUuid: string;
    failureName: string;
    failureDescription?: string;
  } | null>(null);
  const [activeSafetyReq, setActiveSafetyReq] = useState<SafetyReqData | null>(null);
  const [existingSafetyReqs, setExistingSafetyReqs] = useState<SafetyReqData[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const handleSafetyReqClick = async (failureUuid: string, failureName: string, failureDescription?: string) => {
    try {
      setIsLoading(true);
      setSelectedFailureForSafetyReq({ failureUuid, failureName, failureDescription });
      
      // Fetch existing safety requirements for this failure
      const result = await getSafetyReqsForNode(failureUuid);
      
      if (result.success && result.data) {
        setExistingSafetyReqs(result.data);
        
        if (result.data.length > 0) {
          // Show tabs mode if requirements exist
          setModalMode('tabs');
          setActiveSafetyReq(result.data[0]);
          setActiveTabIndex(0);
        } else {
          // Show create mode if no requirements exist
          setModalMode('create');
          setActiveSafetyReq(null);
        }
      } else {
        // Show create mode on error or no data
        setModalMode('create');
        setExistingSafetyReqs([]);
        setActiveSafetyReq(null);
      }
      
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error fetching safety requirements:', error);
      message.error('Failed to load safety requirements');
      
      // Fallback to create mode
      setModalMode('create');
      setExistingSafetyReqs([]);
      setActiveSafetyReq(null);
      setIsModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSafetyReqCancel = () => {
    setIsModalOpen(false);
    setSelectedFailureForSafetyReq(null);
    setActiveSafetyReq(null);
    setExistingSafetyReqs([]);
    setModalMode('create');
    setActiveTabIndex(0);
  };

  const handleSafetyReqSave = async (reqData: CreateSafetyReqInput) => {
    if (!selectedFailureForSafetyReq) {
      message.error('No failure selected');
      return;
    }

    try {
      setIsLoading(true);
      
      // Convert form values to proper types
      const convertedReqData = {
        ...reqData,
        reqASIL: reqData.reqASIL
      };
      
      let result;
      if (modalMode === 'create') {
        // Create new requirement
        result = await createSafetyReq(selectedFailureForSafetyReq.failureUuid, convertedReqData);
      } else if (activeSafetyReq) {
        // Update existing requirement
        result = await updateSafetyReq(activeSafetyReq.uuid, convertedReqData);
      }
      
      if (result?.success) {
        message.success(modalMode === 'create' ? 'Safety requirement created successfully' : 'Safety requirement updated successfully');
        
        // Refresh the requirements list
        const refreshResult = await getSafetyReqsForNode(selectedFailureForSafetyReq.failureUuid);
        if (refreshResult.success && refreshResult.data) {
          setExistingSafetyReqs(refreshResult.data);
          
          if (modalMode === 'create') {
            // Switch to tabs mode after creating first requirement
            setModalMode('tabs');
            setActiveSafetyReq(refreshResult.data[0]);
            setActiveTabIndex(0);
          } else {
            // Update active requirement
            const updatedReq = refreshResult.data.find(req => req.uuid === activeSafetyReq?.uuid);
            if (updatedReq) {
              setActiveSafetyReq(updatedReq);
            }
          }
        }
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      } else {
        message.error(result?.error || 'Failed to save safety requirement');
      }
    } catch (error) {
      console.error('Error saving safety requirement:', error);
      message.error('Failed to save safety requirement');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSafetyReqCreateNew = () => {
    setModalMode('create');
    setActiveSafetyReq(null);
  };

  const handleSafetyReqDelete = async () => {
    if (!activeSafetyReq) {
      message.error('No safety requirement selected');
      return;
    }

    try {
      setIsLoading(true);
      
      const result = await deleteSafetyReq(activeSafetyReq.uuid);
      
      if (result.success) {
        message.success('Safety requirement deleted successfully');
        
        // Refresh the requirements list
        if (selectedFailureForSafetyReq) {
          const refreshResult = await getSafetyReqsForNode(selectedFailureForSafetyReq.failureUuid);
          if (refreshResult.success && refreshResult.data) {
            setExistingSafetyReqs(refreshResult.data);
            
            if (refreshResult.data.length === 0) {
              // No requirements left, close modal
              handleSafetyReqCancel();
            } else {
              // Select first requirement
              setActiveSafetyReq(refreshResult.data[0]);
              setActiveTabIndex(0);
            }
          }
        }
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      } else {
        message.error(result.error || 'Failed to delete safety requirement');
      }
    } catch (error) {
      console.error('Error deleting safety requirement:', error);
      message.error('Failed to delete safety requirement');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSafetyReqTabChange = (index: number) => {
    setActiveTabIndex(index);
    if (existingSafetyReqs[index]) {
      setActiveSafetyReq(existingSafetyReqs[index]);
    }
  };

  const safetyReqModalProps = {
    open: isModalOpen,
    onCancel: handleSafetyReqCancel,
    onSave: handleSafetyReqSave,
    onCreateNew: handleSafetyReqCreateNew,
    onDelete: handleSafetyReqDelete,
    onTabChange: handleSafetyReqTabChange,
    nodeName: selectedFailureForSafetyReq?.failureName || '',
    nodeDescription: selectedFailureForSafetyReq?.failureDescription,
    loading: isLoading,
    mode: modalMode,
    activeReq: activeSafetyReq,
    existingReqs: existingSafetyReqs,
    activeTabIndex
  };

  return {
    handleSafetyReqClick,
    safetyReqModalProps
  };
};
