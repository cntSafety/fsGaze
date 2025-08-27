/**
 * @file Implements the full export of the safety-related graph from Neo4j.
 */
import { driver } from '@/app/services/neo4j/config';
import { SafetyGraphData } from './types';

/**
 * Fetches a comprehensive snapshot of all safety-related data from the Neo4j database.
 * This function performs a series of queries to gather all nodes and relationships
 * that constitute the safety analysis graph.
 *
 * The data fetched includes:
 * - All FAILUREMODE nodes and their properties.
 * - All CAUSATION nodes and their properties.
 * - All OCCURRENCE relationships, linking failures to their source elements.
 * - All CAUSATION links, detailing cause-and-effect chains between failures.
 * - All RISKRATING nodes and their links to failures.
 * - All SAFETYTASKS nodes and their links.
 * - All SAFETYREQ nodes and their links.
 * - All SAFETYNOTE nodes and their links.
 *
 * This function is intended for features that require a complete overview of the
 * safety graph, such as full graph visualizations or data exports.
 *
 * @returns A Promise that resolves to an object containing the success status,
 *          an optional data object of type `SafetyGraphData`, and an optional message.
 */
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
                   src.originalXmlTag AS occuranceSourceoriginalXmlTag,
                   labels(src) AS occuranceSourceLabels
        `);
        const occurrences = occurrencesResult.records.map(record => ({
            failureUuid: record.get('failureUuid'),
            failureName: record.get('failureName'),
            occuranceSourceUuid: record.get('occuranceSourceUuid'),
            occuranceSourceName: record.get('occuranceSourceName'),
            occuranceSourceArxmlPath: record.get('occuranceSourceArxmlPath'),
            occuranceSourceoriginalXmlTag: record.get('occuranceSourceoriginalXmlTag'),
            occuranceSourceLabels: record.get('occuranceSourceLabels'),
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

        // Uncomment this block for detailed debugging of the export process
        
        // console.log("Debug: Export summary:");
        // console.log(`- failures: ${failures.length}`);
        // console.log(`- causations: ${causations.length}`);
        // console.log(`- riskRatings: ${riskRatings.length}`);
        // console.log(`- safetyTasks: ${safetyTasks.length}`);
        // console.log(`- safetyReqs: ${safetyReqs.length}`);
        // console.log(`- safetyNotes: ${safetyNotes.length}`);
        // console.log(`- occurrences: ${occurrences.length}`);
        // console.log(`- causationLinks: ${causationLinks.length}`);
        // console.log(`- riskRatingLinks: ${riskRatingLinks.length}`);
        // console.log(`- safetyTaskLinks: ${safetyTaskLinks.length}`);
        // console.log(`- safetyReqLinks: ${safetyReqLinks.length}`);
        // console.log(`- safetyNoteLinks: ${safetyNoteLinks.length}`);
        

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

/**
 * Fetches a snapshot of the safety graph specifically tailored for diagramming.
 * This version of the query ensures that for every failure occurrence, the parent
 * component's UUID and name are also fetched. This is critical for reliably
 * constructing diagram nodes with stable UUIDs.
 *
 * @returns A Promise resolving to the safety graph data for diagrams.
 */
export async function getSafetyGraphForDiagram(): Promise<{
    success: boolean;
    data?: SafetyGraphData;
    message?: string;
}> {
    const session = driver.session();
    try {
        const fullGraph = await getSafetyGraph();

        if (!fullGraph.success || !fullGraph.data) {
            return { success: false, message: 'Failed to fetch base safety graph.' };
        }
        
        const occurrencesResult = await session.run(`
            MATCH (f:FAILUREMODE)-[:OCCURRENCE]->(src)
            MATCH (component)-[:CONTAINS]->(src)
            WHERE component:APPLICATION_SW_COMPONENT_TYPE OR component:COMPOSITION_SW_COMPONENT_TYPE OR component:SERVICE_SW_COMPONENT_TYPE
            RETURN f.uuid AS failureUuid, f.name AS failureName, 
                   src.uuid AS occuranceSourceUuid, src.name AS occuranceSourceName, 
                   src.arxmlPath AS occuranceSourceArxmlPath, 
                   labels(src) AS occuranceSourceLabels,
                   component.uuid AS componentUuid,
                   component.name AS componentName
        `);
        
        const occurrences = occurrencesResult.records.map(record => ({
            failureUuid: record.get('failureUuid'),
            failureName: record.get('failureName') || '',
            occuranceSourceUuid: record.get('occuranceSourceUuid'),
            occuranceSourceName: record.get('occuranceSourceName'),
            occuranceSourceArxmlPath: record.get('occuranceSourceArxmlPath'),
            occuranceSourceLabels: record.get('occuranceSourceLabels'),
            componentUuid: record.get('componentUuid'),
            componentName: record.get('componentName'),
        }));

        fullGraph.data.occurrences = occurrences;

        return fullGraph;

    } catch (error: any) {
        console.error("Error fetching safety graph for diagram:", error);
        return { success: false, message: error.message };
    } finally {
        await session.close();
    }
}

/**
 * Fetches a safety subgraph for a specific component using a predefined UUID filter.
 * The query returns the causation UUID along with the involved failure nodes
 * (selected failure, its cause, and its effect) limited to failures that occur
 * within the specified component.
 */
export async function getSafetyGraphForComponent(componentUuid: string): Promise<{
    success: boolean;
    data?: Array<{
        cuuid: string;
        failureUuid: string;
        failureName: string;
        causeFailureUuid: string;
        causeFailureName: string;
        effectFailureUuid: string;
        effectFailureName: string;
        failurePortUuid?: string;
        failurePortName?: string;
        portUuid?: string;
        portName?: string;
        portLabels?: string[];
    }>;
    message?: string;
}> {
    const session = driver.session();
    try {
        const query = `
            MATCH (f:FAILUREMODE)-[:OCCURRENCE]->(cmp)
            WHERE cmp.uuid = $componentUuid
            OPTIONAL MATCH (port)<-[:CONTAINS]-(cmp)
            WHERE port:P_PORT_PROTOTYPE OR port:R_PORT_PROTOTYPE
            OPTIONAL MATCH (fport)-[:OCCURRENCE]->(port)
            OPTIONAL MATCH (c:CAUSATION)-[]-(f)
            OPTIONAL MATCH (f)-[:OCCURRENCE]->(src)
            OPTIONAL MATCH (cause:FAILUREMODE)<-[:FIRST]-(c)-[:THEN]->(effect:FAILUREMODE)
            RETURN c.uuid AS cuuid, f.uuid AS failureUuid, f.name AS failureName,
                   fport.uuid AS failurePortUuid, fport.name AS failurePortName,
                   port.uuid AS portUuid, port.name AS portName, labels(port) AS portLabels,
                   cause.uuid AS causeFailureUuid, cause.name AS causeFailureName,
                   effect.uuid AS effectFailureUuid, effect.name AS effectFailureName
        `;
        const result = await session.run(query, { componentUuid });
        const rows = result.records.map(record => ({
            cuuid: record.get('cuuid'),
            failureUuid: record.get('failureUuid'),
            failureName: record.get('failureName'),
            failurePortUuid: record.get('failurePortUuid') || undefined,
            failurePortName: record.get('failurePortName') || undefined,
            portUuid: record.get('portUuid') || undefined,
            portName: record.get('portName') || undefined,
            portLabels: record.get('portLabels') || undefined,
            causeFailureUuid: record.get('causeFailureUuid'),
            causeFailureName: record.get('causeFailureName'),
            effectFailureUuid: record.get('effectFailureUuid'),
            effectFailureName: record.get('effectFailureName'),
        }));

        return { success: true, data: rows };
    } catch (error: any) {
        console.error("Error fetching safety graph for component:", error);
        return { success: false, message: error.message };
    } finally {
        await session.close();
    }
}