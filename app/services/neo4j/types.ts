// Add type definitions
export interface ArxmlFileContent {
  name: string;
  path: string;
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

// ARXML Import Metadata Interfaces
export interface ArxmlImportInfo {
  uuid: string;
  importId: string;           // Unique import session ID
  importTimestamp: string;    // ISO timestamp
  importDuration: number;     // Processing time in milliseconds
  fileCount: number;          // Number of files imported
  fileNames: string[];        // Array of imported file names
  fileSizes: number[];        // Array of file sizes in bytes
  nodeCount: number;          // Total nodes created
  relationshipCount: number;  // Total relationships created
  unresolvedReferencesCount: number;
  importStatus: 'success' | 'partial' | 'failed';
  errorMessage?: string;      // If import failed
  userAgent?: string;         // Browser/client info
  importVersion: string;      // Version of import logic
}

export interface ArxmlFileInfo {
  uuid: string;
  fileName: string;
  filePath: string;           // Full file path (absolute if available, otherwise relative from selected directory)
  fileSize: number;           // File size in bytes
  importTimestamp: string;    // When this file was imported
  nodeCount: number;          // Nodes created from this file
  relationshipCount: number;  // Relationships created from this file
  arxmlVersion?: string;      // ARXML version if detectable
  checksum?: string;          // File hash for integrity
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
  assemblySWConnectorName: string;
  assemblySWConnectorUUID: string;
  swComponentName: string;
  swComponentUUID: string;
  swComponentType: string;
  receiverPortUUID: string | null;
  receiverPortName: string | null;
  // New fields for provider port failure modes
  providerPortUUID?: string | null;
  providerPortName?: string | null;
  failureModeName: string | null;
  failureModeUUID: string | null;
  failureModeASIL: string | null;
  swComponentClassName: string | null;
  swComponentClassUUID: string | null;
  swComponentClassType: string | null;
  swComponentWithinCompName?: string | null;
  swComponentWithinCompUUID?: string | null;
  receiverPortWithinCompositionUUID?: string | null;
  receiverPortWithinCompositionUUIDName?: string | null;
  receiverPortWithinCompositionName?: string | null;
  failureModeNameWithinCompositionRPort?: string | null;
  failureModeUUIDWithinCompositionRPort?: string | null;
  failureModeASILWithinCompositionRPort?: string | null;
  providerPortUUIDWithinComp?: string | null;
  providerPortNameWithinComp?: string | null;
  swComponentClassNameWithinComp?: string | null;
  swComponentClassUUIDWithinComp?: string | null;
  swComponentClassTypeWithinComp?: string | null;
  failureModeNameWithinComp?: string | null;
  failureModeUUIDWithinComp?: string | null;
  failureModeASILWithinComp?: string | null;
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
  FILE_INFO: "ArxmlFileInfo", // For individual file metadata nodes
  VIRTUAL_REF_NODE_LABEL: "VirtualArxmlRefTarget", // Label for virtually created nodes from unresolved refs
  // Add other specific, non-XML-tag-derived labels here if needed
};

export const RELATIONSHIP_TYPES = {
  CONTAINS: "CONTAINS", // Parent element contains child element
  REFERENCES_DATA_ELEMENT: "REFERENCES_DATA_ELEMENT", // Port/ComSpec refers to a DataElement
  IMPORT_SESSION: "IMPORT_SESSION", // Links import session to file metadata
  // Add other relationship types as needed
};
