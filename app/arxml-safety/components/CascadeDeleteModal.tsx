'use client';

import React, { useState } from 'react';
import { Modal, Button, List, Typography, Space, Alert, Spin } from 'antd';
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

export interface DeletionPreview {
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
  onConfirm: () => Promise<void>;
  previewData: DeletionPreview | null;
  loading?: boolean;
}

export const CascadeDeleteModal: React.FC<CascadeDeleteModalProps> = ({
  open,
  onCancel,
  onConfirm,
  previewData,
  loading = false
}) => {
  const [confirmLoading, setConfirmLoading] = useState(false);

  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      await onConfirm();
    } finally {
      setConfirmLoading(false);
    }
  };

  if (!previewData) {
    return null;
  }

  const { targetNode, dependentNodes, totalNodesToDelete } = previewData;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '18px' }} />
          <span>Confirm Cascade Deletion</span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={confirmLoading}>
          Cancel
        </Button>,
        <Button
          key="delete"
          type="primary"
          danger
          icon={<DeleteOutlined />}
          loading={confirmLoading}
          onClick={handleConfirm}
        >
          Delete All ({totalNodesToDelete} nodes)
        </Button>
      ]}
      width={600}
      centered
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          message="Cascade Deletion Warning"
          description="This action will delete the target node and all its dependent nodes. This action cannot be undone."
          type="warning"
          showIcon
        />

        <div>
          <Title level={5}>Target Node</Title>
          <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px' }}>
            <Text strong>{targetNode.name}</Text>
            <br />
            <Text type="secondary">Type: {targetNode.type}</Text>
          </div>
        </div>

        <div>
          <Title level={5}>Dependent Nodes to Delete ({totalNodesToDelete - 1})</Title>
          
          {dependentNodes.riskRatings.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ color: '#52c41a' }}>Risk Ratings ({dependentNodes.riskRatings.length})</Text>
              <List
                size="small"
                dataSource={dependentNodes.riskRatings}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item.name}</Text>
                    <Text type="secondary" style={{ marginLeft: '8px' }}>
                      S:{item.severity} O:{item.occurrence} D:{item.detection}
                    </Text>
                  </List.Item>
                )}
              />
            </div>
          )}

          {dependentNodes.safetyReqs.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ color: '#722ed1' }}>Safety Requirements ({dependentNodes.safetyReqs.length})</Text>
              <List
                size="small"
                dataSource={dependentNodes.safetyReqs}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item.name}</Text>
                    <Text type="secondary" style={{ marginLeft: '8px' }}>
                      {item.reqID} - ASIL: {item.reqASIL}
                    </Text>
                  </List.Item>
                )}
              />
            </div>
          )}

          {dependentNodes.safetyTasks.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ color: '#1890ff' }}>Safety Tasks ({dependentNodes.safetyTasks.length})</Text>
              <List
                size="small"
                dataSource={dependentNodes.safetyTasks}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item.name}</Text>
                    <Text type="secondary" style={{ marginLeft: '8px' }}>
                      {item.status} - {item.responsible}
                    </Text>
                  </List.Item>
                )}
              />
            </div>
          )}

          {dependentNodes.safetyNotes.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ color: '#fa8c16' }}>Safety Notes ({dependentNodes.safetyNotes.length})</Text>
              <List
                size="small"
                dataSource={dependentNodes.safetyNotes}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item.note}</Text>
                  </List.Item>
                )}
              />
            </div>
          )}

          {dependentNodes.causations.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ color: '#eb2f96' }}>Causations ({dependentNodes.causations.length})</Text>
              <List
                size="small"
                dataSource={dependentNodes.causations}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item.name}</Text>
                    <Text type="secondary" style={{ marginLeft: '8px' }}>
                      {item.causeName} → {item.effectName}
                    </Text>
                  </List.Item>
                )}
              />
            </div>
          )}

          {totalNodesToDelete === 1 && (
            <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f6ffed', borderRadius: '6px' }}>
              <Text type="success">No dependent nodes found. Only the target node will be deleted.</Text>
            </div>
          )}
        </div>
      </Space>
    </Modal>
  );
};

export default CascadeDeleteModal; 