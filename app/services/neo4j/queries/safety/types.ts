// Define the structure of the data to be imported/exported
export interface SafetyGraphNode {
    uuid: string;
    properties: Record<string, unknown>;
}

export interface OccurrenceLink {
    failureUuid: string;
    failureName: string; // For logging/verification, not directly stored in relationship
    occuranceSourceUuid: string;
    occuranceSourceName: string; // For logging/verification
    occuranceSourceArxmlPath?: string;
    occuranceSourceoriginalXmlTag?: string;
    occuranceSourceLabels?: string[]; // Neo4j labels of the source node
    // Optional: any properties for the OCCURRENCE relationship itself
}

export interface CausationLinkInfo {
    causationUuid: string;
    causationName: string; // For logging/verification
    causeFailureUuid: string;
    causeFailureName: string; // For logging/verification
    effectFailureUuid: string;
    effectFailureName: string; // For logging/verification
}

export interface RiskRatingLink {
    failureUuid: string;
    failureName: string; // For logging/verification
    riskRatingUuid: string;
    riskRatingName: string; // For logging/verification
}

export interface SafetyTaskLink {
    nodeUuid: string;
    nodeName: string; // For logging/verification
    safetyTaskUuid: string;
    safetyTaskName: string; // For logging/verification
}

export interface SafetyReqLink {
    nodeUuid: string;
    nodeName: string; // For logging/verification
    safetyReqUuid: string;
    safetyReqName: string; // For logging/verification
}

export interface SafetyNoteLink {
    nodeUuid: string;
    nodeName: string; // For logging/verification
    safetyNoteUuid: string;
    safetyNoteName: string; // For logging/verification
}

export interface SafetyGraphData {
    failures: SafetyGraphNode[];
    causations: SafetyGraphNode[];
    riskRatings: SafetyGraphNode[];
    safetyTasks?: SafetyGraphNode[];
    safetyReqs?: SafetyGraphNode[];
    safetyNotes?: SafetyGraphNode[];
    occurrences: OccurrenceLink[];
    causationLinks: CausationLinkInfo[];
    riskRatingLinks: RiskRatingLink[];
    safetyTaskLinks?: SafetyTaskLink[];
    safetyReqLinks?: SafetyReqLink[];
    safetyNoteLinks?: SafetyNoteLink[];
}
