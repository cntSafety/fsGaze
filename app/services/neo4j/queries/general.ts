import { driver } from '../config';

// Type definitions for import/export
interface ImportNodeData {
  uuid: string;
  labels: string[];
  properties: Record<string, any>;
}

interface ImportRelationshipData {
  type: string;
  properties: Record<string, any>;
  start: string;
  end: string;
}

/**
 * Get all node labels for a specific node by UUID
 */
export const getNodeLabels = async (nodeUuid: string): Promise<{
  success: boolean;
  data?: string[];
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (node) 
       WHERE node.uuid = $nodeUuid 
       RETURN labels(node) AS nodeLabels, node.name AS nodeName`,
      { nodeUuid }
    );

    if (result.records.length === 0) {
      return {
        success: false,
        message: `No node found with UUID: ${nodeUuid}`,
      };
    }

    // Process the result - should be a single record
    const record = result.records[0];
    const nodeLabels = record.get('nodeLabels') || [];
    // Get node name for potential logging
    const nodeName = record.get('nodeName') || 'Unnamed';

    return {
      success: true,
      data: nodeLabels,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: `Error fetching node labels for UUID ${nodeUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a node or relationship by UUID or elementId
 */
export async function deleteNodeByUuid(identifier: string, identifierType: 'uuid' | 'elementId', entityType: 'node' | 'relationship' = 'node') {
  const session = driver.session();
  
  try {
    let query;
    let params;
    
    if (entityType === 'relationship') {
      // For relationship deletion
      if (identifierType === 'elementId') {
        query = `
          MATCH (a)-[r]->(b)
          WHERE elementId(r) = $elementId
          DELETE r
          RETURN count(r) as deletedCount
        `;
        params = { elementId: identifier };
      } else {
        query = `
          MATCH (a)-[r]->(b)
          WHERE r.uuid = $uuid
          DELETE r
          RETURN count(r) as deletedCount
        `;
        params = { uuid: identifier };
      }
    } else {
      // For node deletion (existing logic)
      if (identifierType === 'elementId') {
        query = `
          MATCH (n)
          WHERE elementId(n) = $elementId
          DETACH DELETE n
          RETURN count(n) as deletedCount
        `;
        params = { elementId: identifier };
      } else {
        query = `
          MATCH (n {uuid: $uuid})
          DETACH DELETE n
          RETURN count(n) as deletedCount
        `;
        params = { uuid: identifier };
      }
    }
    
    const result = await session.run(query, params);
    const deletedCount = result.records[0]?.get('deletedCount').toNumber() || 0;
    
    return {
      success: deletedCount > 0,
      message: deletedCount > 0 ? `Successfully deleted ${deletedCount} ${entityType}(s)` : `No ${entityType} found with that identifier`
    };
  } catch (error) {
    return {
      success: false,
      message: `Error deleting ${entityType}: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  } finally {
    await session.close();
  }
}

/**
 * Get database statistics including node count and relationship count
 */
export const getDatabaseStats = async (): Promise<{
  success: boolean;
  data?: {
    nodeCount: number;
    relationshipCount: number;
    labels: string[];
    relationshipTypes: string[];
  };
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // Test connection first
    await session.run('RETURN 1 as test');
    
    // Get node count, relationship count, labels, and relationship types
    
    // Step 1: Get node count
    const nodeCountResult = await session.run('MATCH (n) RETURN count(n) AS nodeCount');
    const nodeCount = nodeCountResult.records[0]?.get('nodeCount').toNumber() || 0;
    
    // Step 2: Get relationship count
    const relCountResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS relationshipCount');
    const relationshipCount = relCountResult.records[0]?.get('relationshipCount').toNumber() || 0;
    
    // Step 3: Get labels
    const labelsResult = await session.run('CALL db.labels()');
    const labels = labelsResult.records.map(record => record.get('label')) as string[];
    
    // Step 4: Get relationship types
    const typesResult = await session.run('CALL db.relationshipTypes()');
    const relationshipTypes = typesResult.records.map(record => record.get('relationshipType')) as string[];

    if (nodeCount === 0 && relationshipCount === 0) {
      return {
        success: true, // Changed to true as this is a valid state
        data: {
          nodeCount: 0,
          relationshipCount: 0,
          labels: [],
          relationshipTypes: []
        },
        message: 'Database is empty',
      };
    }

    return {
      success: true,
      data: {
        nodeCount,
        relationshipCount,
        labels,
        relationshipTypes,
      },
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: 'Error fetching database statistics.',
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Simple test to verify Neo4j connection
 */
export const testDatabaseConnection = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  const session = driver.session();
  
  try {
    const result = await session.run('RETURN "Hello Neo4j!" as message, timestamp() as time');
    
    if (result.records.length > 0) {
      // Get message for potential logging
      result.records[0].get('message');
      const time = result.records[0].get('time');
      
      return {
        success: true,
        message: `Connected successfully at ${new Date(time.toNumber()).toISOString()}`
      };
    } else {
      return {
        success: false,
        message: 'No response from database'
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: `Connection failed: ${errorMessage}`
    };
  } finally {
    await session.close();
  }
};








/**
 * Single query optimized export that gets both nodes and relationships in one transaction
 */
export const exportFullGraphOptimized = async (): Promise<{
  success: boolean;
  data?: {
    nodes: Array<{
      uuid: string;
      labels: string[];
      properties: Record<string, any>;
    }>;
    relationships: Array<{
      type: string;
      properties: Record<string, any>;
      startNodeUuid: string;
      endNodeUuid: string;
    }>;
  };
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // Use a single transaction to get both nodes and relationships
    const result = await session.readTransaction(async txc => {
      // Get nodes
      const nodesResult = await txc.run(`
        MATCH (n)
        WHERE n.uuid IS NOT NULL
        ORDER BY n.uuid ASC
        RETURN
            n.uuid AS uuid,
            labels(n) AS labels,
            properties(n) AS properties
      `);

      // Get relationships  
      const relationshipsResult = await txc.run(`
        MATCH (startNode)-[r]->(endNode)
        WHERE startNode.uuid IS NOT NULL AND endNode.uuid IS NOT NULL
        ORDER BY startNode.uuid ASC, endNode.uuid ASC, type(r) ASC
        RETURN
            type(r) AS type,
            properties(r) AS properties,
            startNode.uuid AS startNodeUuid,
            endNode.uuid AS endNodeUuid
      `);

      return {
        nodes: nodesResult.records,
        relationships: relationshipsResult.records
      };
    });

    const nodes = result.nodes.map(record => ({
      uuid: record.get('uuid'),
      labels: record.get('labels') as string[],
      properties: record.get('properties') as Record<string, any>
    }));

    const relationships = result.relationships.map(record => ({
      type: record.get('type'),
      properties: record.get('properties') as Record<string, any>,
      startNodeUuid: record.get('startNodeUuid'),
      endNodeUuid: record.get('endNodeUuid')
    }));

    return {
      success: true,
      data: {
        nodes,
        relationships
      },
      message: `Successfully exported ${nodes.length} nodes and ${relationships.length} relationships`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: 'Error during full graph export',
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Create performance indexes for faster graph export
 */
export const createExportIndexes = async (): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // Create index on uuid for all nodes to speed up ORDER BY uuid
    await session.run('CREATE INDEX node_uuid_index IF NOT EXISTS FOR (n) ON (n.uuid)');
    
    // Create index for relationship queries
    await session.run('CREATE INDEX rel_start_uuid_index IF NOT EXISTS FOR ()-[r]-() ON (r.startNodeUuid)');
    await session.run('CREATE INDEX rel_end_uuid_index IF NOT EXISTS FOR ()-[r]-() ON (r.endNodeUuid)');

    return {
      success: true,
      message: 'Export performance indexes created successfully'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: 'Error creating export indexes',
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Interface for node data during import
 */
interface ImportNodeData {
  uuid: string;
  labels: string[];
  properties: Record<string, any>;
}

/**
 * Interface for relationship data during import
 */
interface ImportRelationshipData {
  type: string;
  properties: Record<string, any>;
  start: string;
  end: string;
}

/**
 * Full graph import with three-phase wipe-and-load operation
 * Phase 1: Wipe database and create constraints
 * Phase 2: Import all nodes in batches
 * Phase 3: Import all relationships in batches
 */
export const importFullGraph = async (
  nodesData: ImportNodeData[],
  relationshipsData: ImportRelationshipData[]
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  stats?: {
    nodesCreated: number;
    relationshipsCreated: number;
    constraintsCreated: number;
    duration: number;
  };
}> => {
  const session = driver.session();
  const startTime = Date.now();
  
  try {
    console.log('[IMPORT] Starting robust full graph import with separate transactions...');
    
    // Phase 1: Wipe database in its own transaction
    console.log('[IMPORT] Phase 1: Wiping database...');
    await session.writeTransaction(async tx => {
      await tx.run('MATCH (n) DETACH DELETE n');
    });
    console.log('[IMPORT] Database wiped successfully');
    
    // Phase 2: Collect unique labels and create constraints
    console.log('[IMPORT] Phase 2: Creating constraints...');
    const allLabels = new Set<string>();
    
    nodesData.forEach(node => {
      node.labels.forEach(label => allLabels.add(label));
    });
    
    console.log(`[IMPORT] Found ${allLabels.size} unique labels: ${Array.from(allLabels).join(', ')}`);
    
    // Create constraints in separate transactions (one per constraint)
    let constraintsCreated = 0;
    for (const label of Array.from(allLabels)) {
      try {
        await session.writeTransaction(async tx => {
          await tx.run(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.uuid IS UNIQUE`);
        });
        constraintsCreated++;
        console.log(`[IMPORT] Created constraint for ${label}`);
      } catch (error) {
        // Constraint might already exist, which is fine
        console.log(`[IMPORT] Constraint for ${label} might already exist: ${error}`);
      }
    }
    
    console.log(`[IMPORT] Created ${constraintsCreated} constraints`);
    
    // Phase 3: Create nodes in batches
    console.log('[IMPORT] Phase 3: Creating nodes...');
    
    const BATCH_SIZE = 1000;
    let totalNodesCreated = 0;
    
    // Group nodes by label combinations for efficient Cypher queries
    const labelGroups = new Map<string, ImportNodeData[]>();
    
    nodesData.forEach(node => {
      const labelKey = node.labels.sort().join(':');
      if (!labelGroups.has(labelKey)) {
        labelGroups.set(labelKey, []);
      }
      labelGroups.get(labelKey)!.push(node);
    });
    
    console.log(`[IMPORT] Grouped nodes into ${labelGroups.size} label combinations`);
    
    // Create nodes for each label group in batches
    for (const [labelKey, groupNodes] of Array.from(labelGroups)) {
      const labels = labelKey.split(':').filter(Boolean);
      const labelQuery = labels.length > 0 ? ':' + labels.join(':') : '';
      
      console.log(`[IMPORT] Processing ${groupNodes.length} nodes with labels: ${labelKey}`);
      
      for (let i = 0; i < groupNodes.length; i += BATCH_SIZE) {
        const batch = groupNodes.slice(i, i + BATCH_SIZE);
        
        await session.writeTransaction(async tx => {
          const result = await tx.run(`
            UNWIND $nodeBatch AS nodeData
            CREATE (n${labelQuery} {uuid: nodeData.uuid})
            SET n += nodeData.properties
            RETURN count(n) AS created
          `, { nodeBatch: batch });
          
          const created = result.records[0]?.get('created')?.toNumber() || 0;
          totalNodesCreated += created;
        });
        
        console.log(`[IMPORT] Created batch of ${batch.length} nodes for ${labelKey}`);
      }
    }
    
    console.log(`[IMPORT] Phase 3 complete: ${totalNodesCreated} nodes created`);
    
    // Phase 4: Create relationships in batches
    console.log('[IMPORT] Phase 4: Creating relationships...');
    
    let totalRelationshipsCreated = 0;
    
    // Group relationships by type for efficient Cypher queries
    const typeGroups = new Map<string, ImportRelationshipData[]>();
    
    relationshipsData.forEach(rel => {
      if (!typeGroups.has(rel.type)) {
        typeGroups.set(rel.type, []);
      }
      typeGroups.get(rel.type)!.push(rel);
    });
    
    console.log(`[IMPORT] Grouped relationships into ${typeGroups.size} types`);
    
    // Create relationships for each type in batches
    for (const [relType, groupRels] of Array.from(typeGroups)) {
      console.log(`[IMPORT] Processing ${groupRels.length} relationships of type: ${relType}`);
      
      for (let i = 0; i < groupRels.length; i += BATCH_SIZE) {
        const batch = groupRels.slice(i, i + BATCH_SIZE);
        
        await session.writeTransaction(async tx => {
          const result = await tx.run(`
            UNWIND $relBatch AS relData
            MATCH (startNode {uuid: relData.start})
            MATCH (endNode {uuid: relData.end})
            CREATE (startNode)-[r:\`${relType}\`]->(endNode)
            SET r += relData.properties
            RETURN count(r) AS created
          `, { relBatch: batch });
          
          const created = result.records[0]?.get('created')?.toNumber() || 0;
          totalRelationshipsCreated += created;
        });
        
        console.log(`[IMPORT] Created batch of ${batch.length} relationships for ${relType}`);
      }
    }
    
    console.log(`[IMPORT] Phase 4 complete: ${totalRelationshipsCreated} relationships created`);
    
    const duration = Date.now() - startTime;
    console.log(`[IMPORT] Full graph import completed successfully in ${duration}ms`);
    
    return {
      success: true,
      message: `Successfully imported ${totalNodesCreated} nodes and ${totalRelationshipsCreated} relationships`,
      stats: {
        nodesCreated: totalNodesCreated,
        relationshipsCreated: totalRelationshipsCreated,
        constraintsCreated,
        duration
      }
    };
    
  } catch (error) {
    console.error('[IMPORT] Error during import:', error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: 'Error during full graph import',
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
