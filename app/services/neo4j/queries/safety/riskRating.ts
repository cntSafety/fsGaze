import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

/**
 * Create a new RISKRATING node and link it to an existing FAILURE node
 */
export const createRiskRatingNode = async (
  failureModeUuid: string,
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
      `MATCH (failure:FAILUREMODE) 
       WHERE failure.uuid = $failureModeUuid 
       RETURN failure.name AS failureModeName, failure.uuid AS failureModeUuid`,
      { failureModeUuid }
    );

    if (failureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure node found with UUID: ${failureModeUuid}`,
      };
    }

    const failureModeName = failureResult.records[0].get('failureModeName');

    if (progressCallback) progressCallback(30, 'Creating risk rating node');
    
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
    const riskRatingName = `RR${failureModeName}_${timestamp}`;
    
    // Create the risk rating node and establish the relationship
    const queryParams = {
      failureModeUuid,
      riskRatingUuid,
      name: riskRatingName,
      severity,
      occurrence,
      detection,
      ratingComment: ratingComment || '',
      created: currentTimestamp,
      lastModified: currentTimestamp,
    };

    const createResult = await session.run(
      `MATCH (failure:FAILUREMODE) 
       WHERE failure.uuid = $failureModeUuid
       CREATE (riskRating:RISKRATING {
         uuid: $riskRatingUuid,
         name: $name,
         Severity: $severity,
         Occurrence: $occurrence,
         Detection: $detection,
         RatingComment: $ratingComment,
         created: $created,
         lastModified: $lastModified
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
      message: `Risk rating created and linked to failure "${failureModeName}".`,
      riskRatingUuid: createdRiskRatingUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating risk rating node:`, error);
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      failureModeUuid,
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
           riskRating.lastModified = $lastModified
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
 * Get all risk rating nodes for a specific failure node
 * @param failureModeUuid UUID of the failure node to get risk ratings for
 * @param progressCallback Optional callback for progress updates
 */
export const getRiskRatingNodes = async (
  failureModeUuid: string,
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
      `MATCH (failure:FAILUREMODE) 
       WHERE failure.uuid = $failureModeUuid 
       RETURN failure.name AS failureModeName`,
      { failureModeUuid }
    );

    if (failureResult.records.length === 0) {
      return {
        success: false,
        message: `No failure node found with UUID: ${failureModeUuid}`,
      };
    }

    const failureModeName = failureResult.records[0].get('failureModeName');

    if (progressCallback) progressCallback(50, 'Retrieving risk rating nodes');
    
    // Get all risk rating nodes related to the failure node
    const riskRatingResult = await session.run(
      `MATCH (failureNode:FAILUREMODE) 
       WHERE failureNode.uuid = $failureModeUuid
       MATCH (failureNode)-[relRated:RATED]->(RRnode:RISKRATING)
       RETURN RRnode.name AS RiskRatingNodeName, 
              RRnode.uuid AS RiskRatingNodeUuid, 
              RRnode.Severity AS Severity,
              RRnode.Occurrence AS Occurrence,
              RRnode.Detection AS Detection,
              RRnode.RatingComment AS RatingComment,
              RRnode.created AS created,
              RRnode.lastModified AS lastModified
       ORDER BY RRnode.created ASC`,
      { failureModeUuid }
    );

    if (progressCallback) progressCallback(90, 'Processing risk rating data');

    const riskRatings = riskRatingResult.records.map(record => ({
      uuid: record.get('RiskRatingNodeUuid'),
      name: record.get('RiskRatingNodeName'),
      severity: record.get('Severity'),
      occurrence: record.get('Occurrence'),
      detection: record.get('Detection'),
      ratingComment: record.get('RatingComment') || '',
      created: record.get('created'),
      lastModified: record.get('lastModified'),
    }));

    if (progressCallback) progressCallback(100, 'Risk rating nodes retrieved successfully');

    return {
      success: true,
      data: riskRatings,
      message: `Found ${riskRatings.length} risk rating(s) for failure "${failureModeName}".`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error retrieving risk rating nodes:`, error);
    
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace',
      failureModeUuid,
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

/**
 * Get a single risk rating node by its UUID
 * @param riskRatingUuid UUID of the risk rating node to retrieve
 */
export const getRiskRatingByUuid = async (
  riskRatingUuid: string
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  try {
    const query = `
      MATCH (rr:RISKRATING {uuid: $riskRatingUuid})
      RETURN
        rr.uuid AS uuid,
        rr.name AS name,
        rr.Severity AS severity,
        rr.Occurrence AS occurrence,
        rr.Detection AS detection,
        rr.RatingComment AS ratingComment,
        rr.created AS created,
        rr.lastModified AS lastModified
    `;
    const result = await session.run(query, { riskRatingUuid });

    if (result.records.length === 0) {
      return { success: false, message: 'Risk rating not found' };
    }

    const record = result.records[0];
    const data = {
      uuid: record.get('uuid'),
      name: record.get('name'),
      severity: record.get('severity'),
      occurrence: record.get('occurrence'),
      detection: record.get('detection'),
      ratingComment: record.get('ratingComment'),
      created: record.get('created'),
      lastModified: record.get('lastModified'),
    };

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching risk rating by UUID:', error);
    return { success: false, message: 'Failed to fetch risk rating' };
  } finally {
    await session.close();
  }
};
