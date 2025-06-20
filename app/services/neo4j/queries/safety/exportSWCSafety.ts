import { driver } from '@/app/services/neo4j/config';
import { Record } from 'neo4j-driver';

export interface ComponentSafetyData {
    componentName: string;
    safetyNote: string | null;
    fmName: string | null;
    fmDescription: string | null;
    fmNote: string | null;
    fmTask: string | null;
    riskRatingName: string | null;
    Severity: number | null;
    Occurrence: number | null;
    Detection: number | null;
    RatingComment: string | null;
    RiskRatingTaskName: string | null;
    RiskRatingTaskDescription: string | null;
}

export async function getSafetyNodesForComponent(componentUuid: string): Promise<{
    success: boolean;
    data?: ComponentSafetyData[];
    message?: string;
}> {
    const session = driver.session();
    
    try {
        // All safety relevant nodes for a given SW component
        const result = await session.run(`
            MATCH (swc) WHERE swc.uuid = $componentUuid
            // Get notes for swc
            OPTIONAL MATCH (swc)-[notRel:NOTEREF]->(swcNote)
            // Get the failure modes for the sw component
            OPTIONAL MATCH (fm)-[occRel:OCCURRENCE]->(swc)
            // -- Get notes for fm
            OPTIONAL MATCH (fm)-[noteRelfm:NOTEREF]->(fmNote)
            // -- Get tasks for fm
            OPTIONAL MATCH (fm)-[taskRelfm:TASKREF]->(fmTask)
            // -- Get risk rating rr for fm
            OPTIONAL MATCH (fm)-[rrRelfm:RATED]->(fmrr)
            // -- Get tasks related to risk rating (rrTasks)
            OPTIONAL MATCH (fmrr)-[fmrrRelTask:TASKREF]->(rrTask)
            RETURN swc.name AS componentName, 
                   swcNote.note AS safetyNote, 
                   fm.name AS fmName, 
                   fm.description AS fmDescription,
                   fmNote.note AS fmNote, 
                   fmTask.name AS fmTask, 
                   fmrr.name AS riskRatingName, 
                   fmrr.Severity AS Severity, 
                   fmrr.Occurrence AS Occurrence, 
                   fmrr.Detection AS Detection, 
                   fmrr.RatingComment AS RatingComment, 
                   rrTask.name AS RiskRatingTaskName, 
                   rrTask.description AS RiskRatingTaskDescription        `, { componentUuid });

        // Helper function to safely convert Neo4j values to numbers
        const safeToNumber = (value: any): number | null => {
            if (value === null || value === undefined) return null;
            if (typeof value === 'number') return value;
            if (value && typeof value.toNumber === 'function') {
                try {
                    return value.toNumber();
                } catch {
                    return null;
                }
            }
            const parsed = Number(value);
            return isNaN(parsed) ? null : parsed;
        };

        const componentSafetyData: ComponentSafetyData[] = result.records.map((record: Record) => ({
            componentName: record.get('componentName'),
            safetyNote: record.get('safetyNote'),
            fmName: record.get('fmName'),
            fmDescription: record.get('fmDescription'),
            fmNote: record.get('fmNote'),
            fmTask: record.get('fmTask'),
            riskRatingName: record.get('riskRatingName'),
            Severity: safeToNumber(record.get('Severity')),
            Occurrence: safeToNumber(record.get('Occurrence')),
            Detection: safeToNumber(record.get('Detection')),
            RatingComment: record.get('RatingComment'),
            RiskRatingTaskName: record.get('RiskRatingTaskName'),
            RiskRatingTaskDescription: record.get('RiskRatingTaskDescription'),
        }));

        console.log("Debug: Component Safety Export summary:");
        console.log(`- Component UUID: ${componentUuid}`);
        console.log(`- Total records returned: ${componentSafetyData.length}`);
        
        return {
            success: true,
            data: componentSafetyData,
        };
    } catch (error: any) {
        console.error("Error fetching safety nodes for component:", error);
        return { 
            success: false, 
            message: error.message 
        };
    } finally {
        await session.close();
    }
}
