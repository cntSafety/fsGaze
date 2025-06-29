import { useState, useEffect } from 'react';
import { Form, message } from 'antd';
import { createFailureModeNode, deleteFailureModeNode, updateFailureModeNode } from '../../../../services/neo4j/queries/safety/failureModes';
import { ProviderPort as ReceiverPort, PortFailure } from '../types';
import { SafetyTableRow } from '../../CoreSafetyTable';

export const useReceiverPortFailures = (
  receiverPorts: ReceiverPort[],
  portFailures: {[portUuid: string]: PortFailure[]},
  setPortFailures: (portFailures: {[portUuid: string]: PortFailure[]}) => void,
  refreshData?: () => void
) => {
  const [form] = Form.useForm();
  const [portTableData, setPortTableData] = useState<SafetyTableRow[]>([]);
  const [editingPortKey, setEditingPortKey] = useState('');
  const [isSavingPort, setIsSavingPort] = useState(false);
  const [portCurrentPage, setPortCurrentPage] = useState(1);
  const [portPageSize, setPortPageSize] = useState(50);

  // Update port table data when portFailures or receiverPorts change
  useEffect(() => {
    const allPortTableRows: SafetyTableRow[] = [];
    
    for (const port of receiverPorts) {
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
            failureUuid: failure.failureUuid,
            riskRatingCount: failure.riskRatingCount,
            safetyTaskCount: failure.safetyTaskCount,
            safetyReqCount: failure.safetyReqCount,
            safetyNoteCount: failure.safetyNoteCount,
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
  }, [receiverPorts, portFailures]);

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
      
      let result;
      if (record.isNewRow || record.failureName === 'No failureModes defined') {
        // Create new failure for port
        result = await createFailureModeNode(
          record.swComponentUuid!, // This is the port UUID for port records
          row.failureName,
          row.failureDescription || '',
          row.asil
        );
      } else {
        // Update existing failure
        if (!record.failureUuid) {
          message.error('Cannot update failure: No failure UUID found');
          setIsSavingPort(false);
          return;
        }
        result = await updateFailureModeNode(
          record.failureUuid,
          row.failureName,
          row.failureDescription || '',
          row.asil
        );
      }

      if (result.success) {
        const action = (record.isNewRow || record.failureName === 'No failureModes defined') ? 'added' : 'updated';
        message.success(`Port failure mode ${action} successfully!`);
        setEditingPortKey('');
        
        // Call refreshData to refetch everything
        if (refreshData) {
          await refreshData();
        }
      } else {
        message.error(`Error: ${result.message}`);
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
      
      // For each receiver port, check if it has no failureModes and no placeholder row
      receiverPorts.forEach(port => {
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
    // The modal-based delete flow will be triggered by the parent component.
    // This function can just set the record to delete or call a parent handler if needed.
    setEditingPortKey(''); // Optionally clear editing state
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
