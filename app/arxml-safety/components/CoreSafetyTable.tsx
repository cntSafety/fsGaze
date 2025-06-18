'use client';

import React, { useState } from 'react';
import { Table, Form, Input, Select, Popconfirm, Button, Space, Tooltip } from 'antd';
import { SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, LinkOutlined, DashboardOutlined } from '@ant-design/icons';
import type { TableProps, ColumnType } from 'antd/es/table';
import type { FormInstance } from 'antd/es/form';
import type { FilterDropdownProps } from 'antd/es/table/interface';
import { Resizable } from 'react-resizable';
import ElementDetailsModal, { ElementDetails } from './ElementDetailsModal';
import RiskRatingModal from './RiskRatingModal';

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
  columns: SafetyTableColumn[];
  loading?: boolean;
  editingKey: string;
  onEdit?: (record: SafetyTableRow) => void;
  onSave?: (key: React.Key) => Promise<void>;
  onCancel?: () => void;  onAdd?: (swComponentUuid: string, swComponentName: string) => void;
  onDelete?: (record: SafetyTableRow) => Promise<void>;
  onRiskRating?: (failureUuid: string, severity: number, occurrence: number, detection: number) => Promise<void>;
  onRiskRatingClick?: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>; // New enhanced handler
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
  // New prop for element click callback
  onElementClick?: (element: ElementDetails) => void;
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
  onDelete,
  onRiskRating,
  onRiskRatingClick,
  isSaving = false,
  pagination = { pageSize: 10 },
  showComponentActions = false,
  form,
  onFailureSelect,
  selectedFailures,
  onElementClick,
}: CoreSafetyTableProps) {
  const isEditing = (record: SafetyTableRow) => record.key === editingKey;
    // Modal state management
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementDetails | null>(null);
  
  // Risk rating modal state
  const [isRiskRatingModalVisible, setIsRiskRatingModalVisible] = useState(false);
  const [selectedFailureForRiskRating, setSelectedFailureForRiskRating] = useState<SafetyTableRow | null>(null);
  const [isRiskRatingSaving, setIsRiskRatingSaving] = useState(false);
  
  // Helper function to check if a failure is selected
  const isFailureSelected = (failureUuid: string) => {
    return selectedFailures?.first?.uuid === failureUuid || 
           selectedFailures?.second?.uuid === failureUuid;
  };

  // Helper function to get selection state for visual feedback
  const getFailureSelectionState = (failureUuid: string) => {
    if (selectedFailures?.first?.uuid === failureUuid) return 'first';
    if (selectedFailures?.second?.uuid === failureUuid) return 'second';
    return null;
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
      default: return { backgroundColor: '#fafafa', color: '#666', border: '1px solid #d9d9d9' };
    }
  };

  // Build table columns from configuration
  const tableColumns: ColumnType<SafetyTableRow>[] = columns.map((col, index) => {
    const baseColumn: ColumnType<SafetyTableRow> = {
      title: col.title,
      dataIndex: col.dataIndex,
      key: col.key,
      width: columnWidths[col.key] || col.width,
      minWidth: col.minWidth,
      ellipsis: col.ellipsis || (col.dataIndex === 'failureDescription'), // Default ellipsis for description columns
      render: col.render,
      onHeaderCell: () => ({
        width: columnWidths[col.key] || col.width,
        onResize: handleResize(index, col.key),
      } as any),
    };

    // Add tooltip for ellipsis columns
    if (baseColumn.ellipsis && !col.render) {
      baseColumn.ellipsis = {
        showTitle: true,
      };
    }

    // Add search functionality if enabled
    if (col.searchable) {
      Object.assign(baseColumn, getColumnSearchProps(col.dataIndex));
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
        const isPortColumn = col.key === 'portName';
        
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
        const isPortColumn = col.key === 'portName';
        
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

    // Handle editable columns
    if (col.editable) {
      baseColumn.onCell = (record: SafetyTableRow) => ({
        record,
        inputType: col.inputType || 'text',
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
        selectOptions: col.selectOptions,
        multiLine: col.multiLine || false,
      });
    }    return baseColumn;
  });

  // Add actions column if handlers are provided
  if (onEdit || onSave || onCancel || onAdd || onDelete || onFailureSelect || onRiskRating || onRiskRatingClick) {
    tableColumns.push({
      title: 'Actions',
      dataIndex: 'actions',
      key: 'actions',
      width: columnWidths['actions'] || (onFailureSelect || onRiskRating || onRiskRatingClick ? 180 : 120), // Wider if link or risk rating icons are present
      onHeaderCell: () => ({
        width: columnWidths['actions'] || (onFailureSelect || onRiskRating || onRiskRatingClick ? 180 : 120),
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
        
        const selectionState = canLink ? getFailureSelectionState(record.failureUuid!) : null;
        
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
                open={editingKey === '' ? undefined : false}
              >
                <Button 
                  type={selectionState ? "primary" : "text"}
                  size="small"
                  disabled={editingKey !== ''} 
                  onClick={() => handleLinkClick(record)}
                  icon={<LinkOutlined />}
                  style={{
                    backgroundColor: selectionState === 'first' ? '#1890ff' : 
                                   selectionState === 'second' ? '#ff7875' : undefined,
                    borderColor: selectionState === 'first' ? '#1890ff' : 
                               selectionState === 'second' ? '#ff7875' : undefined,
                    color: selectionState ? '#fff' : undefined
                  }}
                />              </Tooltip>
            )}
            
            {/* Risk Rating Icon */}
            {canRiskRating && (
              <Tooltip title="Set Risk Rating">
                <Button 
                  type="text"
                  size="small"
                  disabled={editingKey !== ''} 
                  onClick={() => handleRiskRatingClick(record)}
                  icon={<DashboardOutlined />}
                  style={{ color: '#52c41a' }}
                />
              </Tooltip>
            )}
            
            {onEdit && record.failureName !== 'No failures defined' && (
              <Button 
                type="text"
                size="small"
                disabled={editingKey !== ''} 
                onClick={() => onEdit(record)}
                icon={<EditOutlined />}
                title="Edit"
              />
            )}
            {onDelete && record.failureName !== 'No failures defined' && !record.isNewRow && record.failureUuid && (
              <Popconfirm 
                title="Are you sure you want to delete this failure?"
                onConfirm={() => onDelete(record)}
                okText="Yes, Delete"
                cancelText="Cancel"
                okType="danger"
              >
                <Button 
                  type="text"
                  size="small"
                  disabled={editingKey !== ''} 
                  icon={<DeleteOutlined />}
                  danger
                  title="Delete"
                />
              </Popconfirm>
            )}
            {onAdd && isFirstRowForComponent && record.swComponentUuid && record.swComponentName && (
              <Button 
                type="text"
                size="small"
                disabled={editingKey !== ''} 
                onClick={() => onAdd(record.swComponentUuid!, record.swComponentName!)}
                icon={<PlusOutlined />}
                title="Add Failure"
              />
            )}
          </Space>
        );
      },
    });
  }

  const mergedColumns = tableColumns.map((col) => {
    if (!col.onCell) {
      return col;
    }
    return {
      ...col,
      onCell: col.onCell,
    };
  });

  return (
    <Form form={form} component={false}>
      <Table<SafetyTableRow>
        components={{
          header: {
            cell: ResizableTitle,
          },
          body: {
            cell: EditableCell,
          },
        }}
        bordered
        dataSource={dataSource}
        columns={mergedColumns}
        rowClassName={(record) => {
          // Add visual feedback for selected rows
          const isSelected = record.failureUuid && isFailureSelected(record.failureUuid);
          return `editable-row ${isSelected ? 'selected-failure-row' : ''}`;
        }}
        pagination={pagination}
        loading={loading}
        size="small"
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
      />
      
      {/* Risk Rating Modal */}
      <RiskRatingModal
        visible={isRiskRatingModalVisible}
        onCancel={handleRiskRatingCancel}
        onSave={handleRiskRatingSave}
        failureName={selectedFailureForRiskRating?.failureName || ''}        loading={isRiskRatingSaving}
      />
    </Form>
  );
}
