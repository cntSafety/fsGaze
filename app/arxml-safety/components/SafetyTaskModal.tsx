'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Button, Space, Typography, Divider, Input, Tabs, Popconfirm, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, ClockCircleOutlined, EditOutlined, CheckSquareOutlined, UserOutlined, LinkOutlined } from '@ant-design/icons';
import { SafetyTaskData, SafetyTaskStatus, SafetyTaskType } from '@/app/services/neo4j/queries/safety/safetyTasks';

const { Option } = Select;
const { Text } = Typography;
const { TextArea } = Input;

// Status color mapping
const getStatusColor = (status: SafetyTaskStatus): string => {
  switch (status) {
    case 'open': return '#fa8c16'; // Orange
    case 'started': return '#1890ff'; // Blue
    case 'in-review': return '#722ed1'; // Purple
    case 'finished': return '#52c41a'; // Green
    default: return '#8c8c8c'; // Gray
  }
};

// Task type color mapping
const getTaskTypeColor = (taskType: SafetyTaskType): string => {
  switch (taskType) {
    case 'runtime measures': return '#ff4d4f'; // Red
    case 'dev-time measures': return '#1890ff'; // Blue
    case 'other': return '#8c8c8c'; // Gray
    default: return '#8c8c8c';
  }
};

// Status Progress Component
const StatusProgress: React.FC<{ status: SafetyTaskStatus }> = ({ status }) => {
  const statuses: SafetyTaskStatus[] = ['open', 'started', 'in-review', 'finished'];
  const currentIndex = statuses.indexOf(status);
  
  return (
    <div style={{ width: '100%', marginTop: '8px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <Text strong style={{ color: getStatusColor(status) }}>
          Status: {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
        <Text type="secondary">
          Progress: {currentIndex + 1}/4
        </Text>
      </div>
      
      {/* Progress Bar */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${((currentIndex + 1) / 4) * 100}%`,
          height: '100%',
          backgroundColor: getStatusColor(status),
          borderRadius: '4px',
          transition: 'all 0.3s ease'
        }} />
      </div>
      
      {/* Status Labels */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginTop: '4px',
        fontSize: '12px'
      }}>
        {statuses.map((s, index) => (
          <Text 
            key={s}
            style={{ 
              color: index <= currentIndex ? getStatusColor(s) : '#d9d9d9',
              fontWeight: index === currentIndex ? 'bold' : 'normal'
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Text>
        ))}
      </div>
    </div>
  );
};

interface SafetyTaskModalProps {
  open: boolean;
  onCancel: () => void;
  onSave?: (taskData: Omit<SafetyTaskData, 'uuid' | 'created' | 'lastModified'>) => Promise<void>;
  onOk?: (values: Omit<SafetyTaskData, 'uuid' | 'created' | 'lastModified'>) => Promise<void>;
  onCreateNew?: () => void;
  onDelete?: () => Promise<void>;
  nodeName: string;
  nodeDescription?: string;
  loading?: boolean;
  mode?: 'create' | 'edit' | 'tabs';
  activeTask?: SafetyTaskData | null;
  existingTasks?: SafetyTaskData[];
  activeTabIndex?: number;
  onTabChange?: (index: number) => void;
}

interface SafetyTaskFormData {
  name: string;
  description: string;
  status: SafetyTaskStatus;
  responsible: string;
  reference: string;
  taskType: SafetyTaskType;
}

const SafetyTaskModal: React.FC<SafetyTaskModalProps> = ({
  open: visible,
  onCancel,
  onSave,
  onOk,
  onCreateNew,
  onDelete,
  nodeName,
  nodeDescription,
  loading = false,
  mode = 'create',
  activeTask = null,
  existingTasks = [],
  activeTabIndex = 0,
  onTabChange
}) => {
  const [form] = Form.useForm<SafetyTaskFormData>();
  const [formValues, setFormValues] = useState<Partial<SafetyTaskFormData>>({});

  // Effect to populate form when editing existing task
  useEffect(() => {
    if (mode === 'edit' || mode === 'tabs') {
      if (activeTask) {
        const values = {
          name: activeTask.name,
          description: activeTask.description,
          status: activeTask.status,
          responsible: activeTask.responsible,
          reference: activeTask.reference,
          taskType: activeTask.taskType
        };
        form.setFieldsValue(values);
        setFormValues(values);
      }
    } else {
      // Reset form for create mode
      form.resetFields();
      setFormValues({});
    }
  }, [form, mode, activeTask]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      // Support both old onSave and new onOk interfaces
      if (onOk) {
        await onOk(values);
      } else if (onSave) {
        await onSave(values);
      }
      
      // Reset form
      form.resetFields();
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'create':
        return 'Create Safety Task';
      case 'edit':
        return 'Edit Safety Task';
      case 'tabs':
        return 'Safety Tasks';
      default:
        return 'Safety Task';
    }
  };

  const renderFormContent = () => {
    return (
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onValuesChange={(changedValues, allValues) => {
          setFormValues(allValues);
        }}
      >
        <Form.Item
          name="name"
          label={<span style={{ fontWeight: 'bold' }}>Task Name</span>}
          rules={[
            { required: true, message: 'Please enter a task name' },
            { max: 100, message: 'Task name cannot exceed 100 characters' }
          ]}
        >
          <Input
            placeholder="Enter task name..."
            showCount
            maxLength={100}
          />
        </Form.Item>

        <Form.Item
          name="description"
          label={<span style={{ fontWeight: 'bold' }}>Description</span>}
          rules={[
            { required: true, message: 'Please enter a task description' },
            { max: 500, message: 'Description cannot exceed 500 characters' }
          ]}
        >
          <TextArea
            placeholder="Describe the safety task in detail..."
            rows={4}
            showCount
            maxLength={500}
          />
        </Form.Item>

        <Divider />

        <Form.Item
          name="taskType"
          label={<span style={{ fontWeight: 'bold' }}>Task Type</span>}
          rules={[{ required: true, message: 'Please select a task type' }]}
        >
          <Select
            placeholder="Select task type"
            style={{ width: '100%' }}
          >
            <Option value="runtime measures">
              <span style={{ color: getTaskTypeColor('runtime measures'), fontWeight: 'bold' }}>
                Runtime Measures
              </span>
            </Option>
            <Option value="dev-time measures">
              <span style={{ color: getTaskTypeColor('dev-time measures'), fontWeight: 'bold' }}>
                Dev-time Measures
              </span>
            </Option>
            <Option value="other">
              <span style={{ color: getTaskTypeColor('other'), fontWeight: 'bold' }}>
                Other
              </span>
            </Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="status"
          label={<span style={{ fontWeight: 'bold' }}>Status</span>}
          rules={[{ required: true, message: 'Please select a status' }]}
        >
          <Select
            placeholder="Select status"
            style={{ width: '100%' }}
          >
            <Option value="open">
              <Tag color={getStatusColor('open')}>Open</Tag>
            </Option>
            <Option value="started">
              <Tag color={getStatusColor('started')}>Started</Tag>
            </Option>
            <Option value="in-review">
              <Tag color={getStatusColor('in-review')}>In Review</Tag>
            </Option>
            <Option value="finished">
              <Tag color={getStatusColor('finished')}>Finished</Tag>
            </Option>
          </Select>
        </Form.Item>

        {/* Status Progress Display */}
        {formValues.status && (
          <Form.Item label={<span style={{ fontWeight: 'bold' }}>Progress Visualization</span>}>
            <div style={{ 
              padding: '16px', 
              backgroundColor: '#fafafa', 
              borderRadius: '8px',
              border: '1px solid #d9d9d9'
            }}>
              <StatusProgress status={formValues.status} />
            </div>
          </Form.Item>
        )}

        <Divider />

        <Form.Item
          name="responsible"
          label={<span style={{ fontWeight: 'bold' }}>Responsible Person</span>}
          rules={[
            { required: true, message: 'Please enter the responsible person' },
            { max: 100, message: 'Responsible person cannot exceed 100 characters' }
          ]}
        >
          <Input
            placeholder="Enter responsible person name..."
            prefix={<UserOutlined style={{ color: '#8c8c8c' }} />}
            showCount
            maxLength={100}
          />
        </Form.Item>

        <Form.Item
          name="reference"
          label={<span style={{ fontWeight: 'bold' }}>Reference</span>}
          rules={[
            { required: true, message: 'Please enter a reference' },
            { max: 200, message: 'Reference cannot exceed 200 characters' }
          ]}
        >
          <Input
            placeholder="Enter reference (document, ID, URL, etc.)..."
            prefix={<LinkOutlined style={{ color: '#8c8c8c' }} />}
            showCount
            maxLength={200}
          />
        </Form.Item>
      </Form>
    );
  };

  const renderModalContent = () => {
    if (mode === 'tabs' && existingTasks.length > 1) {
      const tabItems = existingTasks.map((task, index) => ({
        key: index.toString(),
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag color={getStatusColor(task.status)} size="small">
              {task.status}
            </Tag>
            <span>{task.name}</span>
          </div>
        ),
        children: renderFormContent()
      }));

      return (
        <Tabs
          activeKey={activeTabIndex.toString()}
          onChange={(key) => onTabChange && onTabChange(parseInt(key))}
          items={tabItems}
        />
      );
    }
    
    return renderFormContent();
  };

  const getModalFooter = () => {
    const buttons = [
      <Button key="cancel" onClick={handleCancel} disabled={loading} size="small">
        Cancel
      </Button>
    ];

    // Add "Delete" button for edit and tabs modes (when editing existing tasks)
    if ((mode === 'edit' || mode === 'tabs') && activeTask && onDelete) {
      buttons.push(
        <Popconfirm
          key="delete"
          title="Delete Safety Task"
          description={`Are you sure you want to delete "${activeTask.name}"? This action cannot be undone.`}
          onConfirm={onDelete}
          okText="Delete"
          cancelText="Cancel"
          okType="danger"
          disabled={loading}
        >
          <Button
            danger
            disabled={loading}
            icon={<DeleteOutlined />}
            size="small"
          >
            Delete
          </Button>
        </Popconfirm>
      );
    }

    // Add "Create New" button for edit and tabs modes
    if ((mode === 'edit' || mode === 'tabs') && onCreateNew) {
      buttons.push(
        <Button
          key="createNew"
          onClick={onCreateNew}
          disabled={loading}
          icon={<PlusOutlined />}
          size="small"
        >
          New Task
        </Button>
      );
    }

    // Add Save/Update button
    buttons.push(
      <Button
        key="save"
        type="primary"
        onClick={handleOk}
        loading={loading}
        size="small"
      >
        {mode === 'create' ? 'Create Task' : 'Update Task'}
      </Button>
    );

    return buttons;
  };

  return (
    <Modal
      title={getModalTitle()}
      open={visible}
      onCancel={handleCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
          {getModalFooter()}
        </div>
      }
      width={700}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckSquareOutlined style={{ color: '#1890ff', fontSize: '18px' }} />
          <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {nodeName}
          </Text>
        </div>
        
        {mode === 'edit' && activeTask && (
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Editing: {activeTask.name}
            </Text>
            <div style={{ marginTop: 4 }}>
              <Tag color={getTaskTypeColor(activeTask.taskType)} size="small">
                {activeTask.taskType}
              </Tag>
              <Tag color={getStatusColor(activeTask.status)} size="small">
                {activeTask.status}
              </Tag>
            </div>
          </div>
        )}
        
        {mode === 'tabs' && activeTask && nodeDescription && (
          <Text style={{ fontSize: '12px', color: '#595959' }}>
            {nodeDescription}
          </Text>
        )}
        
        {mode === 'create' && existingTasks.length > 0 && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Creating additional safety task ({existingTasks.length} existing)
          </Text>
        )}
      </div>

      {/* Timestamp Information for Edit and Tabs modes */}
      {(mode === 'edit' || mode === 'tabs') && activeTask && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ClockCircleOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Created: {activeTask.created ? new Date(activeTask.created).toLocaleString() : 'N/A'}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <EditOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Modified: {activeTask.lastModified ? new Date(activeTask.lastModified).toLocaleString() : 'N/A'}
              </Text>
            </div>
          </div>
          
          {/* Task Details Summary */}
          <div style={{ 
            marginTop: 12, 
            padding: '12px', 
            backgroundColor: '#f6f8fa', 
            borderRadius: '6px',
            border: '1px solid #e1e4e8'
          }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Responsible: {activeTask.responsible}
                </Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LinkOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Reference: {activeTask.reference}
                </Text>
              </div>
            </div>
          </div>
        </div>
      )}

      {renderModalContent()}
    </Modal>
  );
};

export default SafetyTaskModal;
