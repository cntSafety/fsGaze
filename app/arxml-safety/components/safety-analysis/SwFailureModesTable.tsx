import React from 'react';
import { Button, Typography } from 'antd';
import { PlusOutlined, CodeOutlined } from '@ant-design/icons';
import { SafetyTableColumn, SafetyTableRow } from '../CoreSafetyTable';
import { useSwFailureModes } from './hooks/useSwFailureModes';
import { SwComponent, Failure } from './types';
import { BaseFailureModeTable } from './BaseFailureModeTable';
import { CascadeDeleteModal } from '../CascadeDeleteModal';
import type { DeletionPreview } from '../CascadeDeleteModal';
import { message } from 'antd';

const { Title } = Typography;

interface SwFailureModesTableProps {
  swComponentUuid: string;
  swComponent: SwComponent;
  failures: Failure[];
  setFailures: (failures: Failure[]) => void;
  // Add linking props
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
  refreshData?: () => Promise<void>;
  // Add causation linking props for modal
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
  loading?: boolean;
}

export default function SwFailureModesTable({
  swComponentUuid,
  swComponent,
  failures,
  setFailures,
  onFailureSelect,
  selectedFailures,
  refreshData,
  getFailureSelectionState,
  handleFailureSelection,
  isCauseSelected,
  loading,
}: SwFailureModesTableProps) {
  const {
    form,
    tableData,
    editingKey,
    isSaving,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    handleEdit,
    handleSave,
    handleCancel,
    handleDelete,
    handleAddFailure,
    isDeleteModalVisible,
    setIsDeleteModalVisible,
    failureToDelete,
    setFailureToDelete
  } = useSwFailureModes(swComponentUuid, swComponent, failures, setFailures, refreshData);

  const [deletePreview, setDeletePreview] = React.useState<DeletionPreview | null>(null);

  // Override the handleDelete from the hook to implement modal logic
  const handleDeleteWithModal = async (record: SafetyTableRow) => {
    console.log('🎯 SwFailureModesTable: Delete requested for', record.failureName);
    
    if (!record.failureUuid) {
      message.error('Cannot delete failure: No failure UUID found');
      return;
    }

    try {
      console.log('🔍 SwFailureModesTable: Making preview API call for UUID:', record.failureUuid);
      
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
      console.log('🔍 SwFailureModesTable: Preview result:', previewResult.success ? 'SUCCESS' : 'FAILED');
      
      if (previewResult.success && previewResult.data) {
        setDeletePreview(previewResult.data);
        setFailureToDelete({
          failureUuid: record.failureUuid,
          failureName: record.failureName,
          failureDescription: record.failureDescription ?? null,
          asil: record.asil ?? null,
          relationshipType: 'HAS_FAILURE'
        });
        setIsDeleteModalVisible(true);
      } else {
        console.error('❌ SwFailureModesTable: Preview failed:', previewResult.message);
        message.error(`Failed to preview deletion: ${previewResult.message}`);
      }
    } catch (error) {
      console.error('❌ SwFailureModesTable: Error previewing deletion:', error);
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
      width: 300,
      minWidth: 200,
      multiLine: true, // Enable multi-line editing for description field
      render: (text: unknown) => (
        <div 
          style={{
            maxWidth: 300,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          title={String(text || '')}
        >
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
              onClick={() => handleAddFailure()}
              size="small"
            >
              Add Failure Mode
            </Button>
          </div>
        }
        dataSource={tableData}
        columns={columns}
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
        scroll={{ x: 'max-content' }}
        onFailureSelect={onFailureSelect}
        selectedFailures={selectedFailures}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} failure modes`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, size) => {
            if (editingKey !== '') {
              handleCancel();
            }
            setCurrentPage(page);
            if (size !== pageSize) {
              setPageSize(size);
            }
          },
          onShowSizeChange: (current, size) => {
            if (editingKey !== '') {
              handleCancel();
            }
            setCurrentPage(1);
            setPageSize(size);
          },
        }}
        emptyStateConfig={{
          primaryMessage: 'No failure modes defined for this SW component',
          secondaryMessage: `Component: ${swComponent.name}`,
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
        }}
        onConfirm={async () => {
          console.log('🗑️ SwFailureModesTable: Delete confirmed for', failureToDelete?.failureName);
          if (failureToDelete?.failureUuid) {
            try {
              console.log('🌐 SwFailureModesTable: Calling delete API');
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
              console.log('🌐 SwFailureModesTable: Delete API response', result);
              
              if (result.success) {
                console.log('🔄 SwFailureModesTable: Calling refreshData');
                // Refresh parent data instead of just updating local state
                if (refreshData) {
                  await refreshData();
                  console.log('✅ SwFailureModesTable: refreshData completed');
                } else {
                  console.warn('⚠️ SwFailureModesTable: refreshData function not available');
                }
                message.success('Failure mode deleted successfully');
              } else {
                message.error(`Failed to delete failure mode: ${result.message}`);
                return; // Don't close modal or update state if deletion failed
              }
            } catch (error) {
              console.error('❌ SwFailureModesTable: Error deleting failure mode:', error);
              message.error('Failed to delete failure mode');
              return; // Don't close modal or update state if deletion failed
            }
          }
          setIsDeleteModalVisible(false);
          setDeletePreview(null);
          setFailureToDelete(null);
        }}
        previewData={deletePreview}
        loading={false}
      />
    </div>
  );
}
