import React from 'react';
import { Button } from 'antd';
import { PlusOutlined, CodeOutlined } from '@ant-design/icons';
import { SafetyTableColumn } from '../CoreSafetyTable';
import { useSwFailureModes } from './hooks/useSwFailureModes';
import { SwComponent, Failure } from './types';
import { BaseFailureModeTable } from './BaseFailureModeTable';

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
}

export default function SwFailureModesTable({
  swComponentUuid,
  swComponent,
  failures,
  setFailures,
  onFailureSelect,
  selectedFailures,
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
    handleAddFailure
  } = useSwFailureModes(swComponentUuid, swComponent, failures, setFailures);

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
    <BaseFailureModeTable
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CodeOutlined style={{ fontSize: '18px', color: '#1890ff' }} />
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#262626' }}>SW Failure Modes</span>
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
      loading={false}
      editingKey={editingKey}
      onEdit={handleEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      onAdd={handleAddFailure}
      onDelete={handleDelete}
      isSaving={isSaving}
      showComponentActions={true}
      form={form}
      onFailureSelect={onFailureSelect}
      selectedFailures={selectedFailures}
      pagination={{
        current: currentPage,
        pageSize: pageSize,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} failure modes`,
        pageSizeOptions: ['10', '20', '50'],
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
    />
  );
}
