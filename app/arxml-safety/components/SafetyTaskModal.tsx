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
  open,
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
              Runtime Measures
            </Option>
            <Option value="dev-time measures">
              Dev-Time Measures
            </Option>
            <Option value="other">
              Other
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
            <Option value="open">Open</Option>
            <Option value="started">Started</Option>
            <Option value="in-review">In Review</Option>
            <Option value="finished">Finished</Option>
          </Select>
        </Form.Item>
        
        {formValues.status && <StatusProgress status={formValues.status} />}
        
        <Divider />
        
        <Form.Item
          name="responsible"
          label="Responsible"
          rules={[{ required: true, message: 'Please enter responsible person/team' }]}
        >
          <Input placeholder="e.g., John Doe, Safety Team" />
        </Form.Item>
        
        <Form.Item
          name="reference"
          label="Reference"
        >
          <Input placeholder="e.g., JIRA-123, Requirement-456" />
        </Form.Item>
      </Form>
    );
  };

  const renderNodeInfo = () => (
    <div style={{ marginBottom: 16, padding: '12px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        Associated with: <Tag color="blue">{nodeName}</Tag>
      </Typography.Title>
      {nodeDescription && (
        <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
          {nodeDescription}
        </Text>
      )}
    </div>
  );

  const renderModalContent = () => {
    if (mode === 'tabs' && existingTasks.length > 0) {
      const tabItems = existingTasks.map((task, index) => ({
        key: task.uuid,
        label: (
          <span style={{ color: index === activeTabIndex ? '#1890ff' : undefined }}>
            <CheckSquareOutlined style={{ marginRight: 8 }} />
            {`Task ${index + 1}`}
          </span>
        ),
        children: (
          <>
            {renderNodeInfo()}
            {renderFormContent()}
          </>
        )
      }));

      return (
        <Tabs
          activeKey={existingTasks[activeTabIndex]?.uuid}
          onChange={(key) => {
            const index = existingTasks.findIndex(t => t.uuid === key);
            if (onTabChange) onTabChange(index);
          }}
          tabBarExtraContent={
            <Button
              icon={<PlusOutlined />}
              onClick={onCreateNew}
              size="small"
              type="primary"
              ghost
            >
              Add New
            </Button>
          }
          items={tabItems}
        />
      );
    }
    
    return (
      <>
        {renderNodeInfo()}
        {renderFormContent()}
      </>
    );
  };

  const getModalFooter = () => {
    const isFormValid =
      formValues.name &&
      formValues.description &&
      formValues.status &&
      formValues.taskType;

    const footerButtons = [
      <Button key="cancel" onClick={handleCancel}>
        Cancel
      </Button>
    ];

    if (mode !== 'create') {
      footerButtons.unshift(
        <Popconfirm
          key="delete"
          title="Are you sure you want to delete this task?"
          onConfirm={onDelete}
          okText="Yes"
          cancelText="No"
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={loading}
          >
            Delete
          </Button>
        </Popconfirm>
      );
    }

    footerButtons.push(
      <Button
        key="submit"
        type="primary"
        loading={loading}
        onClick={handleOk}
        disabled={!isFormValid}
      >
        {mode === 'create' ? 'Create Task' : 'Save Changes'}
      </Button>
    );

    return (
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          {mode !== 'create' && activeTask?.lastModified && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              Last updated: {new Date(activeTask.lastModified).toLocaleString()}
            </Text>
          )}
        </div>
        <Space>{footerButtons.reverse()}</Space>
      </Space>
    );
  };

  return (
    <Modal
      title={getModalTitle()}
      open={open}
      onCancel={handleCancel}
      width={800}
      destroyOnHidden
      footer={getModalFooter()}
    >
      {renderModalContent()}
    </Modal>
  );
};

export default SafetyTaskModal;
