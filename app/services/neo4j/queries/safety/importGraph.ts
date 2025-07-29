import { driver } from '@/app/services/neo4j/config';
import { SafetyGraphData } from './types';

export async function importSafetyGraphData(data: SafetyGraphData): Promise<{
    success: boolean;
    logs: string[];
    message?: string;
}> {
    const session = driver.session();
    const tx = session.beginTransaction();
    const logs: string[] = [];

    const convertNeo4jTimestampToNumber = (value: any): number | null => {
        if (value === null || typeof value === 'undefined') return null;
        if (typeof value === 'number') return value; // Already a JS number
        if (value && typeof value.toNumber === 'function') { // Check for neo4j.int or similar BigInt objects
            try {
                return value.toNumber();
            } catch { // toNumber() can fail if the number is too large for JS standard number
                //logs.push(`[WARNING] Failed to convert Neo4j Integer to JS number (possibly too large): ${value.toString()}. Treating as an invalid timestamp for comparison.`);
                return null;
            }
        }
        // Log if it's an unexpected type that wasn't handled above
        //logs.push(`[WARNING] Unexpected timestamp type encountered: ${JSON.stringify(value)}. Cannot convert to number.`);
        return null;
    };

    try {        // Import/Update FAILURE MODES
        const failureNodeType = "FAILUREMODE";
        for (const failure of data.failures || []) {
            const { uuid, properties: rawProperties } = failure;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;       // Handled by MERGE key
            delete propsToSet.created;  // We set this explicitly
            delete propsToSet.lastModified;  // We set this explicitly

            const result = await tx.run(
                'MERGE (f:FAILUREMODE {uuid: $uuid}) ' +
                'ON CREATE SET f = $propsToSet, f.uuid = $uuid, f.created = timestamp(), f.lastModified = timestamp() ' +
                'ON MATCH SET f += $propsToSet ' +
                'RETURN f.name AS name, f.created AS created, f.lastModified AS lastModified',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const name = record.get('name');
                const createdAtRaw = record.get('created');
                const updatedAtRaw = record.get('lastModified');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) { 
                        action = 'created'; // Both timestamps are the same (newly created)
                    } else { 
                        action = 'updated (properties merged, timestamps preserved)'; // Existing node, properties updated
                    }
                } else {
                    action = 'properties applied (some timestamps missing)';
                }
                logs.push(`[SUCCESS] ${failureNodeType} node '${name || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${failureNodeType} node merge (uuid: ${uuid}).`);
            }
        }

        // Import/Update CAUSATIONS
        const causationNodeType = "CAUSATION";
        for (const causation of data.causations || []) {
            const { uuid, properties: rawProperties } = causation;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;
            delete propsToSet.created;
            delete propsToSet.lastModified;

            const result = await tx.run(
                'MERGE (c:CAUSATION {uuid: $uuid}) ' +
                'ON CREATE SET c = $propsToSet, c.uuid = $uuid, c.created = timestamp(), c.lastModified = timestamp() ' +
                'ON MATCH SET c += $propsToSet ' +
                'RETURN c.name AS name, c.created AS created, c.lastModified AS lastModified',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const name = record.get('name');
                const createdAtRaw = record.get('created');
                const updatedAtRaw = record.get('lastModified');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) { 
                        action = 'created'; // Both timestamps are the same (newly created)
                    } else { 
                        action = 'updated (properties merged, timestamps preserved)'; // Existing node, properties updated
                    }
                } else {
                    action = 'properties applied (some timestamps missing)';
                }
                logs.push(`[SUCCESS] ${causationNodeType} node '${name || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${causationNodeType} node merge (uuid: ${uuid}).`);
            }
        }

        // Import OCCURRENCE relationships
        for (const occ of data.occurrences || []) {
            if (!occ.failureUuid || !occ.occuranceSourceUuid) {
                logs.push(`[ERROR] Skipping OCCURRENCE link due to missing failureUuid or occuranceSourceUuid: ${JSON.stringify(occ)}`);
                continue;
            }
            // Check if the source ARXML_ELEMENT (or other type) exists
            const sourceCheck = await tx.run(
                'MATCH (src {uuid: $sourceUuid}) RETURN src.uuid AS uuid, labels(src) as lbls', 
                { sourceUuid: occ.occuranceSourceUuid }
            );
            if (sourceCheck.records.length === 0) {
                logs.push(`[ERROR] Source element with UUID ${occ.occuranceSourceUuid} for OCCURRENCE not found. Skipping link to FAILUREMODE ${occ.failureName || occ.failureUuid}.`);
                continue;
            }
            const sourceNode = sourceCheck.records[0];
            const sourceLabels = sourceNode.get('lbls').join(':');

            // Check if the target FAILUREMODE exists (it should have been created above)
            const failureCheck = await tx.run(
                'MATCH (f:FAILUREMODE {uuid: $failureUuid}) RETURN f.uuid', 
                { failureUuid: occ.failureUuid }
            );
            if (failureCheck.records.length === 0) {
                logs.push(`[ERROR] Target FAILUREMODE with UUID ${occ.failureUuid} for OCCURRENCE not found. Skipping link from ${sourceLabels} ${occ.occuranceSourceName || occ.occuranceSourceUuid}.`);
                continue;
            }

            await tx.run(
                'MATCH (f:FAILUREMODE {uuid: $failureUuid}) ' +
                'MATCH (src {uuid: $occuranceSourceUuid}) ' +
                'MERGE (f)-[r:OCCURRENCE]->(src) ' +
                'ON CREATE SET r.created = timestamp(), r.lastModified = timestamp() ' +
                'RETURN type(r) AS relType', // We can return something to confirm creation/match
                { failureUuid: occ.failureUuid, occuranceSourceUuid: occ.occuranceSourceUuid }
            );
            logs.push(`[SUCCESS] OCCURRENCE relationship linked: (FAILUREMODE ${occ.failureName || occ.failureUuid})-[OCCURRENCE]->(${sourceLabels} ${occ.occuranceSourceName || occ.occuranceSourceUuid}).`);
        }

        // Import CAUSATION links (FIRST, THEN)
        for (const link of data.causationLinks || []) {
            if (!link.causeFailureUuid || !link.causationUuid || !link.effectFailureUuid) {
                logs.push(`[ERROR] Skipping CAUSATION link due to missing UUIDs: ${JSON.stringify(link)}`);
                continue;
            }            // Check if CAUSE FAILUREMODE exists
            const causeFailureCheck = await tx.run('MATCH (f:FAILUREMODE {uuid: $uuid}) RETURN f.uuid', { uuid: link.causeFailureUuid });
            if (causeFailureCheck.records.length === 0) {
                logs.push(`[ERROR] CAUSE FAILUREMODE ${link.causeFailureName || link.causeFailureUuid} not found for causation link. Skipping.`);
                continue;
            }

            // Check if CAUSATION node exists
            const causationNodeCheck = await tx.run('MATCH (c:CAUSATION {uuid: $uuid}) RETURN c.uuid', { uuid: link.causationUuid });
            if (causationNodeCheck.records.length === 0) {
                logs.push(`[ERROR] CAUSATION node ${link.causationName || link.causationUuid} not found for causation link. Skipping.`);
                continue;
            }            // Check if EFFECT FAILUREMODE exists
            const effectFailureCheck = await tx.run('MATCH (f:FAILUREMODE {uuid: $uuid}) RETURN f.uuid', { uuid: link.effectFailureUuid });
            if (effectFailureCheck.records.length === 0) {
                logs.push(`[ERROR] EFFECT FAILUREMODE ${link.effectFailureName || link.effectFailureUuid} not found for causation link. Skipping.`);
                continue;
            }

            // Link CAUSE_FAILURE -> CAUSATION
            await tx.run(
                'MATCH (cause:FAILUREMODE {uuid: $causeFailureUuid}) ' +
                'MATCH (c:CAUSATION {uuid: $causationUuid}) ' +
                'MERGE (cause)<-[r:FIRST]-(c) ' +
                'ON CREATE SET r.created = timestamp(), r.lastModified = timestamp() ',
                { causeFailureUuid: link.causeFailureUuid, causationUuid: link.causationUuid }
            );
            logs.push(`[SUCCESS] FIRST relationship linked: (FAILUREMODE ${link.causeFailureName || link.causeFailureUuid})-[FIRST]->(CAUSATION ${link.causationName || link.causationUuid}).`);

            // Link CAUSATION -> EFFECT_FAILURE
            await tx.run(
                'MATCH (c:CAUSATION {uuid: $causationUuid}) ' +
                'MATCH (effect:FAILUREMODE {uuid: $effectFailureUuid}) ' +
                'MERGE (c)-[r:THEN]->(effect) ' +
                'ON CREATE SET r.created = timestamp(), r.lastModified = timestamp() ',
                { causationUuid: link.causationUuid, effectFailureUuid: link.effectFailureUuid }
            );
            logs.push(`[SUCCESS] THEN relationship linked: (CAUSATION ${link.causationName || link.causationUuid})-[THEN]->(FAILUREMODE ${link.effectFailureName || link.effectFailureUuid}).`);
        }

        // Import/Update RISK RATINGS
        const riskRatingNodeType = "RISKRATING";
        for (const riskRating of data.riskRatings || []) {
            const { uuid, properties: rawProperties } = riskRating;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;       // Handled by MERGE key
            delete propsToSet.created;  // We set this explicitly
            delete propsToSet.lastModified;  // We set this explicitly

            const result = await tx.run(
                'MERGE (r:RISKRATING {uuid: $uuid}) ' +
                'ON CREATE SET r = $propsToSet, r.uuid = $uuid, r.created = timestamp(), r.lastModified = timestamp() ' +
                'ON MATCH SET r += $propsToSet ' +
                'RETURN r.name AS name, r.created AS created, r.lastModified AS lastModified',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const name = record.get('name');
                const createdAtRaw = record.get('created');
                const updatedAtRaw = record.get('lastModified');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) {
                        action = 'created';
                    } else {
                        action = 'updated (timestamps refreshed)';
                    }
                }
                logs.push(`[SUCCESS] ${riskRatingNodeType} node '${name || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${riskRatingNodeType} node merge (uuid: ${uuid}).`);
            }
        }

        // Import RISK RATING links (RATED)
        for (const link of data.riskRatingLinks || []) {
            if (!link.failureUuid || !link.riskRatingUuid) {
                logs.push(`[ERROR] Skipping RATED link due to missing UUIDs: ${JSON.stringify(link)}`);
                continue;
            }            // Check if FAILUREMODE exists
            const failureCheck = await tx.run('MATCH (f:FAILUREMODE {uuid: $uuid}) RETURN f.uuid', { uuid: link.failureUuid });
            if (failureCheck.records.length === 0) {
                logs.push(`[ERROR] FAILUREMODE ${link.failureName || link.failureUuid} not found for RATED link. Skipping.`);
                continue;
            }

            // Check if RISKRATING exists
            const riskRatingCheck = await tx.run('MATCH (r:RISKRATING {uuid: $uuid}) RETURN r.uuid', { uuid: link.riskRatingUuid });
            if (riskRatingCheck.records.length === 0) {
                logs.push(`[ERROR] RISKRATING ${link.riskRatingName || link.riskRatingUuid} not found for RATED link. Skipping.`);
                continue;
            }

            // Link FAILUREMODE -> RISKRATING
            await tx.run(
                'MATCH (f:FAILUREMODE {uuid: $failureUuid}) ' +
                'MATCH (r:RISKRATING {uuid: $riskRatingUuid}) ' +
                'MERGE (f)-[rel:RATED]->(r) ' +
                'ON CREATE SET rel.created = timestamp(), rel.lastModified = timestamp() ',
                { failureUuid: link.failureUuid, riskRatingUuid: link.riskRatingUuid }
            );
            logs.push(`[SUCCESS] RATED relationship linked: (FAILUREMODE ${link.failureName || link.failureUuid})-[RATED]->(RISKRATING ${link.riskRatingName || link.riskRatingUuid}).`);
        }

        // Import/Update SAFETY TASKS
        const safetyTaskNodeType = "SAFETYTASKS";
        for (const safetyTask of data.safetyTasks || []) {
            const { uuid, properties: rawProperties } = safetyTask;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;       // Handled by MERGE key
            delete propsToSet.created;  // We set this explicitly
            delete propsToSet.lastModified;  // We set this explicitly

            const result = await tx.run(
                'MERGE (task:SAFETYTASKS {uuid: $uuid}) ' +
                'ON CREATE SET task = $propsToSet, task.uuid = $uuid, task.created = timestamp(), task.lastModified = timestamp() ' +
                'ON MATCH SET task += $propsToSet ' +
                'RETURN task.name AS name, task.created AS created, task.lastModified AS lastModified',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const name = record.get('name');
                const createdAtRaw = record.get('created');
                const updatedAtRaw = record.get('lastModified');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) {
                        action = 'created';
                    } else {
                        action = 'updated (properties merged, timestamps preserved)';
                    }
                } else {
                    action = 'properties applied (some timestamps missing)';
                }
                logs.push(`[SUCCESS] ${safetyTaskNodeType} node '${name || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${safetyTaskNodeType} node merge (uuid: ${uuid}).`);
            }
        }        // Import SAFETY TASK links (TASKREF)
        for (const link of data.safetyTaskLinks || []) {
            if (!link.nodeUuid || !link.safetyTaskUuid) {
                logs.push(`[ERROR] Skipping TASKREF link due to missing UUIDs: ${JSON.stringify(link)}`);
                continue;
            }

            // Check if the source node exists (can be any node type)
            const nodeCheck = await tx.run('MATCH (n {uuid: $uuid}) RETURN n.uuid, labels(n) as labels', { uuid: link.nodeUuid });
            if (nodeCheck.records.length === 0) {
                logs.push(`[ERROR] Source node ${link.nodeName || link.nodeUuid} not found for TASKREF link. Skipping.`);
                continue;
            }            // Check if SAFETYTASKS exists
            const taskCheck = await tx.run('MATCH (task:SAFETYTASKS {uuid: $uuid}) RETURN task.uuid', { uuid: link.safetyTaskUuid });
            if (taskCheck.records.length === 0) {
                logs.push(`[ERROR] SAFETYTASKS ${link.safetyTaskName || link.safetyTaskUuid} not found for TASKREF link. Skipping.`);
                continue;
            }

            // Link SOURCE_NODE -> SAFETYTASKS
            await tx.run(
                'MATCH (n {uuid: $nodeUuid}) ' +
                'MATCH (task:SAFETYTASKS {uuid: $safetyTaskUuid}) ' +
                'MERGE (n)-[rel:TASKREF]->(task) ' +
                'ON CREATE SET rel.created = timestamp(), rel.lastModified = timestamp() ',
                { nodeUuid: link.nodeUuid, safetyTaskUuid: link.safetyTaskUuid }
            );
            logs.push(`[SUCCESS] TASKREF relationship linked: (${link.nodeName || link.nodeUuid})-[TASKREF]->(SAFETYTASKS ${link.safetyTaskName || link.safetyTaskUuid}).`);
        }

        // Import/Update SAFETY REQUIREMENTS
        const safetyReqNodeType = "SAFETYREQ";
        for (const safetyReq of data.safetyReqs || []) {
            const { uuid, properties: rawProperties } = safetyReq;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;       // Handled by MERGE key
            delete propsToSet.created;  // We set this explicitly
            delete propsToSet.lastModified;  // We set this explicitly

            const result = await tx.run(
                'MERGE (req:SAFETYREQ {uuid: $uuid}) ' +
                'ON CREATE SET req = $propsToSet, req.uuid = $uuid, req.created = timestamp(), req.lastModified = timestamp() ' +
                'ON MATCH SET req += $propsToSet ' +
                'RETURN req.name AS name, req.created AS created, req.lastModified AS lastModified',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const name = record.get('name');
                const createdAtRaw = record.get('created');
                const updatedAtRaw = record.get('lastModified');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) {
                        action = 'created';
                    } else {
                        action = 'updated (properties merged, timestamps preserved)';
                    }
                } else {
                    action = 'properties applied (some timestamps missing)';
                }
                logs.push(`[SUCCESS] ${safetyReqNodeType} node '${name || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${safetyReqNodeType} node merge (uuid: ${uuid}).`);
            }
        }

        // Import SAFETY REQUIREMENT links (HAS_SAFETY_REQUIREMENT)
        for (const link of data.safetyReqLinks || []) {
            if (!link.nodeUuid || !link.safetyReqUuid) {
                logs.push(`[ERROR] Skipping HAS_SAFETY_REQUIREMENT link due to missing UUIDs: ${JSON.stringify(link)}`);
                continue;
            }

            // Check if the source node exists (can be any node type)
            const nodeCheck = await tx.run('MATCH (n {uuid: $uuid}) RETURN n.uuid, labels(n) as labels', { uuid: link.nodeUuid });
            if (nodeCheck.records.length === 0) {
                logs.push(`[ERROR] Source node ${link.nodeName || link.nodeUuid} not found for HAS_SAFETY_REQUIREMENT link. Skipping.`);
                continue;
            }

            // Check if SAFETYREQ exists
            const reqCheck = await tx.run('MATCH (req:SAFETYREQ {uuid: $uuid}) RETURN req.uuid', { uuid: link.safetyReqUuid });
            if (reqCheck.records.length === 0) {
                logs.push(`[ERROR] SAFETYREQ ${link.safetyReqName || link.safetyReqUuid} not found for HAS_SAFETY_REQUIREMENT link. Skipping.`);
                continue;
            }

            // Link SOURCE_NODE -> SAFETYREQ
            await tx.run(
                'MATCH (n {uuid: $nodeUuid}) ' +
                'MATCH (req:SAFETYREQ {uuid: $safetyReqUuid}) ' +
                'MERGE (n)-[rel:HAS_SAFETY_REQUIREMENT]->(req) ' +
                'ON CREATE SET rel.created = timestamp(), rel.lastModified = timestamp() ',
                { nodeUuid: link.nodeUuid, safetyReqUuid: link.safetyReqUuid }
            );
            logs.push(`[SUCCESS] HAS_SAFETY_REQUIREMENT relationship linked: (${link.nodeName || link.nodeUuid})-[HAS_SAFETY_REQUIREMENT]->(SAFETYREQ ${link.safetyReqName || link.safetyReqUuid}).`);
        }

        // Import/Update SAFETY NOTES
        const safetyNoteNodeType = "SAFETYNOTE";
        for (const safetyNote of data.safetyNotes || []) {
            const { uuid, properties: rawProperties } = safetyNote;
            const propsToSet = { ...rawProperties };
            delete propsToSet.uuid;       // Handled by MERGE key
            delete propsToSet.created;  // We set this explicitly
            delete propsToSet.lastModified;  // We set this explicitly

            const result = await tx.run(
                'MERGE (note:SAFETYNOTE {uuid: $uuid}) ' +
                'ON CREATE SET note = $propsToSet, note.uuid = $uuid, note.created = timestamp(), note.lastModified = timestamp() ' +
                'ON MATCH SET note += $propsToSet ' +
                'RETURN note.note AS noteContent, note.created AS created, note.lastModified AS lastModified',
                { uuid, propsToSet }
            );
            const record = result.records[0];
            if (record) {
                const noteContent = record.get('noteContent');
                const createdAtRaw = record.get('created');
                const updatedAtRaw = record.get('lastModified');
                let action = 'processed';

                const createdAtNum = convertNeo4jTimestampToNumber(createdAtRaw);
                const updatedAtNum = convertNeo4jTimestampToNumber(updatedAtRaw);

                if (createdAtNum !== null && updatedAtNum !== null) {
                    if (createdAtNum === updatedAtNum) {
                        action = 'created';
                    } else {
                        action = 'updated (properties merged, timestamps preserved)';
                    }
                } else {
                    action = 'properties applied (some timestamps missing)';
                }
                logs.push(`[SUCCESS] ${safetyNoteNodeType} node '${noteContent || uuid}' (uuid: ${uuid}) ${action}.`);
            } else {
                logs.push(`[WARNING] No information returned for ${safetyNoteNodeType} node merge (uuid: ${uuid}).`);
            }
        }

        // Import SAFETY NOTE links (NOTEREF)
        for (const link of data.safetyNoteLinks || []) {
            if (!link.nodeUuid || !link.safetyNoteUuid) {
                logs.push(`[ERROR] Skipping NOTEREF link due to missing UUIDs: ${JSON.stringify(link)}`);
                continue;
            }

            // Check if the source node exists (can be any node type)
            const nodeCheck = await tx.run('MATCH (n {uuid: $uuid}) RETURN n.uuid, labels(n) as labels', { uuid: link.nodeUuid });
            if (nodeCheck.records.length === 0) {
                logs.push(`[ERROR] Source node ${link.nodeName || link.nodeUuid} not found for NOTEREF link. Skipping.`);
                continue;
            }
            const nodeLabels = nodeCheck.records[0].get('labels').join(':');

            // Check if SAFETYNOTE exists
            const safetyNoteCheck = await tx.run('MATCH (note:SAFETYNOTE {uuid: $uuid}) RETURN note.uuid', { uuid: link.safetyNoteUuid });
            if (safetyNoteCheck.records.length === 0) {
                logs.push(`[ERROR] SAFETYNOTE ${link.safetyNoteName || link.safetyNoteUuid} not found for NOTEREF link. Skipping.`);
                continue;
            }

            // Link Node -> SAFETYNOTE
            await tx.run(
                'MATCH (n {uuid: $nodeUuid}) ' +
                'MATCH (note:SAFETYNOTE {uuid: $safetyNoteUuid}) ' +
                'MERGE (n)-[rel:NOTEREF]->(note) ' +
                'ON CREATE SET rel.created = timestamp(), rel.lastModified = timestamp() ',
                { nodeUuid: link.nodeUuid, safetyNoteUuid: link.safetyNoteUuid }
            );
            logs.push(`[SUCCESS] NOTEREF relationship linked: (${nodeLabels} ${link.nodeName || link.nodeUuid})-[NOTEREF]->(SAFETYNOTE ${link.safetyNoteName || link.safetyNoteUuid}).`);
        }

        await tx.commit();
        logs.push("[INFO] Transaction committed successfully.");
        return { success: true, logs };

    } catch (error: any) {
        logs.push(`[FATAL] Transaction failed: ${error.message}`);
        if (tx) {
            try {
                await tx.rollback();
                logs.push("[INFO] Transaction rolled back.");
            } catch (rollbackError: any) {
                logs.push(`[FATAL] Failed to rollback transaction: ${rollbackError.message}`);
            }
        }
        console.error("Error importing safety graph data:", error);
        return { success: false, logs, message: error.message };
    } finally {
        await session.close();
    }
}
