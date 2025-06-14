'use client';

import React, { useState } from 'react';
import { Modal, Form, Select, Button, Space, Typography, Divider, Card, Input } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';
import { 
  SEVERITY_OPTIONS, 
  OCCURRENCE_OPTIONS, 
  DETECTION_OPTIONS, 
  RATING_VALUE_MAP,
  type RiskRatingOption 
} from '../utils/riskRatingConstants';

const { Option } = Select;
const { Text } = Typography;
const { TextArea } = Input;

interface RiskRatingModalProps {
  visible: boolean;
  onCancel: () => void;
  onSave: (severity: number, occurrence: number, detection: number, ratingComment?: string) => Promise<void>;
  failureName: string;
  loading?: boolean;
}

interface RiskRatingFormData {
  severity: string;
  occurrence: string;
  detection: string;
  ratingComment?: string;
}

const RiskRatingModal: React.FC<RiskRatingModalProps> = ({
  visible,
  onCancel,
  onSave,
  failureName,
  loading = false
}) => {
  const [form] = Form.useForm<RiskRatingFormData>();
  const [selectedSeverity, setSelectedSeverity] = useState<string>();
  const [selectedOccurrence, setSelectedOccurrence] = useState<string>();
  const [selectedDetection, setSelectedDetection] = useState<string>();const handleOk = async () => {
    try {
      const values = await form.validateFields();
      console.log('Form values:', values); // Debug log
      
      // Convert string values to numbers using the mapping
      const severityValue = RATING_VALUE_MAP[values.severity];
      const occurrenceValue = RATING_VALUE_MAP[values.occurrence];
      const detectionValue = RATING_VALUE_MAP[values.detection];
      
      console.log('Converted values:', { severityValue, occurrenceValue, detectionValue }); // Debug log
      
      await onSave(severityValue, occurrenceValue, detectionValue, values.ratingComment);
        // Reset form
      form.resetFields();
      setSelectedSeverity(undefined);
      setSelectedOccurrence(undefined);
      setSelectedDetection(undefined);
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setSelectedSeverity(undefined);
    setSelectedOccurrence(undefined);
    setSelectedDetection(undefined);
    onCancel();
  };const renderSelectOption = (option: RiskRatingOption) => (
    <Option key={option.value} value={option.value} title={option.description}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div 
          style={{ 
            width: '12px', 
            height: '12px', 
            backgroundColor: option.color, 
            borderRadius: '50%', 
            marginRight: '8px' 
          }} 
        />
        {option.label}
      </div>
    </Option>
  );

  const getSelectedOptionColor = (value: string | undefined, options: RiskRatingOption[]) => {
    if (!value) return undefined;
    const option = options.find(opt => opt.value === value);
    return option?.color;
  };

  return (
    <Modal
      title={
        <Space>
          <DashboardOutlined style={{ color: '#1890ff' }} />
          <span>Risk Rating Assessment</span>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>,
        <Button
          key="save"
          type="primary"
          onClick={handleOk}
          loading={loading}
          icon={<DashboardOutlined />}
        >
          Save Risk Rating        </Button>,
      ]}
      width={600}
      destroyOnHidden
    >
      <Card
        size="small"
        style={{ marginBottom: 16, backgroundColor: '#f6f8fa' }}
      >
        <Text strong>Failure Mode: </Text>
        <Text>{failureName}</Text>
      </Card>

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
      >        <Form.Item
          name="severity"
          label="Severity"
          rules={[{ required: true, message: 'Please select a severity level' }]}
        >
          <Select
            placeholder="Select severity level"
            style={{ 
              width: '100%',
              borderColor: selectedSeverity ? getSelectedOptionColor(selectedSeverity, SEVERITY_OPTIONS) : undefined
            }}
            dropdownStyle={{ minWidth: '400px' }}
            onChange={(value) => {
              console.log('Severity changed:', value);
              setSelectedSeverity(value);
            }}
          >
            {SEVERITY_OPTIONS.map(renderSelectOption)}
          </Select>
        </Form.Item>

        <Divider />        <Form.Item
          name="occurrence"
          label="Occurrence"
          rules={[{ required: true, message: 'Please select an occurrence level' }]}
        >
          <Select
            placeholder="Select occurrence level"
            style={{ 
              width: '100%',
              borderColor: selectedOccurrence ? getSelectedOptionColor(selectedOccurrence, OCCURRENCE_OPTIONS) : undefined
            }}
            dropdownStyle={{ minWidth: '400px' }}
            onChange={(value) => {
              console.log('Occurrence changed:', value);
              setSelectedOccurrence(value);
            }}
          >
            {OCCURRENCE_OPTIONS.map(renderSelectOption)}
          </Select>
        </Form.Item>

        <Divider />        <Form.Item
          name="detection"
          label="Detection"
          rules={[{ required: true, message: 'Please select a detection level' }]}
        >
          <Select
            placeholder="Select detection level"
            style={{ 
              width: '100%',
              borderColor: selectedDetection ? getSelectedOptionColor(selectedDetection, DETECTION_OPTIONS) : undefined
            }}
            dropdownStyle={{ minWidth: '400px' }}
            onChange={(value) => {
              console.log('Detection changed:', value);
              setSelectedDetection(value);
            }}
          >
            {DETECTION_OPTIONS.map(renderSelectOption)}
          </Select>
        </Form.Item>

        <Divider />

        <Form.Item
          name="ratingComment"
          label="Rating Comment (Optional)"
        >
          <TextArea
            placeholder="Add any additional comments about this risk rating..."
            rows={3}
            showCount
            maxLength={500}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RiskRatingModal;
