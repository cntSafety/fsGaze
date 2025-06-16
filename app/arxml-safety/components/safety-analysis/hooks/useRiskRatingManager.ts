import { useState } from 'react';
import { message } from 'antd';
import { createRiskRatingNode, updateRiskRatingNode, deleteRiskRatingNode, getRiskRatingNodes } from '@/app/services/neo4j/queries/safety';

interface RiskRatingModalState {
  failureUuid: string;
  failureName: string;
  failureDescription?: string;
  mode: 'create' | 'edit' | 'tabs';
  activeRiskRating: any | null;
  existingRiskRatings: any[];
  activeTabIndex: number;
}

export const useRiskRatingManager = () => {
  const [riskRatingModalVisible, setRiskRatingModalVisible] = useState(false);
  const [riskRatingModalLoading, setRiskRatingModalLoading] = useState(false);  const [modalState, setModalState] = useState<RiskRatingModalState>({
    failureUuid: '',
    failureName: '',
    failureDescription: '',
    mode: 'create',
    activeRiskRating: null,
    existingRiskRatings: [],
    activeTabIndex: 0,  });

  const handleRiskRatingClick = async (failureUuid: string, failureName: string, failureDescription?: string) => {
    try {
      // Get existing risk ratings for this failure
      const existingRatingsResult = await getRiskRatingNodes(failureUuid);
      
      if (!existingRatingsResult.success) {
        message.error(`Error checking existing risk ratings: ${existingRatingsResult.message}`);
        return;
      }      const existingRatings = existingRatingsResult.data || [];
      
      if (existingRatings.length === 0) {
        // No existing ratings - show create mode
        setModalState({
          failureUuid,
          failureName,
          failureDescription,
          mode: 'create',
          activeRiskRating: null,
          existingRiskRatings: [],
          activeTabIndex: 0,        });
      } else if (existingRatings.length === 1) {
        // One existing rating - show edit mode
        setModalState({
          failureUuid,
          failureName,
          failureDescription,
          mode: 'edit',
          activeRiskRating: existingRatings[0],
          existingRiskRatings: existingRatings,
          activeTabIndex: 0,        });
      } else {
        // Multiple existing ratings - show tabs mode
        setModalState({
          failureUuid,
          failureName,
          failureDescription,
          mode: 'tabs',
          activeRiskRating: existingRatings[0],
          existingRiskRatings: existingRatings,
          activeTabIndex: 0,
        });
      }
      
      setRiskRatingModalVisible(true);
    } catch (error) {
      console.error('Error fetching risk ratings:', error);
      message.error('Failed to load risk ratings');
    }
  };  const handleModalTabChange = (index: number) => {
    // The existing risk ratings are already sorted by creation date (oldest first)
    if (modalState.existingRiskRatings[index]) {
      setModalState(prev => ({
        ...prev,
        activeRiskRating: modalState.existingRiskRatings[index],
        activeTabIndex: index,
      }));
    }
  };

  const handleCreateNewRiskRating = () => {
    setModalState(prev => ({
      ...prev,
      mode: 'create',
      activeRiskRating: null,
    }));
  };  const refreshRiskRatings = async () => {
    try {
      const updatedRatingsResult = await getRiskRatingNodes(modalState.failureUuid);
      if (updatedRatingsResult.success) {
        const updatedRatings = updatedRatingsResult.data || [];
        
        setModalState(prev => ({
          ...prev,
          existingRiskRatings: updatedRatings,
          activeRiskRating: updatedRatings.length > 0 ? updatedRatings[Math.min(prev.activeTabIndex, updatedRatings.length - 1)] : null,
          activeTabIndex: Math.min(prev.activeTabIndex, Math.max(0, updatedRatings.length - 1)),
        }));
      }
    } catch (error) {
      console.error('Error refreshing risk ratings:', error);
    }
  };

  const handleCreateRiskRating = async (values: { severity: number; occurrence: number; detection: number; ratingComment?: string }) => {
    try {
      setRiskRatingModalLoading(true);
      const result = await createRiskRatingNode(
        modalState.failureUuid,
        values.severity,
        values.occurrence,
        values.detection,
        values.ratingComment
      );
      
      if (result.success) {
        message.success('Risk rating created successfully!');
        await refreshRiskRatings();
          // After creating a new rating, determine the appropriate mode
        if (modalState.mode === 'create') {
          const updatedRatingsResult = await getRiskRatingNodes(modalState.failureUuid);          if (updatedRatingsResult.success) {
            const updatedRatings = updatedRatingsResult.data || [];
            
            if (updatedRatings.length === 1) {
              // First rating created - switch to edit mode
              setModalState(prev => ({
                ...prev,
                mode: 'edit',
                activeRiskRating: updatedRatings[0],
                existingRiskRatings: updatedRatings,
              }));
            } else if (updatedRatings.length > 1) {
              // Multiple ratings now exist - switch to tabs mode and show the newest rating (last tab)
              const newestRatingIndex = updatedRatings.length - 1;
              setModalState(prev => ({
                ...prev,
                mode: 'tabs',
                activeRiskRating: updatedRatings[newestRatingIndex],
                existingRiskRatings: updatedRatings,
                activeTabIndex: newestRatingIndex, // Show the newest rating tab (last tab)
              }));
            }
          }
        }
      } else {
        message.error(`Error creating risk rating: ${result.message}`);
      }
    } catch (error) {
      console.error('Error creating risk rating:', error);
      message.error('Failed to create risk rating');
    } finally {
      setRiskRatingModalLoading(false);
    }
  };

  const handleUpdateRiskRating = async (values: { severity: number; occurrence: number; detection: number; ratingComment?: string }) => {
    if (!modalState.activeRiskRating) return;
    
    try {
      setRiskRatingModalLoading(true);
      const result = await updateRiskRatingNode(
        modalState.activeRiskRating.uuid,
        values.severity,
        values.occurrence,
        values.detection,
        values.ratingComment
      );
      
      if (result.success) {
        message.success('Risk rating updated successfully!');
        await refreshRiskRatings();
      } else {
        message.error(`Error updating risk rating: ${result.message}`);
      }
    } catch (error) {
      console.error('Error updating risk rating:', error);
      message.error('Failed to update risk rating');
    } finally {
      setRiskRatingModalLoading(false);
    }
  };

  const handleDeleteRiskRating = async () => {
    if (!modalState.activeRiskRating) return;
    
    try {
      setRiskRatingModalLoading(true);
      const result = await deleteRiskRatingNode(modalState.activeRiskRating.uuid);
      
      if (result.success) {
        message.success('Risk rating deleted successfully!');
        const updatedRatingsResult = await getRiskRatingNodes(modalState.failureUuid);
        
        if (updatedRatingsResult.success) {
          const updatedRatings = updatedRatingsResult.data || [];
          
          if (updatedRatings.length === 0) {
            // No more ratings - close modal
            setRiskRatingModalVisible(false);
          } else if (updatedRatings.length === 1) {
            // One rating left - switch to edit mode
            setModalState(prev => ({
              ...prev,
              mode: 'edit',
              activeRiskRating: updatedRatings[0],
              existingRiskRatings: updatedRatings,
              activeTabIndex: 0,
            }));
          } else {
            // Multiple ratings - stay in tabs mode, adjust active tab
            const newActiveIndex = Math.min(modalState.activeTabIndex, updatedRatings.length - 1);
            setModalState(prev => ({
              ...prev,
              activeRiskRating: updatedRatings[newActiveIndex],
              existingRiskRatings: updatedRatings,
              activeTabIndex: newActiveIndex,
            }));
          }
        }
      } else {
        message.error(`Error deleting risk rating: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting risk rating:', error);
      message.error('Failed to delete risk rating');
    } finally {
      setRiskRatingModalLoading(false);
    }
  };

  const closeModal = () => {
    setRiskRatingModalVisible(false);
  };

  return {
    // Modal state
    riskRatingModalVisible,
    riskRatingModalLoading,
    modalState,
    
    // Event handlers
    handleRiskRatingClick,
    handleModalTabChange,
    handleCreateNewRiskRating,
    handleCreateRiskRating,
    handleUpdateRiskRating,
    handleDeleteRiskRating,
    closeModal,
    
    // Utility functions
    refreshRiskRatings,
  };
};
