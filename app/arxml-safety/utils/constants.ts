// Constants for the safety analysis module

export const ASIL_OPTIONS = [
  { value: 'A', label: 'ASIL A' },
  { value: 'B', label: 'ASIL B' },
  { value: 'C', label: 'ASIL C' },
  { value: 'D', label: 'ASIL D' },
  { value: 'QM', label: 'QM' },
  { value: 'TBC', label: 'TBC' },
];

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];

export const TABLE_COLUMNS = {
  SW_COMPONENT_NAME: 'swComponentName',
  FAILURE_NAME: 'failureName',
  FAILURE_DESCRIPTION: 'failureDescription',
  ASIL: 'asil',
} as const;

export const PLACEHOLDER_VALUES = {
  NO_FAILURES: 'No failures defined',
  NO_DESCRIPTION: '-',
  DEFAULT_ASIL: 'TBC',
} as const;

export const COLORS = {
  PLACEHOLDER_TEXT: '#999',
  FIRST_SELECTION: '#e6f3ff',
  SECOND_SELECTION: '#ffe6e6',
} as const;

export const MESSAGES = {
  SUCCESS: {
    FAILURE_ADDED: 'Failure mode added successfully!',
    FAILURE_UPDATED: 'Failure mode updated successfully!',
    FAILURE_DELETED: 'Failure mode deleted successfully!',
    CAUSATION_CREATED: 'Causation created successfully!',
  },
  ERROR: {
    LOAD_FAILED: 'Failed to load safety analysis data',
    SAVE_FAILED: 'Please fill in all required fields',
    DELETE_FAILED: 'Failed to delete failure mode',
    CAUSATION_FAILED: 'Failed to create causation between failure modes',
    NO_UUID: 'Cannot delete failure: No failure UUID found',
    COMPONENT_NOT_FOUND: 'SW Component not found',
  },
} as const;
