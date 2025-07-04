import React from 'react';
import { SafetyTableColumn, SafetyTableRow } from '../CoreSafetyTable';
import { useReceiverPortFailures } from './hooks/useReceiverPortFailures';
import { PortFailure, ProviderPort, SwComponent } from './types';
import { BaseFailureModeTable } from './BaseFailureModeTable';
import { CascadeDeleteModal } from '../CascadeDeleteModal';
import type { DeletionPreview } from '../CascadeDeleteModal';
import { message } from 'antd';

interface ReceiverPortsFailureModesTableProps {
  swComponent: SwComponent;
  receiverPorts: ProviderPort[];
  portFailures: {[portUuid: string]: PortFailure[]};
  setPortFailures: (portFailures: {[portUuid: string]: PortFailure[]}) => void;
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
  refreshData?: () => Promise<void>;
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
  loading?: boolean;
}

export default function ReceiverPortsFailureModesTable({
  swComponent,
  receiverPorts,
  portFailures,
  setPortFailures,
  onFailureSelect,
  selectedFailures,
  refreshData,
  getFailureSelectionState,
  handleFailureSelection,
  isCauseSelected,
  loading,
}: ReceiverPortsFailureModesTableProps) {
  const {
    form,
    portTableData,
    editingPortKey,
    isSavingPort,
    portCurrentPage,
    setPortCurrentPage,
    portPageSize,
    setPortPageSize,
    handleEditPort,
    handleSavePort,
    handleCancelPort,
    handleDeletePort,
    handleAddPortFailure
  } = useReceiverPortFailures(receiverPorts, portFailures, setPortFailures, refreshData);

  const [isDeleteModalVisible, setIsDeleteModalVisible] = React.useState(false);
  const [failureToDelete, setFailureToDelete] = React.useState<PortFailure | null>(null);
  const [portUuidToDelete, setPortUuidToDelete] = React.useState<string | null>(null);
  const [deletePreview, setDeletePreview] = React.useState<DeletionPreview | null>(null);

  // Override the handleDelete from the hook to implement modal logic
  const handleDeleteWithModal = async (record: SafetyTableRow) => {
    if (!record.failureUuid) {
      message.error('Cannot delete failure: No failure UUID found');
      return;
    }

    try {
      // Fetch preview data first
      const previewResponse = await fetch('/api/safety/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'preview',
          nodeUuid: record.failureUuid,
          nodeType: 'FAILUREMODE'
        }),
      });
      
      const previewResult = await previewResponse.json();
      
      if (previewResult.success && previewResult.data) {
        setDeletePreview(previewResult.data);
        setFailureToDelete({
          failureUuid: record.failureUuid,
          failureName: record.failureName,
          failureDescription: record.failureDescription,
          asil: record.asil,
          failureType: null,
          relationshipType: 'HAS_FAILURE'
        });
        setPortUuidToDelete(record.swComponentUuid || null);
        setIsDeleteModalVisible(true);
      } else {
        message.error(`Failed to preview deletion: ${previewResult.message}`);
      }
    } catch (error) {
      console.error('Error previewing deletion:', error);
      message.error('Failed to preview deletion');
    }
  };

  // Define columns for the receiver ports failure modes table
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
      multiLine: true, // Enable multi-line editing for failure name field
      render: (text: unknown) => <strong>{String(text || '-')}</strong>,
    },
    {
      key: 'failureDescription',
      title: 'Description',
      dataIndex: 'failureDescription',
      editable: true,
      searchable: true,
      ellipsis: true,
      minWidth: 200,
      multiLine: true, // Enable multi-line editing for description field
      render: (text: unknown) => String(text || '-'),
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
    <div style={{ 
      fontSize: '14px' // Base font size for the table
    }}>
      <style dangerouslySetInnerHTML={{
        __html: `
          .ant-table-tbody tr td:first-child {
            font-size: 13px !important;
            font-weight: normal !important;
          }
        `
      }} />
      <BaseFailureModeTable
      title={`Receiver Ports Failure Modes for ${swComponent.name}`}
      dataSource={portTableData}
      columns={portColumns}
      loading={isSavingPort || loading}
      editingKey={editingPortKey}
      onEdit={handleEditPort}
      onSave={handleSavePort}
      onCancel={handleCancelPort}
      onAdd={handleAddPortFailure}
      onDelete={handleDeleteWithModal}
      isSaving={isSavingPort}
      showComponentActions={true}
      form={form}
      onFailureSelect={onFailureSelect}
      selectedFailures={selectedFailures}
      scroll={{ x: 'max-content' }}
      pagination={{
        current: portCurrentPage,
        pageSize: portPageSize,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} port failure modes`,
        pageSizeOptions: ['10', '20', '50', '100'],
        onChange: (page, size) => {
          if (editingPortKey !== '') {
            handleCancelPort();
          }
          setPortCurrentPage(page);
          if (size !== portPageSize) {
            setPortPageSize(size);
          }
        },
        onShowSizeChange: (current, size) => {
          if (editingPortKey !== '') {
            handleCancelPort();
          }
          setPortCurrentPage(1);
          setPortPageSize(size);
        },
      }}
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
      refreshData={refreshData}
    />
    <CascadeDeleteModal
      open={isDeleteModalVisible && !!deletePreview}
      onCancel={() => {
        setIsDeleteModalVisible(false);
        setDeletePreview(null);
        setFailureToDelete(null);
        setPortUuidToDelete(null);
      }}
      onConfirm={async () => {
        if (failureToDelete?.failureUuid && portUuidToDelete) {
          try {
            // Call the backend API to actually delete the data
            const response = await fetch('/api/safety/delete', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'execute',
                nodeUuid: failureToDelete.failureUuid,
                nodeType: 'FAILUREMODE'
              }),
            });
            
            const result = await response.json();
            
            if (result.success) {
              // Refresh parent data instead of just updating local state
              if (refreshData) {
                await refreshData();
              }
              message.success('Receiver port failure mode deleted successfully');
            } else {
              message.error(`Failed to delete receiver port failure mode: ${result.message}`);
              return; // Don't close modal or update state if deletion failed
            }
          } catch (error) {
            console.error('Error deleting receiver port failure mode:', error);
            message.error('Failed to delete receiver port failure mode');
            return; // Don't close modal or update state if deletion failed
          }
        }
        setIsDeleteModalVisible(false);
        setDeletePreview(null);
        setFailureToDelete(null);
        setPortUuidToDelete(null);
      }}
      previewData={deletePreview}
      loading={false}
    />
    </div>
  );
}
