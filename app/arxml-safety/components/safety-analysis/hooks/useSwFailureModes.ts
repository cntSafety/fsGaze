import { useState, useEffect } from 'react';
import { Form, message } from 'antd';
import { createFailureNode, deleteFailureNode, updateFailureNode } from '../../../../services/neo4j/queries/safety';
import { SwComponent, Failure } from '../types';
import { SafetyTableRow } from '../../CoreSafetyTable';

export const useSwFailureModes = (
  swComponentUuid: string,
  swComponent: SwComponent | null,
  failures: Failure[],
  setFailures: (failures: Failure[]) => void
) => {
  const [form] = Form.useForm();
  const [tableData, setTableData] = useState<SafetyTableRow[]>([]);
  const [editingKey, setEditingKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Update table data when failures or component changes
  useEffect(() => {
    if (!swComponent) return;
    
    if (failures.length === 0) {
      setTableData([{
        key: `${swComponentUuid}-empty`,
        swComponentUuid,
        swComponentName: swComponent.name,
        failureName: 'No failures defined',
        failureDescription: '-',
        asil: '-'
      }]);
    } else {
      const tableRows: SafetyTableRow[] = failures.map(failure => ({
        key: failure.failureUuid,
        swComponentUuid: swComponentUuid,
        swComponentName: swComponent.name,
        failureName: failure.failureName || '',
        failureDescription: failure.failureDescription || '',
        asil: failure.asil || 'TBC',
        failureUuid: failure.failureUuid
      }));
      setTableData(tableRows);
    }
  }, [failures, swComponent, swComponentUuid]);

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
          setFailures([...failures, newFailure]);
          
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
        // Update existing failure - call Neo4j update service
        if (!record.failureUuid) {
          message.error('Cannot update failure: No failure UUID found');
          return;
        }

        const result = await updateFailureNode(
          record.failureUuid,
          row.failureName,
          row.failureDescription,
          row.asil
        );

        if (result.success) {
          // Update local failures array
          const updatedFailures = failures.map(failure => 
            failure.failureUuid === record.failureUuid 
              ? {
                  ...failure,
                  failureName: row.failureName,
                  failureDescription: row.failureDescription,
                  asil: row.asil
                }
              : failure
          );
          setFailures(updatedFailures);

          // Update table data
          const newData = [...tableData];
          const index = newData.findIndex(item => key === item.key);
          if (index > -1) {
            const item = newData[index];
            newData.splice(index, 1, {
              ...item,
              ...row,
            });
            setTableData(newData);
          }
          
          setEditingKey('');
          message.success('Failure mode updated successfully!');
        } else {
          message.error(`Error updating failure: ${result.message}`);
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
      asil: 'TBC'
    });
    setEditingKey(newKey);
    
    // Add a temporary row for editing
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid,
      swComponentName: swComponent.name,
      failureName: '',
      failureDescription: '',
      asil: 'TBC',
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

  return {
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
  };
};
