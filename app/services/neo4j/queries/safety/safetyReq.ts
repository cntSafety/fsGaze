// Safety Requirements CRUD operations for Neo4j
import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

/**
 * Represents a Safety Requirement entity in the Neo4j database
 */
export interface SafetyReqData {
  /** Unique identifier for the safety requirement */
  uuid: string;
  /** Human-readable name of the safety requirement */
  name: string;
  /** ISO timestamp when the requirement was created in fsGaze */
  created: string;
  /** ISO timestamp when the requirement was last modified in fsGaze */
  lastModified: string;
  /** Unique requirement identifier (e.g., REQ-001) */
  reqID: string;
  /** Detailed description/text of the safety requirement */
  reqText: string;
  /** ASIL classification level (QM, A, B, C, D) */
  reqASIL: string;
  /** Optional link to external documents or systems */
  reqLinkedTo?: string;
  /** Optional creation date from Jama system */
  jamaCreatedDate?: string;
  /** Optional modification date from Jama system */
  jamaModifiedDate?: string;
}

/**
 * Input data required to create a new Safety Requirement
 */
export interface CreateSafetyReqInput {
  /** Human-readable name of the safety requirement */
  name: string;
  /** Unique requirement identifier (e.g., REQ-001) */
  reqID: string;
  /** Detailed description/text of the safety requirement */
  reqText: string;
  /** ASIL classification level (must be valid SafetyReqASIL enum value) */
  reqASIL: string;
  /** Optional link to external documents or systems */
  reqLinkedTo?: string;
  /** Optional creation date from Jama system */
  jamaCreatedDate?: string;
  /** Optional modification date from Jama system */
  jamaModifiedDate?: string;
}

/**
 * Input data for updating an existing Safety Requirement
 * All fields are optional to allow partial updates
 */
export interface UpdateSafetyReqInput {
  /** Human-readable name of the safety requirement */
  name?: string;
  /** Unique requirement identifier (e.g., REQ-001) */
  reqID?: string;
  /** Detailed description/text of the safety requirement */
  reqText?: string;
  /** ASIL classification level (must be valid SafetyReqASIL enum value) */
  reqASIL?: string;
  /** Optional link to external documents or systems */
  reqLinkedTo?: string;
  /** Optional creation date from Jama system */
  jamaCreatedDate?: string;
  /** Optional modification date from Jama system */
  jamaModifiedDate?: string;
}

/**
 * ASIL (Automotive Safety Integrity Level) classification levels
 * Used for functional safety requirements in automotive systems
 */
export enum SafetyReqASIL {
  /** Quality Management - no safety requirements */
  QM = 'QM',
  /** ASIL A - lowest safety integrity level */
  A = 'A',
  /** ASIL B - medium-low safety integrity level */
  B = 'B',
  /** ASIL C - medium-high safety integrity level */
  C = 'C',
  /** ASIL D - highest safety integrity level */
  D = 'D'
}

/**
 * Standard API response format for Safety Requirement operations
 * @template T The type of data returned in successful responses
 */
export interface SafetyReqApiResponse<T = any> {
  /** Indicates whether the operation was successful */
  success: boolean;
  /** Data returned by successful operations */
  data?: T;
  /** Success or informational message */
  message?: string;
  /** Error message for failed operations */
  error?: string;
}

/**
 * Creates a new SAFETYREQ node in Neo4j and links it to a failure mode
 * 
 * @param failureUuid - UUID of the failure mode to link the requirement to
 * @param reqData - Safety requirement data to be stored
 * @returns Promise resolving to API response with created requirement data
 * 
 * @example
 * ```typescript
 * const result = await createSafetyReq('failure-uuid-123', {
 *   name: 'Emergency Stop Requirement',
 *   reqID: 'REQ-001',
 *   reqText: 'System must stop within 2 seconds',
 *   reqASIL: SafetyReqASIL.C,
 *   reqLinkedTo: 'https://jama.company.com/items/123'
 * });
 * ```
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
        reqLinkedTo: $reqLinkedTo,
        jamaCreatedDate: $jamaCreatedDate,
        jamaModifiedDate: $jamaModifiedDate
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
      reqLinkedTo: reqData.reqLinkedTo || null,
      jamaCreatedDate: reqData.jamaCreatedDate || null,
      jamaModifiedDate: reqData.jamaModifiedDate || null
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
 * Retrieves all SAFETYREQ nodes linked to a specific failure mode
 * 
 * @param failureUuid - UUID of the failure mode to get requirements for
 * @returns Promise resolving to API response with array of safety requirements
 * 
 * @example
 * ```typescript
 * const result = await getSafetyReqsForNode('failure-uuid-123');
 * if (result.success) {
 *   console.log(`Found ${result.data.length} safety requirements`);
 * }
 * ```
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
 * Updates an existing SAFETYREQ node with new data
 * Only provided fields will be updated, others remain unchanged
 * 
 * @param reqUuid - UUID of the safety requirement to update
 * @param updateData - Object containing fields to update
 * @returns Promise resolving to API response with updated requirement data
 * 
 * @example
 * ```typescript
 * const result = await updateSafetyReq('req-uuid-123', {
 *   reqASIL: SafetyReqASIL.D,
 *   reqText: 'Updated requirement description'
 * });
 * ```
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
    if (updateData.jamaCreatedDate !== undefined) {
      updateFields.push('sr.jamaCreatedDate = $jamaCreatedDate');
      params.jamaCreatedDate = updateData.jamaCreatedDate;
    }
    if (updateData.jamaModifiedDate !== undefined) {
      updateFields.push('sr.jamaModifiedDate = $jamaModifiedDate');
      params.jamaModifiedDate = updateData.jamaModifiedDate;
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
 * Permanently deletes a SAFETYREQ node from the database
 * This operation removes all relationships and cannot be undone
 * 
 * @param reqUuid - UUID of the safety requirement to delete
 * @returns Promise resolving to API response indicating success/failure
 * 
 * @example
 * ```typescript
 * const result = await deleteSafetyReq('req-uuid-123');
 * if (result.success) {
 *   console.log('Safety requirement deleted successfully');
 * }
 * ```
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
 * Retrieves all SAFETYREQ nodes with optional filtering capabilities
 * Useful for searching and reporting across all safety requirements
 * 
 * @param filters - Optional filtering criteria
 * @param filters.reqASIL - Filter by ASIL level (exact match)
 * @param filters.name - Filter by name (case-insensitive partial match)
 * @param filters.reqID - Filter by requirement ID (case-insensitive partial match)
 * @returns Promise resolving to API response with filtered safety requirements
 * 
 * @example
 * ```typescript
 * // Get all ASIL D requirements
 * const result = await getAllSafetyReqs({ reqASIL: 'D' });
 * 
 * // Search by name
 * const result2 = await getAllSafetyReqs({ name: 'emergency' });
 * ```
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
 * Retrieves a specific SAFETYREQ node by its UUID
 * Used for displaying detailed safety requirement information
 * 
 * @param reqUuid - Unique identifier of the safety requirement
 * @returns Promise resolving to API response with safety requirement data
 * 
 * @example
 * ```typescript
 * const result = await getSafetyReqByUuid('550e8400-e29b-41d4-a716-446655440000');
 * if (result.success) {
 *   console.log('Safety Req:', result.data.name);
 * }
 * ```
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
