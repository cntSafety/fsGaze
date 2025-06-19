'use client';

import React, { useState } from 'react';
import { Form, Input, Select, Button, Card, Alert, Space, Typography, Spin } from 'antd';
import { ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { createFailureModeNode } from '../../services/ArxmlToNeoService';

const { TextArea } = Input;
const { Option } = Select;
const { Title } = Typography;

interface AddFMProps {
  existingElementUuid: string;
  existingElementName?: string;
  onSuccess?: (data: any) => void;
  onCancel?: () => void;
}

interface FailureModeFormData {
  name: string;
  description: string;
  asil: string;
}

const AddFM: React.FC<AddFMProps> = ({ 
  existingElementUuid, 
  existingElementName, 
  onSuccess, 
  onCancel 
}) => {
  const [form] = Form.useForm<FailureModeFormData>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  const handleSubmit = async (values: FailureModeFormData) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await createFailureModeNode(
        existingElementUuid,
        values.name,
        values.description,
        values.asil
      );

      if (result.success) {
        setSuccess(result);
        form.resetFields();
        if (onSuccess) {
          onSuccess(result);
        }
      } else {
        setError(result.message || 'Failed to create failure mode node');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setError(null);
    setSuccess(null);
  };

  return (
    <Card 
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          <Title level={4} style={{ margin: 0 }}>
            Add Failure Mode
          </Title>
        </Space>
      }
      style={{ maxWidth: 600, margin: '0 auto' }}
    >
      {existingElementName && (
        <Alert
          message={`Adding failure mode for: ${existingElementName}`}
          description={`UUID: ${existingElementUuid}`}
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 24 }}
        />
      )}

      {success && (
        <Alert
          message="Success"
          description={success.message}
          type="success"
          showIcon
          closable
          onClose={() => setSuccess(null)}
          style={{ marginBottom: 24 }}
          action={
            <Button size="small" onClick={() => setSuccess(null)}>
              Close
            </Button>
          }
        />
      )}

      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="name"
            label="Failure Mode Name"
            rules={[
              { required: true, message: 'Please enter a failure mode name' },
              { min: 3, message: 'Failure name must be at least 3 characters' },
              { max: 100, message: 'Failure name must not exceed 100 characters' }
            ]}
          >
            <Input
              placeholder="e.g., Cell voltage measurement error"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Failure Mode Description"
            rules={[
              { required: true, message: 'Please enter a failure mode description' },
              { min: 10, message: 'Description must be at least 10 characters' },
              { max: 500, message: 'Description must not exceed 500 characters' }
            ]}
          >
            <TextArea
              rows={4}
              placeholder="Describe the failure mode in detail, including potential causes and effects..."
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="asil"
            label="ASIL (Automotive Safety Integrity Level)"
            rules={[
              { required: true, message: 'Please select an ASIL level' }
            ]}
          >
            <Select
              placeholder="Select ASIL level"
              disabled={loading}
            >
              <Option value="A">ASIL A</Option>
              <Option value="B">ASIL B</Option>
              <Option value="C">ASIL C</Option>
              <Option value="D">ASIL D</Option>
              <Option value="QM">QM (Quality Management)</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<CheckCircleOutlined />}
              >
                Create Failure Mode
              </Button>
              <Button
                onClick={handleReset}
                disabled={loading}
              >
                Reset
              </Button>
              {onCancel && (
                <Button
                  onClick={onCancel}
                  disabled={loading}
                >
                  Cancel
                </Button>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Spin>
    </Card>
  );
};

export default AddFM;
