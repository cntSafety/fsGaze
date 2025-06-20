# Safety Model Documentation

## Overview
The safety module provides comprehensive CRUD operations for a safety analysis model built on Neo4j. The model supports failure analysis, risk assessment, safety tasks, safety requirements, and safety notes with their interconnected relationships.

## Safety Model Structure

### Node Types

#### 1. FAILUREMODE Nodes
- **Purpose**: Represent failure modes in the system
- **Properties**:
  - `uuid`: Unique identifier
  - `name`: Failure mode name
  - `created`: Creation timestamp (ISO format)
  - `lastModified`: Last modification timestamp
  - `description`: Detailed failure mode description
  - `asil`: ASIL rating (QM, A, B, C, D)
- **Relationships**:
  - `OCCURRENCE` → Links to source elements (ports, components)
  - `RATED` → Connected to RISKRATING nodes
  - `FIRST/THEN` → Connected via CAUSATION nodes
  - `HAS_SAFETY_REQUIREMENT` → Connected to SAFETYREQ nodes

#### 2. RISKRATING Nodes
- **Purpose**: Store risk assessment data using FMEA methodology
- **Properties**:
  - `uuid`: Unique identifier
  - `name`: Auto-generated name (e.g., "Risk Rating 1")
  - `created`: Creation timestamp
  - `lastModified`: Last modification timestamp
  - `severity`: Severity rating (1-10)
  - `occurrence`: Occurrence rating (1-10)
  - `detection`: Detection rating (1-10)
  - `overallRisk`: Calculated value (severity × occurrence × detection)
  - `ratingComment`: Optional comment
- **Relationships**:
  - `RATED` ← Links from FAILUREMODE nodes
  - `TASKREF` → Connected to SAFETYTASK nodes

#### 3. SAFETYTASK Nodes
- **Purpose**: Track safety-related tasks and measures
- **Properties**:
  - `uuid`: Unique identifier
  - `name`: Task name
  - `created`: Creation timestamp
  - `lastModified`: Last modification timestamp
  - `description`: Task description
  - `status`: Task status ('open', 'started', 'in-review', 'finished')
  - `responsible`: Person responsible for the task
  - `reference`: Optional reference information
  - `taskType`: Type of task ('runtime measures', 'dev-time measures', 'other')
- **Relationships**:
  - `TASKREF` ← Links from any node (typically RISKRATING or FAILUREMODE)

#### 4. SAFETYREQ Nodes
- **Purpose**: Store safety requirements
- **Properties**:
  - `uuid`: Unique identifier
  - `name`: Requirement name
  - `created`: Creation timestamp
  - `lastModified`: Last modification timestamp
  - `reqID`: Requirement identifier
  - `reqText`: Requirement text/description
  - `reqASIL`: ASIL rating (QM, A, B, C, D)
  - `reqLinkedTo`: Optional link to other elements
- **Relationships**:
  - `HAS_SAFETY_REQUIREMENT` ← Can link from any node

#### 5. SAFETYNOTE Nodes
- **Purpose**: Store safety-related notes and comments
- **Properties**:
  - `uuid`: Unique identifier
  - `note`: Note content
  - `created`: Creation timestamp
  - `lastModified`: Last modification timestamp
- **Relationships**:
  - `NOTEREF` ← Links from any node

#### 6. CAUSATION Nodes
- **Purpose**: Represent causal relationships between failure modes
- **Properties**:
  - `uuid`: Unique identifier
  - `name`: Auto-generated name
  - `created`: Creation timestamp
- **Relationships**:
  - `FIRST` → Points to cause failure mode
  - `THEN` → Points to effect failure mode

### Relationship Patterns

```
FAILUREMODE --[OCCURRENCE]--> SourceElement (P_PORT_PROTOTYPE, R_PORT_PROTOTYPE, etc.)
FAILUREMODE --[RATED]--> RISKRATING
AnyNode --[TASKREF]--> SAFETYTASK
AnyNode --[HAS_SAFETY_REQUIREMENT]--> SAFETYREQ
AnyNode --[NOTEREF]--> SAFETYNOTE
CAUSATION --[FIRST]--> FAILUREMODE (cause)
CAUSATION --[THEN]--> FAILUREMODE (effect)
```

## File Structure

```
app/services/neo4j/queries/safety/
├── index.ts              # Main export file
├── types.ts              # Type definitions and interfaces
├── importGraph.ts        # Graph import functionality
├── exportGraph.ts        # Graph export functionality
├── failureModes.ts       # FAILUREMODE node CRUD operations
├── riskRating.ts         # RISKRATING node CRUD operations
├── safetyTasks.ts        # SAFETYTASK node CRUD operations
├── safetyReq.ts          # SAFETYREQ node CRUD operations
├── safetyNotes.ts        # SAFETYNOTE node CRUD operations
├── causation.ts          # CAUSATION relationship operations
├── deleteSafetyNodes.ts  # Centralized delete operations
└── README.md             # This documentation
```

## API Functions by Module

### failureModes.ts
- `createFailureModeNode()` - Create new failure mode with OCCURRENCE relationship
- `updateFailureModeNode()` - Update failure mode properties
- `deleteFailureModeNode()` - Delete failure mode and related relationships
- `getFailureModesForPorts()` - Get failure modes linked to port prototypes
- `getFailureModesForSwComponents()` - Get failure modes linked to SW components

### riskRating.ts
- `createRiskRatingNode()` - Create risk rating linked to failure
- `updateRiskRatingNode()` - Update risk rating properties
- `deleteRiskRatingNode()` - Delete risk rating node
- `getRiskRatingNodes()` - Get risk ratings for failures

### safetyTasks.ts
- `createSafetyTask()` - Create safety task linked to any node
- `updateSafetyTask()` - Update safety task properties
- `deleteSafetyTask()` - Delete safety task node
- `getSafetyTasksForNode()` - Get tasks linked to specific node

### safetyReq.ts
- `createSafetyReq()` - Create safety requirement
- `updateSafetyReq()` - Update safety requirement properties
- `deleteSafetyReq()` - Delete safety requirement node
- `getSafetyReqsForNode()` - Get requirements linked to specific node

### safetyNotes.ts
- `createSafetyNote()` - Create safety note linked to any node
- `updateSafetyNote()` - Update safety note content
- `deleteSafetyNote()` - Delete safety note node
- `getSafetyNotesForNode()` - Get notes linked to specific node

### causation.ts
- `createCausationBetweenFailureModes()` - Create causal relationship
- `deleteCausationNode()` - Delete causation node and relationships

### Import/Export
- `importSafetyGraphData()` - Import complete safety graph
- `getSafetyGraph()` - Export complete safety graph with all relationships

## Data Flow and Dependencies

### Typical Safety Analysis Workflow:
1. **Create Failure Modes** → Link to system elements (ports, components)
2. **Assess Risks** → Create RISKRATING nodes linked to failure modes
3. **Define Tasks** → Create SAFETYTASK nodes linked to risk ratings
4. **Document Requirements** → Create SAFETYREQ nodes as needed
5. **Add Notes** → Create SAFETYNOTE nodes for additional context
6. **Model Causation** → Create CAUSATION relationships between failure modes

### Deletion Considerations:
When deleting nodes, consider the dependency chain:
- Deleting a FAILUREMODE will orphan connected RISKRATINGs
- Deleting a RISKRATING will orphan connected SAFETYTASKs
- CAUSATION nodes depend on FAILUREMODE nodes existing
- SAFETYNOTE and SAFETYREQ nodes can be safely deleted independently

## Validation Rules

### ASIL Values
- Must be one of: 'QM', 'A', 'B', 'C', 'D'

### Risk Rating Values
- Severity: 1-10 integer
- Occurrence: 1-10 integer  
- Detection: 1-10 integer
- Overall Risk: Calculated as severity × occurrence × detection

### Safety Task Status
- Must be one of: 'open', 'started', 'in-review', 'finished'

### Safety Task Types
- Must be one of: 'runtime measures', 'dev-time measures', 'other'

## Backward Compatibility

All existing imports continue to work through the main safety export:
```typescript
import { createFailureModeNode, createRiskRatingNode } from '@/app/services/neo4j/queries/safety';
```

## Query Examples

### Get All Safety Nodes for a SW Component

This comprehensive query retrieves all safety-related information for a specific SW component, including failure modes, notes, tasks, risk ratings, and causation chains:

```cypher
//all safety nodes for a given SW component
match(swc) where swc.uuid="F2F2D5DA-6C14-4AC3-8EC0-8F961F3A0A81" 
//get notes for swc
OPTIONAL match(swc)-[notRel:NOTEREF]->(swcNote)
//get the failure modes for the sw component
OPTIONAL match (fm)-[occRel:OCCURRENCE]->(swc) 
//-- get notes for fm
OPTIONAL match (fm)-[noteRelfm:NOTEREF]->(fmNote) 
//-- get tasks for fm
OPTIONAL match (fm)-[taskRelfm:TASKREF]->(fmTask)
//-- get risk rating rr for fm
OPTIONAL match (fm)-[rrRelfm:RATED]->(fmrr)
//-- get tasks related to risk reating (rrTasks)
OPTIONAL match (fmrr)-[fmrrRelTask:TASKREF]->(rrTask)
//-- get causation for fm / first so this is the start of the causation
OPTIONAL match (fm)<-[causationRelFirst:FIRST]-(causation)
//---get causation partner first --> then 
OPTIONAL match (causation)-[causationRelThen:THEN]->(fmOfPartner)
//---get the partner node where this failure mode occurs 
OPTIONAL match (fmOfPartner)-[partnerFMtoOccSource:OCCURRENCE]->(impactedElement) 
RETURN swc, swcNote, fm, fmNote, fmTask, fmrr, rrTask, fmOfPartner, impactedElement
```


```cypher
//all safety relevand nodes for a given SW component
match(swc) where swc.uuid="F2F2D5DA-6C14-4AC3-8EC0-8F961F3A0A81" 
//get notes for swc
OPTIONAL match(swc)-[notRel:NOTEREF]->(swcNote)
//get the failure modes for the sw component
OPTIONAL match (fm)-[occRel:OCCURRENCE]->(swc) 
//-- get notes for fm
OPTIONAL match (fm)-[noteRelfm:NOTEREF]->(fmNote) 
//-- get tasks for fm
OPTIONAL match (fm)-[taskRelfm:TASKREF]->(fmTask)
//-- get risk rating rr for fm
OPTIONAL match (fm)-[rrRelfm:RATED]->(fmrr)
//-- get tasks related to risk reating (rrTasks)
OPTIONAL match (fmrr)-[fmrrRelTask:TASKREF]->(rrTask)
RETURN swc.name as componentName, swcNote.note as safetyNote, fm.name as fmName, fm.description as fmDescription,
fmNote.note as fmNote, fmTask.name as fmTask, fmrr.name as riskRatingName, fmrr.Severity as Severity, fmrr.Occurrence as Occurrence, fmrr.Detection as Detection, fmrr.RatingComment as RatingComment, rrTask.name as RiskRatingTaskName, rrTask.description as RiskRatingTaskDescription
```


This query demonstrates:

- **NOTEREF**: References to safety notes from components and failure modes
- **OCCURRENCE**: Links failure modes to their source elements
- **TASKREF**: References to safety tasks from failure modes
- **RATED**: Risk rating assessments for failure modes
- **FIRST/THEN**: Causation chain relationships showing cause-effect patterns
- **Complex traversal**: Following causation chains to find impacted elements

## Testing and Validation

All modules include comprehensive error handling and validation:

- Input parameter validation
- Node existence verification
- Relationship integrity checks
- Transaction rollback on errors
- Detailed error messages for debugging
