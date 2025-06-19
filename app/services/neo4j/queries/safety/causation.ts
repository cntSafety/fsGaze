import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

/**
 * Create a causation relationship between two failure nodes
 * @param sourceFailureUuid UUID of the source failure (cause)
 * @param targetFailureUuid UUID of the target failure (effect)
 */
export const createCausationBetweenFailures = async (
  sourceFailureUuid: string,
  targetFailureUuid: string
): Promise<{
  success: boolean;
  message: string;
  causationUuid?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // First, verify both failure nodes exist
    const verificationResult = await session.run(
      `MATCH (source:FAILURE), (target:FAILURE)
       WHERE source.uuid = $sourceFailureUuid AND target.uuid = $targetFailureUuid
       RETURN source.name AS sourceName, target.name AS targetName`,
      { sourceFailureUuid, targetFailureUuid }
    );

    if (verificationResult.records.length === 0) {
      return {
        success: false,
        message: `One or both failure nodes not found. Source: ${sourceFailureUuid}, Target: ${targetFailureUuid}`,
      };
    }

    const sourceName = verificationResult.records[0].get('sourceName');
    const targetName = verificationResult.records[0].get('targetName');

    // Check if causation relationship already exists
    const existingRelResult = await session.run(
      `MATCH (causation:CAUSATION)-[:FIRST]->(:FAILURE {uuid: $sourceFailureUuid})
       MATCH (causation)-[:THEN]->(:FAILURE {uuid: $targetFailureUuid})
       RETURN causation`,
      { sourceFailureUuid, targetFailureUuid }
    );

    if (existingRelResult.records.length > 0) {
      return {
        success: false,
        message: `Causation relationship already exists between "${sourceName}" and "${targetName}".`,
      };
    }

    // Generate UUID and name for the causation node
    const causationUuid = generateUUID();
    const causationName = `${sourceName} causes ${targetName}`;

    // Create the causation node and relationships
    const result = await session.run(
      `MATCH (causationFirst:FAILURE {uuid: $firstFailureUuid})
       MATCH (causationThen:FAILURE {uuid: $thenFailureUuid})
       CREATE (causation:CAUSATION {
           name: $causationName,
           uuid: $causationUuid,
           createdAt: $createdAt
       })
       CREATE (causation)-[:FIRST]->(causationFirst)
       CREATE (causation)-[:THEN]->(causationThen)
       RETURN causation.uuid AS createdCausationUuid, causation.name AS createdCausationName`,
      {
        firstFailureUuid: sourceFailureUuid,
        thenFailureUuid: targetFailureUuid,
        causationName,
        causationUuid,
        createdAt: new Date().toISOString()
      }
    );

    if (result.records.length === 0) {
      throw new Error('No records returned from CREATE query');
    }

    const createdCausationUuid = result.records[0].get('createdCausationUuid');

    return {
      success: true,
      message: `Causation relationship created: "${sourceName}" causes "${targetName}".`,
      causationUuid: createdCausationUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating causation relationship:`, error);
    
    return {
      success: false,
      message: "Error creating causation relationship.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a CAUSATION node and its FIRST and THEN relationships
 * @param causationUuid UUID of the CAUSATION node to delete
 */
export const deleteCausationNode = async (
  causationUuid: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // First, verify that the CAUSATION node exists and get its details
    const existingCausationResult = await session.run(
      `MATCH (causation:CAUSATION)
       WHERE causation.uuid = $causationUuid
       RETURN causation.name AS causationName`,
      { causationUuid }
    );

    if (existingCausationResult.records.length === 0) {
      return {
        success: false,
        message: `No CAUSATION node found with UUID: ${causationUuid}`,
      };
    }

    const causationName = existingCausationResult.records[0].get('causationName');

    // Delete the CAUSATION node and all its relationships (FIRST and THEN)
    // DETACH DELETE removes the node and all its relationships
    await session.run(
      `MATCH (causation:CAUSATION)
       WHERE causation.uuid = $causationUuid
       DETACH DELETE causation`,
      { causationUuid }
    );

    return {
      success: true,
      message: `CAUSATION node "${causationName || causationUuid}" and its relationships deleted successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error deleting CAUSATION node:`, errorMessage);
    
    return {
      success: false,
      message: "Error deleting CAUSATION node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
