'use client';

import React, { useState } from 'react';
import { Modal, Button, List, Typography, Space, Alert, Spin } from 'antd';
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface DeletionPreview {
  targetNode: {
    uuid: string;
    name: string;
    type: string;
  };
  dependentNodes: {
    riskRatings: Array<{ uuid: string; name: string; severity: number; occurrence: number; detection: number }>;
    safetyReqs: Array<{ uuid: string; name: string; reqID: string; reqASIL: string }>;
    safetyTasks: Array<{ uuid: string; name: string; status: string; responsible: string }>;
    safetyNotes: Array<{ uuid: string; note: string }>;
    causations: Array<{ uuid: string; name: string; causeName: string; effectName: string }>;
  };
  totalNodesToDelete: number;
  summary: string;
}

interface CascadeDeleteModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  nodeUuid: string;
  nodeType: string;
  nodeName: string;
}

export const CascadeDeleteModal: React.FC<CascadeDeleteModalProps> = ({
  open,
  onCancel,
  onSuccess,
  nodeUuid,
  nodeType,
  nodeName,
}) => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'preview' | 'confirm' | 'executing'>('preview');

  // Load preview when modal opens
  React.useEffect(() => {
    if (open && nodeUuid && !preview) {
      loadPreview();
    }
    // If the modal is closed or nodeUuid is cleared, reset preview state
    if (!open || !nodeUuid) {
      setPreview(null);
      setError(null);
      setStep('preview');
    }
  }, [open, nodeUuid]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/safety/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'preview',
          nodeUuid,
          nodeType,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setPreview(result.data);
        setStep('confirm');
      } else {
        setError(result.message || 'Failed to load deletion preview');
      }
    } catch (err) {
      setError('Network error while loading preview');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setLoading(true);
    setStep('executing');
    
    try {
      const response = await fetch('/api/safety/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'execute',
          nodeUuid,
          nodeType,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        onSuccess();
      } else {
        setError(result.message || 'Failed to delete node');
        setStep('confirm');
      }
    } catch (err) {
      setError('Network error while deleting');
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setError(null);
    setStep('preview');
    onCancel();
  };

  const renderPreviewContent = () => {
    if (!preview) return null;

    return (
      <div>
        <Alert
          message="Deletion Preview"
          description={preview.summary}
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          style={{ marginBottom: 16 }}
        />

        <Title level={5}>Target Node:</Title>
        <Text strong>{preview.targetNode.name}</Text> ({preview.targetNode.type})
        
        <Title level={5} style={{ marginTop: 16 }}>Dependent Nodes:</Title>
        
        {preview.dependentNodes.riskRatings.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Risk Ratings ({preview.dependentNodes.riskRatings.length}):</Text>
            <List
              size="small"
              dataSource={preview.dependentNodes.riskRatings}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item.name} (S:{item.severity} O:{item.occurrence} D:{item.detection})</Text>
                </List.Item>
              )}
            />
          </div>
        )}

        {preview.dependentNodes.safetyReqs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Safety Requirements ({preview.dependentNodes.safetyReqs.length}):</Text>
            <List
              size="small"
              dataSource={preview.dependentNodes.safetyReqs}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item.name} (ID: {item.reqID}, ASIL: {item.reqASIL})</Text>
                </List.Item>
              )}
            />
          </div>
        )}

        {preview.dependentNodes.safetyTasks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Safety Tasks ({preview.dependentNodes.safetyTasks.length}):</Text>
            <List
              size="small"
              dataSource={preview.dependentNodes.safetyTasks}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item.name} (Status: {item.status}, Responsible: {item.responsible})</Text>
                </List.Item>
              )}
            />
          </div>
        )}

        {preview.dependentNodes.safetyNotes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Safety Notes ({preview.dependentNodes.safetyNotes.length}):</Text>
            <List
              size="small"
              dataSource={preview.dependentNodes.safetyNotes}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item.note.substring(0, 50)}{item.note.length > 50 ? '...' : ''}</Text>
                </List.Item>
              )}
            />
          </div>
        )}

        {preview.dependentNodes.causations.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Causation Relationships ({preview.dependentNodes.causations.length}):</Text>
            <List
              size="small"
              dataSource={preview.dependentNodes.causations}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item.causeName} → {item.effectName}</Text>
                </List.Item>
              )}
            />
          </div>
        )}
      </div>
    );
  };

  const renderConfirmContent = () => {
    return (
      <div>
        <Alert
          message="Confirm Deletion"
          description={`Are you sure you want to delete "${nodeName}" and all ${preview?.totalNodesToDelete || 0} dependent nodes? This action cannot be undone.`}
          type="error"
          showIcon
          icon={<DeleteOutlined />}
          style={{ marginBottom: 16 }}
        />
        
        {preview && renderPreviewContent()}
      </div>
    );
  };

  const renderExecutingContent = () => {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text>Deleting node and dependent nodes...</Text>
        </div>
      </div>
    );
  };

  const getModalContent = () => {
    if (step === 'executing') {
      return renderExecutingContent();
    } else if (step === 'confirm' && preview) {
      return renderConfirmContent();
    } else {
      return (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading deletion preview...</Text>
          </div>
        </div>
      );
    }
  };

  const getModalTitle = () => {
    switch (step) {
      case 'preview':
        return 'Loading Preview...';
      case 'confirm':
        return 'Confirm Deletion';
      case 'executing':
        return 'Deleting...';
      default:
        return 'Delete Node';
    }
  };

  const getModalActions = () => {
    if (step === 'executing') {
      return null; // No buttons during execution
    }

    return (
      <Space>
        <Button onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>
        {step === 'confirm' && (
          <Button 
            type="primary" 
            danger 
            onClick={handleConfirmDelete}
            loading={loading}
            icon={<DeleteOutlined />}
          >
            Delete All
          </Button>
        )}
      </Space>
    );
  };

  return (
    <Modal
      title={getModalTitle()}
      open={open}
      onCancel={handleCancel}
      footer={getModalActions()}
      width={700}
      destroyOnHidden
    >
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      
      {getModalContent()}
    </Modal>
  );
}; 