'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Button, Space, Typography, Divider, Input, Tabs, Popconfirm, Collapse, Progress, Statistic, Row, Col, Card, theme } from 'antd';
import { PlusOutlined, DeleteOutlined, ClockCircleOutlined, EditOutlined, BugOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { 
  SEVERITY_OPTIONS, 
  OCCURRENCE_OPTIONS, 
  DETECTION_OPTIONS, 
  type RiskRatingOption 
} from '../utils/riskRatingConstants';
import InlineSafetyTasks from './InlineSafetyTasks';

const { Option } = Select;
const { Text } = Typography;
const { TextArea } = Input;

interface RiskRatingModalProps {
  open: boolean;
  onCancel: () => void;
  onSave?: (severity: number, occurrence: number, detection: number, ratingComment?: string) => Promise<void>;
  onOk?: (values: { severity: number; occurrence: number; detection: number; ratingComment?: string }) => Promise<void>;
  onCreateNew?: () => void; // New callback for creating additional risk ratings
  onDelete?: () => Promise<void>; // New callback for deleting risk ratings
  failureUuid: string;
  failureName: string;
  failureDescription?: string; // New prop for failure description
  loading?: boolean;
  // Enhanced props for multi-modal support
  mode?: 'create' | 'edit' | 'tabs';
  activeRiskRating?: {
    uuid: string;
    name: string;
    severity: number;
    occurrence: number;
    detection: number;
    ratingComment: string;
    created: string;
    lastModified: string;
  } | null;
  existingRiskRatings?: any[];
  activeTabIndex?: number;
  onTabChange?: (index: number) => void;
}

interface RiskRatingFormData {
  severity: number;
  occurrence: number;
  detection: number;
  ratingComment?: string;
}

const RiskRatingModal: React.FC<RiskRatingModalProps> = ({
  open: visible, // Rename prop but keep internal variable name for compatibility
  onCancel,
  onSave,  onOk,
  onCreateNew,
  onDelete,
  failureUuid,
  failureName,
  failureDescription,
  loading = false,
  mode = 'create',
  activeRiskRating = null,
  existingRiskRatings = [],
  activeTabIndex = 0,
  onTabChange
}) => {
  const [form] = Form.useForm<RiskRatingFormData>();
  const [formValues, setFormValues] = useState<{
    severity?: number;
    occurrence?: number;
    detection?: number;
  }>({});

  const { token } = theme.useToken();

  const getOverallRiskColor = (val: number) => {
    if (val >= 17) return token.colorError;
    if (val >= 9) return token.colorWarning;
    return token.colorSuccess;
  };

  // Calculate overall risk
  const overallRisk = (formValues.severity || 0) * (formValues.occurrence || 0) * (formValues.detection || 0);

  // Effect to populate form when editing existing risk rating
  useEffect(() => {
    if (mode === 'edit' || mode === 'tabs') {
      if (activeRiskRating) {
        // Use the integer values directly
        const values = {
          severity: activeRiskRating.severity,
          occurrence: activeRiskRating.occurrence,
          detection: activeRiskRating.detection,
          ratingComment: activeRiskRating.ratingComment || ''
        };
        form.setFieldsValue(values);
        setFormValues(values);
      }
    } else {
      // Reset form for create mode
      form.resetFields();
      setFormValues({});
    }
  }, [form, mode, activeRiskRating]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      // Use the integer values directly (no conversion needed)
      
      // Support both old onSave and new onOk interfaces
      if (onOk) {
        await onOk({
          severity: values.severity,
          occurrence: values.occurrence,
          detection: values.detection,
          ratingComment: values.ratingComment
        });
      } else if (onSave) {
        await onSave(values.severity, values.occurrence, values.detection, values.ratingComment);
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
        return 'Create Risk Rating Assessment';
      case 'edit':
        return 'Edit Risk Rating Assessment';
      case 'tabs':
        return 'Risk Rating Assessments';
      default:
        return 'Risk Rating Assessment';
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
          name="severity"
          label={<span style={{ fontWeight: 'bold' }}>Severity</span>}
          rules={[{ required: true, message: 'Please select a severity level' }]}
        >
          <Select
            placeholder="Select severity level"
            style={{ width: '100%' }}
            styles={{ popup: { root: { minWidth: '400px' } } }}
          >
            {SEVERITY_OPTIONS.map(option => (
              <Option 
                key={option.value} 
                value={option.value} 
                title={option.description}
                style={{ color: option.color }}
              >
                <span style={{ color: option.color, fontWeight: 'bold' }}>
                  {option.label}
                </span>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Divider />
        <Form.Item
          name="occurrence"
          label={<span style={{ fontWeight: 'bold' }}>Occurrence</span>}
          rules={[{ required: true, message: 'Please select an occurrence level' }]}
        >
          <Select
            placeholder="Select occurrence level"
            style={{ width: '100%' }}
            styles={{ popup: { root: { minWidth: '400px' } } }}
          >
            {OCCURRENCE_OPTIONS.map(option => (
              <Option 
                key={option.value} 
                value={option.value} 
                title={option.description}
                style={{ color: option.color }}
              >
                <span style={{ color: option.color, fontWeight: 'bold' }}>
                  {option.label}
                </span>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Divider />
        <Form.Item
          name="detection"
          label={<span style={{ fontWeight: 'bold' }}>Detection</span>}
          rules={[{ required: true, message: 'Please select a detection level' }]}
        >
          <Select
            placeholder="Select detection level"
            style={{ width: '100%' }}
            styles={{ popup: { root: { minWidth: '400px' } } }}
          >
            {DETECTION_OPTIONS.map(option => (
              <Option 
                key={option.value} 
                value={option.value} 
                title={option.description}
                style={{ color: option.color }}
              >
                <span style={{ color: option.color, fontWeight: 'bold' }}>
                  {option.label}
                </span>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Divider />

        {/* Overall Risk Display */}
        <Form.Item label={<span style={{ fontWeight: 'bold' }}>Overall Risk Assessment</span>}>
          <Card bordered>
            <Row align="middle" gutter={16}>
              <Col>
                <Statistic
                  title="Risk Score"
                  value={overallRisk}
                  valueStyle={{ color: getOverallRiskColor(overallRisk), fontSize: '24px', fontWeight: 600 }}
                />
              </Col>
              <Col flex="auto">
                <Progress
                  percent={(overallRisk / 27) * 100}
                  strokeColor={getOverallRiskColor(overallRisk)}
                  showInfo={false}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px' }}>
                  <Text style={{ color: token.colorSuccess }}>Low (1-8)</Text>
                  <Text style={{ color: token.colorWarning }}>Medium (9-16)</Text>
                  <Text style={{ color: token.colorError }}>High (17-27)</Text>
                </div>
              </Col>
            </Row>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Calculation: Severity ({formValues.severity || 0}) × Occurrence ({formValues.occurrence || 0}) × Detection ({formValues.detection || 0}) = {overallRisk}
              </Text>
            </div>
          </Card>
        </Form.Item>

        <Divider />
        <Form.Item
          name="ratingComment"
          label="Rating Text"
        >
          <TextArea
            placeholder="Add any additional comments about this risk rating..."
            rows={3}
            showCount
            maxLength={1000}
          />
        </Form.Item>

        {/* Safety Tasks Section */}
        <Divider />
        <Collapse
          size="small"
          items={[
            {
              key: 'safety-tasks',
              label: (
                <span>
                  <CheckSquareOutlined style={{ marginRight: 8 }} />
                  Safety Tasks
                </span>
              ),
              children: (
                <InlineSafetyTasks
                  failureUuid={failureUuid}
                  failureName={failureName}
                  compact={true}
                />
              )
            }
          ]}
        />
      </Form>
    );
  };

  const renderModalContent = () => {
    if (mode === 'tabs' && existingRiskRatings.length > 1) {
      const tabItems = existingRiskRatings.map((rating, index) => ({
        key: index.toString(),
        label: `Risk Rating ${index + 1}`,
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

    // Add "Delete" button for edit and tabs modes (when editing existing risk ratings)
    if ((mode === 'edit' || mode === 'tabs') && activeRiskRating && onDelete) {
      buttons.push(
        <Popconfirm
          key="delete"
          title="Delete Risk Rating"
          description={`Are you sure you want to delete "${activeRiskRating.name}"? This action cannot be undone.`}
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
/*     if ((mode === 'edit' || mode === 'tabs') && onCreateNew) {
      buttons.push(
        <Button
          key="createNew"
          onClick={onCreateNew}
          disabled={loading}
          icon={<PlusOutlined />}
          size="small"
        >
          New Rating Version
        </Button>
      );
    } */

    // Add Save/Update button
    buttons.push(
      <Button
        key="save"
        type="primary"
        onClick={handleOk}
        loading={loading}
        size="small"
      >
        {mode === 'create' ? 'Create Rating' : 'Update Rating'}
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
      width={600}
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BugOutlined style={{ color: '#fa8c16', fontSize: '18px' }} />
          <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {failureName}
          </Text>
        </div>
        
        {mode === 'edit' && activeRiskRating && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Editing: {activeRiskRating.name}
          </Text>
        )}
        {mode === 'tabs' && activeRiskRating && failureDescription && (
          <Text style={{ fontSize: '12px', color: '#595959' }}>
            {failureDescription}
          </Text>
        )}
        
        {mode === 'create' && existingRiskRatings.length > 0 && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Creating additional risk rating ({existingRiskRatings.length} existing)
          </Text>
        )}
      </div>

      {/* Timestamp Information for Edit and Tabs modes */}
      {(mode === 'edit' || mode === 'tabs') && activeRiskRating && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ClockCircleOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Created: {activeRiskRating.created ? new Date(activeRiskRating.created).toLocaleString() : 'N/A'}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <EditOutlined style={{ color: '#8c8c8c', fontSize: '14px' }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Modified: {activeRiskRating.lastModified ? new Date(activeRiskRating.lastModified).toLocaleString() : 'N/A'}
              </Text>
            </div>
          </div>
        </div>
      )}

      {renderModalContent()}
    </Modal>
  );
};

export default RiskRatingModal;
