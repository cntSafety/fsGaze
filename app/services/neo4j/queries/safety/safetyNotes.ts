import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

/**
 * Create a safety note for any node
 * @param nodeUuid UUID of the node to attach the note to
 * @param note The note content
 * @param progressCallback Optional progress callback function
 */
export const createSafetyNote = async (
  nodeUuid: string,
  note: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  safetyNoteUuid?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating input parameters');

    if (!nodeUuid || !note.trim()) {
      return {
        success: false,
        message: 'Node UUID and note content are required',
      };
    }

    if (progressCallback) progressCallback(20, 'Verifying target node exists');

    // First, verify the target node exists
    const verificationResult = await session.run(
      `MATCH (n) WHERE n.uuid = $nodeUuid RETURN n.uuid AS uuid, labels(n) AS labels`,
      { nodeUuid }
    );

    if (verificationResult.records.length === 0) {
      return {
        success: false,
        message: `Target node with UUID ${nodeUuid} not found`,
      };
    }

    const nodeLabels = verificationResult.records[0].get('labels');
    
    if (progressCallback) progressCallback(50, 'Creating safety note');

    // Generate UUID for the safety note
    const safetyNoteUuid = generateUUID();
    const currentTimestamp = new Date().toISOString();

    // Create the SAFETYNOTE node and NOTEREF relationship
    const createResult = await session.run(
      `MATCH (n) WHERE n.uuid = $nodeUuid
       CREATE (note:SAFETYNOTE {
         uuid: $safetyNoteUuid,
         note: $note,
         created: $timestamp,
         lastModified: $timestamp
       })
       CREATE (n)-[:NOTEREF]->(note)
       RETURN note.uuid AS safetyNoteUuid, note.note AS noteContent`,
      { 
        nodeUuid,
        safetyNoteUuid,
        note: note.trim(),
        timestamp: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing safety note creation');

    if (createResult.records.length === 0) {
      throw new Error('Failed to create safety note');
    }

    const createdNoteUuid = createResult.records[0].get('safetyNoteUuid');

    if (progressCallback) progressCallback(100, 'Safety note created successfully');

    return {
      success: true,
      message: `Safety note created successfully for ${nodeLabels.join(', ')} node.`,
      safetyNoteUuid: createdNoteUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating safety note:`, error);
    
    return {
      success: false,
      message: "Error creating safety note.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Update an existing safety note
 * @param safetyNoteUuid UUID of the safety note to update
 * @param note The new note content
 * @param progressCallback Optional progress callback function
 */
export const updateSafetyNote = async (
  safetyNoteUuid: string,
  note: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating input parameters');

    if (!safetyNoteUuid || !note.trim()) {
      return {
        success: false,
        message: 'Safety note UUID and note content are required',
      };
    }

    if (progressCallback) progressCallback(30, 'Updating safety note');

    const currentTimestamp = new Date().toISOString();

    // Update the safety note
    const updateResult = await session.run(
      `MATCH (note:SAFETYNOTE) WHERE note.uuid = $safetyNoteUuid
       SET note.note = $note, note.lastModified = $timestamp
       RETURN note.uuid AS updatedUuid`,
      { 
        safetyNoteUuid,
        note: note.trim(),
        timestamp: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing safety note update');

    if (updateResult.records.length === 0) {
      return {
        success: false,
        message: `Safety note with UUID ${safetyNoteUuid} not found`,
      };
    }

    if (progressCallback) progressCallback(100, 'Safety note updated successfully');

    return {
      success: true,
      message: "Safety note updated successfully.",
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error updating safety note:`, error);
    
    return {
      success: false,
      message: "Error updating safety note.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a safety note
 * @param safetyNoteUuid UUID of the safety note to delete
 * @param progressCallback Optional progress callback function
 */
export const deleteSafetyNote = async (
  safetyNoteUuid: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating safety note UUID');

    if (!safetyNoteUuid) {
      return {
        success: false,
        message: 'Safety note UUID is required',
      };
    }

    if (progressCallback) progressCallback(30, 'Checking if safety note exists');

    // First check if the safety note exists and get its content for the success message
    const checkResult = await session.run(
      `MATCH (note:SAFETYNOTE) WHERE note.uuid = $safetyNoteUuid
       RETURN note.note AS noteContent`,
      { safetyNoteUuid }
    );

    if (checkResult.records.length === 0) {
      return {
        success: false,
        message: `Safety note with UUID ${safetyNoteUuid} not found`,
      };
    }

    if (progressCallback) progressCallback(60, 'Deleting safety note');
    
    // Delete the safety note and all its relationships
    const deleteResult = await session.run(
      `MATCH (note:SAFETYNOTE) 
       WHERE note.uuid = $safetyNoteUuid
       DETACH DELETE note
       RETURN count(note) AS deletedCount`,
      { safetyNoteUuid }
    );

    if (progressCallback) progressCallback(90, 'Finalizing safety note deletion');

    const deletedCount = deleteResult.records[0].get('deletedCount');

    if (deletedCount === 0) {
      throw new Error('No safety note was deleted');
    }

    if (progressCallback) progressCallback(100, 'Safety note deleted successfully');

    return {
      success: true,
      message: "Safety note deleted successfully.",
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error deleting safety note:`, error);
    
    return {
      success: false,
      message: "Error deleting safety note.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get safety notes for a specific node
 * @param nodeUuid UUID of the node to get notes for
 */
export const getSafetyNotesForNode = async (
  nodeUuid: string
): Promise<{
  success: boolean;
  data?: Array<{
    uuid: string;
    note: string;
    created: string;
    lastModified: string;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (!nodeUuid) {
      return {
        success: false,
        message: 'Node UUID is required',
      };
    }

    // Get all safety notes for the node
    const result = await session.run(
      `MATCH (n)-[:NOTEREF]->(note:SAFETYNOTE) 
       WHERE n.uuid = $nodeUuid
       RETURN note.uuid AS uuid, 
              note.note AS note, 
              note.created AS created, 
              note.lastModified AS lastModified
       ORDER BY note.created DESC`,
      { nodeUuid }
    );

    const safetyNotes = result.records.map(record => ({
      uuid: record.get('uuid'),
      note: record.get('note'),
      created: record.get('created'),
      lastModified: record.get('lastModified'),
    }));

    return {
      success: true,
      data: safetyNotes,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error getting safety notes:`, error);
    
    return {
      success: false,
      message: "Error retrieving safety notes.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get a specific safety note by UUID
 * @param safetyNoteUuid UUID of the safety note
 */
export const getSafetyNote = async (
  safetyNoteUuid: string
): Promise<{
  success: boolean;
  data?: {
    uuid: string;
    note: string;
    created: string;
    lastModified: string;
  };
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (!safetyNoteUuid) {
      return {
        success: false,
        message: 'Safety note UUID is required',
      };
    }

    // Get the specific safety note
    const result = await session.run(
      `MATCH (note:SAFETYNOTE) 
       WHERE note.uuid = $safetyNoteUuid
       RETURN note.uuid AS uuid, 
              note.note AS note, 
              note.created AS created, 
              note.lastModified AS lastModified`,
      { safetyNoteUuid }
    );

    if (result.records.length === 0) {
      return {
        success: false,
        message: `Safety note with UUID ${safetyNoteUuid} not found`,
      };
    }

    const safetyNote = {
      uuid: result.records[0].get('uuid'),
      note: result.records[0].get('note'),
      created: result.records[0].get('created'),
      lastModified: result.records[0].get('lastModified'),
    };

    return {
      success: true,
      data: safetyNote,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error getting safety note:`, error);
    
    return {
      success: false,
      message: "Error retrieving safety note.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Extract <Tag> entries from SAFETYNOTEs attached to a node.
 * A tagged note starts with: "<Tag>" (case sensitive), optionally followed by spaces,
 * then a comma-separated list of tag identifiers, e.g.:
 *   <Tag> Ready_For_Review, myTag2, myTag3
 *
 * Returns a de-duplicated tag list plus per-note breakdown.
 */
export const getTagsFromNote = async (
  nodeUuid: string
): Promise<{
  success: boolean;
  tags?: string[];
  taggedNotes?: Array<{ noteUuid: string; tags: string[] }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  try {
    if (!nodeUuid) {
      return { success: false, message: 'Node UUID is required' };
    }

    // Fetch only SAFETYNOTEs that start with "<Tag>"
    const result = await session.run(
      `MATCH (n {uuid: $nodeUuid})-[:NOTEREF]->(note:SAFETYNOTE)
       WHERE note.note STARTS WITH '<Tag>'
       RETURN note.uuid AS uuid, note.note AS note, note.created AS created
       ORDER BY created ASC`,
      { nodeUuid }
    );

    if (result.records.length === 0) {
      return {
        success: true,
        tags: [],
        taggedNotes: [],
        message: 'No tagged safety notes found'
      };
    }

    const taggedNotes: Array<{ noteUuid: string; tags: string[] }> = [];
    const seen = new Set<string>();
    const aggregated: string[] = [];

    result.records.forEach(rec => {
      const noteUuid = rec.get('uuid') as string;
      const raw = rec.get('note') as string;

      // Remove leading "<Tag>" + optional whitespace
      const remainder = raw.replace(/^<Tag>\s*/, '');
      // Split by comma
      const tags = remainder
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        // Basic normalization: keep alphanumerics, underscore, dash
        .map(t => t.replace(/[^A-Za-z0-9_\-]/g, ''))
        .filter(t => t.length > 0);

      if (tags.length > 0) {
        taggedNotes.push({ noteUuid, tags });
        tags.forEach(tag => {
          if (!seen.has(tag)) {
            seen.add(tag);
            aggregated.push(tag);
          }
        });
      }
    });

    return {
      success: true,
      tags: aggregated,
      taggedNotes
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error extracting tags from safety notes:', error);
    return {
      success: false,
      message: 'Error extracting tags.',
      error: errorMessage
    };
  } finally {
    await session.close();
  }
};
