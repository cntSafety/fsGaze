export interface Requirement {
  id: string;
  name: string;
  description: string;
  attributes: { name: string; value: string }[];
  sphinxneedsID?: string | null; // Add sphinxneedsID field
  asil?: string;
}

export interface FlowConnection {
  flowId: string;
  sourceId: string;
  sourceName: string;
  sourcePin: string;
  targetId: string;
  targetName: string;
  targetPin: string;
}

export interface ActionUsage {
  name: string;
  elementId: string; // Add this property to fix the TypeScript warning
  incomingFlows: Array<{
    sourceId: string;
    sourceName: string;
    sourcePin?: string;
    targetId: string;
    // Additional properties might be here
  }>;
  outgoingFlows: Array<{
    targetId: string;
    targetName: string;
    targetPin?: string;
    // Additional properties might be here
  }>;
  requirements: Array<{
    id: string;
    name: string;
    description: string;
    sphinxneedsID?: string | null;
    attributes?: Array<{
      name: string;
      value: string;
    }>;
    // Additional properties might be here
  }>;
  // Any other properties that might be present
}

export interface ActionsFlowsReqData {
  elementId: string;
  name: string;
  incomingFlows: {
    sourceId: string;
    sourceName: string;
    sourcePin: string | null;
    targetId: string;
  }[];
  outgoingFlows: {
    targetId: string;
    targetName: string;
    targetPin: string | null;
  }[];
  requirements: Requirement[];
}

// this are the dfa requirements which are assigned to several actions and have common sources.
export interface CCIResultItem {
  id?: string; // Add this required property
  requirementName: string;
  requirementId: string;
  sphinxneedsID?: string | null; // Add sphinxneedsID field
  asil?: string;
  actions: {
    name: string;
    id: string;
  }[];
  commonSources: { name: string; pin: string | null; id: string }[];
  timestamp: string;
}

export interface FlowNode {
  id: string;
  type: "custom";
  position: { x: number; y: number };
  data: {
    label: string;
    type: "action" | "requirement";
    borderColor?: string;
    borderWidth?: number;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
}
