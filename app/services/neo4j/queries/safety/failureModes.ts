import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

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

    if (progressCallback) progressCallback(30, 'Creating failure node');
    
    // Generate a UUID for the new failure node
    const failureUuid = generateUUID();
    const currentTimestamp = new Date().toISOString();
    
    // Create the failure node and establish the relationship
    const queryParams = {
      existingElementUuid,
      failureUuid,
      failureName,
      failureDescription,
      asil,
      created: currentTimestamp,
      lastModified: currentTimestamp,
    };

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
    
    // First, verify that the failure node exists
    const existingFailureResult = await session.run(
      `MATCH (failure:FAILURE) 
       WHERE failure.uuid = $failureUuid 
       RETURN failure.name AS currentName, failure.description AS currentDescription, failure.asil AS currentAsil`,
      { failureUuid }
    );

    if (existingFailureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure node found with UUID: ${failureUuid}`,
      };
    }

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
    }

    const updatedFailureName = updateResult.records[0].get('updatedFailureName');

    if (progressCallback) progressCallback(100, 'Failure node updated successfully');

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
      return {
        success: true,
        data: [],
        message: `No failures found for SW component: ${swComponentUuid}`,
      };
    }

    const failures = result.records.map(record => ({
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureDescription: record.get('failureDescription'),
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
