'use client';

import React, { useEffect, useState } from 'react';
import { Table, Tag, Spin, Alert, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getAllSafetyTasks, SafetyTaskData, SafetyTaskStatus } from '@/app/services/neo4j/queries/safety/safetyTasks';
import Link from 'next/link';

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
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<SafetyTaskData | null>(null);

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

  const handleRowClick = (record: SafetyTaskData) => {
    if (record.relatedFailureModeName) {
      setSelectedTask(record);
      setIsModalVisible(true);
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedTask(null);
  };

  const columns: ColumnsType<SafetyTaskData> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      ellipsis: true,
    },
    {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
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
      title: 'Responsible',
      dataIndex: 'responsible',
      key: 'responsible',
      sorter: (a, b) => a.responsible.localeCompare(b.responsible),
    },
    {
        title: 'Reference',
        dataIndex: 'reference',
        key: 'reference',
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
      onRow={(record) => {
        return {
          onClick: () => handleRowClick(record),
        };
      }}
    />
    {selectedTask && (
        <Modal
          title="Related Failure Mode Details"
          open={isModalVisible}
          onCancel={handleCancel}
          footer={null}
        >
          <p><strong>Name:</strong> {selectedTask.relatedFailureModeName}</p>
          <p><strong>UUID:</strong> {selectedTask.relatedFailureModeUuid}</p>
        </Modal>
      )}
    </>
  );
};

export default SafetyTaskList; 