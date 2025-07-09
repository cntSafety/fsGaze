export interface SwComponent {
  uuid: string;
  name: string;
  description?: string;
  arxmlPath?: string;
  componentType?: string;
  failures?: { uuid: string; name: string }[];
}

export interface Failure {
  failureUuid: string;
  failureName: string | null;
  failureDescription: string | null;
  asil: string | null;
  relationshipType: string;
  riskRatingCount?: number;
  safetyTaskCount?: number;
  safetyReqCount?: number;
  safetyNoteCount?: number;
}

export interface PortFailure {
  failureUuid: string;
  failureName: string | null;
  failureDescription: string | null;
  asil: string | null;
  failureType: string | null;
  relationshipType: string;
  riskRatingCount?: number;
  safetyTaskCount?: number;
  safetyReqCount?: number;
  safetyNoteCount?: number;
}

export interface ProviderPort {
  name: string;
  uuid: string;
  type: string;
}

export interface SwSafetyAnalysisProps {
  swComponentUuid: string;
}

export interface SafetyNote {
  uuid: string;
  note: string;
  created: string;
  lastModified: string;
}
