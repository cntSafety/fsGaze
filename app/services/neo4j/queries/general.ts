import { driver } from '../config';

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
