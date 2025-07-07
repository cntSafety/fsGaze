import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Typography, message, Tabs, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { 
  SafetyReqData, 
  SafetyReqASIL, 
  CreateSafetyReqInput 
} from '@/app/services/neo4j/queries/safety/safetyReq';

const { TextArea } = Input;
const { Text } = Typography;
const { Option } = Select;

interface SafetyReqModalProps {
  open: boolean;
  onCancel: () => void;
  onSave: (reqData: CreateSafetyReqInput) => Promise<void>;
  onCreateNew: () => void;
  onDelete: () => Promise<void>;
  onTabChange: (index: number) => void;
  nodeName: string;
  nodeDescription?: string;
  loading: boolean;
  mode: 'create' | 'edit' | 'tabs';
  activeReq: SafetyReqData | null;
  existingReqs: SafetyReqData[];
  activeTabIndex: number;
}

// Helper functions for UI styling
const getASILColor = (asil: string): string => {
  switch (asil) {
    case 'QM': return 'default';
    case 'A': return 'green';
    case 'B': return 'blue';
    case 'C': return 'orange';
    case 'D': return 'red';
    default: return 'default';
  }
};

const SafetyReqModal: React.FC<SafetyReqModalProps> = ({
  open,
  onCancel,
  onSave,
  onCreateNew,
  onDelete,
  onTabChange,
  nodeName,
  nodeDescription,
  loading,
  mode,
  activeReq,
  existingReqs,
  activeTabIndex
}) => {
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when activeReq changes
  useEffect(() => {
    if (activeReq) {
      form.setFieldsValue({
        name: activeReq.name,
        reqID: activeReq.reqID,
        reqText: activeReq.reqText,
        reqASIL: activeReq.reqASIL,
        reqLinkedTo: activeReq.reqLinkedTo || ''
      });
    } else {
      form.resetFields();
    }
  }, [activeReq, form]);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const values = await form.validateFields();
      
      const reqData: CreateSafetyReqInput = {
        name: values.name,
        reqID: values.reqID,
        reqText: values.reqText,
        reqASIL: values.reqASIL,
        reqLinkedTo: values.reqLinkedTo || undefined
      };

      await onSave(reqData);
      
      if (mode === 'create') {
        form.resetFields();
      }
    } catch (error) {
      console.error('Form validation failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFormContent = () => (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
    >
      <Form.Item
        label="Requirement Name"
        name="name"
        rules={[{ required: true, message: 'Please enter requirement name' }]}
      >
        <Input placeholder="Enter requirement name" />
      </Form.Item>

      <Form.Item
        label="Requirement ID"
        name="reqID"
        rules={[{ required: true, message: 'Please enter requirement ID' }]}
      >
        <Input placeholder="Enter requirement ID (e.g., REQ-001)" />
      </Form.Item>

      <Form.Item
        label="Requirement Text"
        name="reqText"
        rules={[{ required: true, message: 'Please enter requirement text' }]}
      >
        <TextArea 
          rows={4} 
          placeholder="Enter detailed requirement description"
        />
      </Form.Item>

      <Form.Item
        label="ASIL Level"
        name="reqASIL"
        rules={[{ required: true, message: 'Please select ASIL level' }]}
      >
        <Select placeholder="Select ASIL level">
          {Object.values(SafetyReqASIL).map(asil => (
            <Option key={asil} value={asil}>
              <Tag color={getASILColor(asil)}>{asil}</Tag>
            </Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item
        label="Linked To (Optional)"
        name="reqLinkedTo"
      >
        <Input placeholder="Link to other requirements or documents" />
      </Form.Item>
    </Form>
  );

  const renderCreateMode = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong>Create Safety Requirement for: {nodeName}</Text>
        {nodeDescription && (
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {nodeDescription}
            </Text>
          </div>
        )}
      </div>
      {renderFormContent()}
    </div>
  );

  const renderEditMode = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong>Edit Safety Requirement</Text>
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Editing: {activeReq?.name}
          </Text>
          <div style={{ marginTop: 4 }}>
            <Tag color={getASILColor(activeReq?.reqASIL || '')}>
              {activeReq?.reqASIL}
            </Tag>
            <Text type="secondary" style={{ fontSize: '11px', marginLeft: 8 }}>
              ID: {activeReq?.reqID}
            </Text>
          </div>
        </div>
      </div>
      {renderFormContent()}
    </div>
  );

  const renderTabsMode = () => {
    if (existingReqs.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">No safety requirements found for this failure.</Text>
          <div style={{ marginTop: 16 }}>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={onCreateNew}
            >
              Create First Requirement
            </Button>
          </div>
        </div>
      );
    }

    const tabItems = existingReqs.map((req, index) => ({
      key: index.toString(),
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tag color={getASILColor(req.reqASIL)}>
            {req.reqASIL}
          </Tag>
          <span>{req.name}</span>
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
            <Text strong>Safety Requirements for: {nodeName}</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {existingReqs.length} requirement(s) found
              </Text>
            </div>
            {activeReq && (
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ClockCircleOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Created: {activeReq.created ? new Date(activeReq.created).toLocaleString() : 'N/A'}
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <EditOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Modified: {activeReq.lastModified ? new Date(activeReq.lastModified).toLocaleString() : 'N/A'}
                  </Text>
                </div>
              </div>
            )}
          </div>
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              size="small"
              onClick={onCreateNew}
            >
              New Requirement
            </Button>
            {activeReq && (
              <Popconfirm
                title="Delete Requirement"
                description="Are you sure you want to delete this safety requirement?"
                onConfirm={onDelete}
                okText="Yes, Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button 
                  danger 
                  icon={<DeleteOutlined />} 
                  size="small"
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
          onChange={(key) => onTabChange(parseInt(key))}
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
        return renderEditMode();
      case 'tabs':
        return renderTabsMode();
      default:
        return renderCreateMode();
    }
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'create':
        return 'Create Safety Requirement';
      case 'edit':
        return 'Edit Safety Requirement';
      case 'tabs':
        return 'Manage Safety Requirements';
      default:
        return 'Safety Requirement';
    }
  };

  const showFooter = mode !== 'tabs' || (mode === 'tabs' && existingReqs.length > 0);

  return (
    <Modal
      title={getModalTitle()}
      open={open}
      onCancel={onCancel}
      footer={showFooter ? [
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={isSubmitting || loading}
          onClick={handleSubmit}
          disabled={mode === 'tabs' && existingReqs.length === 0}
        >
          {mode === 'create' ? 'Create Requirement' : 'Save Changes'}
        </Button>
      ] : [
        <Button key="close" onClick={onCancel}>
          Close
        </Button>      ]}
      width={700}
      destroyOnHidden
    >
      {renderContent()}
    </Modal>
  );
};

export default SafetyReqModal;
