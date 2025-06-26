import { driver } from '@/app/services/neo4j/config';

// Types for deletion preview and execution
export interface DeletionPreview {
  targetNode: {
    uuid: string;
    name: string;
    type: string;
  };
  dependentNodes: {
    riskRatings: Array<{ uuid: string; name: string; severity: number; occurrence: number; detection: number }>;
    safetyReqs: Array<{ uuid: string; name: string; reqID: string; reqASIL: string }>;
    safetyTasks: Array<{ uuid: string; name: string; status: string; responsible: string }>;
    safetyNotes: Array<{ uuid: string; note: string }>;
    causations: Array<{ uuid: string; name: string; causeName: string; effectName: string }>;
  };
  totalNodesToDelete: number;
  summary: string;
}

export interface CascadeDeleteResult {
  success: boolean;
  message: string;
  deletedNodes?: {
    targetNode: { uuid: string; name: string; type: string };
    dependentNodes: {
      riskRatings: number;
      safetyReqs: number;
      safetyTasks: number;
      safetyNotes: number;
      causations: number;
    };
    totalDeleted: number;
  };
  error?: string;
}

/**
 * Preview what will be deleted when deleting a safety node
 */
export const previewCascadeDelete = async (
  nodeUuid: string,
  nodeType: string
): Promise<{
  success: boolean;
  data?: DeletionPreview;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // First, verify the target node exists
    const targetNodeResult = await session.run(
      `MATCH (n) 
       WHERE n.uuid = $nodeUuid AND labels(n)[0] = $nodeType
       RETURN n.uuid AS uuid, n.name AS name, labels(n)[0] AS type`,
      { nodeUuid, nodeType }
    );

    if (targetNodeResult.records.length === 0) {
      return {
        success: false,
        message: `No ${nodeType} node found with UUID: ${nodeUuid}`,
      };
    }

    const targetNode = {
      uuid: targetNodeResult.records[0].get('uuid'),
      name: targetNodeResult.records[0].get('name') || 'Unnamed',
      type: targetNodeResult.records[0].get('type'),
    };

    // Get all dependent nodes based on node type
    const dependentNodes: any = {
      riskRatings: [],
      safetyReqs: [],
      safetyTasks: [],
      safetyNotes: [],
      causations: [],
    };

    if (nodeType === 'FAILUREMODE') {
      // Get risk ratings linked to this failure mode
      const riskRatingsResult = await session.run(
        `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:RATED]->(rr:RISKRATING)
         RETURN rr.uuid AS uuid, rr.name AS name, rr.Severity AS severity, 
                rr.Occurrence AS occurrence, rr.Detection AS detection`,
        { nodeUuid }
      );
      dependentNodes.riskRatings = riskRatingsResult.records.map(record => ({
        uuid: record.get('uuid'),
        name: record.get('name'),
        severity: record.get('severity'),
        occurrence: record.get('occurrence'),
        detection: record.get('detection'),
      }));

      // Get safety requirements linked to this failure mode
      const safetyReqsResult = await session.run(
        `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:HAS_SAFETY_REQUIREMENT]->(sr:SAFETYREQ)
         RETURN sr.uuid AS uuid, sr.name AS name, sr.reqID AS reqID, sr.reqASIL AS reqASIL`,
        { nodeUuid }
      );
      dependentNodes.safetyReqs = safetyReqsResult.records.map(record => ({
        uuid: record.get('uuid'),
        name: record.get('name'),
        reqID: record.get('reqID'),
        reqASIL: record.get('reqASIL'),
      }));

      // Get safety tasks linked to this failure mode
      const safetyTasksResult = await session.run(
        `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:TASKREF]->(st:SAFETYTASKS)
         RETURN st.uuid AS uuid, st.name AS name, st.status AS status, st.responsible AS responsible`,
        { nodeUuid }
      );
      dependentNodes.safetyTasks = safetyTasksResult.records.map(record => ({
        uuid: record.get('uuid'),
        name: record.get('name'),
        status: record.get('status'),
        responsible: record.get('responsible'),
      }));

      // Get safety notes linked to this failure mode
      const safetyNotesResult = await session.run(
        `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
         RETURN sn.uuid AS uuid, sn.note AS note`,
        { nodeUuid }
      );
      dependentNodes.safetyNotes = safetyNotesResult.records.map(record => ({
        uuid: record.get('uuid'),
        note: record.get('note'),
      }));

      // Get causations where this failure mode is involved
      const causationsResult = await session.run(
        `MATCH (c:CAUSATION)-[:FIRST|THEN]->(f:FAILUREMODE {uuid: $nodeUuid})
         OPTIONAL MATCH (c)-[:FIRST]->(cause:FAILUREMODE)
         OPTIONAL MATCH (c)-[:THEN]->(effect:FAILUREMODE)
         RETURN c.uuid AS uuid, c.name AS name, 
                cause.name AS causeName, effect.name AS effectName`,
        { nodeUuid }
      );
      dependentNodes.causations = causationsResult.records.map(record => ({
        uuid: record.get('uuid'),
        name: record.get('name'),
        causeName: record.get('causeName') || 'Unknown',
        effectName: record.get('effectName') || 'Unknown',
      }));

      // Also get safety tasks linked to risk ratings of this failure mode
      const riskRatingTasksResult = await session.run(
        `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:RATED]->(rr:RISKRATING)-[:TASKREF]->(st:SAFETYTASKS)
         RETURN st.uuid AS uuid, st.name AS name, st.status AS status, st.responsible AS responsible`,
        { nodeUuid }
      );
      const riskRatingTasks = riskRatingTasksResult.records.map(record => ({
        uuid: record.get('uuid'),
        name: record.get('name'),
        status: record.get('status'),
        responsible: record.get('responsible'),
      }));
      
      // Merge and deduplicate safety tasks
      const allTasks = [...dependentNodes.safetyTasks, ...riskRatingTasks];
      dependentNodes.safetyTasks = allTasks.filter((task, index, self) => 
        index === self.findIndex(t => t.uuid === task.uuid)
      );

    } else if (nodeType === 'RISKRATING') {
      // Get safety tasks linked to this risk rating
      const safetyTasksResult = await session.run(
        `MATCH (rr:RISKRATING {uuid: $nodeUuid})-[:TASKREF]->(st:SAFETYTASKS)
         RETURN st.uuid AS uuid, st.name AS name, st.status AS status, st.responsible AS responsible`,
        { nodeUuid }
      );
      dependentNodes.safetyTasks = safetyTasksResult.records.map(record => ({
        uuid: record.get('uuid'),
        name: record.get('name'),
        status: record.get('status'),
        responsible: record.get('responsible'),
      }));

      // Get safety notes linked to this risk rating
      const safetyNotesResult = await session.run(
        `MATCH (rr:RISKRATING {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
         RETURN sn.uuid AS uuid, sn.note AS note`,
        { nodeUuid }
      );
      dependentNodes.safetyNotes = safetyNotesResult.records.map(record => ({
        uuid: record.get('uuid'),
        note: record.get('note'),
      }));

    } else if (nodeType === 'SAFETYTASKS') {
      // Get safety notes linked to this safety task
      const safetyNotesResult = await session.run(
        `MATCH (st:SAFETYTASKS {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
         RETURN sn.uuid AS uuid, sn.note AS note`,
        { nodeUuid }
      );
      dependentNodes.safetyNotes = safetyNotesResult.records.map(record => ({
        uuid: record.get('uuid'),
        note: record.get('note'),
      }));

    } else if (nodeType === 'SAFETYREQ') {
      // Get safety notes linked to this safety requirement
      const safetyNotesResult = await session.run(
        `MATCH (sr:SAFETYREQ {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
         RETURN sn.uuid AS uuid, sn.note AS note`,
        { nodeUuid }
      );
      dependentNodes.safetyNotes = safetyNotesResult.records.map(record => ({
        uuid: record.get('uuid'),
        note: record.get('note'),
      }));

    } else if (nodeType === 'CAUSATION') {
      // CAUSATION nodes don't have dependents, but we need to check if they're referenced elsewhere
      const otherReferencesResult = await session.run(
        `MATCH (c:CAUSATION {uuid: $nodeUuid})
         OPTIONAL MATCH (c)-[:FIRST]->(cause:FAILUREMODE)
         OPTIONAL MATCH (c)-[:THEN]->(effect:FAILUREMODE)
         RETURN cause.name AS causeName, effect.name AS effectName`,
        { nodeUuid }
      );
      if (otherReferencesResult.records.length > 0) {
        const record = otherReferencesResult.records[0];
        dependentNodes.causations = [{
          uuid: nodeUuid,
          name: targetNode.name,
          causeName: record.get('causeName') || 'Unknown',
          effectName: record.get('effectName') || 'Unknown',
        }];
      }
    }

    // Calculate totals
    const totalNodesToDelete = 1 + // target node
      dependentNodes.riskRatings.length +
      dependentNodes.safetyReqs.length +
      dependentNodes.safetyTasks.length +
      dependentNodes.safetyNotes.length +
      dependentNodes.causations.length;

    // Generate summary message
    const summary = generateDeletionSummary(targetNode, dependentNodes, totalNodesToDelete);

    return {
      success: true,
      data: {
        targetNode,
        dependentNodes,
        totalNodesToDelete,
        summary,
      },
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error previewing cascade delete for ${nodeType} ${nodeUuid}:`, error);
    
    return {
      success: false,
      message: `Error previewing deletion for ${nodeType} node.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Execute the cascading delete after user confirmation
 */
export const executeCascadeDelete = async (
  nodeUuid: string,
  nodeType: string
): Promise<CascadeDeleteResult> => {
  const session = driver.session();
  
  try {
    // First, verify the target node exists
    const targetNodeResult = await session.run(
      `MATCH (n) 
       WHERE n.uuid = $nodeUuid AND labels(n)[0] = $nodeType
       RETURN n.uuid AS uuid, n.name AS name, labels(n)[0] AS type`,
      { nodeUuid, nodeType }
    );

    if (targetNodeResult.records.length === 0) {
      return {
        success: false,
        message: `No ${nodeType} node found with UUID: ${nodeUuid}`,
      };
    }

    const targetNode = {
      uuid: targetNodeResult.records[0].get('uuid'),
      name: targetNodeResult.records[0].get('name') || 'Unnamed',
      type: targetNodeResult.records[0].get('type'),
    };

    // Execute deletion in a transaction
    const result = await session.writeTransaction(async (tx) => {
      const deletedCounts = {
        riskRatings: 0,
        safetyReqs: 0,
        safetyTasks: 0,
        safetyNotes: 0,
        causations: 0,
      };

      if (nodeType === 'FAILUREMODE') {
        // Delete safety tasks linked to risk ratings first
        const riskRatingTasksResult = await tx.run(
          `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:RATED]->(rr:RISKRATING)-[:TASKREF]->(st:SAFETYTASKS)
           DETACH DELETE st
           RETURN count(st) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyTasks += riskRatingTasksResult.records[0].get('deletedCount').toNumber();

        // Delete safety tasks linked directly to failure mode
        const directTasksResult = await tx.run(
          `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:TASKREF]->(st:SAFETYTASKS)
           DETACH DELETE st
           RETURN count(st) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyTasks += directTasksResult.records[0].get('deletedCount').toNumber();

        // Delete safety notes linked to failure mode
        const safetyNotesResult = await tx.run(
          `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
           DETACH DELETE sn
           RETURN count(sn) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyNotes = safetyNotesResult.records[0].get('deletedCount').toNumber();

        // Delete risk ratings
        const riskRatingsResult = await tx.run(
          `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:RATED]->(rr:RISKRATING)
           DETACH DELETE rr
           RETURN count(rr) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.riskRatings = riskRatingsResult.records[0].get('deletedCount').toNumber();

        // Delete safety requirements
        const safetyReqsResult = await tx.run(
          `MATCH (f:FAILUREMODE {uuid: $nodeUuid})-[:HAS_SAFETY_REQUIREMENT]->(sr:SAFETYREQ)
           DETACH DELETE sr
           RETURN count(sr) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyReqs = safetyReqsResult.records[0].get('deletedCount').toNumber();

        // Delete causations
        const causationsResult = await tx.run(
          `MATCH (c:CAUSATION)-[:FIRST|THEN]->(f:FAILUREMODE {uuid: $nodeUuid})
           DETACH DELETE c
           RETURN count(c) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.causations = causationsResult.records[0].get('deletedCount').toNumber();

      } else if (nodeType === 'RISKRATING') {
        // Delete safety tasks linked to this risk rating
        const safetyTasksResult = await tx.run(
          `MATCH (rr:RISKRATING {uuid: $nodeUuid})-[:TASKREF]->(st:SAFETYTASKS)
           DETACH DELETE st
           RETURN count(st) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyTasks = safetyTasksResult.records[0].get('deletedCount').toNumber();

        // Delete safety notes linked to this risk rating
        const safetyNotesResult = await tx.run(
          `MATCH (rr:RISKRATING {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
           DETACH DELETE sn
           RETURN count(sn) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyNotes = safetyNotesResult.records[0].get('deletedCount').toNumber();

      } else if (nodeType === 'SAFETYTASKS') {
        // Delete safety notes linked to this safety task
        const safetyNotesResult = await tx.run(
          `MATCH (st:SAFETYTASKS {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
           DETACH DELETE sn
           RETURN count(sn) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyNotes = safetyNotesResult.records[0].get('deletedCount').toNumber();

      } else if (nodeType === 'SAFETYREQ') {
        // Delete safety notes linked to this safety requirement
        const safetyNotesResult = await tx.run(
          `MATCH (sr:SAFETYREQ {uuid: $nodeUuid})-[:NOTEREF]->(sn:SAFETYNOTE)
           DETACH DELETE sn
           RETURN count(sn) AS deletedCount`,
          { nodeUuid }
        );
        deletedCounts.safetyNotes = safetyNotesResult.records[0].get('deletedCount').toNumber();

      } else if (nodeType === 'CAUSATION') {
        // CAUSATION nodes are deleted directly
        deletedCounts.causations = 1;
      }

      // Finally, delete the target node
      const targetNodeResult = await tx.run(
        `MATCH (n) 
         WHERE n.uuid = $nodeUuid AND labels(n)[0] = $nodeType
         DETACH DELETE n
         RETURN count(n) AS deletedCount`,
        { nodeUuid, nodeType }
      );

      return {
        targetNode,
        dependentNodes: deletedCounts,
        totalDeleted: 1 + Object.values(deletedCounts).reduce((sum, count) => sum + count, 0),
      };
    });

    return {
      success: true,
      message: `Successfully deleted ${targetNode.name} and all dependent nodes.`,
      deletedNodes: result,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error executing cascade delete for ${nodeType} ${nodeUuid}:`, error);
    
    return {
      success: false,
      message: `Error deleting ${nodeType} node and dependent nodes.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Helper function to generate a human-readable summary of what will be deleted
 */
function generateDeletionSummary(
  targetNode: { name: string; type: string },
  dependentNodes: any,
  totalNodesToDelete: number
): string {
  const parts: string[] = [];
  
  parts.push(`Delete "${targetNode.name}" (${targetNode.type})`);
  
  if (dependentNodes.riskRatings.length > 0) {
    parts.push(`${dependentNodes.riskRatings.length} risk rating(s)`);
  }
  
  if (dependentNodes.safetyReqs.length > 0) {
    parts.push(`${dependentNodes.safetyReqs.length} safety requirement(s)`);
  }
  
  if (dependentNodes.safetyTasks.length > 0) {
    parts.push(`${dependentNodes.safetyTasks.length} safety task(s)`);
  }
  
  if (dependentNodes.safetyNotes.length > 0) {
    parts.push(`${dependentNodes.safetyNotes.length} safety note(s)`);
  }
  
  if (dependentNodes.causations.length > 0) {
    parts.push(`${dependentNodes.causations.length} causation relationship(s)`);
  }
  
  if (parts.length === 1) {
    return `This will delete ${totalNodesToDelete} node: ${parts[0]}`;
  } else {
    return `This will delete ${totalNodesToDelete} nodes: ${parts.join(', ')}`;
  }
} 