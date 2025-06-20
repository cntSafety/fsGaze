import { useState, useEffect, useCallback } from 'react';
import type { CausationSelection, CausationSelectionState } from './types/causation';

const STORAGE_KEY = 'fsGaze_causation_selection';
const EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Custom event system for cross-tab communication
class CausationEventEmitter extends EventTarget {
  emit(eventName: string, data?: any) {
    this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
  }
}

const causationEvents = new CausationEventEmitter();

export const useCausationStorage = () => {
  const [selectionState, setSelectionState] = useState<CausationSelectionState>({
    first: null,
    second: null,
    expiresAt: 0
  });

  // Initialize storage and cleanup on app start
  useEffect(() => {
    const initializeStorage = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: CausationSelectionState = JSON.parse(stored);
          
          // Check if expired
          if (Date.now() > parsed.expiresAt) {
            localStorage.removeItem(STORAGE_KEY);
            setSelectionState({ first: null, second: null, expiresAt: 0 });
          } else {
            setSelectionState(parsed);
          }
        }
      } catch (error) {
        console.error('Error initializing causation storage:', error);
        localStorage.removeItem(STORAGE_KEY);
        setSelectionState({ first: null, second: null, expiresAt: 0 });
      }
    };

    initializeStorage();

    // Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        if (e.newValue) {
          try {
            const parsed: CausationSelectionState = JSON.parse(e.newValue);
            setSelectionState(parsed);
            causationEvents.emit('causation-selection-changed', parsed);
          } catch (error) {
            console.error('Error parsing storage change:', error);
          }
        } else {
          setSelectionState({ first: null, second: null, expiresAt: 0 });
          causationEvents.emit('causation-selection-cleared');
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Save selection to storage
  const saveToStorage = useCallback((newState: CausationSelectionState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      setSelectionState(newState);
    } catch (error) {
      console.error('Error saving to causation storage:', error);
    }
  }, []);

  // Add or update a selection
  const addSelection = useCallback((selection: Omit<CausationSelection, 'timestamp' | 'tabId'>) => {
    const fullSelection: CausationSelection = {
      ...selection,
      timestamp: Date.now(),
      tabId: TAB_ID
    };

    const newState: CausationSelectionState = {
      first: selectionState.first,
      second: selectionState.second,
      expiresAt: Date.now() + EXPIRY_TIME
    };

    // If no first selection, set as first
    if (!newState.first) {
      newState.first = fullSelection;
    }
    // If first exists but no second, and it's different from first, set as second
    else if (!newState.second && newState.first.failureUuid !== fullSelection.failureUuid) {
      newState.second = fullSelection;
    }
    // If both exist, replace first and clear second
    else {
      newState.first = fullSelection;
      newState.second = null;
    }

    saveToStorage(newState);
    return newState;
  }, [selectionState, saveToStorage]);

  // Clear all selections
  const clearSelections = useCallback(() => {
    const newState: CausationSelectionState = {
      first: null,
      second: null,
      expiresAt: 0
    };
    
    localStorage.removeItem(STORAGE_KEY);
    setSelectionState(newState);
    causationEvents.emit('causation-selection-cleared');
  }, []);

  // Remove completed selections after causation creation
  const clearAfterCausationCreation = useCallback(() => {
    clearSelections();
  }, [clearSelections]);

  // Check if a failure is selected
  const isFailureSelected = useCallback((failureUuid: string) => {
    return selectionState.first?.failureUuid === failureUuid || 
           selectionState.second?.failureUuid === failureUuid;
  }, [selectionState]);

  // Get selection state for a failure
  const getFailureSelectionState = useCallback((failureUuid: string) => {
    if (selectionState.first?.failureUuid === failureUuid) return 'first';
    if (selectionState.second?.failureUuid === failureUuid) return 'second';
    return null;
  }, [selectionState]);

  // Check if selections are ready for causation creation
  const isReadyForCausation = useCallback(() => {
    return selectionState.first && selectionState.second;
  }, [selectionState]);

  // Get selection info for display
  const getSelectionInfo = useCallback(() => {
    return {
      first: selectionState.first,
      second: selectionState.second,
      isReady: isReadyForCausation(),
      isCrossComponent: selectionState.first && selectionState.second && 
                       selectionState.first.componentUuid !== selectionState.second.componentUuid
    };
  }, [selectionState, isReadyForCausation]);

  return {
    selectionState,
    addSelection,
    clearSelections,
    clearAfterCausationCreation,
    isFailureSelected,
    getFailureSelectionState,
    isReadyForCausation,
    getSelectionInfo,
    events: causationEvents
  };
};

export default useCausationStorage;
