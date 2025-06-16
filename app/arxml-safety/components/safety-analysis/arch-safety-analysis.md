# ARXML Safety Analysis Subsystem Architecture

## Overview
The `arxml-safety` subsystem provides comprehensive safety analysis functionality for AUTOSAR ARXML files. This documentation describes the architecture, components, and important implementation details to help mainteners understand the structure and avoid common pitfalls.

## System Architecture

## System Architecture

### Directory Structure
```
app/arxml-safety/
├── components/
│   ├── ArxmlSafetyAnalysisTable.tsx     # Main safety analysis table
│   ├── CoreSafetyTable.tsx              # Reusable table component
│   ├── ElementDetailsModal.tsx          # Element details modal
│   ├── RiskRatingModal.tsx              # Risk rating CRUD modal
│   └── safety-analysis/
│       ├── hooks/
│       │   ├── useRiskRatingManager.ts  # Risk rating state management
│       │   ├── useSwFailureModes.ts     # SW component failures
│       │   ├── useProviderPortFailures.ts # Provider port failures
│       │   └── useReceiverPortFailures.ts # Receiver port failures
│       ├── BaseFailureModeTable.tsx     # Base table component
│       ├── RiskRatingManager.tsx        # Risk rating provider
│       ├── SwFailureModesTable.tsx      # SW failure modes table
│       ├── ProviderPortsFailureModesTable.tsx # Provider ports table
│       └── ReceiverPortsFailureModesTable.tsx # Receiver ports table
├── hooks/
│   └── useTableState.ts                 # Table state management
├── services/
│   └── safetyApi.ts                     # API service layer
├── types/
│   └── index.ts                         # TypeScript type definitions
└── utils/
    ├── constants.ts                     # General constants
    └── riskRatingConstants.ts           # Risk rating specific constants
```

## Core Components

### 1. Risk Rating System

#### RiskRatingModal.tsx
**Purpose**: Modal for creating, editing, and viewing risk ratings with support for multiple ratings per failure.

**Key Features**:
- Three operational modes: `create`, `edit`, `tabs`
- Multi-risk rating support with tabbed interface
- Timestamp tracking (created/modified dates)
- Form validation with Ant Design Form component
- Loading states and error handling

**Important Implementation Details**:
- Uses `Form.useForm()` hook for form management
- Form instance must always be connected to Form element to avoid warnings
- Each Form.Item must have exactly one child element
- Uses integer values directly for Severity/Occurrence/Detection (1-5 scale)

**Ant Design Components Used**:
- `Modal` - Main container (avoid `destroyOnClose`, use `destroyOnHidden`)
- `Form` - Form wrapper with form instance
- `Form.Item` - Form field containers (single child requirement)
- `Input` - Text inputs
- `Select` - Dropdown selections
- `Button` - Action buttons
- `Typography.Text` - Text display
- `Tabs` - Tabbed interface for multiple ratings
- `Space` - Layout spacing

#### RiskRatingManager.tsx
**Purpose**: Provider component using render props pattern to manage risk rating functionality.

**Features**:
- Wraps `useRiskRatingManager` hook
- Provides clean API to child components
- Automatically renders `RiskRatingModal`
- Centralized state management

#### useRiskRatingManager.ts
**Purpose**: Custom hook for risk rating business logic and state management.

**Key Responsibilities**:
- Modal state management (visible, loading, mode)
- CRUD operations for risk ratings
- Smart modal mode determination based on existing ratings
- Error handling and user feedback
- Tab management for multiple risk ratings

**State Interface**:
```typescript
interface RiskRatingModalState {
  failureUuid: string;
  failureName: string;
  failureDescription?: string;  // Optional failure description
  mode: 'create' | 'edit' | 'tabs';
  activeRiskRating: RiskRating | null;
  existingRiskRatings: RiskRating[];
  activeTabIndex: number;
}
```

### 2. Table System

#### CoreSafetyTable.tsx
**Purpose**: Reusable table component with built-in editing, actions, and modal integration.

**Key Features**:
- Editable cells with inline editing
- Resizable columns with persistence
- Action buttons (edit, save, cancel, delete)
- Modal integration for element details and risk ratings
- Row selection and highlighting
- Pagination support

**Important Implementation Details**:
- Function declared as `export default function CoreSafetyTable({})`
- No duplicate export statements needed
- Proper newline formatting required between JSX elements
- Form instance connection required for editing functionality

**Ant Design Components Used**:
- `Table` - Main table component with custom cell renderers
- `Form` - For inline editing functionality
- `Input` - Editable cell inputs
- `Button` - Action buttons
- `Space` - Action button layout
- `Popconfirm` - Delete confirmations
- `Tooltip` - Hover information

#### BaseFailureModeTable.tsx
**Purpose**: Base component for all failure mode tables, provides consistent structure.

**Features**:
- Wraps `CoreSafetyTable` with `RiskRatingManager`
- Standard layout and styling
- Configurable empty states
- Flexible title prop (string or ReactNode)

### 3. Specialized Table Components

#### SwFailureModesTable.tsx
**Purpose**: Software component failure modes analysis.

#### ProviderPortsFailureModesTable.tsx
**Purpose**: Provider port failure modes analysis.

#### ReceiverPortsFailureModesTable.tsx
**Purpose**: Receiver port failure modes analysis.

## Ant Design Best Practices & Common Pitfalls

### ✅ Correct Usage

#### Form Components
```typescript
// Correct: Form instance always connected
const [form] = Form.useForm();
return (
  <Form form={form}>
    <Form.Item name="field" rules={[{required: true}]}>
      <Input />
    </Form.Item>
  </Form>
);
```

#### Modal Components
```typescript
// Correct: Use destroyOnHidden instead of destroyOnClose
<Modal
  open={visible}
  onCancel={handleCancel}
  destroyOnHidden
  width={600}
>
  {content}
</Modal>
```

#### Select Components with Risk Rating Values
```typescript
// Correct: Use integer values directly
<Select value={severity} onChange={setSeverity}>
  {SEVERITY_OPTIONS.map(option => (
    <Option key={option.value} value={option.value}>
      <span style={{ color: option.color }}>
        {option.label}
      </span>
    </Option>
  ))}
</Select>
```

### ❌ Common Mistakes to Avoid

#### Deprecated/Incorrect Patterns
```typescript
// ❌ Wrong: destroyOnClose is deprecated
<Modal destroyOnClose />

// ❌ Wrong: Multiple children in Form.Item
<Form.Item>
  <Input />
  <Button />  // This breaks Form.Item structure
</Form.Item>

// ❌ Wrong: Form without form instance
<Form>  // Missing form={formInstance}
  <Form.Item><Input /></Form.Item>
</Form>

// ❌ Wrong: String values for risk ratings
<Select value="3" onChange={handleChange}>  // Should be integer 3

// ❌ Wrong: Missing newlines in JSX
<Component prop="value"      anotherProp="value">  // Breaks parsing
```

#### Syntax Issues to Avoid
```typescript
// ❌ Wrong: Missing newlines between JSX elements
<div>content</div>    <div>more content</div>

// ❌ Wrong: Improper function declarations
export default function Component() {
  // ...
};
export default Component;  // Duplicate export

// ❌ Wrong: Missing semicolons or braces
const func = () => {
  // missing closing brace
```

## Risk Rating Constants


### Usage Guidelines
- Always use integer values (1-5) for calculations
- Display labels in UI, store/transmit integers
- Apply color coding for visual distinction
- Provide descriptions in tooltips

## API Integration

### Safety API Service
**Location**: `app/arxml-safety/services/safetyApi.ts`

**Key Functions**:
- `getRiskRatingNodes(failureUuid)` - Fetch risk ratings for failure
- `createRiskRating(data)` - Create new risk rating
- `updateRiskRating(data)` - Update existing risk rating
- `deleteRiskRating(riskRatingId)` - Delete risk rating

**Important Notes**:
- All API calls return `{success: boolean, data?: any, message?: string}`
- Error handling is centralized in the hook layer
- Backend expects integer values for risk rating fields

## State Management Patterns

### Hook-Based Architecture
- Business logic isolated in custom hooks
- UI components focus on presentation only
- Centralized state management for related functionality
- Clear separation of concerns

### Modal State Management
```typescript
interface ModalState {
  visible: boolean;
  loading: boolean;
  mode: 'create' | 'edit' | 'tabs';
  data: any;
}
```

## Testing Considerations

### Component Testing
- Mock custom hooks for isolated component testing
- Test form validation and submission flows
- Verify modal opening/closing behavior
- Check table interactions and editing

### Hook Testing
- Test state transitions and business logic
- Mock API calls and verify error handling
- Test edge cases (empty data, network errors)
- Verify side effects (messages, state updates)

## Future Development Guidelines

### Adding New Components
1. Follow the hook-based architecture pattern
2. Use TypeScript interfaces for all props and state
3. Implement proper error handling and loading states
4. Follow Ant Design best practices
5. Add proper JSX formatting and syntax
6. Include comprehensive type definitions

### Extending Existing Functionality
1. Add new features to appropriate hooks
2. Maintain backward compatibility
3. Update TypeScript interfaces
4. Add proper error handling
5. Update documentation

This architecture provides a maintainable, scalable foundation for safety analysis functionality while avoiding common implementation pitfalls.
