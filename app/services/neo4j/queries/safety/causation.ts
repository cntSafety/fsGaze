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

/**
 * Check ASIL matches and mismatches in causation relationships
 * Returns all causations with their cause and effect failure modes, including ASIL levels
 * and a status indicating whether the ASIL levels match, are a low-to-high escalation, are TBC, or are another type of mismatch.
 * The logic is as follows:
 *   - If ASILs are equal: MATCH
 *   - If effect is D and cause is QM/A/B/C: LOWTOHIGH
 *   - If effect is C and cause is QM/A/B: LOWTOHIGH
 *   - If effect is B and cause is QM/A: LOWTOHIGH
 *   - If effect is A and cause is QM: LOWTOHIGH
 *   - If either ASIL is TBC: TBC
 *   - If effect equals cause: MATCH
 *   - Otherwise: OTHERMISMATCH
 * @returns Promise with success status and data containing causation details with ASIL status
 */
export const checkASIL = async (): Promise<{
  success: boolean;
  data?: Array<{
    causationUUID: string;
    causationName: string | null;
    causesFMName: string | null;
    causesFMUUID: string;
    causesFMASIL: string | null;
    causeOccuranceName: string | null;
    causeOccuranceUUID: string;
    causeOccuranceType: string;
    containingElementCauseName: string | null;
    containingElementCauseUUID: string | null;
    containingElementCauseType: string | null;
    effectsFMName: string | null;
    effectsFMUUID: string;
    effectsFMASIL: string | null;
    effectsOccuranceName: string | null;
    effectsOccuranceUUID: string;
    effectsOccuranceType: string;
    containingElementEffectName: string | null;
    containingElementEffectUUID: string | null;
    containingElementEffectType: string | null;
    asilStatus: 'MATCH' | 'LOWTOHIGH' | 'TBC' | 'OTHERMISMATCH';
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (causation:CAUSATION)
       MATCH (causation)-[:FIRST]->(causesFM)
       MATCH (causation)-[:THEN]->(effectsFM)
       MATCH (causesFM)-[:OCCURRENCE]->(causeOccurance)
       OPTIONAL MATCH (causeOccurance)<-[:CONTAINS]-(containingElementCause)
       MATCH (effectsFM)-[:OCCURRENCE]->(effectsOccurance)
       OPTIONAL MATCH (effectsOccurance)<-[:CONTAINS]-(containingElementEffect)
       WHERE causesFM.asil IS NOT NULL AND effectsFM.asil IS NOT NULL
       RETURN
         causation.uuid as causationUUID,
         causation.name as causationName,
         causesFM.name as causesFMName,
         causesFM.uuid as causesFMUUID,
         causesFM.asil as causesFMASIL,
         causeOccurance.name as causeOccuranceName,
         causeOccurance.uuid as causeOccuranceUUID,
         labels(causeOccurance)[0] as causeOccuranceType,
         containingElementCause.name AS containingElementCauseName,
         containingElementCause.uuid AS containingElementCauseUUID,
         labels(containingElementCause)[0] as containingElementCauseType,
         effectsFM.name as effectsFMName,
         effectsFM.uuid as effectsFMUUID,
         effectsFM.asil as effectsFMASIL,
         effectsOccurance.name as effectsOccuranceName,
         effectsOccurance.uuid as effectsOccuranceUUID,
         labels(effectsOccurance)[0] as effectsOccuranceType,
         containingElementEffect.name AS containingElementEffectName,
         containingElementEffect.uuid AS containingElementEffectUUID,
         labels(containingElementEffect)[0] as containingElementEffectType,
         CASE
           WHEN causesFM.asil = effectsFM.asil THEN 'MATCH'
           WHEN effectsFM.asil = 'D' AND causesFM.asil IN ['QM','A','B','C'] THEN 'LOWTOHIGH'
           WHEN effectsFM.asil = 'C' AND causesFM.asil IN ['QM','A','B'] THEN 'LOWTOHIGH'
           WHEN effectsFM.asil = 'B' AND causesFM.asil IN ['QM','A'] THEN 'LOWTOHIGH'
           WHEN effectsFM.asil = 'A' AND causesFM.asil = 'QM' THEN 'LOWTOHIGH'
           WHEN effectsFM.asil = 'TBC' OR causesFM.asil = 'TBC' THEN 'TBC'
           WHEN effectsFM.asil = causesFM.asil THEN 'MATCH'
           ELSE 'OTHERMISMATCH'
         END as asilStatus
       ORDER BY asilStatus ASC, causesFM.asil, effectsFM.asil`
    );

    if (result.records.length === 0) {
      return {
        success: true,
        data: [],
        message: 'No causations found with valid ASIL levels for both cause and effect failure modes.',
      };
    }

    const causations = result.records.map(record => ({
      causationUUID: record.get('causationUUID'),
      causationName: record.get('causationName'),
      causesFMName: record.get('causesFMName'),
      causesFMUUID: record.get('causesFMUUID'),
      causesFMASIL: record.get('causesFMASIL'),
      causeOccuranceName: record.get('causeOccuranceName'),
      causeOccuranceUUID: record.get('causeOccuranceUUID'),
      causeOccuranceType: record.get('causeOccuranceType'),
      containingElementCauseName: record.get('containingElementCauseName'),
      containingElementCauseUUID: record.get('containingElementCauseUUID'),
      containingElementCauseType: record.get('containingElementCauseType'),
      effectsFMName: record.get('effectsFMName'),
      effectsFMUUID: record.get('effectsFMUUID'),
      effectsFMASIL: record.get('effectsFMASIL'),
      effectsOccuranceName: record.get('effectsOccuranceName'),
      effectsOccuranceUUID: record.get('effectsOccuranceUUID'),
      effectsOccuranceType: record.get('effectsOccuranceType'),
      containingElementEffectName: record.get('containingElementEffectName'),
      containingElementEffectUUID: record.get('containingElementEffectUUID'),
      containingElementEffectType: record.get('containingElementEffectType'),
      asilStatus: record.get('asilStatus') as 'MATCH' | 'LOWTOHIGH' | 'TBC' | 'OTHERMISMATCH',
    }));

    const matchCount = causations.filter(c => c.asilStatus === 'MATCH').length;
    const lowToHighCount = causations.filter(c => c.asilStatus === 'LOWTOHIGH').length;
    const tbcCount = causations.filter(c => c.asilStatus === 'TBC').length;
    const otherMismatchCount = causations.filter(c => c.asilStatus === 'OTHERMISMATCH').length;

    return {
      success: true,
      data: causations,
      message: `Found ${causations.length} causations with ASIL analysis: ${matchCount} matches, ${lowToHighCount} low-to-high escalations, ${tbcCount} TBC, ${otherMismatchCount} other mismatches.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error checking ASIL in causations:`, error);
    
    return {
      success: false,
      message: "Error checking ASIL in causations.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
