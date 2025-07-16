'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Table, Tag, Spin, Alert, Input, Button, Space, Form, Select, message } from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { getAllSafetyTasks, updateSafetyTask, SafetyTaskData, SafetyTaskStatus, CreateSafetyTaskInput, SafetyTaskType } from '@/app/services/neo4j/queries/safety/safetyTasks';
import Link from 'next/link';
import { SearchOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';
import type { FilterConfirmProps } from 'antd/es/table/interface';

const { Option } = Select;

const statusColors: { [key in SafetyTaskStatus]: string } = {
  open: 'blue',
  started: 'orange',
  'in-review': 'purple',
  finished: 'green',
};

interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
    editing: boolean;
    dataIndex: keyof CreateSafetyTaskInput;
    title: any;
    inputType: 'text' | 'textarea' | 'select';
    children: React.ReactNode;
}

const EditableCell: React.FC<EditableCellProps> = ({
    editing,
    dataIndex,
    title,
    inputType,
    children,
    ...restProps
}) => {
    const getInput = () => {
        if (inputType === 'select') {
            if (dataIndex === 'status') {
                const statuses: SafetyTaskStatus[] = ['open', 'started', 'in-review', 'finished'];
                return (
                    <Select placeholder="Select a status">
                        {statuses.map(s => <Option key={s} value={s}>{s}</Option>)}
                    </Select>
                );
            }
            if (dataIndex === 'taskType') {
                const types: SafetyTaskType[] = ['runtime measures', 'dev-time measures', 'other'];
                return (
                    <Select placeholder="Select a type">
                        {types.map(t => <Option key={t} value={t}>{t}</Option>)}
                    </Select>
                );
            }
        }
        if (inputType === 'textarea') {
            return <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />;
        }
        return <Input />;
    };

    return (
        <td {...restProps}>
            {editing ? (
                <Form.Item
                    name={dataIndex}
                    style={{ margin: 0 }}
                    rules={[{ required: true, message: `Please Input ${title}!` }]}
                >
                    {getInput()}
                </Form.Item>
            ) : (
                children
            )}
        </td>
    );
};

const SafetyTaskList: React.FC = () => {
  const [tasks, setTasks] = useState<SafetyTaskData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef<InputRef>(null);
  const [form] = Form.useForm();
  const [editingKey, setEditingKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const result = await getAllSafetyTasks();
      if (result.success && result.data) {
        setTasks(result.data);
      } else {
        setError(result.message || 'Failed to fetch safety tasks');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const isEditing = (record: SafetyTaskData) => record.uuid === editingKey;

  const edit = (record: Partial<SafetyTaskData> & { uuid: React.Key }) => {
    form.setFieldsValue({ ...record });
    setEditingKey(record.uuid as string);
  };

  const cancel = () => {
    setEditingKey('');
  };

  const save = async (key: React.Key) => {
    try {
      setIsSaving(true);
      const row = (await form.validateFields()) as CreateSafetyTaskInput;
      const result = await updateSafetyTask(key as string, row);

      if (result.success) {
        message.success('Safety task updated successfully.');
        setEditingKey('');
        fetchTasks();
      } else {
        message.error(result.message || 'Failed to update safety task.');
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
      message.error('Validation failed. Please check the fields.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSearch = (
    selectedKeys: string[],
    confirm: (param?: FilterConfirmProps) => void,
    dataIndex: keyof SafetyTaskData,
  ) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex as string);
  };

  const handleReset = (clearFilters: () => void) => {
    clearFilters();
    setSearchText('');
  };

  const getColumnSearchProps = (dataIndex: keyof SafetyTaskData): ColumnType<SafetyTaskData> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters)}
            size="small"
            style={{ width: 90 }}
          >
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
    ),
    onFilter: (value, record) =>
      record[dataIndex]
        ? record[dataIndex]!.toString().toLowerCase().includes((value as string).toLowerCase())
        : false,
    onFilterDropdownOpenChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
  });

  const columns: (ColumnType<SafetyTaskData> & { editable?: boolean; inputType?: string })[] = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      width: 200,
      ...getColumnSearchProps('name'),
      render: (text) => <strong style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</strong>,
      editable: true,
      inputType: 'text',
    },
    {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        width: 300,
        ...getColumnSearchProps('description'),
        render: (text) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>,
        editable: true,
        inputType: 'textarea',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: SafetyTaskStatus) => (
        <Tag color={statusColors[status]} key={status}>
          {status.toUpperCase()}
        </Tag>
      ),
      filters: [
        { text: 'Open', value: 'open' },
        { text: 'Started', value: 'started' },
        { text: 'In Review', value: 'in-review' },
        { text: 'Finished', value: 'finished' },
      ],
      onFilter: (value, record) => record.status === value,
      editable: true,
      inputType: 'select',
    },
    {
        title: 'Task Type',
        dataIndex: 'taskType',
        key: 'taskType',
        filters: [
            { text: 'Runtime Measures', value: 'runtime measures' },
            { text: 'Dev-time Measures', value: 'dev-time measures' },
            { text: 'Other', value: 'other' },
        ],
        onFilter: (value, record) => record.taskType === value,
        editable: true,
        inputType: 'select',
    },
    {
      title: 'Related Component or Port',
      dataIndex: 'relatedComponentName',
      key: 'relatedComponentName',
      ...getColumnSearchProps('relatedComponentName'),
      render: (text, record) => {
        if (record.relatedComponentUuid && record.relatedComponentName) {
          return (
            <Link href={`/arxml-safety/${record.relatedComponentUuid}`}>
              {record.relatedComponentName}
            </Link>
          );
        }
        return 'N/A';
      },
    },
    {
      title: 'Related FM',
      dataIndex: 'relatedFailureModeName',
      key: 'relatedFailureModeName',
      ...getColumnSearchProps('relatedFailureModeName'),
      render: (text) => text || 'N/A',
    },
    {
      title: 'Responsible',
      dataIndex: 'responsible',
      key: 'responsible',
      sorter: (a, b) => a.responsible.localeCompare(b.responsible),
      ...getColumnSearchProps('responsible'),
      editable: true,
      inputType: 'text',
    },
    {
        title: 'Reference',
        dataIndex: 'reference',
        key: 'reference',
        ...getColumnSearchProps('reference'),
        editable: true,
        inputType: 'text',
    },
    {
      title: 'Created',
      dataIndex: 'created',
      key: 'created',
      sorter: (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
      render: (date: string) => new Date(date).toLocaleDateString(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Last Modified',
      dataIndex: 'lastModified',
      key: 'lastModified',
      sorter: (a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime(),
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
        title: 'Actions',
        dataIndex: 'actions',
        fixed: 'right' as 'right',
        width: 150,
        render: (_: any, record: SafetyTaskData) => {
            const editable = isEditing(record);
            return editable ? (
                <Space>
                    <Button onClick={() => save(record.uuid)} type="primary" loading={isSaving} size="small">
                        Save
                    </Button>
                    <Button onClick={cancel} size="small">Cancel</Button>
                </Space>
            ) : (
                <Button disabled={editingKey !== ''} onClick={() => edit(record)} size="small">
                    Edit
                </Button>
            );
        },
    },
  ];

  const mergedColumns = columns.map(col => {
    if (!col.editable) {
        return col;
    }
    return {
        ...col,
        onCell: (record: SafetyTaskData) => ({
            record,
            inputType: col.inputType,
            dataIndex: col.dataIndex,
            title: col.title,
            editing: isEditing(record),
        }),
    };
  });

  if (loading) {
    return <Spin tip="Loading safety tasks..." />;
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon />;
  }

  return (
    <>
    <Form form={form} component={false}>
      <Table
        components={{
            body: {
                cell: EditableCell,
            },
        }}
        columns={mergedColumns}
        dataSource={tasks}
        rowKey="uuid"
        scroll={{ x: 'max-content' }}
        size="small"
        pagination={{
            onChange: cancel,
        }}
        loading={loading || isSaving}
      />
    </Form>
    </>
  );
};

export default SafetyTaskList;