import { driver } from '@/app/services/neo4j/config';
import { generateUUID } from '../../utils';

// Valid status values for safety tasks
export type SafetyTaskStatus = 'open' | 'started' | 'in-review' | 'finished';

// Valid task type values for safety tasks
export type SafetyTaskType = 'runtime measures' | 'dev-time measures' | 'other';

export interface SafetyTaskData {
  uuid: string;
  name: string;
  created: string;
  lastModified: string;
  description: string;
  status: SafetyTaskStatus;
  responsible: string;
  reference: string;
  taskType: SafetyTaskType;
}

export interface CreateSafetyTaskInput {
  name: string;
  description: string;
  status: SafetyTaskStatus;
  responsible: string;
  reference: string;
  taskType: SafetyTaskType;
}

/**
 * Create a safety task for any node
 * @param nodeUuid UUID of the node to attach the task to
 * @param taskData The task data
 * @param progressCallback Optional progress callback function
 */
export const createSafetyTask = async (
  nodeUuid: string,
  taskData: CreateSafetyTaskInput,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  safetyTaskUuid?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating input parameters');    if (!nodeUuid || !taskData.name.trim() || !taskData.description.trim()) {
      return {
        success: false,
        message: 'Node UUID, task name, and description are required',
      };
    }

    // Validate status
    const validStatuses: SafetyTaskStatus[] = ['open', 'started', 'in-review', 'finished'];
    if (!validStatuses.includes(taskData.status)) {
      return {
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      };
    }

    // Validate task type
    const validTaskTypes: SafetyTaskType[] = ['runtime measures', 'dev-time measures', 'other'];
    if (!validTaskTypes.includes(taskData.taskType)) {
      return {
        success: false,
        message: `Invalid task type. Must be one of: ${validTaskTypes.join(', ')}`,
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
    
    if (progressCallback) progressCallback(50, 'Creating safety task');

    // Generate UUID for the safety task
    const safetyTaskUuid = generateUUID();
    const currentTimestamp = new Date().toISOString();    // Create the SAFETYTASKS node and TASKREF relationship
    const createResult = await session.run(
      `MATCH (n) WHERE n.uuid = $nodeUuid
       CREATE (task:SAFETYTASKS {
         uuid: $safetyTaskUuid,
         name: $name,
         description: $description,
         status: $status,
         responsible: $responsible,
         reference: $reference,
         taskType: $taskType,
         created: $timestamp,
         lastModified: $timestamp
       })
       CREATE (n)-[:TASKREF]->(task)
       RETURN task.uuid AS safetyTaskUuid, task.name AS taskName`,
      { 
        nodeUuid,
        safetyTaskUuid,
        name: taskData.name.trim(),
        description: taskData.description.trim(),
        status: taskData.status,
        responsible: taskData.responsible.trim(),
        reference: taskData.reference.trim(),
        taskType: taskData.taskType,
        timestamp: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing safety task creation');

    if (createResult.records.length === 0) {
      throw new Error('Failed to create safety task');
    }

    const createdTaskUuid = createResult.records[0].get('safetyTaskUuid');

    if (progressCallback) progressCallback(100, 'Safety task created successfully');

    return {
      success: true,
      message: `Safety task "${taskData.name}" created successfully for ${nodeLabels.join(', ')} node.`,
      safetyTaskUuid: createdTaskUuid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error creating safety task:`, error);
    
    return {
      success: false,
      message: "Error creating safety task.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Update an existing safety task
 * @param safetyTaskUuid UUID of the safety task to update
 * @param taskData The updated task data
 * @param progressCallback Optional progress callback function
 */
export const updateSafetyTask = async (
  safetyTaskUuid: string,
  taskData: CreateSafetyTaskInput,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating input parameters');    if (!safetyTaskUuid || !taskData.name.trim() || !taskData.description.trim()) {
      return {
        success: false,
        message: 'Safety task UUID, name, and description are required',
      };
    }

    // Validate status
    const validStatuses: SafetyTaskStatus[] = ['open', 'started', 'in-review', 'finished'];
    if (!validStatuses.includes(taskData.status)) {
      return {
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      };
    }

    // Validate task type
    const validTaskTypes: SafetyTaskType[] = ['runtime measures', 'dev-time measures', 'other'];
    if (!validTaskTypes.includes(taskData.taskType)) {
      return {
        success: false,
        message: `Invalid task type. Must be one of: ${validTaskTypes.join(', ')}`,
      };
    }

    if (progressCallback) progressCallback(30, 'Updating safety task');

    const currentTimestamp = new Date().toISOString();    // Update the safety task
    const updateResult = await session.run(
      `MATCH (task:SAFETYTASKS) WHERE task.uuid = $safetyTaskUuid
       SET task.name = $name,
           task.description = $description,
           task.status = $status,
           task.responsible = $responsible,
           task.reference = $reference,
           task.taskType = $taskType,
           task.lastModified = $timestamp
       RETURN task.uuid AS updatedUuid`,
      { 
        safetyTaskUuid,
        name: taskData.name.trim(),
        description: taskData.description.trim(),
        status: taskData.status,
        responsible: taskData.responsible.trim(),
        reference: taskData.reference.trim(),
        taskType: taskData.taskType,
        timestamp: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing safety task update');

    if (updateResult.records.length === 0) {
      return {
        success: false,
        message: `Safety task with UUID ${safetyTaskUuid} not found`,
      };
    }

    if (progressCallback) progressCallback(100, 'Safety task updated successfully');

    return {
      success: true,
      message: "Safety task updated successfully.",
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error updating safety task:`, error);
    
    return {
      success: false,
      message: "Error updating safety task.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Delete a safety task
 * @param safetyTaskUuid UUID of the safety task to delete
 * @param progressCallback Optional progress callback function
 */
export const deleteSafetyTask = async (
  safetyTaskUuid: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating safety task UUID');

    if (!safetyTaskUuid) {
      return {
        success: false,
        message: 'Safety task UUID is required',
      };
    }

    if (progressCallback) progressCallback(30, 'Checking if safety task exists');

    // First check if the safety task exists and get its name for the success message
    const checkResult = await session.run(
      `MATCH (task:SAFETYTASKS) WHERE task.uuid = $safetyTaskUuid
       RETURN task.name AS taskName`,
      { safetyTaskUuid }
    );

    if (checkResult.records.length === 0) {
      return {
        success: false,
        message: `Safety task with UUID ${safetyTaskUuid} not found`,
      };
    }

    const taskName = checkResult.records[0].get('taskName');

    if (progressCallback) progressCallback(60, 'Deleting safety task');
    
    // Delete the safety task and all its relationships
    const deleteResult = await session.run(
      `MATCH (task:SAFETYTASKS) 
       WHERE task.uuid = $safetyTaskUuid
       DETACH DELETE task
       RETURN count(task) AS deletedCount`,
      { safetyTaskUuid }
    );

    if (progressCallback) progressCallback(90, 'Finalizing safety task deletion');

    const deletedCount = deleteResult.records[0].get('deletedCount');

    if (deletedCount === 0) {
      throw new Error('No safety task was deleted');
    }

    if (progressCallback) progressCallback(100, 'Safety task deleted successfully');

    return {
      success: true,
      message: `Safety task "${taskName}" deleted successfully.`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error deleting safety task:`, error);
    
    return {
      success: false,
      message: "Error deleting safety task.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get safety tasks for a specific node
 * @param nodeUuid UUID of the node to get tasks for
 */
export const getSafetyTasksForNode = async (
  nodeUuid: string
): Promise<{
  success: boolean;
  data?: SafetyTaskData[];
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
    }    // Get all safety tasks for the node
    const result = await session.run(
      `MATCH (n)-[:TASKREF]->(task:SAFETYTASKS) 
       WHERE n.uuid = $nodeUuid
       RETURN task.uuid AS uuid, 
              task.name AS name,
              task.description AS description,
              task.status AS status,
              task.responsible AS responsible,
              task.reference AS reference,
              task.taskType AS taskType,
              task.created AS created, 
              task.lastModified AS lastModified
       ORDER BY task.created DESC`,
      { nodeUuid }
    );

    const safetyTasks: SafetyTaskData[] = result.records.map(record => ({
      uuid: record.get('uuid'),
      name: record.get('name'),
      description: record.get('description'),
      status: record.get('status') as SafetyTaskStatus,
      responsible: record.get('responsible'),
      reference: record.get('reference'),
      taskType: record.get('taskType') as SafetyTaskType,
      created: record.get('created'),
      lastModified: record.get('lastModified'),
    }));

    return {
      success: true,
      data: safetyTasks,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error getting safety tasks:`, error);
    
    return {
      success: false,
      message: "Error retrieving safety tasks.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get a specific safety task by UUID
 * @param safetyTaskUuid UUID of the safety task
 */
export const getSafetyTask = async (
  safetyTaskUuid: string
): Promise<{
  success: boolean;
  data?: SafetyTaskData;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (!safetyTaskUuid) {
      return {
        success: false,
        message: 'Safety task UUID is required',
      };
    }    // Get the specific safety task
    const result = await session.run(
      `MATCH (task:SAFETYTASKS) 
       WHERE task.uuid = $safetyTaskUuid
       RETURN task.uuid AS uuid, 
              task.name AS name,
              task.description AS description,
              task.status AS status,
              task.responsible AS responsible,
              task.reference AS reference,
              task.taskType AS taskType,
              task.created AS created, 
              task.lastModified AS lastModified`,
      { safetyTaskUuid }
    );

    if (result.records.length === 0) {
      return {
        success: false,
        message: `Safety task with UUID ${safetyTaskUuid} not found`,
      };
    }

    const safetyTask: SafetyTaskData = {
      uuid: result.records[0].get('uuid'),
      name: result.records[0].get('name'),
      description: result.records[0].get('description'),
      status: result.records[0].get('status') as SafetyTaskStatus,
      responsible: result.records[0].get('responsible'),
      reference: result.records[0].get('reference'),
      taskType: result.records[0].get('taskType') as SafetyTaskType,
      created: result.records[0].get('created'),
      lastModified: result.records[0].get('lastModified'),
    };

    return {
      success: true,
      data: safetyTask,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error getting safety task:`, error);
    
    return {
      success: false,
      message: "Error retrieving safety task.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get all safety tasks with optional filtering by status
 * @param status Optional status filter
 */
export const getAllSafetyTasks = async (
  status?: SafetyTaskStatus
): Promise<{
  success: boolean;
  data?: SafetyTaskData[];
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    let query = `MATCH (task:SAFETYTASKS)`;
    const params: { status?: string } = {};

    if (status) {
      // Validate status
      const validStatuses: SafetyTaskStatus[] = ['open', 'started', 'in-review', 'finished'];
      if (!validStatuses.includes(status)) {
        return {
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        };
      }
      
      query += ` WHERE task.status = $status`;
      params.status = status;
    }    query += ` RETURN task.uuid AS uuid, 
                      task.name AS name,
                      task.description AS description,
                      task.status AS status,
                      task.responsible AS responsible,
                      task.reference AS reference,
                      task.taskType AS taskType,
                      task.created AS created, 
                      task.lastModified AS lastModified
               ORDER BY task.created DESC`;

    const result = await session.run(query, params);

    const safetyTasks: SafetyTaskData[] = result.records.map(record => ({
      uuid: record.get('uuid'),
      name: record.get('name'),
      description: record.get('description'),
      status: record.get('status') as SafetyTaskStatus,
      responsible: record.get('responsible'),
      reference: record.get('reference'),
      taskType: record.get('taskType') as SafetyTaskType,
      created: record.get('created'),
      lastModified: record.get('lastModified'),
    }));

    return {
      success: true,
      data: safetyTasks,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error getting all safety tasks:`, error);
    
    return {
      success: false,
      message: "Error retrieving safety tasks.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Update only the status of a safety task
 * @param safetyTaskUuid UUID of the safety task
 * @param status New status
 * @param progressCallback Optional progress callback function
 */
export const updateSafetyTaskStatus = async (
  safetyTaskUuid: string,
  status: SafetyTaskStatus,
  progressCallback?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    if (progressCallback) progressCallback(10, 'Validating input parameters');

    if (!safetyTaskUuid) {
      return {
        success: false,
        message: 'Safety task UUID is required',
      };
    }

    // Validate status
    const validStatuses: SafetyTaskStatus[] = ['open', 'started', 'in-review', 'finished'];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      };
    }

    if (progressCallback) progressCallback(30, 'Updating safety task status');

    const currentTimestamp = new Date().toISOString();

    // Update only the status and lastModified timestamp
    const updateResult = await session.run(
      `MATCH (task:SAFETYTASKS) WHERE task.uuid = $safetyTaskUuid
       SET task.status = $status,
           task.lastModified = $timestamp
       RETURN task.uuid AS updatedUuid, task.name AS taskName`,
      { 
        safetyTaskUuid,
        status,
        timestamp: currentTimestamp
      }
    );

    if (progressCallback) progressCallback(90, 'Finalizing safety task status update');

    if (updateResult.records.length === 0) {
      return {
        success: false,
        message: `Safety task with UUID ${safetyTaskUuid} not found`,
      };
    }

    const taskName = updateResult.records[0].get('taskName');

    if (progressCallback) progressCallback(100, 'Safety task status updated successfully');

    return {
      success: true,
      message: `Safety task "${taskName}" status updated to "${status}".`,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error updating safety task status:`, error);
    
    return {
      success: false,
      message: "Error updating safety task status.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
