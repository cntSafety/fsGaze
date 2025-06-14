// Risk rating constants for FMEA analysis

export interface RiskRatingOption {
  value: string;
  label: string;
  description: string;
  color: string;
}

export const SEVERITY_OPTIONS: RiskRatingOption[] = [
  {
    value: 'Low',
    label: 'Low',
    description: 'The impact of the failure is low',
    color: '#52c41a' // Green
  },
  {
    value: 'Medium',
    label: 'Medium',
    description: 'A higher impact but not violating human life',
    color: '#fadb14' // Light yellow
  },
  {
    value: 'High',
    label: 'High',
    description: 'Potential harm of humans',
    color: '#ff4d4f' // Red
  }
];

export const OCCURRENCE_OPTIONS: RiskRatingOption[] = [
  {
    value: 'Low Risk of Failure',
    label: 'Low',
    description: 'Simple stateless component with no side effects',
    color: '#52c41a' // Green
  },
  {
    value: 'Medium Risk of Failure',
    label: 'Medium',
    description: 'Non trivial algorythm with some states and side effects',
    color: '#fadb14' // Light yellow
  },
  {
    value: 'High Risk of Failure',
    label: 'High',
    description: 'Complex component with states and complex algorythms',
    color: '#ff4d4f' // Red
  }
];

export const DETECTION_OPTIONS: RiskRatingOption[] = [
  {
    value: 'Low Confidence',
    label: 'Low',
    description: 'Difficult to detect potential failures in the component',
    color: '#ff4d4f' // Red (low confidence in detection is bad)
  },
  {
    value: 'Medium Confidence',
    label: 'Medium',
    description: 'Placeholder description for medium detection',
    color: '#fadb14' // Light yellow
  },
  {
    value: 'High Confidence',
    label: 'High',
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
