import React from 'react';
import { Card, Typography, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import CoreSafetyTable, { SafetyTableColumn } from '../CoreSafetyTable';
import { useSwFailureModes } from './hooks/useSwFailureModes';
import { SwComponent, Failure } from './types';

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

  // Define columns for the failure modes table
  const columns: SafetyTableColumn[] = [
    {
      key: 'failureName',
      title: 'Failure Name',
      dataIndex: 'failureName',
      editable: true,
      searchable: true,
      minWidth: 150,
      render: (text: string | null) => text || '-',
    },
    {
      key: 'failureDescription',
      title: 'Description',
      dataIndex: 'failureDescription',
      editable: true,
      searchable: true,
      ellipsis: true,
      minWidth: 250,
      render: (text: string | null) => text || '-',
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
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Title level={3} style={{ margin: 0 }}>
          Failure Modes for SW Component
        </Title>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={handleAddFailure}
          disabled={editingKey !== ''}
        >
          Add Failure Mode
        </Button>
      </div>
      
      {tableData.length > 0 ? (
        <CoreSafetyTable
          dataSource={tableData}
          columns={columns}
          loading={false}
          editingKey={editingKey}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
          isSaving={isSaving}
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
              // Cancel editing if we're changing pages while editing
              if (editingKey !== '') {
                handleCancel();
              }
              setCurrentPage(page);
              if (size !== pageSize) {
                setPageSize(size);
              }
            },
            onShowSizeChange: (current, size) => {
              // Cancel editing if we're changing page size while editing
              if (editingKey !== '') {
                handleCancel();
              }
              setCurrentPage(1); // Reset to first page when changing page size
              setPageSize(size);
            },
          }}
        />
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          backgroundColor: '#fafafa',
          borderRadius: '8px'
        }}>
          <Typography.Text type="secondary" style={{ fontSize: '16px' }}>
            No failure modes defined for this component
          </Typography.Text>
          <br />
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAddFailure}
            style={{ marginTop: '16px' }}
          >
            Add First Failure Mode
          </Button>
        </div>
      )}
    </Card>
  );
}
