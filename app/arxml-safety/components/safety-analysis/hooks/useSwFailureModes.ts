import { useState, useEffect } from 'react';
import { Form, message } from 'antd';
import { createFailureModeNode, updateFailureModeNode } from '../../../../services/neo4j/queries/safety/failureModes';
import { getRiskRatingNodes } from '../../../../services/neo4j/queries/safety/riskRating';
import { getSafetyTasksForNode } from '../../../../services/neo4j/queries/safety/safetyTasks';
import { getSafetyReqsForNode } from '../../../../services/neo4j/queries/safety/safetyReq';
import { getSafetyNotesForNode } from '../../../../services/neo4j/queries/safety/safetyNotes';
import { SwComponent, Failure } from '../types';
import { SafetyTableRow } from '../../CoreSafetyTable';

export const useSwFailureModes = (
  swComponentUuid: string,
  swComponent: SwComponent | null,
  failures: Failure[],
  setFailures: (failures: Failure[]) => void,
  refreshData?: () => void
) => {
  const [form] = Form.useForm();
  const [tableData, setTableData] = useState<SafetyTableRow[]>([]);
  const [editingKey, setEditingKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [recordToDelete, setRecordToDelete] = useState<SafetyTableRow | null>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [failureToDelete, setFailureToDelete] = useState<Failure | null>(null);

  // Update table data when failures or component changes
  useEffect(() => {
/*     console.log('🔄 useSwFailureModes: useEffect triggered', {
      swComponent: swComponent?.name,
      failuresCount: failures.length,
      failures: failures.map(f => ({ uuid: f.failureUuid, name: f.failureName }))
    }); */
    
    if (!swComponent) return;
    
    if (failures.length === 0) {
      // console.log('📝 useSwFailureModes: Setting empty state');
      setTableData([{
        key: `${swComponentUuid}-empty`,
        swComponentUuid,
        swComponentName: swComponent.name,
        failureName: 'No failureModes defined',
        failureDescription: '-',
        asil: '-'
      }]);
    } else {
      // console.log('📝 useSwFailureModes: Setting table data with failures');
      const tableRows: SafetyTableRow[] = failures.map(failure => ({
        key: failure.failureUuid,
        swComponentUuid: swComponentUuid,
        swComponentName: swComponent.name,
        failureName: failure.failureName || '',
        failureDescription: failure.failureDescription || '',
        asil: failure.asil || 'TBC',
        failureUuid: failure.failureUuid,
        riskRatingCount: failure.riskRatingCount,
        safetyTaskCount: failure.safetyTaskCount,
        safetyReqCount: failure.safetyReqCount,
        safetyNoteCount: failure.safetyNoteCount,
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
      
      let result;
      if (record.isNewRow) {
        // Create new failure
        result = await createFailureModeNode(
          swComponentUuid,
          row.failureName,
          row.failureDescription,
          row.asil
        );
      } else {
        // Update existing failure
        if (!record.failureUuid) {
          message.error('Cannot update failure: No failure UUID found');
          setIsSaving(false);
          return;
        }
        result = await updateFailureModeNode(
          record.failureUuid,
          row.failureName,
          row.failureDescription,
          row.asil
        );
      }

      if (result.success) {
        const action = record.isNewRow ? 'added' : 'updated';
        message.success(`Failure mode ${action} successfully!`);
        setEditingKey('');
        
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
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Remove temporary new rows or restore "No failureModes defined" if needed
    setTableData(prev => {
      const filtered = prev.filter(row => !row.isNewRow || row.key !== editingKey);
      
      // If we removed the only row and there are no real failures, add back "No failureModes defined"
      if (filtered.length === 0 && failures.length === 0 && swComponent) {
        return [{
          key: `${swComponentUuid}-empty`,
          swComponentUuid,
          swComponentName: swComponent.name,
          failureName: 'No failureModes defined',
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
      setRecordToDelete(record);
      
      // The modal will be shown by the parent component, and the user can confirm or cancel
      // We'll handle the execution in the parent component's onConfirm callback
    } catch (error) {
      console.error('Error deleting failure:', error);
      message.error('Failed to delete failure mode');
      setRecordToDelete(null);
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
    
    // If we currently have "No failureModes defined", replace it, otherwise add to the end
    setTableData(prev => {
      if (prev.length === 1 && prev[0].failureName === 'No failureModes defined') {
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
    handleAddFailure,
    isDeleteModalVisible,
    setIsDeleteModalVisible,
    failureToDelete,
    setFailureToDelete
  };
};
