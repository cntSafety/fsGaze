'use client';

import React, { useState } from 'react';
import { Modal, Input, Button, Typography, Space, Alert, Select, InputNumber } from 'antd';
import { LinkOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { createCausationBetweenFailures } from '@/app/services/ArxmlToNeoService';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface CreateCausationModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  firstFailure: {
    uuid: string;
    name: string;
  } | null;
  secondFailure: {
    uuid: string;
    name: string;
  } | null;
}

const CreateCausationModal: React.FC<CreateCausationModalProps> = ({
  open,
  onCancel,
  onSuccess,
  firstFailure,
  secondFailure
}) => {
  const [causationName, setCausationName] = useState('');
  const [causationDescription, setCausationDescription] = useState('');
  const [causationType, setCausationType] = useState('direct');
  const [probability, setProbability] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!firstFailure || !secondFailure || !causationName.trim()) {
      Modal.error({
        title: 'Missing Information',
        content: 'Please provide a name for the causation.',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await createCausationBetweenFailures(
        firstFailure.uuid,
        secondFailure.uuid,
        causationType,
        probability,
        causationDescription.trim() || undefined
      );

      if (result.success) {
        Modal.success({
          title: 'Causation Created',
          content: `Successfully created causation between "${firstFailure.name}" → "${secondFailure.name}"`,
        });
        
        // Reset form
        setCausationName('');
        setCausationDescription('');
        setCausationType('direct');
        setProbability(undefined);
        onSuccess();
      } else {
        Modal.error({
          title: 'Causation Creation Failed',
          content: result.message || 'Failed to create causation between failure modes',
        });
      }
    } catch (error) {
      console.error('Error creating causation:', error);
      Modal.error({
        title: 'Causation Creation Failed',
        content: 'An unexpected error occurred while creating the causation',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setCausationName('');
    setCausationDescription('');
    setCausationType('direct');
    setProbability(undefined);
    onCancel();
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LinkOutlined />
          <span>Create Causation Between Failure Modes</span>
        </div>
      }
      open={open}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
          disabled={!firstFailure || !secondFailure || !causationName.trim()}
        >
          Create Causation
        </Button>,
      ]}
      width={600}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Failure Mode Selection Display */}
        <div>
          <Title level={5} style={{ marginBottom: '16px' }}>Selected Failure Modes</Title>
          
          {firstFailure && secondFailure ? (
            <div style={{ 
              padding: '16px', 
              backgroundColor: '#f6f6f6', 
              borderRadius: '8px',
              border: '1px solid #d9d9d9'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <Text strong style={{ color: '#1890ff' }}>First Failure (Cause):</Text>
                  <div style={{ marginTop: '4px' }}>
                    <Text code>{firstFailure.name}</Text>
                  </div>
                </div>
                
                <ArrowRightOutlined style={{ fontSize: '20px', color: '#52c41a' }} />
                
                <div style={{ flex: 1, minWidth: '200px', textAlign: 'right' }}>
                  <Text strong style={{ color: '#ff7875' }}>Second Failure (Effect):</Text>
                  <div style={{ marginTop: '4px' }}>
                    <Text code>{secondFailure.name}</Text>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Alert
              message="Failure Mode Selection Incomplete"
              description="Please select both failure modes from the tree before creating a causation."
              type="warning"
              showIcon
            />
          )}
        </div>

        {/* Causation Details Form */}
        <div>
          <Title level={5} style={{ marginBottom: '16px' }}>Causation Details</Title>
          
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text strong>Causation Type: <span style={{ color: 'red' }}>*</span></Text>
              <Select
                value={causationType}
                onChange={setCausationType}
                style={{ width: '100%', marginTop: '8px' }}
                options={[
                  { value: 'direct', label: 'Direct' },
                  { value: 'indirect', label: 'Indirect' },
                  { value: 'conditional', label: 'Conditional' }
                ]}
              />
            </div>

            <div>
              <Text strong>Probability (Optional):</Text>
              <InputNumber
                min={0}
                max={1}
                step={0.1}
                placeholder="0.0 - 1.0"
                value={probability}
                onChange={setProbability}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </div>

            <div>
              <Text strong>Causation Name: <span style={{ color: 'red' }}>*</span></Text>
              <Input
                placeholder="Enter a descriptive name for this causation relationship"
                value={causationName}
                onChange={(e) => setCausationName(e.target.value)}
                style={{ marginTop: '8px' }}
                maxLength={100}
                showCount
              />
            </div>

            <div>
              <Text strong>Description (Optional):</Text>
              <TextArea
                placeholder="Provide additional details about how the first failure causes the second failure"
                value={causationDescription}
                onChange={(e) => setCausationDescription(e.target.value)}
                style={{ marginTop: '8px' }}
                rows={3}
                maxLength={500}
                showCount
              />
            </div>
          </Space>
        </div>

        {/* Information Notice */}
        <Alert
          message="Causation Relationship"
          description={
            <div>
              <p>This will create a CAUSATION node in the Neo4j database with:</p>
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                <li><strong>FIRST</strong> relationship → {firstFailure?.name || 'First Failure'}</li>
                <li><strong>THEN</strong> relationship → {secondFailure?.name || 'Second Failure'}</li>
              </ul>
              <p style={{ marginTop: '8px' }}>
                This represents that the first failure can cause or lead to the second failure.
              </p>
            </div>
          }
          type="info"
          showIcon
        />
      </Space>
    </Modal>
  );
};

export default CreateCausationModal;
