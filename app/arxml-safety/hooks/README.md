# Cross-Component Causation System

## Overview

The cross-component causation system allows users to create failure causation relationships between components across different browser tabs. This enables complex safety analysis workflows where failures in one component can cause failures in another component.

## Architecture

### Core Components

1. **useCausationStorage** - Manages browser localStorage for persistence across tabs
2. **useCrossComponentCausation** - Main hook for component integration
3. **CrossComponentCausationIndicator** - UI component showing current selection state

### Data Flow

```
Component A (Tab 1) → localStorage → Component B (Tab 2) → Causation Creation
```

## Key Features

### Browser Storage Persistence
- Selections persist across browser tabs and page refreshes
- Automatic cleanup after 30 minutes
- Cross-tab synchronization using storage events

### Universal Integration
- Works within single components (existing behavior)
- Works across different components (new feature)
- Backward compatible with existing CoreSafetyTable

### Visual Feedback
- Clear indication of current selections
- Cross-component vs. intra-component distinction
- Status messages guiding user workflow

## Usage

### Basic Integration

```tsx
import { useCrossComponentCausation } from '../hooks/useCrossComponentCausation';
import CrossComponentCausationIndicator from './CrossComponentCausationIndicator';

const MyComponent = ({ componentUuid, componentName }) => {
  const {
    handleFailureSelection,
    clearSelections,
    getSelectionDisplayInfo
  } = useCrossComponentCausation(componentUuid, componentName);

  const selectionDisplayInfo = getSelectionDisplayInfo();

  return (
    <>
      <CrossComponentCausationIndicator
        first={selectionDisplayInfo.first}
        second={selectionDisplayInfo.second}
        isCrossComponent={selectionDisplayInfo.isCrossComponent}
        isReady={selectionDisplayInfo.isReady}
        statusText={selectionDisplayInfo.statusText}
        onClear={clearSelections}
      />
      
      {/* Your existing failure tables/components */}
    </>
  );
};
```

### Failure Selection Handler

```tsx
// Create wrapper for backward compatibility
const handleFailureSelectionWrapper = (failure: { uuid: string; name: string }) => {
  handleFailureSelection(failure.uuid, failure.name, 'component');
};

// Pass to tables
<SwFailureModesTable 
  onFailureSelect={handleFailureSelectionWrapper}
  selectedFailures={selectedFailures}
/>
```

## Storage Schema

```typescript
interface CausationSelection {
  failureUuid: string;
  failureName: string;
  componentUuid: string;
  componentName: string;
  timestamp: number;
  tabId: string;
  sourceType: 'component' | 'provider-port' | 'receiver-port';
}

interface CausationSelectionState {
  first: CausationSelection | null;
  second: CausationSelection | null;
  expiresAt: number;
}
```

## Workflow Examples

### Same Component Causation
1. User selects Failure A → Stored as 'first'
2. User selects Failure B (same component) → Stored as 'second'
3. Causation created: A → B

### Cross-Component Causation
1. User opens Component X analysis (Tab 1)
2. User selects Failure A in Component X → Stored as 'first'
3. User opens Component Y analysis (Tab 2)
4. Indicator shows: "Cause: Failure A (Component X)"
5. User selects Failure B in Component Y → Stored as 'second'
6. Cross-component causation created: A (Component X) → B (Component Y)

## Safety Features

### Automatic Cleanup
- Selections expire after 30 minutes
- Invalid/expired selections are removed on app startup
- Tab-specific tracking prevents conflicts

### Validation
- Prevents self-causation (same failure)
- Validates component and failure existence
- Error handling for network failures

### User Experience
- Clear visual feedback for all states
- Intuitive workflow guidance
- Easy cancellation/reset functionality

## File Structure

```
app/arxml-safety/
├── hooks/
│   ├── types/
│   │   └── causation.ts              # Type definitions
│   ├── useCausationStorage.ts        # Storage management
│   └── useCrossComponentCausation.ts # Main integration hook
└── components/
    └── CrossComponentCausationIndicator.tsx # UI component
```

## Integration Points

### SwSafetyAnalysisComponent
- Displays CrossComponentCausationIndicator
- Passes selection state to all failure tables
- Handles backward compatibility

### CoreSafetyTable
- Uses existing selectedFailures interface
- Link buttons trigger handleFailureSelection
- Visual feedback for selected failures

### FMFlow
- Integration for visual causation creation
- Node selection triggers handleFailureSelection
- Visual indicators for selected nodes
