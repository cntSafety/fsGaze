import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

/**
 * Create a failure mode node and link it to an existing element via an "OCCURRENCE" relationship
 * @param existingElementUuid UUID of the existing element to link the failure to
 * @param failureModeName Name of the failure
 * @param failureModeDescription Description of the failure
 * @param asil ASIL (Automotive Safety Integrity Level) rating
 * @param progressCallback Optional callback for progress updates
 */
export const createFailureModeNode = async (
  existingElementUuid: string,
  failureModeName: string,
  failureModeDescription: string,
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
    if (progressCallback) progressCallback(10, 'Validating existing element');
    
    // First, verify that the existing element exists
    const existingElementResult = await session.run(
      `MATCH (element) 
       WHERE element.uuid = $existingElementUuid 
       RETURN element.name AS elementName, labels(element)[0] AS elementType`,
      { existingElementUuid }
    );

    if (existingElementResult.records.length === 0) {
      return {
        success: false,
        message: `No element found with UUID: ${existingElementUuid}`,
      };
    }

    const elementName = existingElementResult.records[0].get('elementName');
    const elementType = existingElementResult.records[0].get('elementType');

    if (progressCallback) progressCallback(30, 'Creating failure mode node');
    
    // Generate a UUID for the new failure mode node
    const failureModeUuid = generateUUID();
    const currentTimestamp = new Date().toISOString();
    
    // Create the failure mode node and establish the relationship
    const queryParams = {
      existingElementUuid,
      failureModeUuid,
      failureModeName,
      failureModeDescription,
      asil,
      created: currentTimestamp,
      lastModified: currentTimestamp,
    };

    const createResult = await session.run(
      `MATCH (element) 
       WHERE element.uuid = $existingElementUuid
       CREATE (failureMode:FAILUREMODE {
         uuid: $failureModeUuid,
         name: $failureModeName,
         description: $failureModeDescription,
         asil: $asil,
         created: $created,
         lastModified: $lastModified
       })
       CREATE (failureMode)-[r:OCCURRENCE]->(element)
       RETURN failureMode.uuid AS createdFailureModeUuid, failureMode.name AS createdFailureModeName`,
      queryParams
    );

    if (progressCallback) progressCallback(90, 'Finalizing failure mode node creation');

    if (createResult.records.length === 0) {
      throw new Error('No records returned from CREATE query');
    }

    const createdFailureModeUuid = createResult.records[0].get('createdFailureModeUuid');
    const createdFailureModeName = createResult.records[0].get('createdFailureModeName');

    if (progressCallback) progressCallback(100, 'Failure node created successfully');    return {
      success: true,
      message: `Failure mode "${createdFailureModeName}" created and linked to ${elementType} "${elementName}".`,
      failureUuid: createdFailureModeUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating failure mode mode node:`, error);
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      existingElementUuid,
      failureModeName,
    });
    
    return {
      success: false,
      message: "Error creating failure mode mode node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Update an existing failure mode node's properties
 * @param failureModeUuid UUID of the failure mode node to update
 * @param failureModeName New name of the failure
 * @param failureModeDescription New description of the failure
 * @param asil New ASIL (Automotive Safety Integrity Level) rating
 * @param progressCallback Optional callback for progress updates
 */
export const updateFailureModeNode = async (
  failureModeUuid: string,
  failureModeName: string,
  failureModeDescription: string,
  asil: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating failure mode node');
    
    // First, verify that the failure mode node exists
    const existingFailureResult = await session.run(
      `MATCH (failureMode:FAILUREMODE) 
       WHERE failureMode.uuid = $failureModeUuid 
       RETURN failureMode.name AS currentName, failureMode.description AS currentDescription, failureMode.asil AS currentAsil`,
      { failureModeUuid }
    );

    if (existingFailureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure mode node found with UUID: ${failureModeUuid}`,
      };
    }

    if (progressCallback) progressCallback(50, 'Updating failure mode node properties');
    
    const currentTimestamp = new Date().toISOString();
    
    // Update the failure mode node properties
    const updateResult = await session.run(
      `MATCH (failureMode:FAILUREMODE) 
       WHERE failureMode.uuid = $failureModeUuid
       SET failureMode.name = $failureModeName,
           failureMode.description = $failureModeDescription,
           failureMode.asil = $asil,
           failureMode.lastModified = $timestamp
       RETURN failureMode.uuid AS updatedFailureModeUuid, failureMode.name AS updatedFailureModeName`,
      {
        failureModeUuid,
        failureModeName,
        failureModeDescription,
        asil,
        timestamp: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing failure mode node update');

    if (updateResult.records.length === 0) {
      throw new Error('No records returned from UPDATE query');
    }

    const updatedFailureName = updateResult.records[0].get('updatedFailureModeName');

    if (progressCallback) progressCallback(100, 'Failure node updated successfully');

    return {
      success: true,
      message: `Failure mode "${updatedFailureName}" updated successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error updating failure mode node:`, error);
    
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      failureModeUuid,
      failureModeName,
    });
    
    return {
      success: false,
      message: "Error updating failure mode node.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a failure mode node and its relationships
 * @param failureModeUuid UUID of the failure mode node to delete
 * @param progressCallback Optional callback for progress updates
 */
export const deleteFailureModeNode = async (
  failureModeUuid: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating failure mode node');
    
    // First, verify that the failure mode node exists
    const existingFailureResult = await session.run(      `MATCH (failureMode:FAILUREMODE) 
       WHERE failureMode.uuid = $failureModeUuid 
       RETURN failureMode.name AS failureModeName`,
      { failureModeUuid }
    );

    if (existingFailureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure mode node found with UUID: ${failureModeUuid}`,
      };
    }

    const failureModeName = existingFailureResult.records[0].get('failureModeName');

    if (progressCallback) progressCallback(50, 'Deleting failure mode node and relationships');
    
    // Delete the failure mode node and all its relationships
    const deleteResult = await session.run(
      `MATCH (failureMode:FAILUREMODE) 
       WHERE failureMode.uuid = $failureModeUuid
       DETACH DELETE failureMode
       RETURN count(failureMode) AS deletedCount`,
      { failureModeUuid }
    );

    // Get deleted count for potential logging
    deleteResult.records[0].get('deletedCount');

    if (progressCallback) progressCallback(100, 'Failure node deleted successfully');

    return {
      success: true,
      message: `Failure mode "${failureModeName}" deleted successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error deleting failure mode node:`, errorMessage);
    
    return {
      success: false,
      message: "Error deleting failure mode node.",
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
  
  try {    const query = `
      MATCH (port)-[r]-(failureMode:FAILUREMODE)
      WHERE port.uuid = $portUuid
      AND (port:P_PORT_PROTOTYPE OR port:R_PORT_PROTOTYPE)
      RETURN 
        failureMode.uuid AS failureModeUuid,
        failureMode.name AS failureModeName,
        failureMode.description AS failureModeDescription,
        failureMode.asil AS asil,
        labels(failureMode) AS failureLabels,
        type(r) AS relationshipType
      ORDER BY failureMode.Created ASC`;
    
    const result = await session.run(query, { portUuid });

    if (result.records.length === 0) {
      return {
        success: true,
        data: [],
        message: `No failures found for port: ${portUuid}`,
      };
    }    const failures = result.records.map(record => ({
      failureUuid: record.get('failureModeUuid'),
      failureName: record.get('failureModeName'),
      failureDescription: record.get('failureModeDescription'),
      asil: record.get('asil'),
      failureType: record.get('failureLabels'),
      relationshipType: record.get('relationshipType'),
    }));

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
 * Get failures that have OCCURRENCE relations to APPLICATION_SW_COMPONENT_TYPE or COMPOSITION_SW_COMPONENT_TYPE
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
  
  try {    const query = `
      MATCH (swComponent)-[r]-(failureMode:FAILUREMODE)
      WHERE swComponent.uuid = $swComponentUuid 
      AND (swComponent:APPLICATION_SW_COMPONENT_TYPE OR swComponent:COMPOSITION_SW_COMPONENT_TYPE OR swComponent:ECU_ABSTRACTION_SW_COMPONENT_TYPE)
      RETURN 
        failureMode.uuid AS failureModeUuid,
        failureMode.name AS failureModeName,
        failureMode.description AS failureModeDescription,
        failureMode.asil AS asil,
        type(r) AS relationshipType
      ORDER BY failureMode.Created ASC`;
    
    const result = await session.run(query, { swComponentUuid });

    if (result.records.length === 0) {
      return {
        success: true,
        data: [],
        message: `No failures found for SW component: ${swComponentUuid}`,
      };
    }    const failures = result.records.map(record => ({
      failureUuid: record.get('failureModeUuid'),
      failureName: record.get('failureModeName'),
      failureDescription: record.get('failureModeDescription'),
      asil: record.get('asil'),
      relationshipType: record.get('relationshipType'),
    }));

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
 * Retrieves failure modes and their associated counts for multiple software components.
 * 
 * This function fetches all failure modes that occur in the specified software components
 * and includes aggregate counts of related safety artifacts (risk ratings, safety tasks,
 * safety requirements, and safety notes) for each failure mode.
 * 
 * @param componentUuids - Array of software component UUIDs to fetch failure data for
 * 
 * @returns Promise that resolves to an object containing:
 * - success: boolean indicating if the operation was successful
 * - data: Array of failure mode objects with the following structure:
 *   - swComponentUuid: UUID of the software component
 *   - swComponentName: Name of the software component
 *   - failureUuid: UUID of the failure mode
 *   - failureName: Name of the failure mode
 *   - failureDescription: Description of the failure mode
 *   - asil: ASIL (Automotive Safety Integrity Level) classification
 *   - created: Creation timestamp of the failure mode
 *   - riskRatingCount: Number of risk ratings associated with this failure mode
 *   - safetyTaskCount: Number of safety tasks associated with this failure mode
 *   - safetyReqCount: Number of safety requirements associated with this failure mode
 *   - safetyNoteCount: Number of safety notes associated with this failure mode
 * - message: Error message if the operation failed
 * 
 * @example
 * ```typescript
 * const componentIds = ['comp-1', 'comp-2', 'comp-3'];
 * const result = await getFailuresAndCountsForComponents(componentIds);
 * 
 * if (result.success && result.data) {
 *   result.data.forEach(failure => {
 *     console.log(`${failure.failureName} (${failure.asil}) - ${failure.riskRatingCount} risk ratings`);
 *   });
 * }
 * ```
 * 
 * @throws Will return success: false with error message if Neo4j query fails
 * 
 * @since 1.0.0
 */
export const getFailuresAndCountsForComponents = async (
  componentUuids: string[]
): Promise<{ success: boolean; data?: any[]; message?: string }> => {
  const session = driver.session();
  try {
    const query = `
      MATCH (swc)
      WHERE swc.uuid IN $componentUuids
      AND (swc:APPLICATION_SW_COMPONENT_TYPE OR swc:COMPOSITION_SW_COMPONENT_TYPE OR swc:ECU_ABSTRACTION_SW_COMPONENT_TYPE)
      OPTIONAL MATCH (swc)<-[:OCCURRENCE]-(failureMode:FAILUREMODE)
      WITH swc, failureMode
      WHERE failureMode IS NOT NULL
      OPTIONAL MATCH (failureMode)-[:RATED]->(rr:RISKRATING)
      OPTIONAL MATCH (failureMode)-[:TASKREF]->(t:SAFETYTASKS)
      OPTIONAL MATCH (failureMode)-[:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
      OPTIONAL MATCH (failureMode)-[:NOTEREF]->(n:SAFETYNOTE)
      RETURN
        swc.uuid AS swComponentUuid,
        swc.name AS swComponentName,
        failureMode.uuid AS failureUuid,
        failureMode.name AS failureName,
        failureMode.description AS failureDescription,
        failureMode.asil AS asil,
        failureMode.created AS created,
        count(DISTINCT rr) AS riskRatingCount,
        count(DISTINCT t) AS safetyTaskCount,
        count(DISTINCT CASE WHEN t.status = 'finished' THEN t END) AS finishedTaskCount,
        count(DISTINCT req) AS safetyReqCount,
        count(DISTINCT n) AS safetyNoteCount,
         rr.Severity as Severity, 
         rr.Occurrence as Occurrence, 
         rr.Detection as Detection
      ORDER BY swc.name, failureMode.created ASC
    `;

    const result = await session.run(query, { componentUuids });
    const data = result.records.map(record => ({
      swComponentUuid: record.get('swComponentUuid'),
      swComponentName: record.get('swComponentName'),
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureDescription: record.get('failureDescription'),
      asil: record.get('asil'),
      created: record.get('created'),
      riskRatingCount: record.get('riskRatingCount').low,
      safetyTaskCount: record.get('safetyTaskCount').low,
      finishedTaskCount: record.get('finishedTaskCount').low,
      safetyReqCount: record.get('safetyReqCount').low,
      safetyNoteCount: record.get('safetyNoteCount').low,
      Severity: record.get('Severity'),
      Occurrence: record.get('Occurrence'),
      Detection: record.get('Detection'), 
    }));
    
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching failures with counts:', error);
    return { success: false, message: 'Failed to fetch failures with counts' };
  } finally {
    await session.close();
  }
};

/**
 * Retrieves failure modes and their associated counts for a single software component.
 * 
 * This function fetches all failure modes that occur in the specified software component
 * and includes aggregate counts of related safety artifacts (risk ratings, safety tasks,
 * safety requirements, and safety notes) for each failure mode.
 * 
 * @param componentUuid - UUID of the software component to fetch failure data for
 * 
 * @returns Promise that resolves to an object containing:
 * - success: boolean indicating if the operation was successful
 * - data: Array of failure mode objects with the following structure:
 *   - failureUuid: UUID of the failure mode
 *   - failureName: Name of the failure mode
 *   - failureDescription: Description of the failure mode
 *   - asil: ASIL (Automotive Safety Integrity Level) classification
 *   - relationshipType: Type of relationship (typically 'HAS_FAILURE')
 *   - riskRatingCount: Number of risk ratings associated with this failure mode
 *   - safetyTaskCount: Number of safety tasks associated with this failure mode
 *   - safetyReqCount: Number of safety requirements associated with this failure mode
 *   - safetyNoteCount: Number of safety notes associated with this failure mode
 * - message: Error message if the operation failed
 * 
 * @example
 * ```typescript
 * const componentId = 'comp-123';
 * const result = await getFailuresAndCountsForComponent(componentId);
 * 
 * if (result.success && result.data) {
 *   console.log(`Found ${result.data.length} failure modes`);
 *   result.data.forEach(failure => {
 *     console.log(`${failure.failureName} (${failure.asil}) - ${failure.riskRatingCount} risk ratings`);
 *   });
 * }
 * ```
 * 
 * @throws Will return success: false with error message if Neo4j query fails
 * 
 * @since 1.0.0
 */
export const getFailuresAndCountsForComponent = async (
  componentUuid: string
): Promise<{ success: boolean; data?: any[]; message?: string }> => {
  const session = driver.session();
  try {
    const query = `
      MATCH (swc {uuid: $componentUuid})
      WHERE (swc:APPLICATION_SW_COMPONENT_TYPE OR swc:COMPOSITION_SW_COMPONENT_TYPE OR swc:ECU_ABSTRACTION_SW_COMPONENT_TYPE)
      MATCH (swc)<-[:OCCURRENCE]-(failureMode:FAILUREMODE)
      WITH failureMode
      OPTIONAL MATCH (failureMode)-[:RATED]->(rr:RISKRATING)
      OPTIONAL MATCH (failureMode)-[:TASKREF]->(t:SAFETYTASKS)
      OPTIONAL MATCH (failureMode)-[:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
      OPTIONAL MATCH (failureMode)-[:NOTEREF]->(n:SAFETYNOTE)
      RETURN
        failureMode.uuid AS failureUuid,
        failureMode.name AS failureName,
        failureMode.description AS failureDescription,
        failureMode.asil AS asil,
        failureMode.created AS created,
        count(DISTINCT rr) AS riskRatingCount,
        count(DISTINCT t) AS safetyTaskCount,
        count(DISTINCT req) AS safetyReqCount,
        count(DISTINCT n) AS safetyNoteCount
      ORDER BY failureMode.created ASC
    `;

    const result = await session.run(query, { componentUuid });
    const data = result.records.map(record => ({
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureDescription: record.get('failureDescription'),
      asil: record.get('asil'),
      relationshipType: 'HAS_FAILURE', // Assuming this relationship type
      riskRatingCount: record.get('riskRatingCount').low,
      safetyTaskCount: record.get('safetyTaskCount').low,
      safetyReqCount: record.get('safetyReqCount').low,
      safetyNoteCount: record.get('safetyNoteCount').low,
    }));
    
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching failures with counts for component:', error);
    return { success: false, message: 'Failed to fetch component failures with counts' };
  } finally {
    await session.close();
  }
};

/**
 * Retrieves failure modes and their associated counts for multiple ports.
 * 
 * This function fetches all failure modes that occur in the specified ports
 * and includes aggregate counts of related safety artifacts (risk ratings, safety tasks,
 * safety requirements, and safety notes) for each failure mode. Results are grouped by port UUID.
 * 
 * @param portUuids - Array of port UUIDs to fetch failure data for
 * 
 * @returns Promise that resolves to an object containing:
 * - success: boolean indicating if the operation was successful
 * - data: Object with port UUIDs as keys, each containing an array of failure mode objects:
 *   - failureUuid: UUID of the failure mode
 *   - failureName: Name of the failure mode
 *   - failureDescription: Description of the failure mode
 *   - asil: ASIL (Automotive Safety Integrity Level) classification
 *   - failureType: Type of failure (typically 'FAILURE')
 *   - relationshipType: Type of relationship (typically 'HAS_FAILURE')
 *   - riskRatingCount: Number of risk ratings associated with this failure mode
 *   - safetyTaskCount: Number of safety tasks associated with this failure mode
 *   - safetyReqCount: Number of safety requirements associated with this failure mode
 *   - safetyNoteCount: Number of safety notes associated with this failure mode
 * - message: Error message if the operation failed
 * 
 * @example
 * ```typescript
 * const portIds = ['port-1', 'port-2', 'port-3'];
 * const result = await getFailuresAndCountsForPorts(portIds);
 * 
 * if (result.success && result.data) {
 *   Object.entries(result.data).forEach(([portId, failures]) => {
 *     console.log(`Port ${portId} has ${failures.length} failure modes`);
 *     failures.forEach(failure => {
 *       console.log(`  - ${failure.failureName} (${failure.asil})`);
 *     });
 *   });
 * }
 * ```
 * 
 * @throws Will return success: false with error message if Neo4j query fails
 * 
 * @since 1.0.0
 * 
 * @note Returns empty data object if portUuids array is empty
 */
export const getFailuresAndCountsForPorts = async (
  portUuids: string[]
): Promise<{ success: boolean; data?: any; message?: string }> => {
  if (portUuids.length === 0) {
    return { success: true, data: {} };
  }
  const session = driver.session();
  try {
    const query = `
      MATCH (p)<-[:OCCURRENCE]-(failureMode:FAILUREMODE)
      WHERE p.uuid IN $portUuids
      AND (p:P_PORT_PROTOTYPE OR p:R_PORT_PROTOTYPE)
      WITH p, failureMode
      OPTIONAL MATCH (failureMode)-[:RATED]->(rr:RISKRATING)
      OPTIONAL MATCH (failureMode)-[:TASKREF]->(t:SAFETYTASKS)
      OPTIONAL MATCH (failureMode)-[:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
      OPTIONAL MATCH (failureMode)-[:NOTEREF]->(n:SAFETYNOTE)
      RETURN
        p.uuid as portUuid,
        failureMode.uuid AS failureUuid,
        failureMode.name AS failureName,
        failureMode.description AS failureDescription,
        failureMode.asil AS asil,
        count(DISTINCT rr) AS riskRatingCount,
        count(DISTINCT t) AS safetyTaskCount,
        count(DISTINCT req) AS safetyReqCount,
        count(DISTINCT n) AS safetyNoteCount,
        p.name as portName,
        failureMode.Created as Created
      ORDER BY portName, Created ASC
    `;

    const result = await session.run(query, { portUuids });
    
    const dataByPort: { [key: string]: any[] } = {};
    result.records.forEach(record => {
      const portUuid = record.get('portUuid');
      if (!dataByPort[portUuid]) {
        dataByPort[portUuid] = [];
      }
      dataByPort[portUuid].push({
        failureUuid: record.get('failureUuid'),
        failureName: record.get('failureName'),
        failureDescription: record.get('failureDescription'),
        asil: record.get('asil'),
        failureType: 'FAILURE', // Assuming failure type
        relationshipType: 'HAS_FAILURE',
        riskRatingCount: record.get('riskRatingCount').low,
        safetyTaskCount: record.get('safetyTaskCount').low,
        safetyReqCount: record.get('safetyReqCount').low,
        safetyNoteCount: record.get('safetyNoteCount').low,
      });
    });

    return { success: true, data: dataByPort };
  } catch (error) {
    console.error('Error fetching failures with counts for ports:', error);
    return { success: false, message: 'Failed to fetch port failures with counts' };
  } finally {
    await session.close();
  }
};

/**
 * Get a single failure mode by its UUID
 * @param failureModeUuid UUID of the failure mode to retrieve
 */
export const getFailureModeByUuid = async (
  failureModeUuid: string
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  try {
    const query = `
      MATCH (failureMode:FAILUREMODE {uuid: $failureModeUuid})
      RETURN
        failureMode.uuid AS failureUuid,
        failureMode.name AS failureName,
        failureMode.description AS failureDescription,
        failureMode.asil AS asil,
        failureMode.created AS created,
        failureMode.lastModified AS lastModified
    `;
    const result = await session.run(query, { failureModeUuid });

    if (result.records.length === 0) {
      return { success: false, message: 'Failure mode not found' };
    }

    const record = result.records[0];
    const data = {
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureDescription: record.get('failureDescription'),
      asil: record.get('asil'),
      created: record.get('created'),
      lastModified: record.get('lastModified'),
    };

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching failure mode by UUID:', error);
    return { success: false, message: 'Failed to fetch failure mode' };
  } finally {
    await session.close();
  }
};
