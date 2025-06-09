import { driver } from '../config';
import { generateUUID } from '../utils';

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
    console.log('🔍 Creating failure node with params:', {
      existingElementUuid,
      failureName,
      failureDescription,
      asil
    });


    if (progressCallback) progressCallback(10, 'Validating existing element');
    
    // First, verify that the existing element exists
    const existingElementResult = await session.run(
      `MATCH (element) 
       WHERE element.uuid = $existingElementUuid 
       RETURN element.name AS elementName, labels(element)[0] AS elementType`,
      { existingElementUuid }
    );

    if (existingElementResult.records.length === 0) {
      console.log('❌ No element found with UUID:', existingElementUuid);
      return {
        success: false,
        message: `No element found with UUID: ${existingElementUuid}`,
      };
    }

    const elementName = existingElementResult.records[0].get('elementName');
    const elementType = existingElementResult.records[0].get('elementType');

    console.log('✅ Found existing element:', { elementName, elementType });

    if (progressCallback) progressCallback(30, 'Creating failure node');
    
    // Generate a UUID for the new failure node
    const failureUuid = generateUUID();
    const currentTimestamp = new Date().toISOString();
    
    console.log('🔍 About to create failure node with UUID:', failureUuid);
    
    // Create the failure node and establish the relationship
    const queryParams = {
      existingElementUuid,
      failureUuid,
      failureName,
      failureDescription,
      asil,
      createdAt: currentTimestamp,
    };

    console.log('🔍 Query parameters:', queryParams);

    const createResult = await session.run(
      `MATCH (element) 
       WHERE element.uuid = $existingElementUuid
       CREATE (failure:FAILURE {
         uuid: $failureUuid,
         name: $failureName,
         description: $failureDescription,
         asil: $asil
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

    console.log(`✅ Failure node created successfully:`, {
      failureUuid: createdFailureUuid,
      failureName: createdFailureName,
      linkedToElement: elementName,
      elementType: elementType
    });

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

    const deletedCount = deleteResult.records[0].get('deletedCount');

    if (progressCallback) progressCallback(100, 'Failure node deleted successfully');

    console.log(`✅ Failure node deleted successfully:`, {
      failureUuid,
      failureName,
      deletedCount
    });

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
 * @param causationType Type of causation (e.g., "direct", "indirect", "conditional")
 * @param probability Optional probability of causation (0.0 to 1.0)
 * @param description Optional description of the causation relationship
 */
export const createCausationBetweenFailures = async (
  sourceFailureUuid: string,
  targetFailureUuid: string,
  causationType: string = "direct",
  probability?: number,
  description?: string
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
           type: $causationType,
           createdAt: $createdAt
           ${probability !== undefined ? ', probability: $probability' : ''}
           ${description ? ', description: $description' : ''}
       })
       CREATE (causation)-[:FIRST]->(causationFirst)
       CREATE (causation)-[:THEN]->(causationThen)
       RETURN causation.uuid AS createdCausationUuid, causation.name AS createdCausationName`,
      {
        firstFailureUuid: sourceFailureUuid,
        thenFailureUuid: targetFailureUuid,
        causationName,
        causationUuid,
        causationType,
        createdAt: new Date().toISOString(),
        ...(probability !== undefined && { probability }),
        ...(description && { description })
      }
    );

    if (result.records.length === 0) {
      throw new Error('No records returned from CREATE query');
    }

    const createdCausationUuid = result.records[0].get('createdCausationUuid');
    const createdCausationName = result.records[0].get('createdCausationName');

    console.log(`✅ Causation node created:`, {
      causationUuid: createdCausationUuid,
      causationName: createdCausationName,
      source: sourceName,
      target: targetName,
      causationType,
      probability,
      description
    });

    return {
      success: true,
      message: `Causation relationship created: "${sourceName}" causes "${targetName}" (${causationType}).`,
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
    failureType: string | null;
    relationshipType: string;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    console.log(`🔍 Fetching failures for port UUID: ${portUuid}`);
    
    const result = await session.run(
      `MATCH (port)-[r]-(failure:FAILURE)
       WHERE port.uuid = $portUuid 
       AND (port:P_PORT_PROTOTYPE OR port:R_PORT_PROTOTYPE)
       RETURN 
         failure.uuid AS failureUuid,
         failure.name AS failureName,
         labels(failure) AS failureLabels,
         type(r) AS relationshipType
       ORDER BY failure.name`,
      { portUuid }
    );

    if (result.records.length === 0) {
      console.log(`ℹ️ No failures found for port UUID: ${portUuid}`);
      return {
        success: true,
        data: [],
        message: `No failures found for port: ${portUuid}`,
      };
    }

    const failures = result.records.map(record => ({
      failureUuid: record.get('failureUuid'),
      failureName: record.get('failureName'),
      failureType: record.get('failureLabels')?.join(', ') || 'FAILURE',
      relationshipType: record.get('relationshipType'),
    }));

    console.log(`✅ Found ${failures.length} failures for port ${portUuid}:`, failures);

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
