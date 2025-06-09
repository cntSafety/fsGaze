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
    console.log(`🔍 Fetching node labels for UUID: ${nodeUuid}`);
    
    const result = await session.run(
      `MATCH (node) 
       WHERE node.uuid = $nodeUuid 
       RETURN labels(node) AS nodeLabels, node.name AS nodeName`,
      { nodeUuid }
    );

    if (result.records.length === 0) {
      console.log(`❌ No node found for UUID: ${nodeUuid}`);
      return {
        success: false,
        message: `No node found with UUID: ${nodeUuid}`,
      };
    }

    // Process the result - should be a single record
    const record = result.records[0];
    const nodeLabels = record.get('nodeLabels') || [];
    const nodeName = record.get('nodeName') || 'Unnamed';

    console.log(`✅ Node labels retrieved for ${nodeName} (${nodeUuid}):`, nodeLabels);

    return {
      success: true,
      data: nodeLabels,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching node labels for UUID ${nodeUuid}:`, errorMessage);
    
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
export async function deleteNodeByUuid(identifier, identifierType, entityType = 'node') {
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
    
    console.log(`🔄 Executing ${entityType} deletion query:`, query);
    console.log(`📝 Parameters:`, params);
    
    const result = await session.run(query, params);
    const deletedCount = result.records[0]?.get('deletedCount').toNumber() || 0;
    
    console.log(`✅ Deletion result: ${deletedCount} ${entityType}(s) deleted`);
    
    return {
      success: deletedCount > 0,
      message: deletedCount > 0 ? `Successfully deleted ${deletedCount} ${entityType}(s)` : `No ${entityType} found with that identifier`
    };
  } catch (error) {
    console.error(`❌ Error deleting ${entityType}:`, error);
    return {
      success: false,
      message: `Error deleting ${entityType}: ${error.message}`
    };
  } finally {
    await session.close();
  }
}
