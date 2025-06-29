// Central type definitions for the safety analysis module
import React from 'react';

export interface SwComponent {
  uuid: string;
  name: string;
  description?: string;
  arxmlPath?: string;
  componentType?: string;
}

export interface Failure {
  failureUuid: string;
  failureName: string | null;
  failureDescription: string | null;
  asil: string | null;
  relationshipType: string;
}

export interface PortFailure {
  failureUuid: string;
  failureName: string | null;
  failureDescription: string | null;
  asil: string | null;
  failureType: string | null;
  relationshipType: string;
}

export interface ProviderPort {
  name: string;
  uuid: string;
  type: string;
}

export interface SafetyTableRow {
  key: string;
  swComponentUuid?: string;
  swComponentName?: string;
  failureName: string;
  failureDescription: string;
  asil: string;
  isNewRow?: boolean;
  failureUuid?: string;
  riskRatingCount?: number;
  safetyTaskCount?: number;
  safetyReqCount?: number;
  safetyNoteCount?: number;
}

export interface SafetyTableColumn {
  key: string;
  title: string;
  dataIndex: string;
  editable?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  render?: (text: unknown, record: SafetyTableRow, index: number) => React.ReactNode;
  inputType?: 'text' | 'select';
  selectOptions?: Array<{ value: string; label: string }>;
  width?: string | number;
  ellipsis?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

export interface CausationSelection {
  first: { uuid: string; name: string } | null;
  second: { uuid: string; name: string } | null;
}

export interface TablePaginationConfig {
  current: number;
  pageSize: number;
  showSizeChanger: boolean;
  showQuickJumper: boolean;
  showTotal: (total: number, range: [number, number]) => string;
  pageSizeOptions: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Props interfaces
export interface SwSafetyAnalysisProps {
  swComponentUuid: string;
}

export interface SafetyTableProps {
  dataSource: SafetyTableRow[];
  columns: SafetyTableColumn[];
  loading: boolean;
  editingKey: string;
  onEdit: (record: SafetyTableRow) => void;
  onSave: (key: React.Key) => Promise<void>;
  onCancel: () => void;
  onAdd: (swComponentUuid: string, swComponentName: string) => void;
  onDelete: (record: SafetyTableRow) => Promise<void>;
  isSaving: boolean;
  showComponentActions?: boolean;
  form: any; // FormInstance type from antd
  pagination?: any; // TablePaginationConfig from antd
}
