'use client';

import React, { useState } from 'react';
import { Table, Form, Input, Select, Typography, Popconfirm, Button, Space } from 'antd';
import { SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableProps, ColumnType } from 'antd/es/table';
import type { FilterDropdownProps } from 'antd/es/table/interface';
import { Resizable } from 'react-resizable';

const { Option } = Select;

// Resizable column title component
const ResizableTitle = (props: any) => {
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
      onResize={onResize}
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
  render?: (text: any, record: SafetyTableRow, index: number) => React.ReactNode;
  inputType?: 'text' | 'select';
  selectOptions?: Array<{ value: string; label: string }>;
  width?: string | number;
  ellipsis?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
  editing: boolean;
  dataIndex: string;
  title: any;
  inputType: 'text' | 'select';
  record: SafetyTableRow;
  index: number;
  selectOptions?: Array<{ value: string; label: string }>;
}

const EditableCell: React.FC<React.PropsWithChildren<EditableCellProps>> = ({
  editing,
  dataIndex,
  title,
  inputType,
  record,
  index,
  selectOptions,
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
  onCancel?: () => void;
  onAdd?: (swComponentUuid: string, swComponentName: string) => void;
  onDelete?: (record: SafetyTableRow) => Promise<void>;
  isSaving?: boolean;
  pagination?: false | TableProps<SafetyTableRow>['pagination'];
  showComponentActions?: boolean;
  form?: any;
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
  columns,
  loading = false,
  editingKey,
  onEdit,
  onSave,
  onCancel,
  onAdd,
  onDelete,
  isSaving = false,
  pagination = { pageSize: 10 },
  showComponentActions = false,
  form,
}: CoreSafetyTableProps) {
  const isEditing = (record: SafetyTableRow) => record.key === editingKey;
  
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
  const handleResize = (index: number, columnKey: string) => (e: any, { size }: any) => {
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

    // Special rendering for component names with actions
    if (col.dataIndex === 'swComponentName' && showComponentActions && !col.render) {
      baseColumn.render = (text: string, record: SafetyTableRow, index: number) => {
        const isFirstRowForComponent = index === 0 || 
          dataSource[index - 1]?.swComponentUuid !== record.swComponentUuid;
        
        return isFirstRowForComponent ? col.render ? col.render(text, record, index) : (
          <span style={{ fontWeight: 'bold' }}>{text}</span>
        ) : null;
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
      });
    }

    return baseColumn;
  });

  // Add actions column if handlers are provided
  if (onEdit || onSave || onCancel || onAdd || onDelete) {
    tableColumns.push({
      title: 'Actions',
      dataIndex: 'actions',
      key: 'actions',
      width: columnWidths['actions'] || 120, // Use resizable width
      onHeaderCell: () => ({
        width: columnWidths['actions'] || 120,
        onResize: handleResize(columns.length, 'actions'),
      } as any),
      render: (_: any, record: SafetyTableRow, index: number) => {
        const editable = isEditing(record);
        const isFirstRowForComponent = showComponentActions && (index === 0 || 
          dataSource[index - 1]?.swComponentUuid !== record.swComponentUuid);
        
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
        rowClassName="editable-row"
        pagination={pagination}
        loading={loading}
        size="small"
      />
    </Form>
  );
}
