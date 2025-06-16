// Risk rating constants for FMEA analysis

export interface RiskRatingOption {
  value: number;
  label: string;
  description: string;
  color: string;
}

export const SEVERITY_OPTIONS: RiskRatingOption[] = [
  {
    value: 1,
    label: 'QM impact',
    description: 'No violation safety requiremetns',
    color: '#52c41a' // Green
  },
  {
    value: 2,
    label: 'Indirect safety impact',
    description: 'Safety impact only in combination with another failure, e.g. Safety mechansism is not working as expected',
    color: '#fadb14' // Light yellow
  },
  {
    value: 3,
    label: 'Direct safety impact',
    description: 'Leads to a direct violation of safety requirements, e.g. wrong setting of target toreqe',
    color: '#ff4d4f' // Red
  }
];

export const OCCURRENCE_OPTIONS: RiskRatingOption[] = [
  {
    value: 1,
    label: 'Simple',
    description: 'Simple stateless component with no side effects',
    color: '#52c41a' // Green
  },
  {
    value: 2,
    label: 'Medium complexity',
    description: 'Non trivial algorythm with some states and side effects',
    color: '#fadb14' // Light yellow
  },
  {
    value: 3,
    label: 'High complexity',
    description: 'Complex component with states and complex algorythms',
    color: '#ff4d4f' // Red
  }
];

export const DETECTION_OPTIONS: RiskRatingOption[] = [
  {
    value: 1,
    label: 'Low Confidence',
    description: 'Difficult to detect potential failures in the component',
    color: '#ff4d4f' // Red (low confidence in detection is bad)
  },
  {
    value: 2,
    label: 'Medium Confidence',
    description: 'In most cases it is possible to detect potential failures in the component',
    color: '#fadb14' // Light yellow
  },
  {
    value: 3,
    label: 'High Confidence',
    description: 'Easy to detect potential failures in the component',
    color: '#52c41a' // Green (high confidence in detection is good)
  }
];

// Numeric mapping for database storage
export const RATING_VALUE_MAP: Record<string, number> = {
  // Severity mappings
  'Low': 1,
  'Medium': 2,
  'High': 3,
  // Occurrence mappings
  'Low Risk of Failure': 1,
  'Medium Risk of Failure': 2,
  'High Risk of Failure': 3,
  // Detection mappings
  'Low Confidence': 1,
  'Medium Confidence': 2,
  'High Confidence': 3
};

// Reverse mapping for display
export const RATING_DISPLAY_MAP: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High'
};
