import React from 'react';
import { SafetyTableColumn } from '../CoreSafetyTable';
import { useReceiverPortFailures } from './hooks/useReceiverPortFailures';
import { PortFailure, ProviderPort } from './types';
import { BaseFailureModeTable } from './BaseFailureModeTable';

interface ReceiverPortsFailureModesTableProps {
  receiverPorts: ProviderPort[];
  portFailures: {[portUuid: string]: PortFailure[]};
  setPortFailures: (portFailures: {[portUuid: string]: PortFailure[]}) => void;
  // Add linking props
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
}

export default function ReceiverPortsFailureModesTable({
  receiverPorts,
  portFailures,
  setPortFailures,
  onFailureSelect,
  selectedFailures,
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
  } = useReceiverPortFailures(receiverPorts, portFailures, setPortFailures);

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
      title="Receiver Ports Failure Modes"
      dataSource={portTableData}
      columns={portColumns}
      loading={false}
      editingKey={editingPortKey}
      onEdit={handleEditPort}
      onSave={handleSavePort}
      onCancel={handleCancelPort}
      onAdd={handleAddPortFailure}
      onDelete={handleDeletePort}
      isSaving={isSavingPort}
      showComponentActions={true}
      form={form}
      onFailureSelect={onFailureSelect}
      selectedFailures={selectedFailures}
      pagination={{
        current: portCurrentPage,
        pageSize: portPageSize,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} port failure modes`,
        pageSizeOptions: ['10', '20', '50'],
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
    />
    </div>
  );
}
