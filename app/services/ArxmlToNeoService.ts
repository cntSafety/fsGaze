/**
 * ArxmlToNeoService - Modular ARXML to Neo4j Service
 * 
 * This service has been refactored into smaller, focused modules:
 * - types.ts: All TypeScript interfaces and type definitions
 * - config.ts: Neo4j driver configuration
 * - utils.ts: Utility functions for UUID generation and data transformation
 * - queries/arxml-import.ts: ARXML parsing and import functionality
 * - queries/components.ts: Component-related queries
 * - queries/ports.ts: Port-related queries  
 * - queries/safety.ts: Safety/failure mode queries
 * - queries/general.ts: General utility queries
 */

// Re-export all functionality from modular files
export * from './neo4j/types';
export * from './neo4j/config';
export * from './neo4j/utils';
// We are changing the export for arxml-import to be explicit
// to help the TS language server resolve the module correctly.
export { 
    extractArxmlNodesAndRelationships,
    uploadArxmlToNeo4j,
    getLatestArxmlImportInfo,
    getArxmlFileInfoForImport
} from './neo4j/queries/arxml-import';
export * from './neo4j/queries/components';
export * from './neo4j/queries/ports';
export * from './neo4j/queries/safety';
export * from './neo4j/queries/general';
