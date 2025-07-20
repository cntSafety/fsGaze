import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

/**
 * Create a causation relationship between two failure mode nodes
 * @param sourceFailureModeUuid UUID of the source failure mode (cause)
 * @param targetFailureModeUuid UUID of the target failure mode (effect)
 */
export const createCausationBetweenFailureModes = async (
  sourceFailureModeUuid: string,
  targetFailureModeUuid: string
): Promise<{
  success: boolean;
  message: string;
  causationUuid?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // First, verify both failure mode nodes exist
    const verificationResult = await session.run(
      `MATCH (source:FAILUREMODE), (target:FAILUREMODE)
       WHERE source.uuid = $sourceFailureModeUuid AND target.uuid = $targetFailureModeUuid
       RETURN source.name AS sourceName, target.name AS targetName`,
      { sourceFailureModeUuid, targetFailureModeUuid }
    );

    if (verificationResult.records.length === 0) {
      return {
        success: false,
        message: `One or both failure mode nodes not found. Source: ${sourceFailureModeUuid}, Target: ${targetFailureModeUuid}`,
      };
    }

    const sourceName = verificationResult.records[0].get('sourceName');
    const targetName = verificationResult.records[0].get('targetName');

    // Check if causation relationship already exists
    const existingRelResult = await session.run(
      `MATCH (causation:CAUSATION)-[:FIRST]->(:FAILUREMODE {uuid: $sourceFailureModeUuid})
       MATCH (causation)-[:THEN]->(:FAILUREMODE {uuid: $targetFailureModeUuid})
       RETURN causation`,
      { sourceFailureModeUuid, targetFailureModeUuid }
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
    const currentTimestamp = new Date().toISOString();
    const result = await session.run(
      `MATCH (causationFirst:FAILUREMODE {uuid: $firstFailureUuid})
       MATCH (causationThen:FAILUREMODE {uuid: $thenFailureUuid})
       CREATE (causation:CAUSATION {
           name: $causationName,
           uuid: $causationUuid,
           created: $created,
           lastModified: $lastModified
       })
       CREATE (causation)-[:FIRST]->(causationFirst)
       CREATE (causation)-[:THEN]->(causationThen)
       RETURN causation.uuid AS createdCausationUuid, causation.name AS createdCausationName`,
      {
        firstFailureUuid: sourceFailureModeUuid,
        thenFailureUuid: targetFailureModeUuid,
        causationName,
        causationUuid,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
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

/**
 * Get the causation nodes and connected failure mode effects for a given failure mode cause
 * @param failureModeUuid UUID of the failure mode that acts as a cause
 */
export const getEffectFailureModes = async (
  failureModeUuid: string
): Promise<{
  success: boolean;
  data?: Array<{
    causationUuid: string;
    causationName: string | null;
    effectFailureModeUuid: string;
    effectFailureModeName: string | null;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // First verify the failure mode exists
    const verificationResult = await session.run(
      `MATCH (fmCause:FAILUREMODE)
       WHERE fmCause.uuid = $failureModeUuid
       RETURN fmCause.name AS causeName`,
      { failureModeUuid }
    );

    if (verificationResult.records.length === 0) {
      return {
        success: false,
        message: `No failure mode found with UUID: ${failureModeUuid}`,
      };
    }

    const causeName = verificationResult.records[0].get('causeName');

    // Get the causation nodes and connected failure mode effects
    const result = await session.run(
      `MATCH (fmCause:FAILUREMODE) 
       WHERE fmCause.uuid = $failureModeUuid
       MATCH (fmCause)<-[:FIRST]-(causation:CAUSATION) 
       MATCH (causation)-[:THEN]->(fmEffect:FAILUREMODE) 
       RETURN causation.uuid AS causationUuid, 
              causation.name AS causationName, 
              fmEffect.uuid AS fmEffectUuid, 
              fmEffect.name AS fmEffectName
       ORDER BY causation.name, fmEffect.name`,
      { failureModeUuid }
    );

    if (result.records.length === 0) {
      return {
        success: true,
        data: [],
        message: `No effect failure modes found for cause: "${causeName}"`,
      };
    }

    const effectFailureModes = result.records.map(record => ({
      causationUuid: record.get('causationUuid'),
      causationName: record.get('causationName'),
      effectFailureModeUuid: record.get('fmEffectUuid'),
      effectFailureModeName: record.get('fmEffectName'),
    }));

    return {
      success: true,
      data: effectFailureModes,
      message: `Found ${effectFailureModes.length} effect failure mode(s) for cause: "${causeName}"`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching effect failure modes for UUID ${failureModeUuid}:`, error);
    
    return {
      success: false,
      message: `Error fetching effect failure modes for failure mode ${failureModeUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get the causation nodes and connected failure mode causes for a given failure mode effect
 * @param failureModeUuid UUID of the failure mode that acts as an effect
 */
export const getCauseFailureModes = async (
  failureModeUuid: string
): Promise<{
  success: boolean;
  data?: Array<{
    causationUuid: string;
    causationName: string | null;
    causeFailureModeUuid: string;
    causeFailureModeName: string | null;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // First verify the failure mode exists
    const verificationResult = await session.run(
      `MATCH (fmEffect:FAILUREMODE)
       WHERE fmEffect.uuid = $failureModeUuid
       RETURN fmEffect.name AS effectName`,
      { failureModeUuid }
    );

    if (verificationResult.records.length === 0) {
      return {
        success: false,
        message: `No failure mode found with UUID: ${failureModeUuid}`,
      };
    }

    const effectName = verificationResult.records[0].get('effectName');

    // Get the causation nodes and connected failure mode causes
    const result = await session.run(
      `MATCH (fmEffect:FAILUREMODE) 
       WHERE fmEffect.uuid = $failureModeUuid
       MATCH (fmEffect)<-[:THEN]-(causation:CAUSATION) 
       MATCH (causation)-[:FIRST]->(fmCause:FAILUREMODE) 
       RETURN causation.uuid AS causationUuid, 
              causation.name AS causationName, 
              fmCause.uuid AS fmCauseUuid, 
              fmCause.name AS fmCauseName
       ORDER BY causation.name, fmCause.name`,
      { failureModeUuid }
    );

    if (result.records.length === 0) {
      return {
        success: true,
        data: [],
        message: `No cause failure modes found for effect: "${effectName}"`,
      };
    }

    const causeFailureModes = result.records.map(record => ({
      causationUuid: record.get('causationUuid'),
      causationName: record.get('causationName'),
      causeFailureModeUuid: record.get('fmCauseUuid'),
      causeFailureModeName: record.get('fmCauseName'),
    }));

    return {
      success: true,
      data: causeFailureModes,
      message: `Found ${causeFailureModes.length} cause failure mode(s) for effect: "${effectName}"`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching cause failure modes for UUID ${failureModeUuid}:`, error);
    
    return {
      success: false,
      message: `Error fetching cause failure modes for failure mode ${failureModeUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
