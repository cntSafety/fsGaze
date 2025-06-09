'use client';

import React, { useState, useEffect } from 'react';
import { Card, Spin, Typography, Descriptions, Button, message, Form } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { getInfoForAppSWComp } from '../../services/neo4j/queries/components';
import { getFailuresForSwComponents, createFailureNode, deleteFailureNode } from '../../services/neo4j/queries/safety';
import CoreSafetyTable, { SafetyTableRow, SafetyTableColumn } from './CoreSafetyTable';

const { Title, Text } = Typography;

interface SwComponent {
  uuid: string;
  name: string;
  description?: string;
  arxmlPath?: string;
  componentType?: string;
}

interface Failure {
  failureUuid: string;
  failureName: string | null;
  failureDescription: string | null;
  asil: string | null;
  relationshipType: string;
}

interface SwSafetyAnalysisComponentProps {
  swComponentUuid: string;
}

export default function SwSafetyAnalysisComponent({ swComponentUuid }: SwSafetyAnalysisComponentProps) {
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [swComponent, setSwComponent] = useState<SwComponent | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [tableData, setTableData] = useState<SafetyTableRow[]>([]);
  const [editingKey, setEditingKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadComponentData();
  }, [swComponentUuid]);

  const loadComponentData = async () => {
    try {
      setLoading(true);
      
      // Get SW component details using the new efficient query
      const swComponentResult = await getInfoForAppSWComp(swComponentUuid);
      if (swComponentResult.success && swComponentResult.data) {
        setSwComponent(swComponentResult.data);
        console.log('SW Component:', swComponentResult.data);
           // Get failures for this component
      const failuresResult = await getFailuresForSwComponents(swComponentUuid);
      if (failuresResult.success && failuresResult.data) {
        setFailures(failuresResult.data);
        
        // Convert failures to table data format
        const tableRows: SafetyTableRow[] = failuresResult.data.map(failure => ({
          key: failure.failureUuid,
          swComponentUuid: swComponentUuid,
          swComponentName: swComponentResult.data.name,
          failureName: failure.failureName || '',
          failureDescription: failure.failureDescription || '',
          asil: failure.asil || 'A',
          failureUuid: failure.failureUuid
        }));
        setTableData(tableRows);
      }
      } else {
        message.error(swComponentResult.message || 'SW Component not found');
      }
    } catch (error) {
      console.error('Error loading component data:', error);
      message.error('Failed to load component data');
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    router.push('/arxml-safety');
  };

  const handleEdit = (record: SafetyTableRow) => {
    form.setFieldsValue({
      failureName: record.failureName,
      failureDescription: record.failureDescription,
      asil: record.asil,
    });
    setEditingKey(record.key);
  };

  const handleSave = async (key: React.Key) => {
    try {
      const row = await form.validateFields();
      const record = tableData.find(item => key === item.key);
      
      if (!record) return;

      setIsSaving(true);
      
      if (record.isNewRow) {
        // Create new failure
        const result = await createFailureNode(
          swComponentUuid,
          row.failureName,
          row.failureDescription,
          row.asil
        );

        if (result.success) {
          await loadComponentData(); // Reload data
          setEditingKey('');
          message.success('Failure mode added successfully!');
        } else {
          message.error(`Error: ${result.message}`);
        }
      } else {
        // Update existing failure (placeholder for future implementation)
        const newData = [...tableData];
        const index = newData.findIndex(item => key === item.key);
        if (index > -1) {
          const item = newData[index];
          newData.splice(index, 1, {
            ...item,
            ...row,
          });
          setTableData(newData);
          setEditingKey('');
          message.success('Failure mode updated successfully!');
        }
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
      message.error('Please fill in all required fields');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Remove temporary new rows
    setTableData(prev => prev.filter(row => !row.isNewRow || row.key !== editingKey));
    setEditingKey('');
  };

  const handleDelete = async (record: SafetyTableRow) => {
    if (!record.failureUuid) {
      message.error('Cannot delete failure: No failure UUID found');
      return;
    }

    try {
      setIsSaving(true);
      
      const result = await deleteFailureNode(record.failureUuid);
      
      if (result.success) {
        await loadComponentData(); // Reload all data
        message.success('Failure mode deleted successfully!');
      } else {
        message.error(`Error deleting failure: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting failure:', error);
      message.error('Failed to delete failure mode');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFailure = () => {
    if (!swComponent) return;
    
    const newKey = `${swComponentUuid}-new-${Date.now()}`;
    form.setFieldsValue({
      failureName: '',
      failureDescription: '',
      asil: 'A'
    });
    setEditingKey(newKey);
    
    // Add a temporary row for editing
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid,
      swComponentName: swComponent.name,
      failureName: '',
      failureDescription: '',
      asil: 'A',
      isNewRow: true
    };
    
    setTableData(prev => [...prev, newRow]);
  };

  // Define columns for the failure modes table
  const columns: SafetyTableColumn[] = [
    {
      key: 'failureName',
      title: 'Failure Name',
      dataIndex: 'failureName',
      editable: true,
      searchable: true,
      width: '25%',
      render: (text: string | null) => text || '-',
    },
    {
      key: 'failureDescription',
      title: 'Description',
      dataIndex: 'failureDescription',
      editable: true,
      searchable: true,
      width: '50%',
      render: (text: string | null) => text || '-',
    },
    {
      key: 'asil',
      title: 'ASIL',
      dataIndex: 'asil',
      editable: true,
      inputType: 'select',
      selectOptions: [
        { value: 'A', label: 'ASIL A' },
        { value: 'B', label: 'ASIL B' },
        { value: 'C', label: 'ASIL C' },
        { value: 'D', label: 'ASIL D' },
        { value: 'QM', label: 'QM' },
      ],
      width: '15%',
    },
    {
      key: 'failureUuid',
      title: 'UUID',
      dataIndex: 'failureUuid',
      width: '10%',
      render: (uuid: string) => (
        uuid ? (
          <Typography.Text code style={{ fontSize: '10px' }}>
            {uuid.substring(0, 8)}...
          </Typography.Text>
        ) : '-'
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '400px' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!swComponent) {
    return (
      <div style={{ padding: '24px' }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBackClick}
          style={{ marginBottom: '16px' }}
        >
          Back to Safety Analysis
        </Button>
        <Card>
          <Text type="danger">SW Component not found</Text>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={handleBackClick}
        style={{ marginBottom: '16px' }}
      >
        Back to Safety Analysis
      </Button>

      <Card style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ marginBottom: '16px' }}>
          SW Component Safety Analysis
        </Title>
        
        <Descriptions 
          bordered 
          column={1} 
          size="middle"
          styles={{ label: { fontWeight: 'bold', width: '150px' } }}
        >
          <Descriptions.Item label="Component Name">
            <Text strong style={{ fontSize: '16px' }}>{swComponent.name}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="UUID">
            <Text code>{swComponent.uuid}</Text>
          </Descriptions.Item>
          {swComponent.componentType && (
            <Descriptions.Item label="Component Type">
              <Text>{swComponent.componentType}</Text>
            </Descriptions.Item>
          )}
          {swComponent.arxmlPath && (
            <Descriptions.Item label="ARXML Path">
              <Text code style={{ fontSize: '12px' }}>{swComponent.arxmlPath}</Text>
            </Descriptions.Item>
          )}
          {swComponent.description && (
            <Descriptions.Item label="Description">
              {swComponent.description}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Total Failures">
            <Text strong>{failures.length}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={3} style={{ margin: 0 }}>
            Failure Modes
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
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} failure modes`,
              pageSizeOptions: ['10', '20', '50'],
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
    </div>
  );
}
