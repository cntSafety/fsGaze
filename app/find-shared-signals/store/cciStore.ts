import { create } from "zustand";

// Define the CCIResultItem interface with more detailed requirement information
export interface CCIResultItem {
  id: string;
  timestamp?: string;
  requirementId?: string;
  requirementName?: string;
  sphinxneedsID?: string;
  asil?: string;
  //requirementAttributes?: { name: string; value: string }[];
  actions: any[];
  commonSources: any[];
}

interface CCIState {
  // CCI analysis results
  cciResults: CCIResultItem[];
  affectedActionNames: string[];
  sourceActionIds: string[];

  // UI state
  showResults: boolean;
  layouting: boolean;

  // Actions
  updateResults: (
    results: CCIResultItem[],
    affectedActions: string[],
    sourceIds: string[],
  ) => void;
  setShowResults: (show: boolean) => void;
  setLayouting: (layouting: boolean) => void;
  reset: () => void;
}

export const useCCIStore = create<CCIState>((set) => ({
  // Initial state
  cciResults: [],
  affectedActionNames: [],
  sourceActionIds: [],
  showResults: false,
  layouting: false,

  // Actions
  updateResults: (results, affectedActions, sourceIds) =>
    set({
      cciResults: results,
      affectedActionNames: affectedActions,
      sourceActionIds: sourceIds,
      // Always set showResults to true when we have results, even if the results array is empty
      showResults: true,
    }),

  setShowResults: (show) => set({ showResults: show }),

  setLayouting: (layouting) => set({ layouting }),

  reset: () =>
    set({
      cciResults: [],
      affectedActionNames: [],
      sourceActionIds: [],
      showResults: false,
    }),
}));
