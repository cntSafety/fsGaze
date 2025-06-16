import { driver } from '@/app/services/neo4j/config'; // Import the shared driver
import { generateUUID } from '../utils'; // Assuming path app/services/neo4j/utils.ts

// Define the structure of the data to be imported/exported
export interface SafetyGraphNode {
    uuid: string;
    properties: Record<string, unknown>;
}

export interface OccurrenceLink {
    failureUuid: string;
    failureName: string; // For logging/verification, not directly stored in relationship
    occuranceSourceUuid: string;
    occuranceSourceName: string; // For logging/verification
    // Optional: any properties for the OCCURRENCE relationship itself
}

export interface CausationLinkInfo {
    causationUuid: string;
    causationName: string; // For logging/verification
    causeFailureUuid: string;
    causeFailureName: string; // For logging/verification
    effectFailureUuid: string;
    effectFailureName: string; // For logging/verification
}

export interface SafetyGraphData {
    failures: SafetyGraphNode[];
    causations: SafetyGraphNode[];
    occurrences: OccurrenceLink[];
    causationLinks: CausationLinkInfo[];
}

export async function getSafetyGraph(): Promise<{
    success: boolean;
    data?: SafetyGraphData;
    message?: string;
}> {
    const session = driver.session();
    try {
        // 1. Get all FAILURE nodes and their properties
        const failuresResult = await session.run(
            'MATCH (f:FAILURE) RETURN f.uuid AS uuid, properties(f) AS properties'
        );
        const failures = failuresResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),
        }));

        // 2. Get all CAUSATION nodes and their properties
        const causationsResult = await session.run(
            'MATCH (c:CAUSATION) RETURN c.uuid AS uuid, properties(c) AS properties'
        );
        const causations = causationsResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),
        }));

        // 3. Get all OCCURRENCE relationships and related node details
        // Updated to fetch extended properties from the source ARXML element
        const occurrencesResult = await session.run(`
            MATCH (f:FAILURE)-[o:OCCURRENCE]->(src)
            RETURN f.uuid AS failureUuid, f.name AS failureName, 
                   src.uuid AS occuranceSourceUuid, src.name AS occuranceSourceName, 
                   src.arxmlPath AS occuranceSourceArxmlPath, 
                   src.importLabel AS occuranceSourceimportLabel, 
                   src.importTimestamp AS occuranceSourceimportTimestamp, 
                   src.originalXmlTag AS occuranceSourceoriginalXmlTag
        `);
        const occurrences = occurrencesResult.records.map(record => ({
            failureUuid: record.get('failureUuid'),
            failureName: record.get('failureName'),
            occuranceSourceUuid: record.get('occuranceSourceUuid'),
            occuranceSourceName: record.get('occuranceSourceName'),
            occuranceSourceArxmlPath: record.get('occuranceSourceArxmlPath'),
            occuranceSourceimportLabel: record.get('occuranceSourceimportLabel'),
            occuranceSourceimportTimestamp: record.get('occuranceSourceimportTimestamp'),
            occuranceSourceoriginalXmlTag: record.get('occuranceSourceoriginalXmlTag'),
        }));

        // 4. Get all CAUSATION links (FIRST and THEN relationships)
        const causationLinksResult = await session.run(`
            MATCH (cause:FAILURE)<-[:FIRST]-(c:CAUSATION)-[:THEN]->(effect:FAILURE)
            RETURN c.uuid AS causationUuid, c.name AS causationName, 
                   cause.uuid AS causeFailureUuid, cause.name AS causeFailureName, 
                   effect.uuid AS effectFailureUuid, effect.name AS effectFailureName
        `);
        const causationLinks = causationLinksResult.records.map(record => ({
            causationUuid: record.get('causationUuid'),
            causationName: record.get('causationName'),
            causeFailureUuid: record.get('causeFailureUuid'),
            causeFailureName: record.get('causeFailureName'),
            effectFailureUuid: record.get('effectFailureUuid'),
            effectFailureName: record.get('effectFailureName'),
        }));

        return {
            success: true,
            data: {
                failures,
                causations,
                occurrences,
                causationLinks,
            },
        };
    } catch (error: any) {
        console.error("Error fetching safety graph:", error);
        return { success: false, message: error.message };
    } finally {
        await session.close();
    }
}


export async function importSafetyGraphData(data: SafetyGraphData): Promise<{
    success: boolean;
    logs: string[];
    message?: string;
}> {
    const session = driver.session();
    const tx = session.beginTransaction();
    const logs: string[] = [];

    const convertNeo4jTimestampToNumber = (value: any): number | null => {
        if (value === null || typeof value === 'undefined') return null;
        if (typeof value === 'number') return value; // Already a JS number
        if (value && typeof value.toNumber === 'function') { // Check for neo4j.int or similar BigInt objects
            try {
                return value.toNumber();
            } catch { // toNumber() can fail if the number is too large for JS standard number
                //logs.push(`[WARNING] Failed to convert Neo4j Integer to JS number (possibly too large): ${value.toString()}. Treating as an invalid timestamp for comparison.`);
                return null;
            }
        }
        // Log if it's an unexpected type that wasn't handled above
        //logs.push(`[WARNING] Unexpected timestamp type encountered: ${JSON.stringify(value)}. Cannot convert to number.`);
        return null;
    };

    try {
        // Import/Update FAILURES
        const failureNodeType = "FAILURE";
        for (const failure of data.failures) {
            if (!failure.uuid || !failure.properties || !failure.properties.name) {
                logs.push(`[ERROR] Skipping ${failureNodeType} due to missing uuid or name: ${JSON.stringify(failure)}`);
                continue;
            }
            const { uuid, properties: rawProperties } = failure;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;       // Handled by MERGE key
            delete propsToSet.createdAt;  // We set this explicitly
            delete propsToSet.updatedAt;  // We set this explicitly

            const result = await tx.run(
                'MERGE (f:FAILURE {uuid: $uuid}) ' +
                'ON CREATE SET f = $propsToSet, f.uuid = $uuid, f.createdAt = timestamp(), f.updatedAt = f.createdAt ' +
                'ON MATCH SET f += $propsToSet, f.updatedAt = CASE WHEN f.createdAt IS NULL THEN f.updatedAt ELSE timestamp() END ' +
                'RETURN f.name AS name, f.createdAt AS createdAt, f.updatedAt AS updatedAt',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const name = record.get('name');
                const createdAtRaw = record.get('createdAt');
                const updatedAtRaw = record.get('updatedAt');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) { // Both are current timestamp()
                        action = 'created';
                    } else { // createdAt is old, updatedAt is current timestamp()
                        action = 'updated (timestamps refreshed)';
                    }
                } else if (createdAtNum === null) {
                    // Original createdAt was missing. updatedAt was NOT refreshed to timestamp().
                    // It has its old value (which could be null or a number).
                    if (updatedAtNum !== null) {
                        //action = 'properties applied (original createdAt missing; existing updatedAt preserved)';
                    } else {
                        // action = 'properties applied (original createdAt and updatedAt missing)';
                    }
                } else { // createdAtNum is not null, but updatedAtNum is null. Should be rare.
                    // action = 'state_inconsistent (createdAt present, updatedAt missing after operation)';
                }
                logs.push(`[SUCCESS] ${failureNodeType} node '${name || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${failureNodeType} node merge (uuid: ${uuid}).`);
            }
        }

        // Import/Update CAUSATIONS
        const causationNodeType = "CAUSATION";
        for (const causation of data.causations) {
            if (!causation.uuid || !causation.properties || !causation.properties.name) {
                logs.push(`[ERROR] Skipping ${causationNodeType} due to missing uuid or name: ${JSON.stringify(causation)}`);
                continue;
            }
            const { uuid, properties: rawProperties } = causation;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;
            delete propsToSet.createdAt;
            delete propsToSet.updatedAt;

            const result = await tx.run(
                'MERGE (c:CAUSATION {uuid: $uuid}) ' +
                'ON CREATE SET c = $propsToSet, c.uuid = $uuid, c.createdAt = timestamp(), c.updatedAt = c.createdAt ' +
                'ON MATCH SET c += $propsToSet, c.updatedAt = CASE WHEN c.createdAt IS NULL THEN c.updatedAt ELSE timestamp() END ' +
                'RETURN c.name AS name, c.createdAt AS createdAt, c.updatedAt AS updatedAt',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const name = record.get('name');
                const createdAtRaw = record.get('createdAt');
                const updatedAtRaw = record.get('updatedAt');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) { // Both are current timestamp()
                        action = 'created';
                    } else { // createdAt is old, updatedAt is current timestamp()
                        action = 'updated (timestamps refreshed)';
                    }
                } else if (createdAtNum === null) {
                    // Original createdAt was missing. updatedAt was NOT refreshed to timestamp().
                    // It has its old value (which could be null or a number).
                    if (updatedAtNum !== null) {
                        //action = 'properties applied (original createdAt missing; existing updatedAt preserved)';
                    } else {
                       // action = 'properties applied (original createdAt and updatedAt missing)';
                    }
                } else { // createdAtNum is not null, but updatedAtNum is null. Should be rare.
                    // action = 'state_inconsistent (createdAt present, updatedAt missing after operation)';
                }
                logs.push(`[SUCCESS] ${causationNodeType} node '${name || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${causationNodeType} node merge (uuid: ${uuid}).`);
            }
        }

        // Import OCCURRENCE relationships
        for (const occ of data.occurrences) {
            if (!occ.failureUuid || !occ.occuranceSourceUuid) {
                logs.push(`[ERROR] Skipping OCCURRENCE link due to missing failureUuid or occuranceSourceUuid: ${JSON.stringify(occ)}`);
                continue;
            }
            // Check if the source ARXML_ELEMENT (or other type) exists
            const sourceCheck = await tx.run(
                'MATCH (src {uuid: $sourceUuid}) RETURN src.uuid AS uuid, labels(src) as lbls', 
                { sourceUuid: occ.occuranceSourceUuid }
            );
            if (sourceCheck.records.length === 0) {
                logs.push(`[ERROR] Source element with UUID ${occ.occuranceSourceUuid} for OCCURRENCE not found. Skipping link to FAILURE ${occ.failureName || occ.failureUuid}.`);
                continue;
            }
            const sourceNode = sourceCheck.records[0];
            const sourceLabels = sourceNode.get('lbls').join(':');

            // Check if the target FAILURE exists (it should have been created above)
            const failureCheck = await tx.run(
                'MATCH (f:FAILURE {uuid: $failureUuid}) RETURN f.uuid', 
                { failureUuid: occ.failureUuid }
            );
            if (failureCheck.records.length === 0) {
                logs.push(`[ERROR] Target FAILURE with UUID ${occ.failureUuid} for OCCURRENCE not found. Skipping link from ${sourceLabels} ${occ.occuranceSourceName || occ.occuranceSourceUuid}.`);
                continue;
            }

            await tx.run(
                'MATCH (f:FAILURE {uuid: $failureUuid}) ' +
                'MATCH (src {uuid: $occuranceSourceUuid}) ' +
                'MERGE (f)-[r:OCCURRENCE]->(src) ' +
                'ON CREATE SET r.createdAt = timestamp() ' +
                'ON MATCH SET r.updatedAt = timestamp() ' +
                'RETURN type(r) AS relType', // We can return something to confirm creation/match
                { failureUuid: occ.failureUuid, occuranceSourceUuid: occ.occuranceSourceUuid }
            );
            logs.push(`[SUCCESS] OCCURRENCE relationship linked: (FAILURE ${occ.failureName || occ.failureUuid})-[OCCURRENCE]->(${sourceLabels} ${occ.occuranceSourceName || occ.occuranceSourceUuid}).`);
        }

        // Import CAUSATION links (FIRST, THEN)
        for (const link of data.causationLinks) {
            if (!link.causeFailureUuid || !link.causationUuid || !link.effectFailureUuid) {
                logs.push(`[ERROR] Skipping CAUSATION link due to missing UUIDs: ${JSON.stringify(link)}`);
                continue;
            }

            // Check if CAUSE FAILURE exists
            const causeFailureCheck = await tx.run('MATCH (f:FAILURE {uuid: $uuid}) RETURN f.uuid', { uuid: link.causeFailureUuid });
            if (causeFailureCheck.records.length === 0) {
                logs.push(`[ERROR] CAUSE FAILURE ${link.causeFailureName || link.causeFailureUuid} not found for causation link. Skipping.`);
                continue;
            }

            // Check if CAUSATION node exists
            const causationNodeCheck = await tx.run('MATCH (c:CAUSATION {uuid: $uuid}) RETURN c.uuid', { uuid: link.causationUuid });
            if (causationNodeCheck.records.length === 0) {
                logs.push(`[ERROR] CAUSATION node ${link.causationName || link.causationUuid} not found for causation link. Skipping.`);
                continue;
            }

            // Check if EFFECT FAILURE exists
            const effectFailureCheck = await tx.run('MATCH (f:FAILURE {uuid: $uuid}) RETURN f.uuid', { uuid: link.effectFailureUuid });
            if (effectFailureCheck.records.length === 0) {
                logs.push(`[ERROR] EFFECT FAILURE ${link.effectFailureName || link.effectFailureUuid} not found for causation link. Skipping.`);
                continue;
            }

            // Link CAUSE_FAILURE -> CAUSATION
            await tx.run(
                'MATCH (cause:FAILURE {uuid: $causeFailureUuid}) ' +
                'MATCH (c:CAUSATION {uuid: $causationUuid}) ' +
                'MERGE (cause)-[r:FIRST]->(c) ' +
                'ON CREATE SET r.createdAt = timestamp() ' +
                'ON MATCH SET r.updatedAt = timestamp() ',
                { causeFailureUuid: link.causeFailureUuid, causationUuid: link.causationUuid }
            );
            logs.push(`[SUCCESS] FIRST relationship linked: (FAILURE ${link.causeFailureName || link.causeFailureUuid})-[FIRST]->(CAUSATION ${link.causationName || link.causationUuid}).`);

            // Link CAUSATION -> EFFECT_FAILURE
            await tx.run(
                'MATCH (c:CAUSATION {uuid: $causationUuid}) ' +
                'MATCH (effect:FAILURE {uuid: $effectFailureUuid}) ' +
                'MERGE (c)-[r:THEN]->(effect) ' +
                'ON CREATE SET r.createdAt = timestamp() ' +
                'ON MATCH SET r.updatedAt = timestamp() ',
                { causationUuid: link.causationUuid, effectFailureUuid: link.effectFailureUuid }
            );
            logs.push(`[SUCCESS] THEN relationship linked: (CAUSATION ${link.causationName || link.causationUuid})-[THEN]->(FAILURE ${link.effectFailureName || link.effectFailureUuid}).`);
        }

        await tx.commit();
        logs.push("[INFO] Transaction committed successfully.");
        return { success: true, logs };

    } catch (error: any) {
        logs.push(`[FATAL] Transaction failed: ${error.message}`);
        if (tx) {
            try {
                await tx.rollback();
                logs.push("[INFO] Transaction rolled back.");
            } catch (rollbackError: any) {
                logs.push(`[FATAL] Failed to rollback transaction: ${rollbackError.message}`);
            }
        }
        console.error("Error importing safety graph data:", error);
        return { success: false, logs, message: error.message };
    } finally {
        await session.close();
    }
}

// Added functions start here
// Assuming path app/services/neo4j/utils.ts for generateUUID
// If generateUUID is in a different location, this path needs to be adjusted.
// For example, if utils.ts is in the same directory (queries/utils.ts):
// import { generateUUID } from './utils'; 
// Or if it's in services/utils.ts:
// import { generateUUID } from '../utils'; // This is the duplicate import

/**
 * Create a failure node and link it to an existing element via an "OCCURRENCE" relationship
 * @param existingElementUuid UUID of the existing element to link the failure to
 * @param failureName Name of the failure
 * @param failureDescription Description of the failure
 * @param asil ASIL (Automotive Safety Integrity Level) rating
 * @param progressCallback Optional callback for progress updates
 */
export const createFailureNode = async (
  existingElementUuid: string,
  failureName: string,
  failureDescription: string,
  asil: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  failureUuid?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // console.log('🔍 Creating failure node with params:', {
    //   existingElementUuid,
    //   failureName,
    //   failureDescription,
    //   asil
    // });


    if (progressCallback) progressCallback(10, 'Validating existing element');
    
    // First, verify that the existing element exists
    const existingElementResult = await session.run(
      `MATCH (element) 
       WHERE element.uuid = $existingElementUuid 
       RETURN element.name AS elementName, labels(element)[0] AS elementType`,
      { existingElementUuid }
    );

    if (existingElementResult.records.length === 0) {
      // console.log('❌ No element found with UUID:', existingElementUuid);
      return {
        success: false,
        message: `No element found with UUID: ${existingElementUuid}`,
      };
    }

    const elementName = existingElementResult.records[0].get('elementName');
    const elementType = existingElementResult.records[0].get('elementType');

    // console.log('✅ Found existing element:', { elementName, elementType });

    if (progressCallback) progressCallback(30, 'Creating failure node');
    
    // Generate a UUID for the new failure node
    const failureUuid = generateUUID();
    const currentTimestamp = new Date().toISOString();
    
    // console.log('🔍 About to create failure node with UUID:', failureUuid);    // Create the failure node and establish the relationship
    const queryParams = {
      existingElementUuid,
      failureUuid,
      failureName,
      failureDescription,
      asil,
      created: currentTimestamp,
      lastModified: currentTimestamp,    };

    // console.log('🔍 Query parameters:', queryParams);

    const createResult = await session.run(
      `MATCH (element) 
       WHERE element.uuid = $existingElementUuid
       CREATE (failure:FAILURE {
         uuid: $failureUuid,
         name: $failureName,
         description: $failureDescription,
         asil: $asil,
         Created: $created,
         LastModified: $lastModified
       })
       CREATE (failure)-[r:OCCURRENCE]->(element)
       RETURN failure.uuid AS createdFailureUuid, failure.name AS createdFailureName`,
      queryParams
    );

    if (progressCallback) progressCallback(90, 'Finalizing failure node creation');

    if (createResult.records.length === 0) {
      throw new Error('No records returned from CREATE query');
    }

    const createdFailureUuid = createResult.records[0].get('createdFailureUuid');
    const createdFailureName = createResult.records[0].get('createdFailureName');

    if (progressCallback) progressCallback(100, 'Failure node created successfully');

    // console.log(`✅ Failure node created successfully:`, {
    //   failureUuid: createdFailureUuid,
    //   failureName: createdFailureName,
    //   linkedToElement: elementName,
    //   elementType: elementType
    // });

    return {
      success: true,
      message: `Failure "${createdFailureName}" created and linked to ${elementType} "${elementName}".`,
      failureUuid: createdFailureUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating failure node:`, error);
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      existingElementUuid,
      failureName,
    });
    
    return {
      success: false,
      message: "Error creating failure node.",
      error: errorMessage,
    };  } finally {
    await session.close();
  }
};

/**
 * Create a new RISKRATING node and link it to an existing FAILURE node
 */
export const createRiskRatingNode = async (
  failureUuid: string,
  severity: number,
  occurrence: number,
  detection: number,
  ratingComment?: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  riskRatingUuid?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating existing failure node');
    
    // First, verify that the failure node exists
    const failureResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid 
       RETURN failure.name AS failureName, failure.uuid AS failureUuid`,
      { failureUuid }
    );

    if (failureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure node found with UUID: ${failureUuid}`,
      };
    }

    const failureName = failureResult.records[0].get('failureName');    if (progressCallback) progressCallback(30, 'Creating risk rating node');
    
    // Generate a UUID for the new risk rating node
    const riskRatingUuid = generateUUID();
    const currentTimestamp = new Date().toISOString();
      // Generate a timestamp in the format YYYYMMDDHHMM
    const generateTimestamp = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}${month}${day}${hours}${minutes}`;
    };

    // Generate the risk rating name based on failure name with timestamp for uniqueness
    const timestamp = generateTimestamp(new Date());
    const riskRatingName = `RR${failureName}_${timestamp}`;
    
    // Create the risk rating node and establish the relationship
    const queryParams = {
      failureUuid,
      riskRatingUuid,
      name: riskRatingName,
      severity,
      occurrence,
      detection,
      ratingComment: ratingComment || '',
      created: currentTimestamp,
      lastModified: currentTimestamp,
    };    const createResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid
       CREATE (riskRating:RISKRATING {
         uuid: $riskRatingUuid,
         name: $name,
         Severity: $severity,
         Occurrence: $occurrence,
         Detection: $detection,
         RatingComment: $ratingComment,
         Created: $created,
         LastModified: $lastModified
       })
       CREATE (failure)-[r:RATED]->(riskRating)
       RETURN riskRating.uuid AS createdRiskRatingUuid`,
      queryParams
    );

    if (progressCallback) progressCallback(90, 'Finalizing risk rating node creation');

    if (createResult.records.length === 0) {
      throw new Error('No records returned from CREATE query');
    }

    const createdRiskRatingUuid = createResult.records[0].get('createdRiskRatingUuid');

    if (progressCallback) progressCallback(100, 'Risk rating node created successfully');

    return {
      success: true,
      message: `Risk rating created and linked to failure "${failureName}".`,
      riskRatingUuid: createdRiskRatingUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating risk rating node:`, error);    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      failureUuid,
      severity,
      occurrence,
      detection,
      ratingComment,
    });
    
    return {
      success: false,
      message: "Error creating risk rating node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Update an existing RISKRATING node
 * @param riskRatingUuid UUID of the risk rating node to update
 * @param severity Severity rating (1-10)
 * @param occurrence Occurrence rating (1-10)
 * @param detection Detection rating (1-10)
 * @param ratingComment Optional comment for the rating
 * @param progressCallback Optional callback for progress updates
 */
export const updateRiskRatingNode = async (
  riskRatingUuid: string,
  severity: number,
  occurrence: number,
  detection: number,
  ratingComment?: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating risk rating node');
    
    // First, verify that the risk rating node exists
    const existingRiskRatingResult = await session.run(
      `MATCH (riskRating:RISKRATING) 
       WHERE riskRating.uuid = $riskRatingUuid 
       RETURN riskRating.name AS currentName, 
              riskRating.Severity AS currentSeverity, 
              riskRating.Occurrence AS currentOccurrence,
              riskRating.Detection AS currentDetection,
              riskRating.RatingComment AS currentRatingComment`,
      { riskRatingUuid }
    );

    if (existingRiskRatingResult.records.length === 0) {
      return {
        success: false,
        message: `No risk rating node found with UUID: ${riskRatingUuid}`,
      };
    }

    const currentRecord = existingRiskRatingResult.records[0];
    const currentName = currentRecord.get('currentName');

    if (progressCallback) progressCallback(50, 'Updating risk rating node properties');
    
    const currentTimestamp = new Date().toISOString();
    
    // Update the risk rating node properties (preserve Created, update LastModified)
    const updateResult = await session.run(
      `MATCH (riskRating:RISKRATING) 
       WHERE riskRating.uuid = $riskRatingUuid
       SET riskRating.Severity = $severity,
           riskRating.Occurrence = $occurrence,
           riskRating.Detection = $detection,
           riskRating.RatingComment = $ratingComment,
           riskRating.LastModified = $lastModified
       RETURN riskRating.uuid AS updatedRiskRatingUuid, riskRating.name AS updatedRiskRatingName`,
      {
        riskRatingUuid,
        severity,
        occurrence,
        detection,
        ratingComment: ratingComment || '',
        lastModified: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing risk rating node update');

    if (updateResult.records.length === 0) {
      throw new Error('No records returned from UPDATE query');
    }

    const updatedRiskRatingUuid = updateResult.records[0].get('updatedRiskRatingUuid');
    const updatedRiskRatingName = updateResult.records[0].get('updatedRiskRatingName');

    if (progressCallback) progressCallback(100, 'Risk rating node updated successfully');

    return {
      success: true,
      message: `Risk rating "${updatedRiskRatingName}" updated successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error updating risk rating node:`, error);
    
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      riskRatingUuid,
      severity,
      occurrence,
      detection,
      ratingComment,
    });
    
    return {
      success: false,
      message: "Error updating risk rating node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a failure node and its relationships
 * @param failureUuid UUID of the failure node to delete
 * @param progressCallback Optional callback for progress updates
 */
export const deleteFailureNode = async (
  failureUuid: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating failure node');
    
    // First, verify that the failure node exists
    const existingFailureResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid 
       RETURN failure.name AS failureName`,
      { failureUuid }
    );

    if (existingFailureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure node found with UUID: ${failureUuid}`,
      };
    }

    const failureName = existingFailureResult.records[0].get('failureName');

    if (progressCallback) progressCallback(50, 'Deleting failure node and relationships');
    
    // Delete the failure node and all its relationships
    const deleteResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid
       DETACH DELETE failure
       RETURN count(failure) AS deletedCount`,
      { failureUuid }
    );

    // Get deleted count for potential logging
    deleteResult.records[0].get('deletedCount');

    if (progressCallback) progressCallback(100, 'Failure node deleted successfully');

    // console.log(`✅ Failure node deleted successfully:`, {
    //   failureUuid,
    //   failureName,
    //   deletedCount
    // });

    return {
      success: true,
      message: `Failure "${failureName}" deleted successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error deleting failure node:`, errorMessage);
    
    return {
      success: false,
      message: "Error deleting failure node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

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
    // Get causation name for potential logging
    result.records[0].get('createdCausationName');

    // console.log(`✅ Causation node created:`, {
    //   causationUuid: createdCausationUuid,
    //   causationName: createdCausationName,
    //   source: sourceName,
    //   target: targetName
    // });

    return {
      success: true,
      message: `Causation relationship created: "${sourceName}" causes "${targetName}".`,
      causationUuid: createdCausationUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating causation relationship:`, errorMessage);
    
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
 * Get failures that have OCCURRENCE relations to P_PORT_PROTOTYPE or R_PORT_PROTOTYPE
 */
export const getFailuresForPorts = async (portUuid: string): Promise<{
  success: boolean;
  data?: Array<{
    failureUuid: string;
    failureName: string | null;
    failureDescription: string | null;
    asil: string | null;
    failureType: string | null;
    relationshipType: string;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // console.log(`🔍 Fetching failures for port UUID: ${portUuid}`);
    
    const result = await session.run(
      `MATCH (port)-[r]-(failure:FAILURE)
       WHERE port.uuid = $portUuid 
       AND (port:P_PORT_PROTOTYPE OR port:R_PORT_PROTOTYPE)
       RETURN 
         failure.uuid AS failureUuid,
         failure.name AS failureName,
         failure.description AS failureDescription,
         failure.asil AS asil,
         labels(failure) AS failureLabels,
         type(r) AS relationshipType
       ORDER BY failure.name`,
      { portUuid }
    );

    if (result.records.length === 0) {
      // console.log(`ℹ️ No failures found for port UUID: ${portUuid}`);
      return {
        success: true,
        data: [],
        message: `No failures found for port: ${portUuid}`,
      };
    }

    const failures = result.records.map(record => ({
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureDescription: record.get('failureDescription'),
      asil: record.get('asil'),
      failureType: record.get('failureLabels')?.join(', ') || 'FAILURE',
      relationshipType: record.get('relationshipType'),
    }));

    // console.log(`✅ Found ${failures.length} failures for port ${portUuid}:`, failures);

    return {
      success: true,
      data: failures,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching failures for port UUID ${portUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error fetching failures for port ${portUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get failures that have OCCURRENCE relations to APPLICATION_SW_COMPONENT_TYPE
 */
export const getFailuresForSwComponents = async (swComponentUuid: string): Promise<{
  success: boolean;
  data?: Array<{
    failureUuid: string;
    failureName: string | null;
    failureDescription: string | null;
    asil: string | null;
    relationshipType: string;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    //console.log(`🔍 Fetching failures for SW component UUID: ${swComponentUuid}`);
    
    const result = await session.run(
      `MATCH (swComponent:APPLICATION_SW_COMPONENT_TYPE)-[r]-(failure:FAILURE)
       WHERE swComponent.uuid = $swComponentUuid 
       RETURN 
         failure.uuid AS failureUuid,
         failure.name AS failureName,
         failure.description AS failureDescription,
         failure.asil AS asil,
         type(r) AS relationshipType
       ORDER BY failure.name`,
      { swComponentUuid }
    );

    if (result.records.length === 0) {
      //console.log(`ℹ️ No failures found for SW component UUID: ${swComponentUuid}`);
/*       return {
        success: true,
        data: [],
        message: `No failures found for SW component: ${swComponentUuid}`,
      }; */
    }

    const failures = result.records.map(record => ({
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureDescription: record.get('failureDescription'),
      asil: record.get('asil'),
      relationshipType: record.get('relationshipType'),
    }));

    //console.log(`✅ Found ${failures.length} failures for SW component ${swComponentUuid}:`, failures);

    return {
      success: true,
      data: failures,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching failures for SW component UUID ${swComponentUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error fetching failures for SW component ${swComponentUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Update an existing failure node's properties
 * @param failureUuid UUID of the failure node to update
 * @param failureName New name of the failure
 * @param failureDescription New description of the failure
 * @param asil New ASIL (Automotive Safety Integrity Level) rating
 * @param progressCallback Optional callback for progress updates
 */
export const updateFailureNode = async (
  failureUuid: string,
  failureName: string,
  failureDescription: string,
  asil: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating failure node');
    
    // console.log('🔍 Updating failure node with params:', {
    //   failureUuid,
    //   failureName,
    //   failureDescription,
    //   asil
    // });

    // First, verify that the failure node exists
    const existingFailureResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid 
       RETURN failure.name AS currentName, failure.description AS currentDescription, failure.asil AS currentAsil`,
      { failureUuid }
    );

    if (existingFailureResult.records.length === 0) {
      // console.log('❌ No failure node found with UUID:', failureUuid);
      return {
        success: false,
        message: `No failure node found with UUID: ${failureUuid}`,
      };
    }

    const currentRecord = existingFailureResult.records[0];
    // Get current values for potential logging
    currentRecord.get('currentName');
    currentRecord.get('currentDescription');
    currentRecord.get('currentAsil');

    // console.log('✅ Found existing failure node:', { 
    //   currentName, 
    //   currentDescription, 
    //   currentAsil,
    //   updating_to: { failureName, failureDescription, asil }
    // });

    if (progressCallback) progressCallback(50, 'Updating failure node properties');
    
    const currentTimestamp = new Date().toISOString();
    
    // Update the failure node properties
    const updateResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid
       SET failure.name = $failureName,
           failure.description = $failureDescription,
           failure.asil = $asil,
           failure.updatedAt = $updatedAt
       RETURN failure.uuid AS updatedFailureUuid, failure.name AS updatedFailureName`,
      {
        failureUuid,
        failureName,
        failureDescription,
        asil,
        updatedAt: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing failure node update');

    if (updateResult.records.length === 0) {
      throw new Error('No records returned from UPDATE query');
    }    const updatedFailureUuid = updateResult.records[0].get('updatedFailureUuid');
    // Get updated name for potential logging
    const updatedFailureName = updateResult.records[0].get('updatedFailureName');

    if (progressCallback) progressCallback(100, 'Failure node updated successfully');

    // console.log(`✅ Failure node updated successfully:`, {
    //   failureUuid: updatedFailureUuid,
    //   failureName: failureName,
    //   changes: {
    //     name: currentName !== failureName ? `"${currentName}" → "${failureName}"` : 'unchanged',
    //     description: currentDescription !== failureDescription ? `"${currentDescription}" → "${failureDescription}"` : 'unchanged',
    //     asil: currentAsil !== asil ? `"${currentAsil}" → "${asil}"` : 'unchanged'
    //   }
    // });

    return {
      success: true,
      message: `Failure "${updatedFailureName}" updated successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error updating failure node:`, error);
    
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      failureUuid,
      failureName,
    });
    
    return {
      success: false,
      message: "Error updating failure node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

 /**
 * Get all risk rating nodes for a specific failure node
 * @param failureUuid UUID of the failure node to get risk ratings for
 * @param progressCallback Optional callback for progress updates
 */
export const getRiskRatingNodes = async (
  failureUuid: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  data?: Array<{
    uuid: string;
    name: string;
    severity: number;
    occurrence: number;
    detection: number;
    ratingComment: string;
    created: string;
    lastModified: string;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating failure node');
    
    // First, verify that the failure node exists
    const failureResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid 
       RETURN failure.name AS failureName`,
      { failureUuid }
    );

    if (failureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure node found with UUID: ${failureUuid}`,
      };
    }

    const failureName = failureResult.records[0].get('failureName');

    if (progressCallback) progressCallback(50, 'Retrieving risk rating nodes');
    
    // Get all risk rating nodes related to the failure node
    const riskRatingResult = await session.run(      `MATCH (failureNode:FAILURE) 
       WHERE failureNode.uuid = $failureUuid
       MATCH (failureNode)-[relRated:RATED]->(RRnode:RISKRATING)
       RETURN RRnode.name AS RiskRatingNodeName, 
              RRnode.uuid AS RiskRatingNodeUuid, 
              RRnode.Severity AS Severity,
              RRnode.Occurrence AS Occurrence,
              RRnode.Detection AS Detection,
              RRnode.RatingComment AS RatingComment,
              RRnode.Created AS Created,
              RRnode.LastModified AS RiskRatingNodeLastModified
       ORDER BY RRnode.Created ASC`,
      { failureUuid }
    );

    if (progressCallback) progressCallback(90, 'Processing risk rating data');

    const riskRatings = riskRatingResult.records.map(record => ({
      uuid: record.get('RiskRatingNodeUuid'),
      name: record.get('RiskRatingNodeName'),
      severity: record.get('Severity'),
      occurrence: record.get('Occurrence'),
      detection: record.get('Detection'),
      ratingComment: record.get('RatingComment') || '',
      created: record.get('Created'),
      lastModified: record.get('RiskRatingNodeLastModified'),
    }));

    if (progressCallback) progressCallback(100, 'Risk rating nodes retrieved successfully');

    return {
      success: true,
      data: riskRatings,
      message: `Found ${riskRatings.length} risk rating(s) for failure "${failureName}".`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error retrieving risk rating nodes:`, error);
    
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      failureUuid,
    });
    
    return {
      success: false,
      message: "Error retrieving risk rating nodes.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a risk rating node and its relationships
 * @param riskRatingUuid UUID of the risk rating node to delete
 * @param progressCallback Optional callback for progress updates
 */
export const deleteRiskRatingNode = async (
  riskRatingUuid: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating risk rating node');
    
    // First, verify that the risk rating node exists
    const existingRiskRatingResult = await session.run(
      `MATCH (riskRating:RISKRATING) 
       WHERE riskRating.uuid = $riskRatingUuid 
       RETURN riskRating.name AS riskRatingName`,
      { riskRatingUuid }
    );

    if (existingRiskRatingResult.records.length === 0) {
      return {
        success: false,
        message: `No risk rating node found with UUID: ${riskRatingUuid}`,
      };
    }

    const riskRatingName = existingRiskRatingResult.records[0].get('riskRatingName');

    if (progressCallback) progressCallback(50, 'Deleting risk rating node and relationships');
    
    // Delete the risk rating node and all its relationships
    const deleteResult = await session.run(
      `MATCH (riskRating:RISKRATING) 
       WHERE riskRating.uuid = $riskRatingUuid
       DETACH DELETE riskRating
       RETURN count(riskRating) AS deletedCount`,
      { riskRatingUuid }
    );

    if (progressCallback) progressCallback(90, 'Finalizing risk rating node deletion');

    const deletedCount = deleteResult.records[0].get('deletedCount');

    if (deletedCount === 0) {
      throw new Error('No risk rating node was deleted');
    }

    if (progressCallback) progressCallback(100, 'Risk rating node deleted successfully');

    return {
      success: true,
      message: `Risk rating "${riskRatingName}" deleted successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error deleting risk rating node:`, error);
    
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      riskRatingUuid,
    });
    
    return {
      success: false,
      message: "Error deleting risk rating node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
