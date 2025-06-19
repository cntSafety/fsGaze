// Safety Requirements CRUD operations for Neo4j
import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

// Types and interfaces
export interface SafetyReqData {
  uuid: string;
  name: string;
  created: string;
  lastModified: string;
  reqID: string;
  reqText: string;
  reqASIL: string;
  reqLinkedTo?: string;
}

export interface CreateSafetyReqInput {
  name: string;
  reqID: string;
  reqText: string;
  reqASIL: string;
  reqLinkedTo?: string;
}

export interface UpdateSafetyReqInput {
  name?: string;
  reqID?: string;
  reqText?: string;
  reqASIL?: string;
  reqLinkedTo?: string;
}

// ASIL validation enum
export enum SafetyReqASIL {
  QM = 'QM',
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D'
}

// API Response interface
export interface SafetyReqApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Create a new SAFETYREQ node linked to a failure mode
 */
export const createSafetyReq = async (
  failureUuid: string,
  reqData: CreateSafetyReqInput
): Promise<SafetyReqApiResponse<SafetyReqData>> => {
  const session = driver.session();
  
  try {
    // Validate ASIL level
    if (!Object.values(SafetyReqASIL).includes(reqData.reqASIL as SafetyReqASIL)) {
      return {
        success: false,
        error: `Invalid ASIL level: ${reqData.reqASIL}. Must be one of: ${Object.values(SafetyReqASIL).join(', ')}`
      };
    }

    // Validate required fields
    if (!reqData.name || !reqData.reqID || !reqData.reqText || !reqData.reqASIL) {
      return {
        success: false,
        error: 'Missing required fields: name, reqID, reqText, and reqASIL are required'
      };
    }    const now = new Date().toISOString();
    const uuid = generateUUID();    const query = `
      MATCH (f:FAILUREMODE {uuid: $failureUuid})
      CREATE (sr:SAFETYREQ {
        uuid: $uuid,
        name: $name,
        created: $created,
        lastModified: $lastModified,
        reqID: $reqID,
        reqText: $reqText,
        reqASIL: $reqASIL,
        reqLinkedTo: $reqLinkedTo
      })
      CREATE (f)-[:HAS_SAFETY_REQUIREMENT]->(sr)
      RETURN sr
    `;

    const result = await session.run(query, {
      failureUuid,
      uuid,
      name: reqData.name,
      created: now,
      lastModified: now,
      reqID: reqData.reqID,
      reqText: reqData.reqText,
      reqASIL: reqData.reqASIL,
      reqLinkedTo: reqData.reqLinkedTo || null
    });

    if (result.records.length === 0) {
      return {
        success: false,
        error: 'Failed to create safety requirement - failure mode node not found'
      };
    }

    const createdReq = result.records[0].get('sr').properties;
    
    return {
      success: true,
      data: createdReq,
      message: 'Safety requirement created successfully'
    };

  } catch (error) {
    console.error('Error creating safety requirement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  } finally {
    await session.close();
  }
};

/**
 * Get all SAFETYREQ nodes for a specific failure mode node
 */
export const getSafetyReqsForNode = async (
  failureUuid: string
): Promise<SafetyReqApiResponse<SafetyReqData[]>> => {
  const session = driver.session();
  
  try {    const query = `
      MATCH (f:FAILUREMODE {uuid: $failureUuid})-[:HAS_SAFETY_REQUIREMENT]->(sr:SAFETYREQ)
      RETURN sr
      ORDER BY sr.created DESC
    `;const result = await session.run(query, { failureUuid });
    const safetyReqs = result.records.map((record: any) => record.get('sr').properties);
    
    return {
      success: true,
      data: safetyReqs,
      message: `Found ${safetyReqs.length} safety requirements`
    };

  } catch (error) {
    console.error('Error fetching safety requirements:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  } finally {
    await session.close();
  }
};

/**
 * Update an existing SAFETYREQ node
 */
export const updateSafetyReq = async (
  reqUuid: string,
  updateData: UpdateSafetyReqInput
): Promise<SafetyReqApiResponse<SafetyReqData>> => {
  const session = driver.session();
  
  try {
    // Validate ASIL level if provided
    if (updateData.reqASIL && !Object.values(SafetyReqASIL).includes(updateData.reqASIL as SafetyReqASIL)) {
      return {
        success: false,
        error: `Invalid ASIL level: ${updateData.reqASIL}. Must be one of: ${Object.values(SafetyReqASIL).join(', ')}`
      };
    }

    // Build the SET clause dynamically
    const updateFields: string[] = [];
    const params: any = { reqUuid, lastModified: new Date().toISOString() };

    if (updateData.name !== undefined) {
      updateFields.push('sr.name = $name');
      params.name = updateData.name;
    }
    if (updateData.reqID !== undefined) {
      updateFields.push('sr.reqID = $reqID');
      params.reqID = updateData.reqID;
    }
    if (updateData.reqText !== undefined) {
      updateFields.push('sr.reqText = $reqText');
      params.reqText = updateData.reqText;
    }
    if (updateData.reqASIL !== undefined) {
      updateFields.push('sr.reqASIL = $reqASIL');
      params.reqASIL = updateData.reqASIL;
    }
    if (updateData.reqLinkedTo !== undefined) {
      updateFields.push('sr.reqLinkedTo = $reqLinkedTo');
      params.reqLinkedTo = updateData.reqLinkedTo;
    }

    if (updateFields.length === 0) {
      return {
        success: false,
        error: 'No valid fields provided for update'
      };
    }

    updateFields.push('sr.lastModified = $lastModified');

    const query = `
      MATCH (sr:SAFETYREQ {uuid: $reqUuid})
      SET ${updateFields.join(', ')}
      RETURN sr
    `;

    const result = await session.run(query, params);

    if (result.records.length === 0) {
      return {
        success: false,
        error: 'Safety requirement not found'
      };
    }

    const updatedReq = result.records[0].get('sr').properties;
    
    return {
      success: true,
      data: updatedReq,
      message: 'Safety requirement updated successfully'
    };

  } catch (error) {
    console.error('Error updating safety requirement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a SAFETYREQ node
 */
export const deleteSafetyReq = async (
  reqUuid: string
): Promise<SafetyReqApiResponse<boolean>> => {
  const session = driver.session();
  
  try {
    const query = `
      MATCH (sr:SAFETYREQ {uuid: $reqUuid})
      DETACH DELETE sr
      RETURN count(sr) as deletedCount
    `;

    const result = await session.run(query, { reqUuid });
    const deletedCount = result.records[0].get('deletedCount').toNumber();

    if (deletedCount === 0) {
      return {
        success: false,
        error: 'Safety requirement not found'
      };
    }
    
    return {
      success: true,
      data: true,
      message: 'Safety requirement deleted successfully'
    };

  } catch (error) {
    console.error('Error deleting safety requirement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  } finally {
    await session.close();
  }
};

/**
 * Get all SAFETYREQ nodes with optional filtering
 */
export const getAllSafetyReqs = async (
  filters?: {
    reqASIL?: string;
    name?: string;
    reqID?: string;
  }
): Promise<SafetyReqApiResponse<SafetyReqData[]>> => {
  const session = driver.session();
  
  try {
    let whereClause = '';
    const params: any = {};

    if (filters) {
      const conditions: string[] = [];
      
      if (filters.reqASIL) {
        conditions.push('sr.reqASIL = $reqASIL');
        params.reqASIL = filters.reqASIL;
      }
      if (filters.name) {
        conditions.push('toLower(sr.name) CONTAINS toLower($name)');
        params.name = filters.name;
      }
      if (filters.reqID) {
        conditions.push('toLower(sr.reqID) CONTAINS toLower($reqID)');
        params.reqID = filters.reqID;
      }

      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }
    }

    const query = `
      MATCH (sr:SAFETYREQ)
      ${whereClause}
      RETURN sr
      ORDER BY sr.created DESC
    `;    const result = await session.run(query, params);
    const safetyReqs = result.records.map((record: any) => record.get('sr').properties);
    
    return {
      success: true,
      data: safetyReqs,
      message: `Found ${safetyReqs.length} safety requirements`
    };

  } catch (error) {
    console.error('Error fetching all safety requirements:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  } finally {
    await session.close();
  }
};

/**
 * Get a single SAFETYREQ node by UUID
 */
export const getSafetyReqByUuid = async (
  reqUuid: string
): Promise<SafetyReqApiResponse<SafetyReqData>> => {
  const session = driver.session();
  
  try {
    const query = `
      MATCH (sr:SAFETYREQ {uuid: $reqUuid})
      RETURN sr
    `;

    const result = await session.run(query, { reqUuid });

    if (result.records.length === 0) {
      return {
        success: false,
        error: 'Safety requirement not found'
      };
    }

    const safetyReq = result.records[0].get('sr').properties;
    
    return {
      success: true,
      data: safetyReq,
      message: 'Safety requirement found'
    };

  } catch (error) {
    console.error('Error fetching safety requirement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  } finally {
    await session.close();
  }
};
