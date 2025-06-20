import { useState, useEffect } from 'react';
import { Form, message } from 'antd';
import { createFailureModeNode, deleteFailureModeNode, updateFailureModeNode } from '../../../../services/neo4j/queries/safety/failureModes';
import { ProviderPort, PortFailure } from '../types';
import { SafetyTableRow } from '../../CoreSafetyTable';

export const useProviderPortFailures = (
  providerPorts: ProviderPort[],
  portFailures: {[portUuid: string]: PortFailure[]},
  setPortFailures: (portFailures: {[portUuid: string]: PortFailure[]}) => void
) => {
  const [form] = Form.useForm();
  const [portTableData, setPortTableData] = useState<SafetyTableRow[]>([]);
  const [editingPortKey, setEditingPortKey] = useState('');
  const [isSavingPort, setIsSavingPort] = useState(false);
  const [portCurrentPage, setPortCurrentPage] = useState(1);
  const [portPageSize, setPortPageSize] = useState(50);

  // Update port table data when portFailures or providerPorts change
  useEffect(() => {
    const allPortTableRows: SafetyTableRow[] = [];
    
    for (const port of providerPorts) {
      const failureModes = portFailures[port.uuid] || [];
      
      if (failureModes.length > 0) {
        failureModes.forEach(failure => {
          allPortTableRows.push({
            key: `${port.uuid}-${failure.failureUuid}`,
            swComponentUuid: port.uuid, // Using port UUID as identifier
            swComponentName: `${port.name} (${port.type})`,
            failureName: failure.failureName || '',
            failureDescription: failure.failureDescription || '', // Use failureDescription from the failure data
            asil: failure.asil || 'TBC', // Use actual ASIL from database
            failureUuid: failure.failureUuid
          });
        });
      } else {
        // Add placeholder row for ports with no failureModes
        allPortTableRows.push({
          key: `${port.uuid}-empty`,
          swComponentUuid: port.uuid,
          swComponentName: `${port.name} (${port.type})`,
          failureName: 'No failureModes defined',
          failureDescription: '-',
          asil: '-'
        });
      }
    }
    
    setPortTableData(allPortTableRows);
  }, [providerPorts, portFailures]);

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
      
      if (record.isNewRow || record.failureName === 'No failureModes defined') {
        // Create new failure for port - use the port UUID (stored in swComponentUuid for ports)
        const result = await createFailureModeNode(
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
          
          // Update port failureModes map
          setPortFailures({
            ...portFailures,
            [portUuid]: [...(portFailures[portUuid] || []), newPortFailure]
          });
          
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
            if (record.failureName === 'No failureModes defined') {
              // Replace the "No failureModes defined" row with the new failure
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
        // Update existing failure - call Neo4j update service
        if (!record.failureUuid) {
          message.error('Cannot update failure: No failure UUID found');
          return;
        }

        const result = await updateFailureModeNode(
          record.failureUuid,
          row.failureName,
          row.failureDescription || '',
          row.asil
        );

        if (result.success) {
          // Update local port failureModes map
          const portUuid = record.swComponentUuid!;
          const updatedPortFailures = {
            ...portFailures,
            [portUuid]: portFailures[portUuid]?.map(failure => 
              failure.failureUuid === record.failureUuid 
                ? {
                    ...failure,
                    failureName: row.failureName,
                    failureDescription: row.failureDescription || '',
                    asil: row.asil
                  }
                : failure
            ) || []
          };
          setPortFailures(updatedPortFailures);

          // Update table data
          const newData = [...portTableData];
          const index = newData.findIndex(item => key === item.key);
          if (index > -1) {
            const item = newData[index];
            newData.splice(index, 1, {
              ...item,
              ...row,
            });
            setPortTableData(newData);
          }
          
          setEditingPortKey('');
          message.success('Port failure mode updated successfully!');
        } else {
          message.error(`Error updating failure: ${result.message}`);
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
    // Remove temporary new rows or restore "No failureModes defined" if needed
    setPortTableData(prev => {
      const filtered = prev.filter(row => !row.isNewRow || row.key !== editingPortKey);
      
      // Check if we need to restore "No failureModes defined" for any ports
      const restoredData = [...filtered];
      
      // For each provider port, check if it has no failureModes and no placeholder row
      providerPorts.forEach(port => {
        const portRows = restoredData.filter(row => row.swComponentUuid === port.uuid);
        const portFailuresCount = portFailures[port.uuid]?.length || 0;
        
        // If the port has no failureModes and no rows in the table, add "No failureModes defined"
        if (portFailuresCount === 0 && portRows.length === 0) {
          restoredData.push({
            key: `${port.uuid}-empty`,
            swComponentUuid: port.uuid,
            swComponentName: `${port.name} (${port.type})`,
            failureName: 'No failureModes defined',
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
      
      const result = await deleteFailureModeNode(record.failureUuid);
      
      if (result.success) {
        // Update local state instead of reloading everything
        const portUuid = record.swComponentUuid!;
        
        // Update port failureModes map and handle UI updates
        const updatedPortFailures = {
          ...portFailures,
          [portUuid]: portFailures[portUuid]?.filter(f => f.failureUuid !== record.failureUuid) || []
        };
        
        // Check if this was the last failure for this port
        const remainingFailures = updatedPortFailures[portUuid] || [];
        
        if (remainingFailures.length === 0) {
          // Replace with "No failureModes defined" row
          const port = providerPorts.find(p => p.uuid === portUuid);
          const placeholderRow: SafetyTableRow = {
            key: `${portUuid}-empty`,
            swComponentUuid: portUuid,
            swComponentName: `${port?.name || 'Unknown'} (${port?.type || 'P_PORT_PROTOTYPE'})`,
            failureName: 'No failureModes defined',
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
        
        setPortFailures(updatedPortFailures);
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
      asil: 'TBC'
    });
    setEditingPortKey(newKey);
    
    // Add a temporary row for editing
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid: portUuid, // Store port UUID here
      swComponentName: portName,
      failureName: '',
      failureDescription: '',
      asil: 'TBC',
      isNewRow: true
    };
    
    // Handle the placement of the new row
    setPortTableData(prev => {
      const newData = [...prev];
      
      // Check if the port currently shows "No failureModes defined"
      const noFailuresIndex = newData.findIndex(row => 
        row.swComponentUuid === portUuid && row.failureName === 'No failureModes defined'
      );
      
      if (noFailuresIndex !== -1) {
        // Replace the "No failureModes defined" row with the new editable row
        newData[noFailuresIndex] = newRow;
        // console.log('Replacing "No failureModes defined" for port:', portName, 'at index:', noFailuresIndex);
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
        // console.log('Adding new failure for port:', portName, 'at index:', insertIndex);
      }
      
      return newData;
    });
  };

  return {
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
  };
};
