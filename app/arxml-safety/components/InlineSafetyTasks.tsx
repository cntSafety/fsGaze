'use client';

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Button, 
  List, 
  Input, 
  Select, 
  Space, 
  Typography, 
  Popconfirm, 
  message,
  Tag,
  Divider
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  CheckOutlined, 
  CloseOutlined,
  CheckSquareOutlined
} from '@ant-design/icons';
import {
  createSafetyTask,
  updateSafetyTask,
  deleteSafetyTask,
  getSafetyTasksForNode,
  type SafetyTaskData,
  type CreateSafetyTaskInput,
  type SafetyTaskStatus,
  type SafetyTaskType
} from '@/app/services/neo4j/queries/safety/safetyTasks';

const { TextArea } = Input;
const { Text } = Typography;

interface InlineSafetyTasksProps {
  riskRatingUuid?: string; // The risk rating node UUID to link tasks to
  failureName: string;
  compact?: boolean; // For even more compact display
}

const STATUS_COLORS: Record<SafetyTaskStatus, string> = {
  'open': '#faad14',
  'started': '#1890ff',
  'in-review': '#722ed1',
  'finished': '#52c41a'
};

const TASK_TYPE_OPTIONS: { label: string; value: SafetyTaskType }[] = [
  { label: 'Runtime Measures', value: 'runtime measures' },
  { label: 'Dev-time Measures', value: 'dev-time measures' },
  { label: 'Other', value: 'other' }
];

const STATUS_OPTIONS: { label: string; value: SafetyTaskStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Started', value: 'started' },
  { label: 'In Review', value: 'in-review' },
  { label: 'Finished', value: 'finished' }
];

export const InlineSafetyTasks: React.FC<InlineSafetyTasksProps> = ({
  riskRatingUuid,
  failureName,
  compact = false
}) => {
  const [tasks, setTasks] = useState<SafetyTaskData[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Load tasks when risk rating UUID changes
  useEffect(() => {
    if (riskRatingUuid) {
      loadTasks();
    }
  }, [riskRatingUuid]);

  const loadTasks = async () => {
    if (!riskRatingUuid) return;
    
    setLoading(true);
    try {
      const result = await getSafetyTasksForNode(riskRatingUuid);
      if (result.success && result.data) {
        setTasks(result.data);
      } else {
        message.error(result.message || 'Failed to load safety tasks');
      }
    } catch (error) {
      console.error('Error loading safety tasks:', error);
      message.error('Failed to load safety tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (values: CreateSafetyTaskInput) => {
    if (!riskRatingUuid) {
      message.error('No risk rating selected');
      return;
    }

    setLoading(true);
    try {
      const result = await createSafetyTask(riskRatingUuid, values);
      if (result.success) {
        message.success('Safety task created successfully');
        setShowCreateForm(false);
        await loadTasks(); // Reload tasks
      } else {
        message.error(result.message || 'Failed to create safety task');
      }
    } catch (error) {
      console.error('Error creating safety task:', error);
      message.error('Failed to create safety task');
    } finally {
      setLoading(false);
    }
  };
  const handleUpdateTask = async (taskUuid: string, currentTask: SafetyTaskData, updates: Partial<CreateSafetyTaskInput>) => {
    setLoading(true);
    try {
      // Merge the current task data with updates to create a complete object
      const completeTaskData: CreateSafetyTaskInput = {
        name: updates.name ?? currentTask.name,
        description: updates.description ?? currentTask.description,
        taskType: updates.taskType ?? currentTask.taskType,
        status: updates.status ?? currentTask.status,
        responsible: updates.responsible ?? currentTask.responsible,
        reference: updates.reference ?? currentTask.reference ?? ''
      };
      
      const result = await updateSafetyTask(taskUuid, completeTaskData);
      if (result.success) {
        message.success('Safety task updated successfully');
        setEditingTask(null);
        await loadTasks(); // Reload tasks
      } else {
        message.error(result.message || 'Failed to update safety task');
      }
    } catch (error) {
      console.error('Error updating safety task:', error);
      message.error('Failed to update safety task');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskUuid: string) => {
    setLoading(true);
    try {
      const result = await deleteSafetyTask(taskUuid);
      if (result.success) {
        message.success('Safety task deleted successfully');
        await loadTasks(); // Reload tasks
      } else {
        message.error(result.message || 'Failed to delete safety task');
      }
    } catch (error) {
      console.error('Error deleting safety task:', error);
      message.error('Failed to delete safety task');
    } finally {
      setLoading(false);
    }
  };

  const CreateTaskForm: React.FC = () => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [taskType, setTaskType] = useState<SafetyTaskType>('runtime measures');
    const [status, setStatus] = useState<SafetyTaskStatus>('open');
    const [responsible, setResponsible] = useState('');
    const [reference, setReference] = useState('');

    const handleSubmit = async () => {
      if (!name || !description || !responsible) {
        message.error('Please fill in all required fields');
        return;
      }      await handleCreateTask({
        name,
        description,
        taskType,
        status,
        responsible,
        reference: reference || ''
      });

      // Reset form
      setName('');
      setDescription('');
      setTaskType('runtime measures');
      setStatus('open');
      setResponsible('');
      setReference('');
    };

    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Task Name *</label>
            <Input 
              placeholder="Enter task name" 
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Description *</label>
            <TextArea 
              placeholder="Enter task description" 
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <Space direction={compact ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
            <div style={{ minWidth: 120 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Type *</label>
              <Select 
                placeholder="Select type" 
                options={TASK_TYPE_OPTIONS}
                value={taskType}
                onChange={setTaskType}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ minWidth: 100 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Status *</label>
              <Select 
                options={STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
                style={{ width: '100%' }}
              />
            </div>
          </Space>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Responsible *</label>
            <Input 
              placeholder="Enter responsible person"
              value={responsible}
              onChange={e => setResponsible(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Reference</label>
            <Input 
              placeholder="Enter reference (optional)"
              value={reference}
              onChange={e => setReference(e.target.value)}
            />
          </div>

          <Space style={{ marginTop: '16px' }}>
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={loading}
              icon={<CheckOutlined />}
              size="small"
            >
              Create Task
            </Button>
            <Button
              onClick={() => setShowCreateForm(false)}
              icon={<CloseOutlined />}
              size="small"
            >
              Cancel
            </Button>
          </Space>
        </div>
      </Card>
    );
  };

  const EditTaskForm: React.FC<{ task: SafetyTaskData }> = ({ task }) => {
    const [name, setName] = useState(task.name);
    const [description, setDescription] = useState(task.description);
    const [taskType, setTaskType] = useState<SafetyTaskType>(task.taskType);
    const [status, setStatus] = useState<SafetyTaskStatus>(task.status);
    const [responsible, setResponsible] = useState(task.responsible);
    const [reference, setReference] = useState(task.reference || '');

    const handleSubmit = async () => {
      if (!name || !description || !responsible) {
        message.error('Please fill in all required fields');
        return;
      }      await handleUpdateTask(task.uuid, task, {
        name,
        description,
        taskType,
        status,
        responsible,
        reference: reference || ''
      });
    };

    return (
      <Card size="small" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Task Name *</label>
            <Input 
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Description *</label>
            <TextArea 
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <Space direction={compact ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
            <div style={{ minWidth: 120 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Type *</label>
              <Select 
                options={TASK_TYPE_OPTIONS}
                value={taskType}
                onChange={setTaskType}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ minWidth: 100 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Status *</label>
              <Select 
                options={STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
                style={{ width: '100%' }}
              />
            </div>
          </Space>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Responsible *</label>
            <Input 
              value={responsible}
              onChange={e => setResponsible(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Reference</label>
            <Input 
              value={reference}
              onChange={e => setReference(e.target.value)}
            />
          </div>

          <Space style={{ marginTop: '16px' }}>
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={loading}
              icon={<CheckOutlined />}
              size="small"
            >
              Save
            </Button>
            <Button
              onClick={() => setEditingTask(null)}
              icon={<CloseOutlined />}
              size="small"
            >
              Cancel
            </Button>
          </Space>
        </div>
      </Card>
    );
  };

  const renderTaskItem = (task: SafetyTaskData) => {
    if (editingTask === task.uuid) {
      return <EditTaskForm key={task.uuid} task={task} />;
    }

    return (
      <List.Item
        key={task.uuid}
        actions={[
          <Button
            key="edit"
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditingTask(task.uuid)}
          />,
          <Popconfirm
            key="delete"
            title="Delete this task?"
            onConfirm={() => handleDeleteTask(task.uuid)}
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
        ]}
      >
        <List.Item.Meta
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong>{task.name}</Text>
              <Tag color={STATUS_COLORS[task.status]}>{task.status}</Tag>
              <Tag>{task.taskType}</Tag>
            </div>
          }
          description={
            <div>
              <Text>{task.description}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Responsible: {task.responsible}
                {task.reference && ` | Reference: ${task.reference}`}
              </Text>
            </div>
          }
        />
      </List.Item>
    );
  };

  if (!riskRatingUuid) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <CheckSquareOutlined style={{ fontSize: '24px', color: '#d9d9d9' }} />
        <br />
        <Text type="secondary">Save the risk rating first to manage safety tasks</Text>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong>Safety Tasks for Risk Rating</Text>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setShowCreateForm(!showCreateForm)}
          disabled={loading}
        >
          Add Task
        </Button>
      </div>

      {showCreateForm && <CreateTaskForm />}

      {tasks.length > 0 ? (
        <List
          size="small"
          dataSource={tasks}
          renderItem={renderTaskItem}
          loading={loading}
        />
      ) : (
        !loading && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <CheckSquareOutlined style={{ fontSize: '24px', color: '#d9d9d9' }} />
            <br />
            <Text type="secondary">No safety tasks yet</Text>
            {!showCreateForm && (
              <>
                <br />
                <Button
                  type="link"
                  size="small"
                  onClick={() => setShowCreateForm(true)}
                >
                  Create the first task
                </Button>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
};

export default InlineSafetyTasks;
