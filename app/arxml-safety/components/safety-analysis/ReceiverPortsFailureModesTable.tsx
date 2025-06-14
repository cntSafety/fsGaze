import React from 'react';
import { Card, Typography, message } from 'antd';
import CoreSafetyTable, { SafetyTableColumn } from '../CoreSafetyTable';
import { useReceiverPortFailures } from './hooks/useReceiverPortFailures';
import { PortFailure, ProviderPort } from './types';
import { createRiskRatingNode } from '@/app/services/neo4j/queries/safety';

const { Title } = Typography;

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
    handleAddPortFailure  } = useReceiverPortFailures(receiverPorts, portFailures, setPortFailures);

  // Risk rating handler
  const handleRiskRating = async (failureUuid: string, severity: number, occurrence: number, detection: number, ratingComment?: string) => {
    try {
      const result = await createRiskRatingNode(failureUuid, severity, occurrence, detection, ratingComment);
      
      if (result.success) {
        message.success('Risk rating saved successfully!');
      } else {
        message.error(`Error saving risk rating: ${result.message}`);
      }
    } catch (error) {
      console.error('Error saving risk rating:', error);
      message.error('Failed to save risk rating');
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
      // Remove custom render function to let CoreSafetyTable handle it
    },
    {
      key: 'failureName',
      title: 'Failure Name',
      dataIndex: 'failureName',
      editable: true,
      searchable: true,
      minWidth: 150,
      render: (text: unknown) => String(text || '-'),
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
    <Card style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Title level={3} style={{ margin: 0 }}>
          Receiver Ports Failure Modes
        </Title>
      </div>
      
      {portTableData.length > 0 ? (        <CoreSafetyTable
          dataSource={portTableData}
          columns={portColumns}
          loading={false}
          editingKey={editingPortKey}
          onEdit={handleEditPort}
          onSave={handleSavePort}
          onCancel={handleCancelPort}
          onAdd={handleAddPortFailure}
          onDelete={handleDeletePort}
          onRiskRating={handleRiskRating}
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
              // Cancel editing if we're changing pages while editing
              if (editingPortKey !== '') {
                handleCancelPort();
              }
              setPortCurrentPage(page);
              if (size !== portPageSize) {
                setPortPageSize(size);
              }
            },
            onShowSizeChange: (current, size) => {
              // Cancel editing if we're changing page size while editing
              if (editingPortKey !== '') {
                handleCancelPort();
              }
              setPortCurrentPage(1); // Reset to first page when changing page size
              setPortPageSize(size);
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
            {receiverPorts.length === 0 
              ? 'No receiver ports found for this component'
              : 'No failure modes defined for any receiver ports'
            }
          </Typography.Text>
          {receiverPorts.length > 0 && (
            <>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: '14px', marginTop: '8px' }}>
                Receiver ports: {receiverPorts.map(port => port.name).join(', ')}
              </Typography.Text>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
