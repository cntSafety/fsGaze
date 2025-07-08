// Clean refactored safety analysis table without resizing
'use client';

import React, { useState, useEffect } from 'react';
import { Form, Typography, message, Table, Input, Select, Popconfirm, Button, Space, Tooltip, Card, Badge, Modal } from 'antd';
import { SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, LinkOutlined, DashboardOutlined, CheckSquareOutlined, FileTextOutlined, SnippetsOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { ColumnType } from 'antd/es/table';
import type { FilterDropdownProps } from 'antd/es/table/interface';
import { getApplicationSwComponents } from '../services/neo4j/queries/components';
import { getFailuresForSwComponents, createFailureModeNode, deleteFailureModeNode } from '../services/neo4j/queries/safety/failureModes';
import { createRiskRatingNode, getRiskRatingNodes } from '../services/neo4j/queries/safety/riskRating';
import { createSafetyTask, getSafetyTasksForNode, updateSafetyTask, deleteSafetyTask, SafetyTaskStatus, SafetyTaskType } from '../services/neo4j/queries/safety/safetyTasks';
import { getSafetyReqsForNode } from '../services/neo4j/queries/safety/safetyReq';
import { getSafetyNotesForNode } from '../services/neo4j/queries/safety/safetyNotes';
import { getFailuresAndCountsForComponents } from '../services/neo4j/queries/safety/failureModes';
import { SafetyTableRow } from './types';
import { ASIL_OPTIONS, PLACEHOLDER_VALUES, MESSAGES } from './utils/constants';
import RiskRatingModal from './components/RiskRatingModal';
import SafetyTaskModal from './components/SafetyTaskModal';
import SafetyReqModal from './components/SafetyReqModal';
import { useSafetyReqManager } from './components/safety-analysis/hooks/useSafetyReqManager';
import { CascadeDeleteModal } from '../components/CascadeDeleteModal';
import Link from 'next/link';
import SafetyNoteManager from './components/safety-analysis/SafetyNoteManager';
import { getAsilColor } from '../components/asilColors';
import { Tag } from 'antd';

// Temporary local type to overcome editing issues with CoreSafetyTable.tsx
interface LocalSafetyTableRow extends SafetyTableRow {
  componentType?: string;
  numberOfFailureModes?: number;
}

const { Option } = Select;
const { Text } = Typography;

// Simple editable cell component
interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
  editing: boolean;
  dataIndex: string;
  title: string;
  inputType: 'text' | 'select';
  record: SafetyTableRow;
  index: number;
  selectOptions?: Array<{ value: string; label: string }>;
}

const EditableCell: React.FC<React.PropsWithChildren<EditableCellProps>> = ({
  editing,
  dataIndex,
  title,
  inputType,
  selectOptions,
  children,
  ...restProps
}) => {
  const inputNode = inputType === 'select' ? (
    <Select style={{ width: '100%' }}>
      {selectOptions?.map(option => (
        <Option key={option.value} value={option.value}>
          {option.label}
        </Option>
      ))}
    </Select>
  ) : (
    <Input />
  );

  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
          rules={[
            {
              required: true,
              message: `Please input ${title}!`,
            },
          ]}
        >
          {inputNode}
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};

// Search filter component
const SearchFilter = ({ setSelectedKeys, selectedKeys, confirm, clearFilters, dataIndex }: any) => (
  <div style={{ padding: 8 }}>
    <Input
      placeholder={`Search ${dataIndex}`}
      value={selectedKeys[0]}
      onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
      onPressEnter={() => confirm()}
      style={{ marginBottom: 8, display: 'block' }}
    />
    <Space>
      <Button
        type="primary"
        onClick={() => confirm()}
        icon={<SearchOutlined />}
        size="small"
        style={{ width: 90 }}
      >
        Search
      </Button>
      <Button
        onClick={() => clearFilters && clearFilters()}
        size="small"
        style={{ width: 90 }}
      >
        Reset
      </Button>
    </Space>
  </div>
);

export default function ArxmlSafetyAnalysisTable() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [tableData, setTableData] = useState<SafetyTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState('');  const [isAddingFailure, setIsAddingFailure] = useState(false);
    // Risk rating modal state
  const [isRiskRatingModalVisible, setIsRiskRatingModalVisible] = useState(false);
  const [selectedFailureForRiskRating, setSelectedFailureForRiskRating] = useState<SafetyTableRow | null>(null);
  // Safety task modal state
  const [isSafetyTaskModalVisible, setIsSafetyTaskModalVisible] = useState(false);
  const [selectedFailureForSafetyTask, setSelectedFailureForSafetyTask] = useState<SafetyTableRow | null>(null);
  const [safetyTaskModalMode, setSafetyTaskModalMode] = useState<'create' | 'edit' | 'tabs'>('create');
  const [existingSafetyTasks, setExistingSafetyTasks] = useState<any[]>([]);
  const [activeSafetyTask, setActiveSafetyTask] = useState<any | null>(null);
  const [activeSafetyTaskIndex, setActiveSafetyTaskIndex] = useState(0);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [failureToDelete, setFailureToDelete] = useState<SafetyTableRow | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const swComponentsResult = await getApplicationSwComponents();
      if (!swComponentsResult.success || !swComponentsResult.data) {
        message.error(MESSAGES.ERROR.LOAD_FAILED);
        setLoading(false);
        return;
      }
      
      const allComponents = swComponentsResult.data;
      const componentUuids = allComponents.map(c => c.uuid);
      
      const failuresResult = await getFailuresAndCountsForComponents(componentUuids);

      if (failuresResult.success && failuresResult.data) {
        const componentMap = new Map(allComponents.map(c => [c.uuid, c]));
        const failuresByComponent = failuresResult.data.reduce((acc, failure) => {
          const componentUuid = failure.swComponentUuid;
          if (!acc[componentUuid]) {
            const component = componentMap.get(componentUuid);
            acc[componentUuid] = {
              swComponentUuid: componentUuid,
              swComponentName: failure.swComponentName,
              componentType: component?.componentType,
              failures: [],
            };
          }
          acc[componentUuid].failures.push(failure);
          return acc;
        }, {} as Record<string, { swComponentUuid: string, swComponentName: string, componentType?: string, failures: any[] }>);

        const asilOrder: { [key: string]: number } = { 'QM': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'TBC': -1 };
        const getHighestAsil = (failures: any[]): string => {
          if (!failures || failures.length === 0) return 'N/A';

          return failures.reduce((highest, current) => {
            const currentAsil = current.asil || 'TBC';
            const highestAsil = highest || 'TBC';
            if ((asilOrder[currentAsil] ?? -1) > (asilOrder[highestAsil] ?? -1)) {
              return currentAsil;
            }
            return highest;
          }, 'TBC');
        };

        const aggregatedData = Object.values(failuresByComponent).map((compData: any) => {
          const highestAsil = getHighestAsil(compData.failures);
          return {
            key: compData.swComponentUuid,
            swComponentUuid: compData.swComponentUuid,
            swComponentName: compData.swComponentName,
            componentType: compData.componentType,
            numberOfFailureModes: compData.failures.length,
            asil: highestAsil,
            failureName: '', // Placeholder to satisfy SafetyTableRow
            failureDescription: '', // Placeholder to satisfy SafetyTableRow
          };
        });

        const componentsWithFailures = new Set(Object.keys(failuresByComponent));
        const componentsWithoutFailures = allComponents.filter(c => !componentsWithFailures.has(c.uuid));

        const placeholderRows = componentsWithoutFailures.map(c => ({
          key: `${c.uuid}-empty`,
          swComponentUuid: c.uuid,
          swComponentName: c.name,
          componentType: c.componentType,
          numberOfFailureModes: 0,
          asil: 'N/A',
          failureName: PLACEHOLDER_VALUES.NO_FAILURES, // To align with SafetyTableRow
          failureDescription: '',
        }));

        const combinedData = [...aggregatedData, ...placeholderRows].sort((a, b) => {
          return a.swComponentName.localeCompare(b.swComponentName);
        });
        
        setTableData(combinedData as SafetyTableRow[]);
      } else {
        message.error(failuresResult.message || MESSAGES.ERROR.LOAD_FAILED);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      message.error(MESSAGES.ERROR.LOAD_FAILED);
    } finally {
      setLoading(false);
    }
  };

  // Safety requirement manager
  const { handleSafetyReqClick, safetyReqModalProps } = useSafetyReqManager(loadData);

  // Safety notes modal state
  const [isSafetyNotesModalVisible, setIsSafetyNotesModalVisible] = useState(false);
  const [selectedFailureForNotes, setSelectedFailureForNotes] = useState<SafetyTableRow | null>(null);

  const handleSafetyNotesClick = (record: SafetyTableRow) => {
    setSelectedFailureForNotes(record);
    setIsSafetyNotesModalVisible(true);
  };

  const handleSafetyNotesClose = () => {
    setIsSafetyNotesModalVisible(false);
    setSelectedFailureForNotes(null);
  };

  useEffect(() => {
    loadData();
  }, []);

  const isEditing = (record: SafetyTableRow) => record.key === editingKey;

  const edit = (record: SafetyTableRow) => {
    form.setFieldsValue({
      ...record,
      failureName: record.failureName === PLACEHOLDER_VALUES.NO_FAILURES ? '' : record.failureName,
      failureDescription: record.failureDescription === PLACEHOLDER_VALUES.NO_DESCRIPTION ? '' : record.failureDescription,
      asil: record.asil === PLACEHOLDER_VALUES.NO_DESCRIPTION ? PLACEHOLDER_VALUES.DEFAULT_ASIL : record.asil,
    });
    setEditingKey(record.key);
  };

  const cancel = () => {
    setTableData(prev => prev.filter(row => !row.isNewRow || row.key !== editingKey));
    setEditingKey('');
  };

  const save = async (key: React.Key) => {
    try {
      const row = (await form.validateFields()) as SafetyTableRow;
      const record = tableData.find(item => key === item.key);
      
      if (!record) return;

      setIsAddingFailure(true);
      
      if (record.isNewRow || record.failureName === PLACEHOLDER_VALUES.NO_FAILURES) {
        const result = await createFailureModeNode(
          record.swComponentUuid!,
          row.failureName,
          row.failureDescription,
          row.asil
        );

        if (result.success) {
          await loadData();
          setEditingKey('');
          message.success(MESSAGES.SUCCESS.FAILURE_ADDED);
        } else {
          message.error(`Error: ${result.message}`);
        }
      } else {
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
          message.success(MESSAGES.SUCCESS.FAILURE_UPDATED);
        }
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
      message.error(MESSAGES.ERROR.SAVE_FAILED);
    } finally {
      setIsAddingFailure(false);
    }
  };

  const handleDelete = async (record: SafetyTableRow) => {
    if (!record.failureUuid) {
      message.error(MESSAGES.ERROR.NO_UUID);
      return;
    }
    // Prevent duplicate delete/preview if already deleting this node
    if (failureToDelete && failureToDelete.failureUuid === record.failureUuid && isDeleteModalVisible) {
      return;
    }
    try {
      setIsAddingFailure(true);
      // Use the new cascade delete API
      const response = await fetch('/api/safety/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'preview',
          nodeUuid: record.failureUuid,
          nodeType: 'FAILUREMODE'
        }),
      });
      const previewResult = await response.json();
      if (!previewResult.success) {
        message.error(`Error previewing deletion: ${previewResult.message}`);
        return;
      }
      // Show cascade delete modal with preview data
      setFailureToDelete(record);
      setIsDeleteModalVisible(true);
    } catch (error) {
      console.error('Error deleting failure:', error);
      message.error(MESSAGES.ERROR.DELETE_FAILED);
    } finally {
      setIsAddingFailure(false);
    }
  };
  const handleRiskRating = async (failureUuid: string, severity: number, occurrence: number, detection: number, ratingComment?: string) => {
    try {
      setIsAddingFailure(true);
      
      const result = await createRiskRatingNode(failureUuid, severity, occurrence, detection, ratingComment);
      
      if (result.success) {
        message.success('Risk rating saved successfully!');
        loadData();
      } else {
        message.error(`Error saving risk rating: ${result.message}`);
      }
    } catch (error) {
      console.error('Error saving risk rating:', error);
      message.error('Failed to save risk rating');
    } finally {
      setIsAddingFailure(false);
    }
  };

  const handleRiskRatingClick = (record: SafetyTableRow) => {
    setSelectedFailureForRiskRating(record);
    setIsRiskRatingModalVisible(true);
  };

  const handleRiskRatingCancel = () => {
    setIsRiskRatingModalVisible(false);
    setSelectedFailureForRiskRating(null);
  };
  const handleRiskRatingSave = async (severity: number, occurrence: number, detection: number, ratingComment?: string) => {
    if (!selectedFailureForRiskRating?.failureUuid) return;
    
    await handleRiskRating(selectedFailureForRiskRating.failureUuid, severity, occurrence, detection, ratingComment);
    setIsRiskRatingModalVisible(false);
    setSelectedFailureForRiskRating(null);
    loadData();
  };
  // Safety task handlers
  const handleSafetyTaskClick = async (record: SafetyTableRow) => {
    if (!record.failureUuid) return;
    
    try {
      setIsAddingFailure(true);
      
      // Load existing safety tasks for this failure
      const result = await getSafetyTasksForNode(record.failureUuid);
      
      if (result.success && result.data) {
        setExistingSafetyTasks(result.data);
        
        if (result.data.length > 0) {
          // Tasks exist - show in edit/tabs mode
          setActiveSafetyTask(result.data[0]);
          setActiveSafetyTaskIndex(0);
          setSafetyTaskModalMode(result.data.length > 1 ? 'tabs' : 'edit');
        } else {
          // No tasks exist - show create mode
          setExistingSafetyTasks([]);
          setActiveSafetyTask(null);
          setSafetyTaskModalMode('create');
        }
      } else {
        // Error or no tasks - default to create mode
        setExistingSafetyTasks([]);
        setActiveSafetyTask(null);
        setSafetyTaskModalMode('create');
      }
      
      setSelectedFailureForSafetyTask(record);
      setIsSafetyTaskModalVisible(true);
      
    } catch (error) {
      console.error('Error loading safety tasks:', error);
      message.error('Failed to load safety tasks');
      // Default to create mode on error
      setExistingSafetyTasks([]);
      setActiveSafetyTask(null);
      setSafetyTaskModalMode('create');
      setSelectedFailureForSafetyTask(record);
      setIsSafetyTaskModalVisible(true);
    } finally {
      setIsAddingFailure(false);
    }
  };

  const handleSafetyTaskCancel = () => {
    setIsSafetyTaskModalVisible(false);
    setSelectedFailureForSafetyTask(null);
    setExistingSafetyTasks([]);
    setActiveSafetyTask(null);
    setSafetyTaskModalMode('create');
    setActiveSafetyTaskIndex(0);
  };

  const handleSafetyTaskSave = async (taskData: {
    name: string;
    description: string;
    status: string;
    responsible: string;
    reference: string;
    taskType: string;
  }) => {
    if (!selectedFailureForSafetyTask?.failureUuid) return;
      try {
      setIsAddingFailure(true);
      
      // Convert form values to proper types
      const convertedTaskData = {
        ...taskData,
        status: taskData.status as SafetyTaskStatus,
        taskType: taskData.taskType as SafetyTaskType
      };
      
      let result;
      if (safetyTaskModalMode === 'create') {
        // Create new task
        result = await createSafetyTask(selectedFailureForSafetyTask.failureUuid, convertedTaskData);
      } else if (activeSafetyTask) {
        // Update existing task
        result = await updateSafetyTask(activeSafetyTask.uuid, convertedTaskData);
      }
      
      if (result?.success) {
        message.success(safetyTaskModalMode === 'create' ? 'Safety task created successfully' : 'Safety task updated successfully');
        handleSafetyTaskCancel();
        loadData();
      } else {
        message.error(result?.message || `Failed to ${safetyTaskModalMode === 'create' ? 'create' : 'update'} safety task`);
      }
    } catch (error) {
      console.error('Error saving safety task:', error);
      message.error(`Failed to ${safetyTaskModalMode === 'create' ? 'create' : 'update'} safety task`);
    } finally {
      setIsAddingFailure(false);
    }
  };

  const handleSafetyTaskDelete = async () => {
    if (!activeSafetyTask) return;
    
    try {
      setIsAddingFailure(true);
      const result = await deleteSafetyTask(activeSafetyTask.uuid);
      
      if (result.success) {
        message.success('Safety task deleted successfully');
        handleSafetyTaskCancel();
        loadData();
      } else {
        message.error(result.message || 'Failed to delete safety task');
      }
    } catch (error) {
      console.error('Error deleting safety task:', error);
      message.error('Failed to delete safety task');
    } finally {
      setIsAddingFailure(false);
    }
  };

  const handleSafetyTaskCreateNew = () => {
    setActiveSafetyTask(null);
    setSafetyTaskModalMode('create');
  };

  const handleSafetyTaskTabChange = (index: number) => {
    setActiveSafetyTaskIndex(index);
    if (existingSafetyTasks[index]) {
      setActiveSafetyTask(existingSafetyTasks[index]);
    }
  };

  const addNewFailure = (swComponentUuid: string, swComponentName: string) => {
    const newKey = `${swComponentUuid}-new-${Date.now()}`;
    form.setFieldsValue({
      swComponentName,
      failureName: '',
      failureDescription: '',
      asil: PLACEHOLDER_VALUES.DEFAULT_ASIL
    });
    setEditingKey(newKey);
    
    const newRow: SafetyTableRow = {
      key: newKey,
      swComponentUuid,
      swComponentName,
      failureName: '',
      failureDescription: '',
      asil: PLACEHOLDER_VALUES.DEFAULT_ASIL,
      isNewRow: true
    };
    
    setTableData(prev => {
      const newData = [...prev];
      let insertIndex = newData.length;
      for (let i = newData.length - 1; i >= 0; i--) {
        if (newData[i].swComponentUuid === swComponentUuid) {
          insertIndex = i + 1;
          break;
        }
      }
      newData.splice(insertIndex, 0, newRow);
      return newData;
    });
  };

  const columns: ColumnType<SafetyTableRow>[] = [
    {
      title: 'SW Component Name',
      dataIndex: 'swComponentName',
      key: 'swComponentName',
      filterDropdown: (props: FilterDropdownProps) => (
        <SearchFilter {...props} dataIndex="swComponentName" />
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
      ),
      onFilter: (value: any, record: SafetyTableRow) =>
        record.swComponentName?.toLowerCase().includes(value.toLowerCase()) ?? false,
      render: (text: string, record: SafetyTableRow) => (
        <Link href={`/arxml-safety/${record.swComponentUuid}`} passHref>
          <span style={{ fontWeight: 'bold', cursor: 'pointer' }} className="ant-typography ant-typography-link">
            {text}
          </span>
        </Link>
      ),
    },
    {
      title: 'Component Type',
      dataIndex: 'componentType',
      key: 'componentType',
      width: 250,
      filterDropdown: (props: FilterDropdownProps) => (
        <SearchFilter {...props} dataIndex="componentType" />
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
      ),
      onFilter: (value: any, record: LocalSafetyTableRow) =>
        record.componentType?.toLowerCase().includes(value.toLowerCase()) ?? false,
      sorter: (a: LocalSafetyTableRow, b: LocalSafetyTableRow) => (a.componentType || '').localeCompare(b.componentType || ''),
      render: (type: string) => {
        if (!type) return '-';
        // Shorten the type for display
        const displayType = type.replace(/_/g, ' ').replace('SW COMPONENT TYPE', '');
        let color = 'default';
        if (type.includes('COMPOSITION')) {
          color = 'gray';
        } else if (type.includes('APPLICATION')) {
          color = 'blue';
        }
        return <Tag color={color}>{displayType.trim()}</Tag>;
      },
    },
    {
      title: 'Number of Functional FM',
      dataIndex: 'numberOfFailureModes',
      key: 'numberOfFailureModes',
      width: 200,
      sorter: (a: any, b: any) => a.numberOfFailureModes - b.numberOfFailureModes,
    },
    {
      title: 'ASIL Max',
      dataIndex: 'asil',
      key: 'asil',
      width: 120,
      sorter: (a: LocalSafetyTableRow, b: LocalSafetyTableRow) => {
        const asilOrder: { [key: string]: number } = { 'QM': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'N/A': -1, 'TBC': -1 };
        const aOrder = asilOrder[a.asil as keyof typeof asilOrder] ?? -1;
        const bOrder = asilOrder[b.asil as keyof typeof asilOrder] ?? -1;
        return aOrder - bOrder;
      },
      render: (text: string) => {
        if (text === 'N/A') {
          return <span style={{ color: '#999' }}>{text}</span>;
        }
        return (
          <Tag color={getAsilColor(text)}>
            {text.toUpperCase()}
          </Tag>
        )
      },
    },
  ];

  return (
    <Card title="ARXML Safety Analysis" variant="borderless">
      <Form form={form} component={false}>
        <Table
          components={{
            body: {
              cell: EditableCell,
            },
          }}
          bordered
          dataSource={tableData}
          columns={columns}
          rowClassName="editable-row"
          pagination={false}
          loading={loading}
          scroll={{ x: 'max-content' }}
          size="small"
        />
        
        {/* Risk Rating Modal */}
        <RiskRatingModal
          open={isRiskRatingModalVisible}
          onCancel={handleRiskRatingCancel}
          onSave={handleRiskRatingSave}
          failureName={selectedFailureForRiskRating?.failureName || ''}
          loading={isAddingFailure}
        />      {/* Safety Task Modal */}
        <SafetyTaskModal
          open={isSafetyTaskModalVisible}
          onCancel={handleSafetyTaskCancel}
          onSave={handleSafetyTaskSave}
          onDelete={handleSafetyTaskDelete}
          onCreateNew={handleSafetyTaskCreateNew}
          onTabChange={handleSafetyTaskTabChange}
          nodeName={selectedFailureForSafetyTask?.failureName || ''}
          nodeDescription={selectedFailureForSafetyTask?.failureDescription}
          loading={isAddingFailure}
          mode={safetyTaskModalMode}
          activeTask={activeSafetyTask}
          existingTasks={existingSafetyTasks}
          activeTabIndex={activeSafetyTaskIndex}
        />
        {/* Safety Requirement Modal */}
        <SafetyReqModal {...safetyReqModalProps} />
        {/* Delete Confirmation Modal */}
        <CascadeDeleteModal
          open={isDeleteModalVisible && !!failureToDelete}
          onCancel={() => {
            setIsDeleteModalVisible(false);
            setFailureToDelete(null);
          }}
          onSuccess={async () => {
            if (failureToDelete?.failureUuid) {
              setTableData(prev => prev.filter(row => row.failureUuid !== failureToDelete.failureUuid));
            }
            setIsDeleteModalVisible(false);
            setFailureToDelete(null);
            loadData();
          }}
          nodeUuid={failureToDelete?.failureUuid || ''}
          nodeType="FAILUREMODE"
          nodeName={failureToDelete?.failureName || ''}
        />
        <Modal
          title={`Safety Notes - ${selectedFailureForNotes?.failureName}`}
          open={isSafetyNotesModalVisible}
          onCancel={handleSafetyNotesClose}
          footer={null}
          width={800}
          centered
        >
          {selectedFailureForNotes && selectedFailureForNotes.failureUuid ? (
            <SafetyNoteManager
              nodeUuid={selectedFailureForNotes.failureUuid}
              nodeType="Failure Mode"
              nodeName={selectedFailureForNotes.failureName}
              showInline={false}
              onNotesUpdate={loadData}
            />
          ) : (
            <div>Error: No failure UUID available for safety notes</div>
          )}
        </Modal>
      </Form>
    </Card>
  );
}