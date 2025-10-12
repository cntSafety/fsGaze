import { driver } from '@/app/services/neo4j/config';
import { Record } from 'neo4j-driver';

export interface ComponentSafetyData {
    componentUuid?: string | null;
    componentName: string;
    safetyNote: string | null;
    fmUuid?: string | null;
    fmName: string | null;
    fmDescription: string | null;
    fmNote: string | null;
    fmTask: string | null;
    fmAsil?: string | null;
    riskRatingName: string | null;
    Severity: number | null;
    Occurrence: number | null;
    Detection: number | null;
    RatingComment: string | null;
    RiskRatingTaskName: string | null;
    RiskRatingTaskDescription: string | null;
    RiskRatingTaskResponsible: string | null;
    RiskRatingTaskStatus: string | null;
}

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
    return Number.isNaN(parsed) ? null : parsed;
};

export async function getSafetyNodesForComponent(componentUuid: string): Promise<{
    success: boolean;
    data?: any[];
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
            // -- Get requirements for fm
            OPTIONAL MATCH (fm)-[reqRel:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
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
                   fm.asil as fmAsil, 
                   req.name as reqName,
                   req.reqASIL as reqASIL,
                   req.reqID as reqID,
                   req.reqLinkedTo as reqLinkedTo,
                   req.reqText as reqText,
                   fmNote.note AS fmNote, 
                   fmTask.name AS fmTask, 
                   fmrr.name AS riskRatingName, 
                   fmrr.Severity AS Severity, 
                   fmrr.Occurrence AS Occurrence, 
                   fmrr.Detection AS Detection, 
                   fmrr.RatingComment AS RatingComment, 
                   rrTask.name AS RiskRatingTaskName, 
                   rrTask.description AS RiskRatingTaskDescription,
                   rrTask.responsible AS RiskRatingTaskResponsible,
                   rrTask.status AS RiskRatingTaskStatus        `, { componentUuid });

        const componentSafetyData: any[] = result.records.map((record: Record) => {
            // Get all keys from the record
            const recordObj: any = {};
            
            // Get all field names from the record
            record.keys.forEach(key => {
                const value = record.get(key);
                
                // Handle numeric values specifically
                if (typeof key === 'string' && ['Severity', 'Occurrence', 'Detection'].includes(key)) {
                    recordObj[key] = safeToNumber(value);
                } else {
                    recordObj[key] = value;
                }
            });
            // Add RiskScore if all three values are present and numbers
            const sev = recordObj['Severity'];
            const occ = recordObj['Occurrence'];
            const det = recordObj['Detection'];
            recordObj['RiskScore'] = (typeof sev === 'number' && typeof occ === 'number' && typeof det === 'number')
                ? sev * occ * det
                : null;
            return recordObj;
        });        
        return {
            success: true,
            data: componentSafetyData,
        };
    } catch (error: any) {
        return { 
            success: false, 
            message: error.message 
        };
    } finally {
        await session.close();
    }
}

export async function getSafetyNodesForPorts(componentUuid: string): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
}> {
    const session = driver.session();
    
    try {
        // All safety relevant nodes for ports of a given SW component
        const result = await session.run(`
            MATCH (swc) WHERE swc.uuid = $componentUuid
            //get ports
            OPTIONAL MATCH (swc)-[portRel:CONTAINS]->(port:R_PORT_PROTOTYPE|P_PORT_PROTOTYPE)
            // Get the failure modes for the ports
            OPTIONAL MATCH (fm)-[occRel:OCCURRENCE]->(port)
            // -- Get requirements for fm
            OPTIONAL MATCH (fm)-[reqRel:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
            // -- Get notes for fm
            OPTIONAL MATCH (fm)-[noteRelfm:NOTEREF]->(fmNote)
            // -- Get tasks for fm
            OPTIONAL MATCH (fm)-[taskRelfm:TASKREF]->(fmTask)
            // -- Get risk rating rr for fm
            OPTIONAL MATCH (fm)-[rrRelfm:RATED]->(fmrr)
            // -- Get tasks related to risk rating (rrTasks)
            OPTIONAL MATCH (fmrr)-[fmrrRelTask:TASKREF]->(rrTask)
            RETURN swc.name AS componentName, 
                   port.name AS PortName,
                   fm.name AS fmName, 
                   fm.description AS fmDescription,
                   fm.asil as fmAsil, 
                   req.name as reqName,
                   req.reqASIL as reqASIL,
                   req.reqID as reqID,
                   req.reqLinkedTo as reqLinkedTo,
                   req.reqText as reqText,
                   fmNote.note AS fmNote, 
                   fmTask.name AS fmTask, 
                   fmrr.name AS riskRatingName, 
                   fmrr.Severity AS Severity, 
                   fmrr.Occurrence AS Occurrence, 
                   fmrr.Detection AS Detection, 
                   fmrr.RatingComment AS RatingComment, 
                   rrTask.name AS RiskRatingTaskName, 
                   rrTask.description AS RiskRatingTaskDescription, 
                   rrTask.responsible AS RiskRatingTaskResponsible,
                   rrTask.status AS RiskRatingTaskStatus        `, { componentUuid });

        const portSafetyData: any[] = result.records.map((record: Record) => {
            // Get all keys from the record
            const recordObj: any = {};
            
            // Get all field names from the record
            record.keys.forEach(key => {
                const value = record.get(key);
                
                // Handle numeric values specifically
                if (typeof key === 'string' && ['Severity', 'Occurrence', 'Detection'].includes(key)) {
                    recordObj[key] = safeToNumber(value);
                } else {
                    recordObj[key] = value;
                }
            });
            
            return recordObj;
        });        
        
        return {
            success: true,
            data: portSafetyData,
        };
    } catch (error: any) {
        return { 
            success: false, 
            message: error.message 
        };
    } finally {
        await session.close();
    }
}

export async function getAllComponentSafetyData(): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
}> {
    const session = driver.session();

    try {
        const result = await session.run(`
            MATCH (swc:APPLICATION_SW_COMPONENT_TYPE|COMPOSITION_SW_COMPONENT_TYPE|SERVICE_SW_COMPONENT_TYPE|ECU_ABSTRACTION_SW_COMPONENT_TYPE)
            OPTIONAL MATCH (swc)-[notRel:NOTEREF]->(swcNote)
            OPTIONAL MATCH (fm)-[occRel:OCCURRENCE]->(swc)
            OPTIONAL MATCH (fm)-[reqRel:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
            OPTIONAL MATCH (fm)-[noteRelfm:NOTEREF]->(fmNote)
            OPTIONAL MATCH (fm)-[taskRelfm:TASKREF]->(fmTask)
            OPTIONAL MATCH (fm)-[rrRelfm:RATED]->(fmrr)
            OPTIONAL MATCH (fmrr)-[fmrrRelTask:TASKREF]->(rrTask)
         RETURN swc.uuid AS componentUuid,
                   swc.name AS componentName,
                   swcNote.note AS safetyNote,
             fm.uuid AS fmUuid,
                   fm.name AS fmName,
                   fm.description AS fmDescription,
                   fm.asil AS fmAsil,
                   req.name AS reqName,
                   req.reqASIL AS reqASIL,
                   req.reqID AS reqID,
                   req.reqLinkedTo AS reqLinkedTo,
                   req.reqText AS reqText,
                   fmNote.note AS fmNote,
                   fmTask.name AS fmTask,
                   fmrr.name AS riskRatingName,
                   fmrr.Severity AS Severity,
                   fmrr.Occurrence AS Occurrence,
                   fmrr.Detection AS Detection,
                   fmrr.RatingComment AS RatingComment,
                   rrTask.name AS RiskRatingTaskName,
                   rrTask.description AS RiskRatingTaskDescription,
                   rrTask.responsible AS RiskRatingTaskResponsible,
                   rrTask.status AS RiskRatingTaskStatus
        `);

        const componentSafetyData: any[] = result.records.map((record: Record) => {
            const recordObj: any = {};

            record.keys.forEach(key => {
                const value = record.get(key);

                if (typeof key === 'string' && ['Severity', 'Occurrence', 'Detection'].includes(key)) {
                    recordObj[key] = safeToNumber(value);
                } else {
                    recordObj[key] = value;
                }
            });

            const sev = recordObj['Severity'];
            const occ = recordObj['Occurrence'];
            const det = recordObj['Detection'];
            recordObj['RiskScore'] = (typeof sev === 'number' && typeof occ === 'number' && typeof det === 'number')
                ? sev * occ * det
                : null;

            return recordObj;
        });

        return {
            success: true,
            data: componentSafetyData,
        };
    } catch (error: any) {
        return {
            success: false,
            message: error.message,
        };
    } finally {
        await session.close();
    }
}

export async function getAllPortSafetyData(): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
}> {
    const session = driver.session();

    try {
        const result = await session.run(`
            MATCH (swc:APPLICATION_SW_COMPONENT_TYPE|COMPOSITION_SW_COMPONENT_TYPE|SERVICE_SW_COMPONENT_TYPE|ECU_ABSTRACTION_SW_COMPONENT_TYPE)
            OPTIONAL MATCH (swc)-[portRel:CONTAINS]->(port:R_PORT_PROTOTYPE|P_PORT_PROTOTYPE)
            OPTIONAL MATCH (fm)-[occRel:OCCURRENCE]->(port)
            OPTIONAL MATCH (fm)-[reqRel:HAS_SAFETY_REQUIREMENT]->(req:SAFETYREQ)
            OPTIONAL MATCH (fm)-[noteRelfm:NOTEREF]->(fmNote)
            OPTIONAL MATCH (fm)-[taskRelfm:TASKREF]->(fmTask)
            OPTIONAL MATCH (fm)-[rrRelfm:RATED]->(fmrr)
            OPTIONAL MATCH (fmrr)-[fmrrRelTask:TASKREF]->(rrTask)
         RETURN swc.uuid AS componentUuid,
                   swc.name AS componentName,
                   port.uuid AS portUuid,
                   port.name AS PortName,
             fm.uuid AS fmUuid,
             labels(port)[0] AS portType,
                   fm.name AS fmName,
                   fm.description AS fmDescription,
                   fm.asil AS fmAsil,
                   req.name AS reqName,
                   req.reqASIL AS reqASIL,
                   req.reqID AS reqID,
                   req.reqLinkedTo AS reqLinkedTo,
                   req.reqText AS reqText,
                   fmNote.note AS fmNote,
                   fmTask.name AS fmTask,
                   fmrr.name AS riskRatingName,
                   fmrr.Severity AS Severity,
                   fmrr.Occurrence AS Occurrence,
                   fmrr.Detection AS Detection,
                   fmrr.RatingComment AS RatingComment,
                   rrTask.name AS RiskRatingTaskName,
                   rrTask.description AS RiskRatingTaskDescription,
                   rrTask.responsible AS RiskRatingTaskResponsible,
                   rrTask.status AS RiskRatingTaskStatus
        `);

        const portSafetyData: any[] = result.records.map((record: Record) => {
            const recordObj: any = {};

            record.keys.forEach(key => {
                const value = record.get(key);

                if (typeof key === 'string' && ['Severity', 'Occurrence', 'Detection'].includes(key)) {
                    recordObj[key] = safeToNumber(value);
                } else {
                    recordObj[key] = value;
                }
            });

            return recordObj;
        });

        return {
            success: true,
            data: portSafetyData,
        };
    } catch (error: any) {
        return {
            success: false,
            message: error.message,
        };
    } finally {
        await session.close();
    }
}
