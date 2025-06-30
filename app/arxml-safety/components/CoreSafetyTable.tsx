'use client';

import React, { useState } from 'react';
import { Table, Form, Input, Select, Button, Space, Tooltip, Dropdown, Modal, Popconfirm, message, Badge } from 'antd';
import { SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, LinkOutlined, DashboardOutlined, MoreOutlined, ExclamationCircleOutlined, FileTextOutlined, CheckSquareOutlined, EditFilled, SnippetsOutlined } from '@ant-design/icons';
import type { TableProps, ColumnType } from 'antd/es/table';
import type { FormInstance } from 'antd/es/form';
import type { FilterDropdownProps } from 'antd/es/table/interface';
import { Resizable } from 'react-resizable';
import ElementDetailsModal, { ElementDetails } from './ElementDetailsModal';
import RiskRatingModal from './RiskRatingModal';
import SafetyNoteManager from './safety-analysis/SafetyNoteManager';
// import { CascadeDeleteModal } from '../../components/CascadeDeleteModal'; // Removed: Now handled by parent components

const { Option } = Select;

// Resizable column title component
interface ResizableTitleProps {
  onResize: (width: number) => void;
  width: number;
  [key: string]: unknown;
}

const ResizableTitle = (props: ResizableTitleProps) => {
  const { onResize, width, ...restProps } = props;

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      }
      onResize={(e, data) => onResize(data.size.width)}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

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
  multiLine?: boolean; // New property to indicate if this column should use textarea when editing
}

interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
  editing: boolean;
  dataIndex: string;
  title: string;
  inputType: 'text' | 'select';
  record: SafetyTableRow;
  index: number;
  selectOptions?: Array<{ value: string; label: string }>;
  multiLine?: boolean; // New property for multi-line editing
}

const EditableCell: React.FC<React.PropsWithChildren<EditableCellProps>> = ({
  editing,
  dataIndex,
  title,
  inputType,
  // record and index are required by the interface but not used in this implementation
  record: _record,
  index: _index,
  selectOptions,
  multiLine = false,
  children,
  ...restProps
}) => {
  const inputNode = inputType === 'select' ? (
    <Select style={{ width: '100%' }}>
      {selectOptions?.map(option => (
        <Option key={option.value} value={option.value}>
          {option.label}
        </Option>
      ))}
    </Select>
  ) : multiLine ? (
    <Input.TextArea 
      autoSize={{ minRows: 2, maxRows: 6 }}
      style={{ width: '100%' }}
      placeholder={`Enter ${title.toLowerCase()}...`}
    />
  ) : (
    <Input />
  );

  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
          rules={[
            {
              required: dataIndex !== 'swComponentName',
              message: `Please Input ${title}!`,
            },
          ]}
        >
          {inputNode}
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};

interface CoreSafetyTableProps {
  dataSource: SafetyTableRow[];
  columns: (SafetyTableColumn & ColumnType<SafetyTableRow>)[];
  loading?: boolean;
  editingKey: string;
  onEdit?: (record: SafetyTableRow) => void;
  onSave?: (key: React.Key) => Promise<void>;
  onCancel?: () => void;  onAdd?: (swComponentUuid: string, swComponentName: string) => void;
  onDelete?: (record: SafetyTableRow) => Promise<void>;  onRiskRating?: (failureUuid: string, severity: number, occurrence: number, detection: number) => Promise<void>;
  onRiskRatingClick?: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>; // New enhanced handler
  onSafetyTaskClick?: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>; // New safety task handler
  onSafetyReqClick?: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>; // New safety requirement handler
  refreshData?: () => void;
  isSaving?: boolean;
  pagination?: false | TableProps<SafetyTableRow>['pagination'];
  showComponentActions?: boolean;
  form?: FormInstance;
  // New props for failure linking
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
  scroll?: TableProps<SafetyTableRow>['scroll'];
  // New prop for element click callback
  onElementClick?: (element: ElementDetails) => void;
  // Causation linking for modal
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
}

const getColumnSearchProps = (dataIndex: string): ColumnType<SafetyTableRow> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) => (
    <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
      <Input
        placeholder={`Search ${dataIndex}`}
        value={selectedKeys[0]}
        onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
        onPressEnter={() => confirm()}
        style={{ marginBottom: 8, display: 'block' }}
      />
      <Space>
        <Button
          type="primary"
          onClick={() => confirm()}
          icon={<SearchOutlined />}
          size="small"
          style={{ width: 90 }}
        >
          Search
        </Button>
        <Button
          onClick={() => clearFilters && clearFilters()}
          size="small"
          style={{ width: 90 }}
        >
          Reset
        </Button>
      </Space>
    </div>
  ),
  filterIcon: (filtered: boolean) => (
    <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
  ),
  onFilter: (value, record) =>
    record[dataIndex as keyof SafetyTableRow]
      ?.toString()
      .toLowerCase()
      .includes((value as string).toLowerCase()) || false,
});

export default function CoreSafetyTable({
  dataSource,
  columns,  loading = false,
  editingKey,
  onEdit,
  onSave,
  onCancel,
  onAdd,
  onDelete,  onRiskRating,
  onRiskRatingClick,
  onSafetyTaskClick,
  onSafetyReqClick,
  refreshData,
  isSaving = false,
  pagination = { pageSize: 50 },
  showComponentActions = false,
  form,
  onFailureSelect,
  selectedFailures,
  onElementClick,
  scroll,
  getFailureSelectionState,
  handleFailureSelection,
  isCauseSelected,
}: CoreSafetyTableProps) {
  const isEditing = (record: SafetyTableRow) => record.key === editingKey;
    // Modal state management
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementDetails | null>(null);
  
  // Risk rating modal state
  const [isRiskRatingModalVisible, setIsRiskRatingModalVisible] = useState(false);
  const [selectedFailureForRiskRating, setSelectedFailureForRiskRating] = useState<SafetyTableRow | null>(null);
  const [isRiskRatingSaving, setIsRiskRatingSaving] = useState(false);
  
  // Delete confirmation modal state - Removed: Now handled by parent components
    // Safety notes modal state
  const [isSafetyNotesModalVisible, setIsSafetyNotesModalVisible] = useState(false);
  const [selectedFailureForNotes, setSelectedFailureForNotes] = useState<SafetyTableRow | null>(null);
  
  // Safety task modal state
  const [isSafetyTaskModalVisible, setIsSafetyTaskModalVisible] = useState(false);
  const [selectedFailureForSafetyTask, setSelectedFailureForSafetyTask] = useState<SafetyTableRow | null>(null);
  
  // Helper function to check if a failure is selected
  const isFailureSelected = (failureUuid: string) => {
    return selectedFailures?.first?.uuid === failureUuid || 
           selectedFailures?.second?.uuid === failureUuid;
  };

  // Helper function to handle element click for modal
  const handleElementClick = (element: ElementDetails) => {
    if (onElementClick) {
      // Use external callback if provided
      onElementClick(element);
    } else {
      // Use internal modal
      setSelectedElement(element);
      setIsModalVisible(true);
    }
  };
  // Helper function to close modal
  const handleModalClose = () => {
    setIsModalVisible(false);
    setSelectedElement(null);
  };

  // Helper function to handle link click
  const handleLinkClick = (record: SafetyTableRow) => {
    if (!record.failureUuid || !onFailureSelect) return;
    
    onFailureSelect({
      uuid: record.failureUuid,
      name: record.failureName
    });
  };

  // Risk rating handlers
  const handleRiskRatingClick = async (record: SafetyTableRow) => {
    if (onRiskRatingClick && record.failureUuid) {
      // Use the new enhanced handler that checks for existing risk ratings
      await onRiskRatingClick(record.failureUuid, record.failureName, record.failureDescription);
    } else {
      // Fall back to the old behavior
      setSelectedFailureForRiskRating(record);
      setIsRiskRatingModalVisible(true);
    }
  };

  const handleRiskRatingCancel = () => {
    setIsRiskRatingModalVisible(false);
    setSelectedFailureForRiskRating(null);
  };

  const handleRiskRatingSave = async (severity: number, occurrence: number, detection: number) => {
    if (!selectedFailureForRiskRating?.failureUuid || !onRiskRating) return;
    
    try {
      setIsRiskRatingSaving(true);
      await onRiskRating(selectedFailureForRiskRating.failureUuid, severity, occurrence, detection);
      setIsRiskRatingModalVisible(false);
      setSelectedFailureForRiskRating(null);
    } catch (error) {
      console.error('Error saving risk rating:', error);
    } finally {
      setIsRiskRatingSaving(false);
    }
  };

  // Safety task handlers
  const handleSafetyTaskClick = async (record: SafetyTableRow) => {
    if (onSafetyTaskClick && record.failureUuid) {
      // Use the enhanced handler from SafetyTaskManager
      await onSafetyTaskClick(record.failureUuid, record.failureName, record.failureDescription);
    } else {
      // Fall back to basic modal behavior if no handler provided
      setSelectedFailureForSafetyTask(record);
      setIsSafetyTaskModalVisible(true);
    }
  };

  const handleSafetyTaskCancel = () => {
    setIsSafetyTaskModalVisible(false);
    setSelectedFailureForSafetyTask(null);
  };

  // Safety requirements handlers
  const handleSafetyReqClick = async (record: SafetyTableRow) => {
    if (onSafetyReqClick && record.failureUuid) {
      // Use the enhanced handler from SafetyReqManager
      await onSafetyReqClick(record.failureUuid, record.failureName, record.failureDescription);
    }
  };

  // Delete confirmation handlers
  const handleDeleteClick = async (record: SafetyTableRow) => {
    // Call the parent's delete handler directly instead of opening our own modal
    if (onDelete) {
      await onDelete(record);
    }
  };

  // handleDeleteCancel - Removed: No longer needed since modal is handled by parent components

  // Safety notes handlers
  const handleSafetyNotesClick = (record: SafetyTableRow) => {
    console.log('Safety Notes clicked for record:', {
      failureUuid: record.failureUuid,
      failureName: record.failureName,
      record: record
    });
    setSelectedFailureForNotes(record);
    setIsSafetyNotesModalVisible(true);
  };

  const handleSafetyNotesClose = () => {
    setIsSafetyNotesModalVisible(false);
    setSelectedFailureForNotes(null);
  };

  // State for managing column widths
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(() => {
    // Initialize with default widths from column configuration
    const initialWidths: { [key: string]: number } = {};
    columns.forEach(col => {
      if (col.width && typeof col.width === 'number') {
        initialWidths[col.key] = col.width;
      } else if (col.minWidth) {
        initialWidths[col.key] = col.minWidth;
      } else {
        // Default widths based on column type
        switch (col.dataIndex) {
          case 'swComponentName':
          case 'portName':
            initialWidths[col.key] = 200;
            break;
          case 'failureName':
            initialWidths[col.key] = 150;
            break;
          case 'failureDescription':
            initialWidths[col.key] = 250;
            break;
          case 'asil':
            initialWidths[col.key] = 80;
            break;
          default:
            initialWidths[col.key] = 120;
        }
      }
    });
    // Add actions column width
    initialWidths['actions'] = 120;
    return initialWidths;
  });

  // Handle column resize
  const handleResize = (index: number, columnKey: string) => (e: unknown, { size }: { size: { width: number; height: number } }) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: size.width,
    }));
  };

  const getAsilColor = (level: string) => {
    switch (level) {
      case 'D': return { backgroundColor: '#fff2f0', color: '#cf1322', border: '1px solid #ffccc7' };
      case 'C': return { backgroundColor: '#fff7e6', color: '#d46b08', border: '1px solid #ffd591' };
      case 'B': return { backgroundColor: '#feffe6', color: '#7cb305', border: '1px solid #eaff8f' };
      case 'A': return { backgroundColor: '#f6ffed', color: '#52c41a', border: '1px solid #b7eb8f' };
      case 'TBC': return { backgroundColor: '#fff7e6', color: '#fa8c16', border: '1px solid #ffb366', fontWeight: 'bold' };
      default: return { backgroundColor: '#fafafa', color: '#666', border: '1px solid #d9d9d9' };
    }
  };

  // Build table columns from configuration
  const tableColumns: (ColumnType<SafetyTableRow> & { editable?: boolean; dataIndex?: string; title?: string })[] = columns.map((col, index) => {
    const columnKey = col.key || (typeof col.dataIndex === 'string' ? col.dataIndex : index.toString());
    const baseColumn: ColumnType<SafetyTableRow> = {
      title: col.title,
      dataIndex: col.dataIndex,
      key: columnKey,
      width: columnWidths[columnKey] || col.width,
      minWidth: col.minWidth,
      ellipsis: col.ellipsis || (col.dataIndex === 'failureDescription'), // Default ellipsis for description columns
      render: col.render,
      onHeaderCell: (column: any) => ({
        width: column.width,
        onResize: handleResize(index, columnKey),
      } as any),
      ...(col.searchable && getColumnSearchProps(col.dataIndex as string)),
    };

    // Add tooltip for ellipsis columns
    if (baseColumn.ellipsis && !col.render) {
      baseColumn.ellipsis = {
        showTitle: true,
      };
    }

    // Special rendering for ASIL column
    if (col.dataIndex === 'asil' && !col.render) {
      baseColumn.render = (asil: string) => {
        if (asil === '-') return <span style={{ color: '#999' }}>-</span>;
        
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            ...getAsilColor(asil)
          }}>
            {asil}
          </span>
        );
      };
    }

    // Special rendering for failure name column - make it clickable
    if (col.dataIndex === 'failureName' && !col.render) {
      baseColumn.render = (text: string, record: SafetyTableRow) => {
        if (!text || text === '-' || text === 'No failures defined') {
          return <span style={{ color: '#999' }}>{text || '-'}</span>;
        }
        
        return (
          <Button
            type="link"
            style={{ 
              padding: 0, 
              height: 'auto', 
              fontSize: 'inherit',
              textAlign: 'left',
              whiteSpace: 'normal',
              wordBreak: 'break-word'
            }}
            onClick={() => handleElementClick({
              uuid: record.failureUuid || record.key,
              name: text,
              type: 'failure',
              additionalInfo: {
                description: record.failureDescription,
                asil: record.asil,
                component: record.swComponentName
              }
            })}
          >
            {text}
          </Button>
        );
    }
    }

    // Special rendering for component name column - make it clickable
    if (col.dataIndex === 'swComponentName' && !col.render) {
      baseColumn.render = (text: string, record: SafetyTableRow, index: number) => {
        if (!text || text === '-') {
          return <span style={{ color: '#999' }}>{text || '-'}</span>;
        }
        
        // Check if this is a port column by looking at the column key
        const isPortColumn = columnKey === 'portName';
        
        if (isPortColumn) {
          // Handle port column grouping - only show port name on first row for each port
          const isFirstRowForPort = index === 0 || 
            dataSource[index - 1]?.swComponentUuid !== record.swComponentUuid;
          
          if (!isFirstRowForPort) {
            return null; // Return blank space for subsequent rows of the same port
          }
          
          // Extract port name from the format "PortName (P_PORT_PROTOTYPE)"
          const match = text.match(/^(.+)\s+\(.*\)$/);
          const portName = match ? match[1] : text;
          
          return (
            <Button
              type="link"
              style={{ 
                padding: 0, 
                height: 'auto', 
                fontSize: 'inherit',
                textAlign: 'left',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                fontWeight: 'bold',
                color: '#1890ff'
              }}
              onClick={() => handleElementClick({
                uuid: record.swComponentUuid || record.key,
                name: portName,
                type: 'port',
                additionalInfo: {
                  fullName: text,
                  portType: col.title?.toString().includes('Provider') ? 'Provider Port' : 
                           col.title?.toString().includes('Receiver') ? 'Receiver Port' : 'Port'
                }
              })}
            >
              {portName}
            </Button>
          );
        } else {
          // Handle regular component name
          return (
            <Button
              type="link"
              style={{ 
                padding: 0, 
                height: 'auto', 
                fontSize: 'inherit',
                textAlign: 'left',
                whiteSpace: 'normal',
                wordBreak: 'break-word'
              }}
              onClick={() => handleElementClick({
                uuid: record.swComponentUuid || record.key,
                name: text,
                type: 'component',
                additionalInfo: {
                  failureCount: dataSource.filter(row => row.swComponentUuid === record.swComponentUuid).length
                }
              })}
            >
              {text}
            </Button>
          );
        }
      };
    }

    // Special rendering for component names with actions
    if (col.dataIndex === 'swComponentName' && showComponentActions && !col.render) {
      baseColumn.render = (text: string, record: SafetyTableRow, index: number) => {
        const isPortColumn = columnKey === 'portName';
        
        if (isPortColumn) {
          // Handle port column grouping - only show port name on first row for each port
          const isFirstRowForPort = index === 0 || 
            dataSource[index - 1]?.swComponentUuid !== record.swComponentUuid;
          
          if (!isFirstRowForPort) {
            return null; // Return blank space for subsequent rows of the same port
          }
          
          // Extract port name from the format "PortName (P_PORT_PROTOTYPE)"
          const match = text.match(/^(.+)\s+\(.*\)$/);
          const portName = match ? match[1] : text;
          
          return (
            <Button
              type="link"
              style={{ 
                padding: 0, 
                height: 'auto', 
                fontSize: 'inherit',
                textAlign: 'left',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                fontWeight: 'bold',
                color: '#1890ff'
              }}
              onClick={() => handleElementClick({
                uuid: record.swComponentUuid || record.key,
                name: portName,
                type: 'port',
                additionalInfo: {
                  fullName: text,
                  portType: col.title?.toString().includes('Provider') ? 'Provider Port' : 
                           col.title?.toString().includes('Receiver') ? 'Receiver Port' : 'Port'
                }
              })}
            >
              {portName}
            </Button>
          );
        } else {
          // Handle regular component name
          const isFirstRowForComponent = index === 0 || 
            dataSource[index - 1]?.swComponentUuid !== record.swComponentUuid;
          
          return isFirstRowForComponent ? (
            <Button
              type="link"
              style={{ 
                padding: 0, 
                height: 'auto', 
                fontSize: 'inherit',
                textAlign: 'left',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                fontWeight: 'bold'
              }}
              onClick={() => handleElementClick({
                uuid: record.swComponentUuid || record.key,
                name: text,
                type: 'component',
                additionalInfo: {
                  failureCount: dataSource.filter(row => row.swComponentUuid === record.swComponentUuid).length
                }
              })}
            >
              {text}
            </Button>
          ) : null;
        }
      };
    }

    return { ...baseColumn, ...col };
  });

  // Add actions column if handlers are provided
  if (onEdit || onSave || onCancel || onAdd || onDelete || onFailureSelect || onRiskRating || onRiskRatingClick) {
    tableColumns.push({
      title: 'Actions',
      dataIndex: 'actions',
      key: 'actions',
      width: 240, // Fixed width for Actions column
      onHeaderCell: () => ({
        width: 240,
        onResize: handleResize(columns.length, 'actions'),
      } as any),
      render: (_: unknown, record: SafetyTableRow, index: number) => {
        const editable = isEditing(record);
        const isFirstRowForComponent = showComponentActions && (index === 0 || 
          dataSource[index - 1]?.swComponentUuid !== record.swComponentUuid);
          // Don't show link icon for placeholder rows or rows without failure UUID
        const canLink = record.failureName !== 'No failures defined' && 
                       record.failureUuid && 
                       onFailureSelect;
          // Don't show risk rating for placeholder rows or rows without failure UUID
        const canRiskRating = record.failureName !== 'No failures defined' && 
                              record.failureUuid && 
                              (onRiskRating || onRiskRatingClick);
        
        const selectionState = canLink ? getFailureSelectionState && getFailureSelectionState(record.failureUuid!) : null;
        
        return editable ? (
          <Space size="small">
            {onSave && (
              <Button 
                type="primary"
                size="small"
                onClick={() => onSave(record.key)} 
                loading={isSaving}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            )}
            {onCancel && (
              <Popconfirm title="Sure to cancel?" onConfirm={onCancel}>
                <Button size="small" disabled={isSaving}>Cancel</Button>
              </Popconfirm>
            )}
          </Space>
        ) : (
          <Space size="small">
            {/* Always visible: Add Button */}
            {onAdd && record.swComponentUuid && record.swComponentName && (
              <Tooltip title="Add Failure">
                <Button 
                  type="text"
                  size="small"
                  disabled={editingKey !== ''} 
                  onClick={() => onAdd(record.swComponentUuid!, record.swComponentName!)}
                  icon={<PlusOutlined />}
                />
              </Tooltip>
            )}

            {/* Always visible: Edit Button */}
            {onEdit && record.failureName !== 'No failures defined' && (
              <Tooltip title="Edit">
                <Button 
                  type="text"
                  size="small"
                  disabled={editingKey !== ''} 
                  onClick={() => onEdit(record)}
                  icon={<EditOutlined />}
                />
              </Tooltip>
            )}
            
            {/* Link Icon for Causation Creation */}
            {canLink && (
              <Tooltip 
                key={`tooltip-${record.failureUuid}-${selectionState || 'none'}`}
                title={
                  selectionState === 'first' ? 'Selected as Cause - Click another to set Effect' :
                  selectionState === 'second' ? 'Selected as Effect' :
                  selectedFailures?.first ? 'Click to set as Effect' :
                  'Click to set as Cause'
                }
              >
                <Button
                  type="text"
                  size="small"
                  onClick={() => handleLinkClick(record)}
                  icon={<LinkOutlined />}
                  style={{
                    color: selectionState === 'first' ? '#1890ff' : 
                           selectionState === 'second' ? '#ff7875' : undefined
                  }}
                />
              </Tooltip>
            )}
            
            {/* Safety Note Icon */}
            {record.failureName !== 'No failures defined' && record.failureUuid && (
              <Tooltip title="Safety Notes">
                <Badge count={record.safetyNoteCount} size="small" offset={[0, 8]}>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => handleSafetyNotesClick(record)}
                    icon={<SnippetsOutlined />}
                    style={{ color: '#1890ff' }}
                  />
                </Badge>
              </Tooltip>
            )}
            
            {/* Safety Requirements */}
            {onSafetyReqClick && record.failureName !== 'No failures defined' && record.failureUuid && (
              <Tooltip title="Manage Requirements">
                <Badge count={record.safetyReqCount} size="small" offset={[0, 8]}>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => handleSafetyReqClick(record)}
                    icon={<FileTextOutlined />}
                    style={{ color: '#722ed1' }}
                  />
                </Badge>
              </Tooltip>
            )}

            {/* Risk Rating */}
            {canRiskRating && (
              <Tooltip title="Set Risk Rating">
                <Badge count={record.riskRatingCount} size="small" offset={[0, 8]}>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => handleRiskRatingClick(record)}
                    icon={<DashboardOutlined />}
                    style={{ color: '#52c41a' }}
                  />
                </Badge>
              </Tooltip>
            )}
            
            {/* Safety Tasks */}
            {onSafetyTaskClick && record.failureName !== 'No failures defined' && record.failureUuid && (
              <Tooltip title="Manage Safety Tasks">
                <Badge count={record.safetyTaskCount} size="small" offset={[0, 8]}>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => handleSafetyTaskClick(record)}
                    icon={<CheckSquareOutlined />}
                    style={{ color: '#1890ff' }}
                  />
                </Badge>
              </Tooltip>
            )}
            
            {/* Delete Action */}
            {onDelete && record.failureName !== 'No failures defined' && !record.isNewRow && record.failureUuid && (
              <Tooltip title="Delete">
                <Popconfirm
                  title="Are you sure you want to delete this item?"
                  onConfirm={() => handleDeleteClick(record)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    danger
                  />
                </Popconfirm>
              </Tooltip>
            )}
          </Space>
        );
      },
    });
  }

  const mergedColumns = tableColumns.map(col => {
    const typedCol = col as SafetyTableColumn;
    if (!typedCol.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record: SafetyTableRow) => ({
        record,
        inputType: typedCol.inputType || 'text',
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
        selectOptions: typedCol.selectOptions,
        multiLine: typedCol.multiLine,
      }),
    };
  });

  const components = {
    header: {
      cell: ResizableTitle,
    },
    body: {
      cell: EditableCell,
    },
  };

  const rowClassName = (record: SafetyTableRow) => {
    const isSelected = isFailureSelected(record.failureUuid || '');
    const selectionState = getFailureSelectionState ? getFailureSelectionState(record.failureUuid || '') : null;
    let classes = 'editable-row';
    if (isSelected) {
      classes += ' selected-row';
    }
    if (selectionState === 'first') {
      classes += ' cause-selected-row';
    } else if (selectionState === 'second') {
      classes += ' effect-selected-row';
    }
    return classes;
  };

  return (
    <Form form={form} component={false}>
      <Table
        components={components}
        bordered
        dataSource={dataSource}
        columns={mergedColumns}
        rowClassName={rowClassName}
        pagination={pagination}
        loading={loading}
        size="small"
        scroll={scroll}
        rowKey="key"
        onRow={(record) => {
          return {
            onClick: (event) => {
              // Prevent row click handler from firing when clicking on an action button
              const target = event.target as HTMLElement;
              if (target.closest('button') || target.closest('a')) {
                return;
              }
              if (onElementClick) {
                onElementClick({
                  type: 'failure',
                  uuid: record.failureUuid ?? '',
                  name: record.failureName,
                  additionalInfo: {
                    description: record.failureDescription,
                    asil: record.asil,
                    component: record.swComponentName,
                  },
                });
              }
            },
          };
        }}
      />
      
      {/* Add CSS for selected row styling and multi-line editing */}
      <style jsx>{`
        :global(.selected-failure-row) {
          background-color: #f0f8ff !important;
        }
        :global(.selected-failure-row:hover) {
          background-color: #e6f3ff !important;
        }
        /* Improve textarea editing experience */
        :global(.ant-table-tbody .ant-form-item-control .ant-input) {
          transition: all 0.3s ease;
        }
        :global(.ant-table-tbody .ant-form-item-control .ant-input:focus) {
          box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
        }
        /* Ensure table cells accommodate textarea height */
        :global(.ant-table-tbody > tr > td) {
          vertical-align: top;
          padding: 8px 16px;
        }
        /* Style for multi-line input in edit mode */
        :global(.ant-table-tbody .ant-form-item) {
          margin-bottom: 0;
        }
      `}</style>
        
        {/* Element Details Modal */}
      <ElementDetailsModal
        isVisible={isModalVisible}
        onClose={handleModalClose}
        elementDetails={selectedElement}
        getFailureSelectionState={getFailureSelectionState}
        handleFailureSelection={handleFailureSelection}
        isCauseSelected={isCauseSelected}
      />
      
      {/* Risk Rating Modal */}
      <RiskRatingModal
        open={isRiskRatingModalVisible}
        onCancel={handleRiskRatingCancel}
        onSave={handleRiskRatingSave}
        failureName={selectedFailureForRiskRating?.failureName || ''}        loading={isRiskRatingSaving}
      />
      
      {/* Delete Confirmation Modal - Removed: Now handled by parent components */}
      
      {/* Safety Notes Modal */}
      <Modal
        title={`Safety Notes - ${selectedFailureForNotes?.failureName}`}
        open={isSafetyNotesModalVisible}
        onCancel={handleSafetyNotesClose}
        footer={null}
        width={800}
        centered
      >
        {selectedFailureForNotes && selectedFailureForNotes.failureUuid ? (
          <SafetyNoteManager
            nodeUuid={selectedFailureForNotes.failureUuid}
            nodeType="Failure Mode"
            nodeName={selectedFailureForNotes.failureName}
            showInline={false}
            onNotesUpdate={refreshData}
          />
        ) : (
          <div>Error: No failure UUID available for safety notes</div>
        )}
      </Modal>
    </Form>
  );
}
