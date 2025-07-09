'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Table, Tag, Spin, Alert, Input, Button, Space } from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { getAllSafetyTasks, SafetyTaskData, SafetyTaskStatus } from '@/app/services/neo4j/queries/safety/safetyTasks';
import Link from 'next/link';
import { SearchOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';
import type { FilterConfirmProps } from 'antd/es/table/interface';

const statusColors: { [key in SafetyTaskStatus]: string } = {
  open: 'blue',
  started: 'orange',
  'in-review': 'purple',
  finished: 'green',
};

const SafetyTaskList: React.FC = () => {
  const [tasks, setTasks] = useState<SafetyTaskData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef<InputRef>(null);

  useEffect(() => {
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

    fetchTasks();
  }, []);

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

  const columns: ColumnsType<SafetyTaskData> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      width: 300,
      ...getColumnSearchProps('name'),
      render: (text) => <strong style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</strong>,
    },
    {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        width: 700,
        ...getColumnSearchProps('description'),
        render: (text) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>,
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
    },
    {
      title: 'Related Component',
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
    },
    {
        title: 'Reference',
        dataIndex: 'reference',
        key: 'reference',
        ...getColumnSearchProps('reference'),
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
  ];

  if (loading) {
    return <Spin tip="Loading safety tasks..." />;
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon />;
  }

  return (
    <>
    <Table
      columns={columns}
      dataSource={tasks}
      rowKey="uuid"
      scroll={{ x: 'max-content' }}
      size="small"
      pagination={false}
    />
    </>
  );
};

export default SafetyTaskList;