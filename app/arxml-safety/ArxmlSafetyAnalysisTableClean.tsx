// Clean refactored safety analysis table without resizing
'use client';

import React, { useState, useEffect } from 'react';
import { Form, Typography, message, Table, Input, Select, Popconfirm, Button, Space, Tooltip } from 'antd';
import { SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, LinkOutlined, DashboardOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { ColumnType } from 'antd/es/table';
import type { FilterDropdownProps } from 'antd/es/table/interface';
import { getApplicationSwComponents } from '../services/neo4j/queries/components';
import { getFailuresForSwComponents, createFailureNode, deleteFailureNode } from '../services/neo4j/queries/safety/failureModes';
import { createRiskRatingNode } from '../services/neo4j/queries/safety/riskRating';
import { createSafetyTask, getSafetyTasksForNode, updateSafetyTask, deleteSafetyTask } from '../services/neo4j/queries/safety/safetyTasks';
import { SafetyTableRow } from './types';
import { ASIL_OPTIONS, PLACEHOLDER_VALUES, MESSAGES } from './utils/constants';
import RiskRatingModal from './components/RiskRatingModal';
import SafetyTaskModal from './components/SafetyTaskModal';

const { Option } = Select;

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const swComponentsResult = await getApplicationSwComponents();
      if (swComponentsResult.success && swComponentsResult.data) {
        const tableRows: SafetyTableRow[] = [];
        
        for (const component of swComponentsResult.data) {
          const failuresResult = await getFailuresForSwComponents(component.uuid);
          
          if (failuresResult.success && failuresResult.data && failuresResult.data.length > 0) {
            failuresResult.data.forEach((failure: any) => {
              tableRows.push({
                key: `${component.uuid}-${failure.failureUuid}`,
                swComponentUuid: component.uuid,
                swComponentName: component.name,
                failureName: failure.failureName || '',
                failureDescription: failure.failureDescription || '',
                asil: failure.asil || PLACEHOLDER_VALUES.DEFAULT_ASIL,
                failureUuid: failure.failureUuid
              });
            });
          } else {
            tableRows.push({
              key: `${component.uuid}-empty`,
              swComponentUuid: component.uuid,
              swComponentName: component.name,
              failureName: PLACEHOLDER_VALUES.NO_FAILURES,
              failureDescription: PLACEHOLDER_VALUES.NO_DESCRIPTION,
              asil: PLACEHOLDER_VALUES.NO_DESCRIPTION
            });
          }
        }
        
        tableRows.sort((a, b) => {
          if (a.swComponentName && b.swComponentName && a.swComponentName !== b.swComponentName) {
            return a.swComponentName.localeCompare(b.swComponentName);
          }
          if (a.failureName === PLACEHOLDER_VALUES.NO_FAILURES) return 1;
          if (b.failureName === PLACEHOLDER_VALUES.NO_FAILURES) return -1;
          return a.failureName.localeCompare(b.failureName);
        });
        
        setTableData(tableRows);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      message.error(MESSAGES.ERROR.LOAD_FAILED);
    } finally {
      setLoading(false);
    }
  };

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
        const result = await createFailureNode(
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

    try {
      setIsAddingFailure(true);
      
      const result = await deleteFailureNode(record.failureUuid);
      
      if (result.success) {
        await loadData();
        message.success(MESSAGES.SUCCESS.FAILURE_DELETED);
      } else {
        message.error(`Error deleting failure: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting failure:', error);
      message.error(MESSAGES.ERROR.DELETE_FAILED);    } finally {
      setIsAddingFailure(false);
    }
  };
  const handleRiskRating = async (failureUuid: string, severity: number, occurrence: number, detection: number, ratingComment?: string) => {
    try {
      setIsAddingFailure(true);
      
      const result = await createRiskRatingNode(failureUuid, severity, occurrence, detection, ratingComment);
      
      if (result.success) {
        message.success('Risk rating saved successfully!');
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
      
      let result;
      if (safetyTaskModalMode === 'create') {
        // Create new task
        result = await createSafetyTask(selectedFailureForSafetyTask.failureUuid, taskData);
      } else if (activeSafetyTask) {
        // Update existing task
        result = await updateSafetyTask(activeSafetyTask.uuid, taskData);
      }
      
      if (result?.success) {
        message.success(safetyTaskModalMode === 'create' ? 'Safety task created successfully' : 'Safety task updated successfully');
        handleSafetyTaskCancel();
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
      render: (text: string, record: SafetyTableRow, index: number) => {
        const isFirstRowForComponent = index === 0 || 
          tableData[index - 1]?.swComponentUuid !== record.swComponentUuid;
        
        return isFirstRowForComponent ? (
          <Typography.Link 
            style={{ fontWeight: 'bold' }}
            onClick={() => {
              if (record.swComponentUuid) {
                router.push(`/arxml-safety/${record.swComponentUuid}`);
              }
            }}
          >
            {text}
          </Typography.Link>
        ) : null;
      },
    },    {
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
      onCell: (record: SafetyTableRow) => ({
        record,
        inputType: 'text',
        dataIndex: 'failureName',
        title: 'Failure Mode Name',
        editing: isEditing(record),
      }),
      render: (text: string) => (
        <span style={{ color: text === PLACEHOLDER_VALUES.NO_FAILURES ? '#999' : 'inherit' }}>
          {text}
        </span>
      ),
    },    {
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
      onCell: (record: SafetyTableRow) => ({
        record,
        inputType: 'text',
        dataIndex: 'failureDescription',
        title: 'Failure Description',
        editing: isEditing(record),
      }),
      render: (text: string) => (
        <span style={{ color: text === PLACEHOLDER_VALUES.NO_DESCRIPTION ? '#999' : 'inherit' }}>
          {text}
        </span>
      ),
    },    {
      title: 'ASIL',
      dataIndex: 'asil',
      key: 'asil',
      width: 80,
      onCell: (record: SafetyTableRow) => ({
        record,
        inputType: 'select',
        dataIndex: 'asil',
        title: 'ASIL',
        editing: isEditing(record),
        selectOptions: ASIL_OPTIONS,
      }),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 220,
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
            <Tooltip title="Link for causation analysis">
              <Button
                icon={<LinkOutlined />}
                size="small"
                type="text"
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
            )}            {/* Risk Rating Icon */}
            {record.failureUuid && record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES && (
              <Tooltip title="Set Risk Rating">
                <Button 
                  type="text"
                  size="small"
                  onClick={() => handleRiskRatingClick(record)}
                  icon={<DashboardOutlined />}
                  style={{ color: '#52c41a' }}
                />
              </Tooltip>
            )}            {/* Safety Task Icon */}
            {record.failureUuid && record.failureName !== PLACEHOLDER_VALUES.NO_FAILURES && (
              <Tooltip title="Manage Safety Tasks">
                <Button 
                  type="text"
                  size="small"
                  onClick={() => handleSafetyTaskClick(record)}
                  icon={<CheckSquareOutlined />}
                  style={{ color: '#1890ff' }}
                />
              </Tooltip>
            )}

            <Tooltip title="Add new failure mode">
              <Button
                icon={<PlusOutlined />}
                size="small"
                type="text"
                onClick={() => addNewFailure(record.swComponentUuid!, record.swComponentName!)}
              />
            </Tooltip>

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
    </Form>
  );
}
