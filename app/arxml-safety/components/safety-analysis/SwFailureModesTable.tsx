import React, { useState, useEffect } from 'react';
import { Button, Typography, Form } from 'antd';
import { PlusOutlined, CodeOutlined } from '@ant-design/icons';
import { SafetyTableColumn, SafetyTableRow } from '../CoreSafetyTable';
import { useComponentFailures } from './hooks/useComponentFailures';
import { SwComponent, Failure } from './types';
import { BaseFailureModeTable } from './BaseFailureModeTable';
import { CascadeDeleteModal } from '../CascadeDeleteModal';
import type { DeletionPreview } from '../CascadeDeleteModal';
import { message } from 'antd';

const { Title } = Typography;

interface SwFailureModesTableProps {
  swComponentUuid: string;
  swComponent: SwComponent;
  // Props for cross-component causation linking (unchanged)
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
}

export default function SwFailureModesTable({
  swComponentUuid,
  swComponent,
  onFailureSelect,
  selectedFailures,
  getFailureSelectionState,
  handleFailureSelection,
  isCauseSelected,
}: SwFailureModesTableProps) {
  const [form] = Form.useForm();
  const {
    failures,
    loading: isDataLoading,
    addFailure,
    updateFailure,
    deleteFailure,
    refetch,
  } = useComponentFailures(swComponentUuid);

  const [tableData, setTableData] = useState<SafetyTableRow[]>([]);
  const [editingKey, setEditingKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [failureToDelete, setFailureToDelete] = useState<Failure | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletionPreview | null>(null);

  useEffect(() => {
    if (!swComponent) return;

    if (failures.length === 0) {
      setTableData([]);
    } else {
      const tableRows: SafetyTableRow[] = failures.map(failure => ({
        key: failure.failureUuid,
        swComponentUuid: swComponentUuid,
        swComponentName: swComponent.name,
        failureName: failure.failureName || '',
        failureDescription: failure.failureDescription || '',
        asil: failure.asil || 'TBC',
        failureUuid: failure.failureUuid,
        riskRatingCount: failure.riskRatingCount,
        safetyTaskCount: failure.safetyTaskCount,
        safetyReqCount: failure.safetyReqCount,
        safetyNoteCount: failure.safetyNoteCount,
      }));
      setTableData(tableRows);
    }
  }, [failures, swComponent, swComponentUuid]);

  const handleEdit = (record: SafetyTableRow) => {
    form.setFieldsValue({
      failureName: record.failureName,
      failureDescription: record.failureDescription,
      asil: record.asil,
    });
    setEditingKey(record.key);
  };

  const handleCancel = () => {
    const newKey = editingKey;
    setEditingKey('');
    // If we were adding a new row, remove it from the table data
    if(tableData.find(item => item.key === newKey)?.isNewRow) {
      setTableData(prev => prev.filter(row => row.key !== newKey));
    }
  };

  const handleSave = async (key: React.Key) => {
    try {
      const row = await form.validateFields();
      const record = tableData.find(item => key === item.key);
      if (!record) return;

      setIsSaving(true);
      
      let result;
      if (record.isNewRow) {
        result = await addFailure(row);
      } else {
        if (!record.failureUuid) {
          message.error('Cannot update failure: No failure UUID found');
          setIsSaving(false);
          return;
        }
        result = await updateFailure(record.failureUuid, row);
      }

      if (result.success) {
        setEditingKey('');
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
      message.error('Please fill in all required fields');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFailure = () => {
    if (!swComponent) return;
    
    const newKey = `${swComponentUuid}-new-${Date.now()}`;
    form.setFieldsValue({ failureName: '', failureDescription: '', asil: 'TBC' });
    setEditingKey(newKey);
    
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid,
      swComponentName: swComponent.name,
      failureName: '',
      failureDescription: '',
      asil: 'TBC',
      isNewRow: true
    };
    
    setTableData(prev => [newRow, ...prev]);
  };
  
  const handleDeleteWithModal = async (record: SafetyTableRow) => {
    if (!record.failureUuid) {
      message.error('Cannot delete failure: No failure UUID found');
      return;
    }

    try {
      const previewResponse = await fetch('/api/safety/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', nodeUuid: record.failureUuid, nodeType: 'FAILUREMODE' }),
      });
      
      const previewResult = await previewResponse.json();
      
      if (previewResult.success && previewResult.data) {
        setDeletePreview(previewResult.data);
        const failure = failures.find(f => f.failureUuid === record.failureUuid);
        if (failure) {
          setFailureToDelete(failure);
          setIsDeleteModalVisible(true);
        }
      } else {
        message.error(`Failed to preview deletion: ${previewResult.message}`);
      }
    } catch (error) {
      message.error('Failed to preview deletion');
    }
  };

  // Define columns for the SW failure modes table
  const columns: SafetyTableColumn[] = [
    {
      key: 'swComponentName',
      title: 'SW Component',
      dataIndex: 'swComponentName',
      searchable: true,
      width: 200,
    },
    {
      key: 'failureName',
      title: 'Failure Name',
      dataIndex: 'failureName',
      editable: true,
      searchable: true,
      multiLine: true,
      render: (text: unknown) => <strong>{String(text || '-')}</strong>,
    },
    {
      key: 'failureDescription',
      title: 'Description',
      dataIndex: 'failureDescription',
      editable: true,
      searchable: true,
      width: 300,
      multiLine: true,
      render: (text: unknown) => (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {String(text || '-')}
        </div>
      ),
    },
    {
      key: 'asil',
      title: 'ASIL',
      dataIndex: 'asil',
      editable: true,
      inputType: 'select',
      width: 80,
      selectOptions: [
        { value: 'A', label: 'ASIL A' },
        { value: 'B', label: 'ASIL B' },
        { value: 'C', label: 'ASIL C' },
        { value: 'D', label: 'ASIL D' },
        { value: 'QM', label: 'QM' },
        { value: 'TBC', label: 'TBC' },
      ],
    },
  ];

  return (
    <div className="sw-failure-modes-table-container">
      <BaseFailureModeTable
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CodeOutlined style={{ fontSize: '23px', color: '#1890ff' }} />
              <Title level={4} style={{ margin: 0 }}>
                Functional Failure Modes for {swComponent.name}
              </Title>
            </div>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddFailure}
              size="small"
            >
              Add Failure Mode
            </Button>
          </div>
        }
        dataSource={tableData}
        columns={columns}
        loading={isSaving || isDataLoading}
        editingKey={editingKey}
        onEdit={handleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onAdd={handleAddFailure}
        onDelete={handleDeleteWithModal}
        isSaving={isSaving}
        showComponentActions={true}
        form={form}
        scroll={{ x: 'max-content' }}
        onFailureSelect={onFailureSelect}
        selectedFailures={selectedFailures}
        emptyStateConfig={{
          primaryMessage: 'No failure modes defined for this SW component',
          secondaryMessage: `Component: ${swComponent.name}`,
        }}
        getFailureSelectionState={getFailureSelectionState}
        handleFailureSelection={handleFailureSelection}
        isCauseSelected={isCauseSelected}
        refreshData={refetch}
      />
      <CascadeDeleteModal
        open={isDeleteModalVisible && !!deletePreview}
        onCancel={() => {
          setIsDeleteModalVisible(false);
          setDeletePreview(null);
          setFailureToDelete(null);
        }}
        onConfirm={async () => {
          if (failureToDelete?.failureUuid) {
            try {
              const response = await fetch('/api/safety/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  action: 'execute', 
                  nodeUuid: failureToDelete.failureUuid,
                  nodeType: 'FAILUREMODE' // Add the missing nodeType
                }),
              });
              const result = await response.json();
              if (result.success) {
                message.success('Failure mode and related items deleted successfully.');
                deleteFailure(failureToDelete.failureUuid);
              } else {
                message.error(`Deletion failed: ${result.message}`);
              }
            } catch (error) {
              message.error('An error occurred during deletion.');
            } finally {
              setIsDeleteModalVisible(false);
              setDeletePreview(null);
              setFailureToDelete(null);
            }
          }
        }}
        previewData={deletePreview}
      />
    </div>
  );
}
