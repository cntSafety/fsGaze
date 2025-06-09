'use client';

import React, { useState } from 'react';
import { Table, Form, Input, Select, Typography, Popconfirm, Button, Space } from 'antd';
import { SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import type { TableProps, ColumnType } from 'antd/es/table';
import type { FilterDropdownProps } from 'antd/es/table/interface';

const { Option } = Select;

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
  pagination?: boolean | TableProps<SafetyTableRow>['pagination'];
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
  const tableColumns: ColumnType<SafetyTableRow>[] = columns.map((col) => {
    const baseColumn: ColumnType<SafetyTableRow> = {
      title: col.title,
      dataIndex: col.dataIndex,
      key: col.key,
      width: col.width,
      render: col.render,
    };

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
      render: (_: any, record: SafetyTableRow, index: number) => {
        const editable = isEditing(record);
        const isFirstRowForComponent = showComponentActions && (index === 0 || 
          dataSource[index - 1]?.swComponentUuid !== record.swComponentUuid);
        
        return editable ? (
          <span>
            {onSave && (
              <Typography.Link 
                onClick={() => onSave(record.key)} 
                style={{ marginInlineEnd: 8 }}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Typography.Link>
            )}
            {onCancel && (
              <Popconfirm title="Sure to cancel?" onConfirm={onCancel}>
                <Typography.Link disabled={isSaving}>Cancel</Typography.Link>
              </Popconfirm>
            )}
          </span>
        ) : (
          <span>
            {onEdit && record.failureName !== 'No failures defined' && (
              <Typography.Link 
                disabled={editingKey !== ''} 
                onClick={() => onEdit(record)}
                style={{ marginInlineEnd: 8 }}
              >
                Edit
              </Typography.Link>
            )}
            {onDelete && record.failureName !== 'No failures defined' && !record.isNewRow && record.failureUuid && (
              <Popconfirm 
                title="Are you sure you want to delete this failure?"
                onConfirm={() => onDelete(record)}
                okText="Yes, Delete"
                cancelText="Cancel"
                okType="danger"
              >
                <Typography.Link 
                  disabled={editingKey !== ''} 
                  style={{ marginInlineEnd: 8, color: '#ff4d4f' }}
                >
                  <DeleteOutlined /> Delete
                </Typography.Link>
              </Popconfirm>
            )}
            {onAdd && isFirstRowForComponent && record.swComponentUuid && record.swComponentName && (
              <Typography.Link 
                disabled={editingKey !== ''} 
                onClick={() => onAdd(record.swComponentUuid!, record.swComponentName!)}
              >
                + Add Failure
              </Typography.Link>
            )}
          </span>
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
        scroll={{ x: 800 }}
      />
    </Form>
  );
}
