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
         Created: $created,
         LastModified: $lastModified
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
      `MATCH (failure:FAILUREMODE) 
       WHERE failure.uuid = $failureModeUuid 
       RETURN failure.name AS currentName, failure.description AS currentDescription, failure.asil AS currentAsil`,
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
      `MATCH (failure:FAILUREMODE) 
       WHERE failure.uuid = $failureModeUuid
       SET failure.name = $failureModeName,
           failure.description = $failureModeDescription,
           failure.asil = $asil,
           failure.updatedAt = $updatedAt
       RETURN failure.uuid AS updatedFailureUuid, failure.name AS updatedFailureName`,
      {
        failureModeUuid,
        failureModeName,
        failureModeDescription,
        asil,
        updatedAt: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing failure mode node update');

    if (updateResult.records.length === 0) {
      throw new Error('No records returned from UPDATE query');
    }

    const updatedFailureName = updateResult.records[0].get('updatedFailureName');

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
    const existingFailureResult = await session.run(      `MATCH (failure:FAILUREMODE) 
       WHERE failure.uuid = $failureModeUuid 
       RETURN failure.name AS failureModeName`,
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
      `MATCH (failure:FAILUREMODE) 
       WHERE failure.uuid = $failureModeUuid
       DETACH DELETE failure
       RETURN count(failure) AS deletedCount`,
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
      MATCH (port)-[r]-(failure:FAILUREMODE)
      WHERE port.uuid = $portUuid
      AND (port:P_PORT_PROTOTYPE OR port:R_PORT_PROTOTYPE)
      RETURN 
        failure.uuid AS failureModeUuid,
        failure.name AS failureModeName,
        failure.description AS failureModeDescription,
        failure.asil AS asil,
        labels(failure) AS failureLabels,
        type(r) AS relationshipType
      ORDER BY failure.Created ASC`;
    
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
  
  try {    const query = `
      MATCH (swComponent:APPLICATION_SW_COMPONENT_TYPE)-[r]-(failure:FAILUREMODE)
      WHERE swComponent.uuid = $swComponentUuid 
      RETURN 
        failure.uuid AS failureModeUuid,
        failure.name AS failureModeName,
        failure.description AS failureModeDescription,
        failure.asil AS asil,
        type(r) AS relationshipType
      ORDER BY failure.Created ASC`;
    
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

export const getFailuresAndCountsForComponents = async (
  componentUuids: string[]
): Promise<{ success: boolean; data?: any[]; message?: string }> => {
  const session = driver.session();
  try {
    const query = `
      MATCH (swc:APPLICATION_SW_COMPONENT_TYPE)
      WHERE swc.uuid IN $componentUuids
      OPTIONAL MATCH (swc)<-[:OCCURRENCE]-(fm:FAILUREMODE)
      WITH swc, fm
      WHERE fm IS NOT NULL
      OPTIONAL MATCH (fm)-[:RATED]->(rr:RISKRATING)
      OPTIONAL MATCH (fm)-[:TASKREF]->(t:SAFETYTASKS)
      OPTIONAL MATCH (fm)-[:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
      OPTIONAL MATCH (fm)-[:NOTEREF]->(n:SAFETYNOTE)
      RETURN
        swc.uuid AS swComponentUuid,
        swc.name AS swComponentName,
        fm.uuid AS failureUuid,
        fm.name AS failureName,
        fm.description AS failureDescription,
        fm.asil AS asil,
        fm.Created AS Created,
        count(DISTINCT rr) AS riskRatingCount,
        count(DISTINCT t) AS safetyTaskCount,
        count(DISTINCT req) AS safetyReqCount,
        count(DISTINCT n) AS safetyNoteCount
      ORDER BY swc.name, fm.Created ASC
    `;

    const result = await session.run(query, { componentUuids });
    const data = result.records.map(record => ({
      swComponentUuid: record.get('swComponentUuid'),
      swComponentName: record.get('swComponentName'),
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureDescription: record.get('failureDescription'),
      asil: record.get('asil'),
      Created: record.get('Created'),
      riskRatingCount: record.get('riskRatingCount').low,
      safetyTaskCount: record.get('safetyTaskCount').low,
      safetyReqCount: record.get('safetyReqCount').low,
      safetyNoteCount: record.get('safetyNoteCount').low,
    }));
    
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching failures with counts:', error);
    return { success: false, message: 'Failed to fetch failures with counts' };
  } finally {
    await session.close();
  }
};

export const getFailuresAndCountsForComponent = async (
  componentUuid: string
): Promise<{ success: boolean; data?: any[]; message?: string }> => {
  const session = driver.session();
  try {
    const query = `
      MATCH (swc:APPLICATION_SW_COMPONENT_TYPE {uuid: $componentUuid})<-[:OCCURRENCE]-(fm:FAILUREMODE)
      WITH fm
      OPTIONAL MATCH (fm)-[:RATED]->(rr:RISKRATING)
      OPTIONAL MATCH (fm)-[:TASKREF]->(t:SAFETYTASKS)
      OPTIONAL MATCH (fm)-[:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
      OPTIONAL MATCH (fm)-[:NOTEREF]->(n:SAFETYNOTE)
      RETURN
        fm.uuid AS failureUuid,
        fm.name AS failureName,
        fm.description AS failureDescription,
        fm.asil AS asil,
        fm.Created AS Created,
        count(DISTINCT rr) AS riskRatingCount,
        count(DISTINCT t) AS safetyTaskCount,
        count(DISTINCT req) AS safetyReqCount,
        count(DISTINCT n) AS safetyNoteCount
      ORDER BY fm.Created ASC
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

export const getFailuresAndCountsForPorts = async (
  portUuids: string[]
): Promise<{ success: boolean; data?: any; message?: string }> => {
  if (portUuids.length === 0) {
    return { success: true, data: {} };
  }
  const session = driver.session();
  try {
    const query = `
      MATCH (p)<-[:OCCURRENCE]-(fm:FAILUREMODE)
      WHERE p.uuid IN $portUuids
      AND (p:P_PORT_PROTOTYPE OR p:R_PORT_PROTOTYPE)
      WITH p, fm
      OPTIONAL MATCH (fm)-[:RATED]->(rr:RISKRATING)
      OPTIONAL MATCH (fm)-[:TASKREF]->(t:SAFETYTASKS)
      OPTIONAL MATCH (fm)-[:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
      OPTIONAL MATCH (fm)-[:NOTEREF]->(n:SAFETYNOTE)
      RETURN
        p.uuid as portUuid,
        fm.uuid AS failureUuid,
        fm.name AS failureName,
        fm.description AS failureDescription,
        fm.asil AS asil,
        count(DISTINCT rr) AS riskRatingCount,
        count(DISTINCT t) AS safetyTaskCount,
        count(DISTINCT req) AS safetyReqCount,
        count(DISTINCT n) AS safetyNoteCount,
        p.name as portName,
        fm.Created as Created
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
