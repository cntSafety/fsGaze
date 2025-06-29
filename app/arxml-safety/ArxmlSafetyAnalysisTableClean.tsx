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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
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
        const failureRows = failuresResult.data.map(f => ({
          key: `${f.swComponentUuid}-${f.failureUuid}`,
          swComponentUuid: f.swComponentUuid,
          swComponentName: f.swComponentName,
          failureName: f.failureName || '',
          failureDescription: f.failureDescription || '',
          asil: f.asil || PLACEHOLDER_VALUES.DEFAULT_ASIL,
          failureUuid: f.failureUuid,
          riskRatingCount: f.riskRatingCount,
          safetyTaskCount: f.safetyTaskCount,
          safetyReqCount: f.safetyReqCount,
          safetyNoteCount: f.safetyNoteCount,
        }));

        const componentsWithFailures = new Set(failureRows.map(f => f.swComponentUuid));
        const componentsWithoutFailures = allComponents.filter(c => !componentsWithFailures.has(c.uuid));

        const placeholderRows = componentsWithoutFailures.map(c => ({
          key: `${c.uuid}-empty`,
          swComponentUuid: c.uuid,
          swComponentName: c.name,
          failureName: PLACEHOLDER_VALUES.NO_FAILURES,
          failureDescription: PLACEHOLDER_VALUES.NO_DESCRIPTION,
          asil: PLACEHOLDER_VALUES.NO_DESCRIPTION,
        }));

        const combinedData = [...failureRows, ...placeholderRows].sort((a, b) => {
          if (a.swComponentName && b.swComponentName && a.swComponentName !== b.swComponentName) {
            return a.swComponentName.localeCompare(b.swComponentName);
          }
          if (a.failureName === PLACEHOLDER_VALUES.NO_FAILURES) return 1;
          if (b.failureName === PLACEHOLDER_VALUES.NO_FAILURES) return -1;
          // Note: The primary sort is now handled by the database query
          return 0;
        });
        
        setTableData(combinedData);
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
      width: 200,
      filterDropdown: (props: FilterDropdownProps) => (
        <SearchFilter {...props} dataIndex="swComponentName" />
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
      ),
      onFilter: (value: any, record: SafetyTableRow) =>
        record.swComponentName?.toLowerCase().includes(value.toLowerCase()) ?? false,
      onCell: (record: SafetyTableRow, index?: number) => {
        const isFirstRowForComponent = index === 0 || tableData[index! - 1]?.swComponentUuid !== record.swComponentUuid;
        if (!isFirstRowForComponent) {
          return { rowSpan: 0 };
        }

        let rowSpan = 1;
        for (let i = index! + 1; i < tableData.length; i++) {
          if (tableData[i].swComponentUuid === record.swComponentUuid) {
            rowSpan++;
          } else {
            break;
          }
        }
        return { rowSpan };
      },
      render: (text: string, record: SafetyTableRow) => (
        <Link href={`/arxml-safety/${record.swComponentUuid}`} passHref>
          <span style={{ fontWeight: 'bold', cursor: 'pointer' }} className="ant-typography ant-typography-link">
            {text}
          </span>
        </Link>
      ),
    },
    {
      title: 'Failure Mode Name',
      dataIndex: 'failureName',
      key: 'failureName',
      width: 200,
      filterDropdown: (props: FilterDropdownProps) => (
        <SearchFilter {...props} dataIndex="failureName" />
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
      ),
      onFilter: (value: any, record: SafetyTableRow) =>
        record.failureName?.toLowerCase().includes(value.toLowerCase()) ?? false,
      onCell: (record: SafetyTableRow) => {
        if (record.failureName === PLACEHOLDER_VALUES.NO_FAILURES) {
          return { colSpan: 4 };
        }
        return {
          record,
          inputType: 'text',
          dataIndex: 'failureName',
          title: 'Failure Mode Name',
          editing: isEditing(record),
        };
      },
      render: (text: string) => (
        <span style={{ color: text === PLACEHOLDER_VALUES.NO_FAILURES ? '#999' : 'inherit' }}>
          {text}
        </span>
      ),
    },
    {
      title: 'Failure Description',
      dataIndex: 'failureDescription',
      key: 'failureDescription',
      ellipsis: true,
      filterDropdown: (props: FilterDropdownProps) => (
        <SearchFilter {...props} dataIndex="failureDescription" />
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />
      ),
      onFilter: (value: any, record: SafetyTableRow) =>
        record.failureDescription?.toLowerCase().includes(value.toLowerCase()) ?? false,
      onCell: (record: SafetyTableRow) => {
        if (record.failureName === PLACEHOLDER_VALUES.NO_FAILURES) {
          return { colSpan: 0 };
        }
        return {
          record,
          inputType: 'text',
          dataIndex: 'failureDescription',
          title: 'Failure Description',
          editing: isEditing(record),
        };
      },
      render: (text: string) => (
        <span style={{ color: text === PLACEHOLDER_VALUES.NO_DESCRIPTION ? '#999' : 'inherit' }}>
          {text}
        </span>
      ),
    },
    {
      title: 'ASIL',
      dataIndex: 'asil',
      key: 'asil',
      width: 80,
      onCell: (record: SafetyTableRow) => {
        if (record.failureName === PLACEHOLDER_VALUES.NO_FAILURES) {
          return { colSpan: 0 };
        }
        return {
          record,
          inputType: 'select',
          dataIndex: 'asil',
          title: 'ASIL',
          editing: isEditing(record),
          selectOptions: ASIL_OPTIONS,
        };
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 220,
      onCell: (record: SafetyTableRow) => {
        if (record.failureName === PLACEHOLDER_VALUES.NO_FAILURES) {
          return { colSpan: 0 };
        }
        return {};
      },
      render: (_: unknown, record: SafetyTableRow) => {
        const editable = isEditing(record);
        
        if (editable) {
          return (
            <Space>
              <Button
                type="primary"
                size="small"
                onClick={() => save(record.key)}
                loading={isAddingFailure}
              >
                Save
              </Button>
              <Button size="small" onClick={cancel}>
                Cancel
              </Button>
            </Space>
          );
        }

        const canDelete = record.failureUuid && record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES;
        const canEdit = record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES;

        return (
          <Space>
            <Tooltip title="Add new failure mode">
              <Button
                icon={<PlusOutlined />}
                size="small"
                type="text"
                onClick={() => addNewFailure(record.swComponentUuid!, record.swComponentName!)}
              />
            </Tooltip>

            {canEdit && (
              <Tooltip title="Edit failure mode">
                <Button
                  icon={<EditOutlined />}
                  size="small"
                  type="text"
                  onClick={() => edit(record)}
                />
              </Tooltip>
            )}
            
            <Tooltip title="Link for causation analysis">
              <Button
                icon={<LinkOutlined />}
                size="small"
                type="text"
              />
            </Tooltip>

            {/* Safety Note Icon */}
            {record.failureUuid && record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES && (
              <Tooltip title="Safety Notes">
                <Badge count={record.safetyNoteCount} size="small" offset={[0, 8]}>
                  <Button 
                    type="text"
                    size="small"
                    onClick={() => handleSafetyNotesClick(record)}
                    icon={<SnippetsOutlined />}
                    style={{ color: '#1890ff' }}
                  />
                </Badge>
              </Tooltip>
            )}

            {/* Safety Requirement Icon */}
            {record.failureUuid && record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES && (
              <Tooltip title="Manage Safety Requirements">
                <Badge count={record.safetyReqCount} size="small" offset={[0, 8]}>
                  <Button 
                    type="text"
                    size="small"
                    onClick={() => handleSafetyReqClick(record.failureUuid!, record.failureName, record.failureDescription)}
                    icon={<FileTextOutlined />}
                    style={{ color: '#722ed1' }}
                  />
                </Badge>
              </Tooltip>
            )}

            {/* Risk Rating Icon */}
            {record.failureUuid && record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES && (
              <Tooltip title="Set Risk Rating">
                <Badge count={record.riskRatingCount} size="small" offset={[0, 8]}>
                  <Button 
                    type="text"
                    size="small"
                    onClick={() => handleRiskRatingClick(record)}
                    icon={<DashboardOutlined />}
                    style={{ color: '#52c41a' }}
                  />
                </Badge>
              </Tooltip>
            )}
            
            {/* Safety Task Icon */}
            {record.failureUuid && record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES && (
              <Tooltip title="Manage Safety Tasks">
                <Badge count={record.safetyTaskCount} size="small" offset={[0, 8]}>
                  <Button 
                    type="text"
                    size="small"
                    onClick={() => handleSafetyTaskClick(record)}
                    icon={<CheckSquareOutlined />}
                    style={{ color: '#1890ff' }}
                  />
                </Badge>
              </Tooltip>
            )}

            {canDelete && (
              <Popconfirm
                title="Are you sure you want to delete this failure mode?"
                okText="Yes"
                cancelText="No"
                onConfirm={() => handleDelete(record)}
              >
                <Tooltip title="Delete failure mode">
                  <Button
                    icon={<DeleteOutlined />}
                    size="small"
                    type="text"
                    danger
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
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
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => {
              if (editingKey !== '') {
                cancel();
              }
              setCurrentPage(page);
              if (size !== pageSize) {
                setPageSize(size);
              }
            },
            position: ['bottomCenter'],
          }}        loading={loading}
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
