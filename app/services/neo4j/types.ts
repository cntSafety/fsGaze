// Add type definitions
export interface ArxmlFileContent {
  name: string;
  content: string;
}

export interface Neo4jNode {
  uuid: string;
  label: string;
  props: Record<string, unknown>;
}

export interface Neo4jRelationship {
  from: string;
  to: string;
  type: string;
  props?: Record<string, unknown>;
}

export interface PendingReference {
  from: string;
  toPath: string;
  type: string;
  props?: Record<string, any>;
}

export interface UnresolvedReference {
  sourceUuid: string;
  targetPath: string;
  relationshipType: string;
  destinationAttribute: string;
  reason: string;
}

// Component visualization interfaces
export interface ComponentVisualizationNode {
  id: string;
  name: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface ComponentVisualizationRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface ComponentVisualizationResult {
  nodes: ComponentVisualizationNode[];
  relationships: ComponentVisualizationRelationship[];
  metadata: {
    totalNodes: number;
    totalRelationships: number;
    componentName: string;
    centerComponentId: string;
  };
}

// Assembly context interfaces
export interface AssemblyContextInfo {
  assemblySWConnectorName: string | null;
  assemblySWConnectorUUID: string | null;
  swComponentName: string | null;
  swComponentUUID: string | null;
  swComponentType: string | null;
  // New fields for port and ASIL information
  providerPortUUID?: string | null;
  providerPortName?: string | null;
  failureModeName?: string | null;
  failureModeUUID?: string | null;
  failureModeASIL?: string | null;
}

// Port and interface interfaces
export interface PortInfo {
  name: string;
  uuid: string;
  type: string;
}

export interface ScopeElement {
  name: string;
  uuid: string;
  type: string;
  ports: PortInfo[];
}

export interface Partner {
  name: string;
  uuid: string;
  type: string;
  ports: PortInfo[];
}

export interface Connection {
  name: string;
  uuid: string;
  TargetPPort: PortInfo | null;
  TargetRPort: PortInfo | null;
}

export interface ScopedComponentConnectionsAndPartnersResult {
  ScopeElement: ScopeElement | null;
  Partners: Partner[];
  Connections: Connection[];
}

export interface ProvidedInterfaceInfo {
  interfaceType: string;
  interfaceName: string;
  arxmlPath: string;
  uuid: string;
}

/**
 * Represents the connection information between two ports for diagramming purposes.
 */
export interface PortConnectionInfo {
  sourcePortUuid: string;
  sourceComponentId: string;
  targetPortUuid: string;
  targetComponentId: string;
}

/**
 * Represents the connection information between two ports for diagramming purposes,
 * including component and port names.
 */
export interface FullPortConnectionInfo {
  sourcePortUuid: string;
  sourcePortName: string;
  sourceComponentUuid: string;
  sourceComponentName: string;
  targetPortUuid: string;
  targetPortName: string;
  targetComponentUuid: string;
  targetComponentName: string;
}

// Constants for specific Node Labels and Relationship Types
export const SPECIFIC_NODE_LABELS = {
  DATA_ELEMENT_REF_TARGET: "ArxmlDataElementRefTarget", // For target nodes of *-REF elements
  IMPORT_INFO: "ArxmlImportInfo", // For the import metadata node
  VIRTUAL_REF_NODE_LABEL: "VirtualArxmlRefTarget", // Label for virtually created nodes from unresolved refs
  // Add other specific, non-XML-tag-derived labels here if needed
};

export const RELATIONSHIP_TYPES = {
  CONTAINS: "CONTAINS", // Parent element contains child element
  REFERENCES_DATA_ELEMENT: "REFERENCES_DATA_ELEMENT", // Port/ComSpec refers to a DataElement
  // Add other relationship types as needed
};
