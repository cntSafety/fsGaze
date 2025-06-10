'use client';

import React, { useState, useEffect } from 'react';
import { Card, Spin, Typography, Descriptions, Button, message, Form } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { getInfoForAppSWComp } from '../../services/neo4j/queries/components';
import { getFailuresForSwComponents, createFailureNode, deleteFailureNode, getFailuresForPorts } from '../../services/neo4j/queries/safety';
import { getProviderPortsForSWComponent } from '../../services/neo4j/queries/ports';
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

interface PortFailure {
  failureUuid: string;
  failureName: string | null;
  failureDescription: string | null;
  asil: string | null;
  failureType: string | null;
  relationshipType: string;
}

interface ProviderPort {
  name: string;
  uuid: string;
  type: string;
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
  
  // Provider ports state
  const [providerPorts, setProviderPorts] = useState<ProviderPort[]>([]);
  const [portFailures, setPortFailures] = useState<{[portUuid: string]: PortFailure[]}>({});
  const [portTableData, setPortTableData] = useState<SafetyTableRow[]>([]);
  const [editingPortKey, setEditingPortKey] = useState('');
  const [isSavingPort, setIsSavingPort] = useState(false);

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
        
        // Get provider ports for this component
        const providerPortsResult = await getProviderPortsForSWComponent(swComponentUuid);
        if (providerPortsResult.success && providerPortsResult.data) {
          setProviderPorts(providerPortsResult.data);
          console.log('Provider Ports:', providerPortsResult.data);
          
          // Get failures for each provider port
          const portFailuresMap: {[portUuid: string]: PortFailure[]} = {};
          const allPortTableRows: SafetyTableRow[] = [];
          
          for (const port of providerPortsResult.data) {
            const portFailuresResult = await getFailuresForPorts(port.uuid);
            if (portFailuresResult.success && portFailuresResult.data) {
              portFailuresMap[port.uuid] = portFailuresResult.data;
              
              // Convert port failures to table data format
              if (portFailuresResult.data.length > 0) {
                portFailuresResult.data.forEach(failure => {
                  allPortTableRows.push({
                    key: `${port.uuid}-${failure.failureUuid}`,
                    swComponentUuid: port.uuid, // Using port UUID as identifier
                    swComponentName: `${port.name} (${port.type})`,
                    failureName: failure.failureName || '',
                    failureDescription: failure.failureDescription || '', // Use failureDescription from the failure data
                    asil: failure.asil || 'A', // Use actual ASIL from database
                    failureUuid: failure.failureUuid
                  });
                });
              } else {
                // Add placeholder row for ports with no failures
                allPortTableRows.push({
                  key: `${port.uuid}-empty`,
                  swComponentUuid: port.uuid,
                  swComponentName: `${port.name} (${port.type})`,
                  failureName: 'No failures defined',
                  failureDescription: '-',
                  asil: '-'
                });
              }
            }
          }
          
          setPortFailures(portFailuresMap);
          setPortTableData(allPortTableRows);
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

        if (result.success && result.failureUuid) {
          // Update local state instead of reloading everything
          const newFailure: Failure = {
            failureUuid: result.failureUuid,
            failureName: row.failureName,
            failureDescription: row.failureDescription,
            asil: row.asil,
            relationshipType: 'HAS_FAILURE'
          };
          
          // Update failures array
          setFailures(prev => [...prev, newFailure]);
          
          // Update table data with the new failure
          const newTableRow: SafetyTableRow = {
            key: result.failureUuid,
            swComponentUuid: swComponentUuid,
            swComponentName: swComponent!.name,
            failureName: row.failureName,
            failureDescription: row.failureDescription,
            asil: row.asil,
            failureUuid: result.failureUuid
          };
          
          // Replace the temporary row with the real one, or remove "No failures defined" if this is the first failure
          setTableData(prev => {
            // If this was the first failure and we only had "No failures defined", replace the placeholder
            if (prev.length === 1 && prev[0].failureName === 'No failures defined') {
              return [newTableRow];
            }
            // Otherwise, replace the temporary new row
            return prev.map(item => 
              item.key === record.key ? newTableRow : item
            );
          });
          
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
    // Remove temporary new rows or restore "No failures defined" if needed
    setTableData(prev => {
      const filtered = prev.filter(row => !row.isNewRow || row.key !== editingKey);
      
      // If we removed the only row and there are no real failures, add back "No failures defined"
      if (filtered.length === 0 && failures.length === 0 && swComponent) {
        return [{
          key: `${swComponentUuid}-empty`,
          swComponentUuid,
          swComponentName: swComponent.name,
          failureName: 'No failures defined',
          failureDescription: '-',
          asil: '-'
        }];
      }
      
      return filtered;
    });
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
        // Update local state instead of reloading everything
        const newFailures = failures.filter(f => f.failureUuid !== record.failureUuid);
        setFailures(newFailures);
        
        // Update table data and check if we need to add "No failures defined"
        setTableData(prev => {
          const filtered = prev.filter(row => row.failureUuid !== record.failureUuid);
          
          // If this was the last failure for the component, add "No failures defined"
          if (newFailures.length === 0 && swComponent) {
            return [{
              key: `${swComponentUuid}-empty`,
              swComponentUuid,
              swComponentName: swComponent.name,
              failureName: 'No failures defined',
              failureDescription: '-',
              asil: '-'
            }];
          }
          
          return filtered;
        });
        
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
    
    // If we currently have "No failures defined", replace it, otherwise add to the end
    setTableData(prev => {
      if (prev.length === 1 && prev[0].failureName === 'No failures defined') {
        return [newRow];
      }
      return [...prev, newRow];
    });
  };

  // Port failure handlers
  const handleEditPort = (record: SafetyTableRow) => {
    form.setFieldsValue({
      failureName: record.failureName,
      failureDescription: record.failureDescription,
      asil: record.asil,
    });
    setEditingPortKey(record.key);
  };

  const handleSavePort = async (key: React.Key) => {
    try {
      const row = await form.validateFields();
      const record = portTableData.find(item => key === item.key);
      
      if (!record) return;

      setIsSavingPort(true);
      
      if (record.isNewRow || record.failureName === 'No failures defined') {
        // Create new failure for port - use the port UUID (stored in swComponentUuid for ports)
        const result = await createFailureNode(
          record.swComponentUuid!, // This is the port UUID for port records
          row.failureName,
          row.failureDescription || '',
          row.asil
        );

        if (result.success && result.failureUuid) {
          // Update local state instead of reloading everything
          const portUuid = record.swComponentUuid!;
          const newPortFailure: PortFailure = {
            failureUuid: result.failureUuid,
            failureName: row.failureName,
            failureDescription: row.failureDescription || '',
            asil: row.asil,
            failureType: null,
            relationshipType: 'HAS_FAILURE'
          };
          
          // Update port failures map
          setPortFailures(prev => ({
            ...prev,
            [portUuid]: [...(prev[portUuid] || []), newPortFailure]
          }));
          
          // Find the port info for the table row
          const port = providerPorts.find(p => p.uuid === portUuid);
          const newTableRow: SafetyTableRow = {
            key: `${portUuid}-${result.failureUuid}`,
            swComponentUuid: portUuid,
            swComponentName: `${port?.name || 'Unknown'} (${port?.type || 'P_PORT_PROTOTYPE'})`,
            failureName: row.failureName,
            failureDescription: row.failureDescription || '',
            asil: row.asil,
            failureUuid: result.failureUuid
          };
          
          // Update port table data
          setPortTableData(prev => {
            if (record.failureName === 'No failures defined') {
              // Replace the "No failures defined" row with the new failure
              return prev.map(item => 
                item.key === record.key ? newTableRow : item
              );
            } else {
              // Replace the temporary new row
              return prev.map(item => 
                item.key === record.key ? newTableRow : item
              );
            }
          });
          
          setEditingPortKey('');
          message.success('Port failure mode added successfully!');
        } else {
          message.error(`Error: ${result.message}`);
        }
      } else {
        // Update existing failure (placeholder for future implementation)
        const newData = [...portTableData];
        const index = newData.findIndex(item => key === item.key);
        if (index > -1) {
          const item = newData[index];
          newData.splice(index, 1, {
            ...item,
            ...row,
          });
          setPortTableData(newData);
          setEditingPortKey('');
          message.success('Port failure mode updated successfully!');
        }
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
      message.error('Please fill in all required fields');
    } finally {
      setIsSavingPort(false);
    }
  };

  const handleCancelPort = () => {
    // Remove temporary new rows or restore "No failures defined" if needed
    setPortTableData(prev => {
      const filtered = prev.filter(row => !row.isNewRow || row.key !== editingPortKey);
      
      // Check if we need to restore "No failures defined" for any ports
      const restoredData = [...filtered];
      
      // For each provider port, check if it has no failures and no placeholder row
      providerPorts.forEach(port => {
        const portRows = restoredData.filter(row => row.swComponentUuid === port.uuid);
        const portFailuresCount = portFailures[port.uuid]?.length || 0;
        
        // If the port has no failures and no rows in the table, add "No failures defined"
        if (portFailuresCount === 0 && portRows.length === 0) {
          restoredData.push({
            key: `${port.uuid}-empty`,
            swComponentUuid: port.uuid,
            swComponentName: `${port.name} (${port.type})`,
            failureName: 'No failures defined',
            failureDescription: '-',
            asil: '-'
          });
        }
      });
      
      return restoredData;
    });
    setEditingPortKey('');
  };

  const handleDeletePort = async (record: SafetyTableRow) => {
    if (!record.failureUuid) {
      message.error('Cannot delete failure: No failure UUID found');
      return;
    }

    try {
      setIsSavingPort(true);
      
      const result = await deleteFailureNode(record.failureUuid);
      
      if (result.success) {
        // Update local state instead of reloading everything
        const portUuid = record.swComponentUuid!;
        
        // Update port failures map and handle UI updates
        setPortFailures(prev => {
          const updatedPortFailures = {
            ...prev,
            [portUuid]: prev[portUuid]?.filter(f => f.failureUuid !== record.failureUuid) || []
          };
          
          // Check if this was the last failure for this port
          const remainingFailures = updatedPortFailures[portUuid] || [];
          
          if (remainingFailures.length === 0) {
            // Replace with "No failures defined" row
            const port = providerPorts.find(p => p.uuid === portUuid);
            const placeholderRow: SafetyTableRow = {
              key: `${portUuid}-empty`,
              swComponentUuid: portUuid,
              swComponentName: `${port?.name || 'Unknown'} (${port?.type || 'P_PORT_PROTOTYPE'})`,
              failureName: 'No failures defined',
              failureDescription: '-',
              asil: '-'
            };
            
            setPortTableData(prev => prev.map(row => 
              row.failureUuid === record.failureUuid ? placeholderRow : row
            ));
          } else {
            // Just remove the deleted row
            setPortTableData(prev => prev.filter(row => row.failureUuid !== record.failureUuid));
          }
          
          return updatedPortFailures;
        });
        
        message.success('Port failure mode deleted successfully!');
      } else {
        message.error(`Error deleting failure: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting port failure:', error);
      message.error('Failed to delete port failure mode');
    } finally {
      setIsSavingPort(false);
    }
  };

  const handleAddPortFailure = (portUuid: string, portName: string) => {
    const newKey = `${portUuid}-new-${Date.now()}`;
    form.setFieldsValue({
      failureName: '',
      failureDescription: '',
      asil: 'A'
    });
    setEditingPortKey(newKey);
    
    // Add a temporary row for editing
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid: portUuid, // Store port UUID here
      swComponentName: portName,
      failureName: '',
      failureDescription: '',
      asil: 'A',
      isNewRow: true
    };
    
    // Handle the placement of the new row
    setPortTableData(prev => {
      const newData = [...prev];
      
      // Check if the port currently shows "No failures defined"
      const noFailuresIndex = newData.findIndex(row => 
        row.swComponentUuid === portUuid && row.failureName === 'No failures defined'
      );
      
      if (noFailuresIndex !== -1) {
        // Replace the "No failures defined" row with the new editable row
        newData[noFailuresIndex] = newRow;
        console.log('Replacing "No failures defined" for port:', portName, 'at index:', noFailuresIndex);
      } else {
        // Find the last index of rows with the same port UUID and insert after
        let insertIndex = newData.length;
        for (let i = newData.length - 1; i >= 0; i--) {
          if (newData[i].swComponentUuid === portUuid) {
            insertIndex = i + 1;
            break;
          }
        }
        // Insert the new row at the correct position
        newData.splice(insertIndex, 0, newRow);
        console.log('Adding new failure for port:', portName, 'at index:', insertIndex);
      }
      
      return newData;
    });
  };

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
      ],
    },
  ];

  // Define columns for the provider ports failure modes table
  const portColumns: SafetyTableColumn[] = [
    {
      key: 'portName',
      title: 'Provider Port',
      dataIndex: 'swComponentName',
      searchable: true,
      width: 200,
      render: (text: string, record: SafetyTableRow, index: number) => {
        // Only show port name on the first row for each port in table order
        const isFirstRowForPort = index === 0 || 
          portTableData[index - 1]?.swComponentUuid !== record.swComponentUuid;
        
        if (!isFirstRowForPort) {
          return null; // Return blank space for subsequent rows of the same port
        }
        
        // Extract port name from the format "PortName (P_PORT_PROTOTYPE)"
        const match = text.match(/^(.+)\s+\(.*\)$/);
        const portName = match ? match[1] : text;
        return (
          <Typography.Text strong style={{ color: '#1890ff' }}>
            {portName}
          </Typography.Text>
        );
      },
    },
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
      minWidth: 200,
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
      ],
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
          <Descriptions.Item label="Total Provider Ports">
            <Text strong>{providerPorts.length}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

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

      {/* Provider Ports Failure Modes Section */}
      <Card style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={3} style={{ margin: 0 }}>
            Provider Ports Failure Modes
          </Title>
        </div>
        
        {portTableData.length > 0 ? (
          <CoreSafetyTable
            dataSource={portTableData}
            columns={portColumns} // Use the port-specific columns
            loading={false}
            editingKey={editingPortKey}
            onEdit={handleEditPort}
            onSave={handleSavePort}
            onCancel={handleCancelPort}
            onAdd={handleAddPortFailure}
            onDelete={handleDeletePort}
            isSaving={isSavingPort}
            showComponentActions={true} // Enable the "Add Failure" action for each port
            form={form}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} port failure modes`,
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
              {providerPorts.length === 0 
                ? 'No provider ports found for this component'
                : 'No failure modes defined for any provider ports'
              }
            </Typography.Text>
            {providerPorts.length > 0 && (
              <>
                <br />
                <Typography.Text type="secondary" style={{ fontSize: '14px', marginTop: '8px' }}>
                  Provider ports: {providerPorts.map(port => port.name).join(', ')}
                </Typography.Text>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
