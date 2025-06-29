'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Button, Space, Typography, Divider, Input, Tabs, Popconfirm, Tag, Steps, Card } from 'antd';
import { PlusOutlined, DeleteOutlined, ClockCircleOutlined, EditOutlined, CheckSquareOutlined, UserOutlined, LinkOutlined } from '@ant-design/icons';
import { SafetyTaskData, SafetyTaskStatus, SafetyTaskType } from '@/app/services/neo4j/queries/safety/safetyTasks';

const { Option } = Select;
const { Text } = Typography;
const { TextArea } = Input;

// Task type color mapping
const getTaskTypeColor = (taskType: SafetyTaskType): string => {
  switch (taskType) {
    case 'runtime measures': return '#4096ff'; // A different blue
    case 'dev-time measures': return '#1890ff'; // Blue
    case 'other': return '#8c8c8c'; // Gray
    default: return '#8c8c8c';
  }
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
  const statuses: SafetyTaskStatus[] = ['open', 'started', 'in-review', 'finished'];

  // Effect to populate form when editing existing task
  useEffect(() => {
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
    } else {
      // Reset form for create mode
      form.resetFields();
      setFormValues({});
    }
  }, [form, activeTask]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      // Support both old onSave and new onOk interfaces
      if (onOk) {
        await onOk(values);
      } else if (onSave) {
        await onSave(values);
      }
      
      if (mode === 'create') {
        form.resetFields();
      }
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
      case 'tabs':
        return 'Manage Safety Tasks';
      default:
        return 'Safety Task';
    }
  };

  const renderFormContent = () => (
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
      
      {formValues.status && (
        <Form.Item label="Progress">
          <Steps
            current={statuses.indexOf(formValues.status)}
            size="small"
            items={statuses.map(s => ({
              key: s,
              title: s.charAt(0).toUpperCase() + s.slice(1)
            }))}
          />
        </Form.Item>
      )}
      
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

  const renderNodeInfo = () => (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        Associated with: <Tag color="blue">{nodeName}</Tag>
      </Typography.Title>
      {nodeDescription && (
        <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
          {nodeDescription}
        </Text>
      )}
    </Card>
  );

  const renderCreateMode = () => (
    <div>
      {renderNodeInfo()}
      {renderFormContent()}
    </div>
  );

  const renderTabsMode = () => {
    if (existingTasks.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">No safety tasks found for this item.</Text>
          <div style={{ marginTop: 16 }}>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={onCreateNew}
            >
              Create First Task
            </Button>
          </div>
        </div>
      );
    }

    const tabItems = existingTasks.map((task, index) => ({
      key: index.toString(),
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tag color={getTaskTypeColor(task.taskType)}>{task.taskType}</Tag>
          <span>{task.name}</span>
        </div>
      ),
      children: renderFormContent()
    }));

    return (
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 16 
        }}>
          <div>
            <Text strong>Safety Tasks for: {nodeName}</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {existingTasks.length} task(s) found
              </Text>
            </div>
          </div>
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              size="small"
              onClick={onCreateNew}
              disabled={loading}
            >
              New Task
            </Button>
            {activeTask && (
              <Popconfirm
                title="Delete Task"
                description="Are you sure you want to delete this safety task?"
                onConfirm={onDelete}
                okText="Yes, Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                disabled={loading}
              >
                <Button 
                  danger 
                  icon={<DeleteOutlined />} 
                  size="small"
                  disabled={loading}
                >
                  Delete
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        <Tabs
          type="card"
          activeKey={activeTabIndex.toString()}
          onChange={(key) => onTabChange && onTabChange(parseInt(key))}
          items={tabItems}
        />
      </div>
    );
  };

  const renderContent = () => {
    switch (mode) {
      case 'create':
        return renderCreateMode();
      case 'edit':
      case 'tabs':
        return renderTabsMode();
      default:
        return renderCreateMode();
    }
  };
  
  const showFooter = mode !== 'tabs' || (mode === 'tabs' && existingTasks.length > 0);

  return (
    <Modal
      title={getModalTitle()}
      open={open}
      onCancel={handleCancel}
      width={800}
      destroyOnHidden
      footer={showFooter ? [
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleOk}
        >
          {mode === 'create' ? 'Create Task' : 'Save Changes'}
        </Button>
      ] : [
        <Button key="close" onClick={onCancel}>
          Close
        </Button>
      ]}
    >
      {renderContent()}
    </Modal>
  );
};

export default SafetyTaskModal;
