import React, { useState, useEffect } from 'react';
import { Form } from 'antd';
import { SafetyTableColumn, SafetyTableRow } from '../CoreSafetyTable';
import { useReceiverPortFailures } from './hooks/useReceiverPortFailures';
import { PortFailure, SwComponent } from './types';
import { BaseFailureModeTable } from './BaseFailureModeTable';
import { CascadeDeleteModal } from '../CascadeDeleteModal';
import type { DeletionPreview } from '../CascadeDeleteModal';
import { message } from 'antd';

interface ReceiverPortsFailureModesTableProps {
  swComponent: SwComponent;
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
}

export default function ReceiverPortsFailureModesTable({
  swComponent,
  onFailureSelect,
  selectedFailures,
  getFailureSelectionState,
  handleFailureSelection,
  isCauseSelected,
}: ReceiverPortsFailureModesTableProps) {
  const [form] = Form.useForm();
  const {
    receiverPorts,
    portFailures,
    loading,
    error,
    refetch,
    addPortFailure,
    updatePortFailure,
    deletePortFailure,
  } = useReceiverPortFailures(swComponent.uuid);

  const [tableData, setTableData] = useState<SafetyTableRow[]>([]);
  const [editingKey, setEditingKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [failureToDelete, setFailureToDelete] = useState<(PortFailure & { portUuid: string }) | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletionPreview | null>(null);

  useEffect(() => {
    const allPortTableRows: SafetyTableRow[] = [];
    
    for (const port of receiverPorts) {
      const failures = portFailures[port.uuid] || [];
      
      if (failures.length > 0) {
        failures.forEach(failure => {
          allPortTableRows.push({
            key: `${port.uuid}-${failure.failureUuid}`,
            swComponentUuid: port.uuid,
            swComponentName: `${port.name} (${port.type})`,
            failureName: failure.failureName || '',
            failureDescription: failure.failureDescription || '',
            asil: failure.asil || 'TBC',
            failureUuid: failure.failureUuid,
            riskRatingCount: failure.riskRatingCount,
            safetyTaskCount: failure.safetyTaskCount,
            safetyReqCount: failure.safetyReqCount,
            safetyNoteCount: failure.safetyNoteCount,
          });
        });
      } else {
        allPortTableRows.push({
          key: `${port.uuid}-empty`,
          swComponentUuid: port.uuid,
          swComponentName: `${port.name} (${port.type})`,
          failureName: 'No failure modes defined',
          failureDescription: '-',
          asil: '-',
          isPlaceholder: true
        });
      }
    }
    
    setTableData(allPortTableRows);
  }, [receiverPorts, portFailures]);

  const handleEdit = (record: SafetyTableRow) => {
    form.setFieldsValue({
      failureName: record.failureName,
      failureDescription: record.failureDescription,
      asil: record.asil,
    });
    setEditingKey(record.key);
  };

  const handleCancel = () => {
    const key = editingKey;
    setEditingKey('');
    const record = tableData.find(item => item.key === key);
    if (record?.isNewRow) {
      setTableData(prev => prev.filter(row => row.key !== key));
    }
  };

  const handleSave = async (key: React.Key) => {
    try {
      const row = await form.validateFields();
      const record = tableData.find(item => item.key === key);
      if (!record || !record.swComponentUuid) return;

      setIsSaving(true);
      
      let result;
      if (record.isNewRow || record.isPlaceholder) {
        result = await addPortFailure(record.swComponentUuid, row);
      } else {
        if (!record.failureUuid) {
          message.error('Cannot update failure: No failure UUID found');
          setIsSaving(false);
          return;
        }
        result = await updatePortFailure(record.swComponentUuid, record.failureUuid, row);
      }

      if (result.success) {
        setEditingKey('');
      }
    } catch (errInfo) {
      message.error('Please fill in all required fields');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFailure = (portUuid: string, portName: string) => {
    const newKey = `${portUuid}-new-${Date.now()}`;
    form.setFieldsValue({ failureName: '', failureDescription: '', asil: 'TBC' });
    setEditingKey(newKey);
    
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid: portUuid,
      swComponentName: portName,
      failureName: '',
      failureDescription: '',
      asil: 'TBC',
      isNewRow: true
    };
    
    setTableData(prev => {
        const newData = [...prev];
        const noFailuresIndex = newData.findIndex(row => row.swComponentUuid === portUuid && row.isPlaceholder);
        if (noFailuresIndex !== -1) {
            newData[noFailuresIndex] = newRow;
        } else {
            let insertIndex = newData.length;
            for (let i = newData.length - 1; i >= 0; i--) {
                if (newData[i].swComponentUuid === portUuid) {
                    insertIndex = i + 1;
                    break;
                }
            }
            newData.splice(insertIndex, 0, newRow);
        }
        return newData;
    });
  };

  const handleDeleteWithModal = async (record: SafetyTableRow) => {
    if (!record.failureUuid || !record.swComponentUuid) {
      message.error('Cannot delete failure: ID missing');
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
        const portFailure = portFailures[record.swComponentUuid]?.find(f => f.failureUuid === record.failureUuid);
        if (portFailure) {
            setFailureToDelete({ ...portFailure, portUuid: record.swComponentUuid });
            setIsDeleteModalVisible(true);
        }
      } else {
        message.error(`Failed to preview deletion: ${previewResult.message}`);
      }
    } catch (error) {
      message.error('Failed to preview deletion');
    }
  };

  const portColumns: SafetyTableColumn[] = [
    {
      key: 'portName',
      title: 'Receiver Port',
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
      minWidth: 150,
      multiLine: true,
      render: (text: unknown, record: SafetyTableRow) => {
        if (record.isPlaceholder) {
          return <span style={{ color: '#9ca3af' }}>{String(text || '-')}</span>;
        }
        return <strong>{String(text || '-')}</strong>;
      },
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
    <div style={{ fontSize: '14px' }}>
      <BaseFailureModeTable
        title={`Receiver Ports Failure Modes for ${swComponent.name}`}
        dataSource={tableData}
        columns={portColumns}
        loading={isSaving || loading}
        editingKey={editingKey}
        onEdit={handleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onAdd={handleAddFailure}
        onDelete={handleDeleteWithModal}
        isSaving={isSaving}
        showComponentActions={true}
        form={form}
        onFailureSelect={onFailureSelect}
        selectedFailures={selectedFailures}
        scroll={{ x: 'max-content' }}
        pagination={false}
        emptyStateConfig={{
            primaryMessage: receiverPorts.length === 0 
                ? 'No receiver ports found for this component'
                : 'No failure modes defined for any receiver ports',
            secondaryMessage: receiverPorts.length > 0 
                ? `Receiver ports: ${receiverPorts.map(port => port.name).join(', ')}`
                : undefined,
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
          if (failureToDelete?.failureUuid && failureToDelete.portUuid) {
            try {
              const response = await fetch('/api/safety/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'execute',
                  nodeUuid: failureToDelete.failureUuid,
                  nodeType: 'FAILUREMODE',
                }),
              });
              const result = await response.json();
              if (result.success) {
                deletePortFailure(failureToDelete.portUuid, failureToDelete.failureUuid);
                message.success('Receiver port failure mode deleted successfully.');
              } else {
                message.error(`Failed to delete port failure mode: ${result.message}`);
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