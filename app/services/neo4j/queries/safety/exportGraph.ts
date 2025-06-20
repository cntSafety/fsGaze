import { driver } from '@/app/services/neo4j/config';
import { SafetyGraphData } from './types';

export async function getSafetyGraph(): Promise<{
    success: boolean;
    data?: SafetyGraphData;
    message?: string;
}> {
    const session = driver.session();
    try {
        // 1. Get all FAILURE nodes and their properties
        const failuresResult = await session.run(
            'MATCH (f:FAILUREMODE) RETURN f.uuid AS uuid, properties(f) AS properties'
        );
        const failures = failuresResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),
        }));

        // 2. Get all CAUSATION nodes and their properties
        const causationsResult = await session.run(
            'MATCH (c:CAUSATION) RETURN c.uuid AS uuid, properties(c) AS properties'
        );
        const causations = causationsResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),
        }));

        // 3. Get all OCCURRENCE relationships and related node details
        // Updated to fetch extended properties from the source ARXML element
        const occurrencesResult = await session.run(`
            MATCH (f:FAILUREMODE)-[o:OCCURRENCE]->(src)
            RETURN f.uuid AS failureUuid, f.name AS failureName, 
                   src.uuid AS occuranceSourceUuid, src.name AS occuranceSourceName, 
                   src.arxmlPath AS occuranceSourceArxmlPath, 
                   src.importLabel AS occuranceSourceimportLabel, 
                   src.importTimestamp AS occuranceSourceimportTimestamp, 
                   src.originalXmlTag AS occuranceSourceoriginalXmlTag
        `);
        const occurrences = occurrencesResult.records.map(record => ({
            failureUuid: record.get('failureUuid'),
            failureName: record.get('failureName'),
            occuranceSourceUuid: record.get('occuranceSourceUuid'),
            occuranceSourceName: record.get('occuranceSourceName'),
            occuranceSourceArxmlPath: record.get('occuranceSourceArxmlPath'),
            occuranceSourceimportLabel: record.get('occuranceSourceimportLabel'),
            occuranceSourceimportTimestamp: record.get('occuranceSourceimportTimestamp'),
            occuranceSourceoriginalXmlTag: record.get('occuranceSourceoriginalXmlTag'),
        }));

        // 4. Get all CAUSATION links (FIRST and THEN relationships)
        const causationLinksResult = await session.run(`
            MATCH (cause:FAILUREMODE)<-[:FIRST]-(c:CAUSATION)-[:THEN]->(effect:FAILUREMODE)
            RETURN c.uuid AS causationUuid, c.name AS causationName, 
                   cause.uuid AS causeFailureUuid, cause.name AS causeFailureName, 
                   effect.uuid AS effectFailureUuid, effect.name AS effectFailureName
        `);
        const causationLinks = causationLinksResult.records.map(record => ({
            causationUuid: record.get('causationUuid'),
            causationName: record.get('causationName'),
            causeFailureUuid: record.get('causeFailureUuid'),
            causeFailureName: record.get('causeFailureName'),
            effectFailureUuid: record.get('effectFailureUuid'),
            effectFailureName: record.get('effectFailureName'),
        }));

        // 5. Get all RISKRATING nodes and their properties
        const riskRatingsResult = await session.run(
            'MATCH (r:RISKRATING) RETURN r.uuid AS uuid, properties(r) AS properties'
        );
        const riskRatings = riskRatingsResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),
        }));

        // 6. Get all RATED relationships between FAILURE and RISKRATING nodes
        const riskRatingLinksResult = await session.run(`
            MATCH (f:FAILUREMODE)-[r:RATED]->(rr:RISKRATING)
            RETURN f.uuid AS failureUuid, f.name AS failureName,
                   rr.uuid AS riskRatingUuid, rr.name AS riskRatingName
        `);        const riskRatingLinks = riskRatingLinksResult.records.map(record => ({
            failureUuid: record.get('failureUuid'),
            failureName: record.get('failureName'),
            riskRatingUuid: record.get('riskRatingUuid'),
            riskRatingName: record.get('riskRatingName'),        }));

        // 7. Get all SAFETYTASKS nodes and their properties
        const safetyTasksResult = await session.run(
            'MATCH (task:SAFETYTASKS) RETURN task.uuid AS uuid, properties(task) AS properties'
        );
        const safetyTasks = safetyTasksResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),
        }));

        // 8. Get all TASKREF relationships between any node and SAFETYTASKS nodes
        const safetyTaskLinksResult = await session.run(`
            MATCH (n)-[rel:TASKREF]->(task:SAFETYTASKS)
            RETURN n.uuid AS nodeUuid, n.name AS nodeName,
                   task.uuid AS safetyTaskUuid, task.name AS safetyTaskName
        `);
        const safetyTaskLinks = safetyTaskLinksResult.records.map(record => ({
            nodeUuid: record.get('nodeUuid'),
            nodeName: record.get('nodeName'),
            safetyTaskUuid: record.get('safetyTaskUuid'),
            safetyTaskName: record.get('safetyTaskName'),        }));

        // 9. Get all SAFETYREQ nodes and their properties
        const safetyReqsResult = await session.run(
            'MATCH (req:SAFETYREQ) RETURN req.uuid AS uuid, properties(req) AS properties'
        );
        const safetyReqs = safetyReqsResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),
        }));

        // 10. Get all HAS_SAFETY_REQUIREMENT relationships between any node and SAFETYREQ nodes
        const safetyReqLinksResult = await session.run(`
            MATCH (n)-[rel:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
            RETURN n.uuid AS nodeUuid, n.name AS nodeName,
                   req.uuid AS safetyReqUuid, req.name AS safetyReqName
        `);
        const safetyReqLinks = safetyReqLinksResult.records.map(record => ({
            nodeUuid: record.get('nodeUuid'),
            nodeName: record.get('nodeName'),
            safetyReqUuid: record.get('safetyReqUuid'),
            safetyReqName: record.get('safetyReqName'),
        }));

        // 11. Get all SAFETYNOTE nodes and their properties
        const safetyNotesResult = await session.run(
            'MATCH (note:SAFETYNOTE) RETURN note.uuid AS uuid, properties(note) AS properties'
        );
        const safetyNotes = safetyNotesResult.records.map(record => ({
            uuid: record.get('uuid'),
            properties: record.get('properties'),        }));

        // 12. Get all NOTEREF relationships between any node and SAFETYNOTE nodes
        const safetyNoteLinksResult = await session.run(`
            MATCH (n)-[ref:NOTEREF]->(note:SAFETYNOTE)
            RETURN n.uuid AS nodeUuid, n.name AS nodeName,
                   note.uuid AS safetyNoteUuid, note.note AS safetyNoteName
        `);
        const safetyNoteLinks = safetyNoteLinksResult.records.map(record => ({
            nodeUuid: record.get('nodeUuid'),
            nodeName: record.get('nodeName'),
            safetyNoteUuid: record.get('safetyNoteUuid'),
            safetyNoteName: record.get('safetyNoteName'),
        }));

/*         console.log("Debug: Export summary:");
        console.log(`- failures: ${failures.length}`);
        console.log(`- causations: ${causations.length}`);
        console.log(`- riskRatings: ${riskRatings.length}`);
        console.log(`- safetyTasks: ${safetyTasks.length}`);
        console.log(`- safetyReqs: ${safetyReqs.length}`);
        console.log(`- safetyNotes: ${safetyNotes.length}`);
        console.log(`- occurrences: ${occurrences.length}`);
        console.log(`- causationLinks: ${causationLinks.length}`);
        console.log(`- riskRatingLinks: ${riskRatingLinks.length}`);
        console.log(`- safetyTaskLinks: ${safetyTaskLinks.length}`);
        console.log(`- safetyReqLinks: ${safetyReqLinks.length}`);
        console.log(`- safetyNoteLinks: ${safetyNoteLinks.length}`); */

        return {
            success: true,
            data: {
                failures,
                causations,
                riskRatings,
                safetyTasks,
                safetyReqs,
                safetyNotes,
                occurrences,
                causationLinks,
                riskRatingLinks,
                safetyTaskLinks,
                safetyReqLinks,
                safetyNoteLinks,
            },
        };
    } catch (error: any) {
        console.error("Error fetching safety graph:", error);
        return { success: false, message: error.message };
    } finally {
        await session.close();
    }
}
