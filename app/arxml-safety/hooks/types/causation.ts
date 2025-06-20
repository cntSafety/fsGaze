export interface CausationSelection {
  failureUuid: string;
  failureName: string;
  componentUuid: string;
  componentName: string;
  timestamp: number;
  tabId: string;
  sourceType: 'component' | 'provider-port' | 'receiver-port';
}

export interface CausationSelectionState {
  first: CausationSelection | null;
  second: CausationSelection | null;
  expiresAt: number;
}

export interface CausationStorageEvents {
  'causation-selection-changed': CausationSelectionState;
  'causation-selection-cleared': void;
}
