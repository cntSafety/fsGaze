'use client';

import React, { useState, useEffect } from 'react';
import { Form, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { getApplicationSwComponents } from '../services/neo4j/queries/components';
import { getFailuresForSwComponents, createFailureNode, deleteFailureNode } from '../services/neo4j/queries/safety';
import CoreSafetyTable, { SafetyTableRow, SafetyTableColumn } from './components/CoreSafetyTable';

export default function ArxmlSafetyAnalysisTable() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [tableData, setTableData] = useState<SafetyTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState('');
  const [isAddingFailure, setIsAddingFailure] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Get SW components
      const swComponentsResult = await getApplicationSwComponents();
      if (swComponentsResult.success && swComponentsResult.data) {
        const tableRows: SafetyTableRow[] = [];
        
        // Get failures for each SW component and create table rows
        for (const component of swComponentsResult.data) {
          const failuresResult = await getFailuresForSwComponents(component.uuid);
          
          if (failuresResult.success && failuresResult.data && failuresResult.data.length > 0) {
            // Create rows for existing failures
            failuresResult.data.forEach((failure) => {
              tableRows.push({
                key: `${component.uuid}-${failure.failureUuid}`,
                swComponentUuid: component.uuid,
                swComponentName: component.name,
                failureName: failure.failureName || '',
                failureDescription: failure.failureDescription || '',
                asil: failure.asil || 'TBC',
                failureUuid: failure.failureUuid
              });
            });
          } else {
            // Create a placeholder row for components with no failures
            tableRows.push({
              key: `${component.uuid}-empty`,
              swComponentUuid: component.uuid,
              swComponentName: component.name,
              failureName: 'No failures defined',
              failureDescription: '-',
              asil: '-'
            });
          }
        }
        
        // Sort table rows by component name to ensure proper grouping
        tableRows.sort((a, b) => {
          if (a.swComponentName && b.swComponentName && a.swComponentName !== b.swComponentName) {
            return a.swComponentName.localeCompare(b.swComponentName);
          }
          // Within the same component, put 'No failures defined' last
          if (a.failureName === 'No failures defined') return 1;
          if (b.failureName === 'No failures defined') return -1;
          return a.failureName.localeCompare(b.failureName);
        });
        
        setTableData(tableRows);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      message.error('Failed to load safety analysis data');
    } finally {
      setLoading(false);
    }
  };

  const isEditing = (record: SafetyTableRow) => record.key === editingKey;

  const edit = (record: SafetyTableRow) => {
    form.setFieldsValue({
      ...record,
      failureName: record.failureName === 'No failures defined' ? '' : record.failureName,
      failureDescription: record.failureDescription === '-' ? '' : record.failureDescription,
      asil: record.asil === '-' ? 'TBC' : record.asil,
    });
    setEditingKey(record.key);
  };

  const addNewFailure = (swComponentUuid: string, swComponentName: string) => {
    const newKey = `${swComponentUuid}-new-${Date.now()}`;
    form.setFieldsValue({
      swComponentName,
      failureName: '',
      failureDescription: '',
      asil: 'TBC'
    });
    setEditingKey(newKey);
    
    // Add a temporary row for editing
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid,
      swComponentName,
      failureName: '',
      failureDescription: '',
      asil: 'TBC',
      isNewRow: true
    };
    
    // Insert the new row right after the last row of the same component
    setTableData(prev => {
      const newData = [...prev];
      // Find the last index of rows with the same swComponentUuid
      let insertIndex = newData.length;
      for (let i = newData.length - 1; i >= 0; i--) {
        if (newData[i].swComponentUuid === swComponentUuid) {
          insertIndex = i + 1;
          break;
        }
      }
      // Insert the new row at the correct position
      newData.splice(insertIndex, 0, newRow);
      // console.log('Adding new failure for component:', swComponentName, 'at index:', insertIndex);
      return newData;
    });
  };

  const cancel = () => {
    // Remove temporary new rows
    setTableData(prev => prev.filter(row => !row.isNewRow || row.key !== editingKey));
    setEditingKey('');
  };

  const save = async (key: React.Key) => {
    try {
      const row = (await form.validateFields()) as SafetyTableRow;
      const record = tableData.find(item => key === item.key);
      
      if (!record) return;

      setIsAddingFailure(true);
      
      if (record.isNewRow || record.failureName === 'No failures defined') {
        // Create new failure
        const result = await createFailureNode(
          record.swComponentUuid!,
          row.failureName,
          row.failureDescription,
          row.asil
        );

        if (result.success) {
          await loadData(); // Reload all data
          setEditingKey('');
          message.success('Failure mode added successfully!');
        } else {
          message.error(`Error: ${result.message}`);
        }
      } else {
        // Update existing failure (for future implementation)
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
      setIsAddingFailure(false);
    }
  };

  const handleDelete = async (record: SafetyTableRow) => {
    if (!record.failureUuid) {
      message.error('Cannot delete failure: No failure UUID found');
      return;
    }

    try {
      setIsAddingFailure(true);
      
      const result = await deleteFailureNode(record.failureUuid);
      
      if (result.success) {
        await loadData(); // Reload all data
        message.success('Failure mode deleted successfully!');
      } else {
        message.error(`Error deleting failure: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting failure:', error);
      message.error('Failed to delete failure mode');
    } finally {
      setIsAddingFailure(false);
    }
  };

  // Define columns for CoreSafetyTable
  const columns: SafetyTableColumn[] = [
    {
      key: 'swComponentName',
      title: 'SW Component Name',
      dataIndex: 'swComponentName',
      editable: false,
      searchable: true,
      minWidth: 200,
      render: (text: string, record: SafetyTableRow, index: number) => {
        // Only show component name on the first row for each component in table order
        const isFirstRowForComponent = index === 0 || 
          tableData[index - 1]?.swComponentUuid !== record.swComponentUuid;
        
        return isFirstRowForComponent ? (
          <Typography.Link 
            style={{ fontWeight: 'bold' }}
            onClick={() => {
              router.push(`/arxml-safety/${record.swComponentUuid}`);
            }}
          >
            {text}
          </Typography.Link>
        ) : null;
      },
    },
    {
      key: 'failureName',
      title: 'Failure Mode Name',
      dataIndex: 'failureName',
      editable: true,
      searchable: true,
      minWidth: 150,
      render: (text: string) => (
        <span style={{ color: text === 'No failures defined' ? '#999' : 'inherit' }}>
          {text}
        </span>
      ),
    },
    {
      key: 'failureDescription',
      title: 'Failure Description',
      dataIndex: 'failureDescription',
      editable: true,
      searchable: true,
      ellipsis: true,
      minWidth: 250,
      render: (text: string) => (
        <span style={{ color: text === '-' ? '#999' : 'inherit' }}>
          {text}
        </span>
      ),
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
    <CoreSafetyTable
      dataSource={tableData}
      columns={columns}
      loading={loading}
      editingKey={editingKey}
      onEdit={edit}
      onSave={save}
      onCancel={cancel}
      onAdd={addNewFailure}
      onDelete={handleDelete}
      isSaving={isAddingFailure}
      showComponentActions={true}
      form={form}
      pagination={{
        current: currentPage,
        pageSize: pageSize,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
        pageSizeOptions: ['10', '20', '50', '100'],
        onChange: (page, size) => {
          // Only cancel editing if we're changing pages while editing
          if (editingKey !== '') {
            cancel();
          }
          setCurrentPage(page);
          if (size !== pageSize) {
            setPageSize(size);
          }
        },
        onShowSizeChange: (current, size) => {
          // Only cancel editing if we're changing page size while editing
          if (editingKey !== '') {
            cancel();
          }
          setCurrentPage(1); // Reset to first page when changing page size
          setPageSize(size);
        }
      }}
    />
  );
}
