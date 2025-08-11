import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Typography, message, Tabs, Space, Tag, Popconfirm, Divider, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { 
  SafetyReqData, 
  SafetyReqASIL, 
  CreateSafetyReqInput,
  UpdateSafetyReqInput 
} from '@/app/services/neo4j/queries/safety/safetyReq';
import { globalJamaService } from '@/app/services/globalJamaService';
import { useJamaConnection } from '@/app/components/JamaConnectionProvider';

const { TextArea } = Input;
const { Text } = Typography;
const { Option } = Select;

interface SafetyReqModalProps {
  open: boolean;
  onCancel: () => void;
  onSave: (reqData: CreateSafetyReqInput) => Promise<void>;
  onCreateNew: () => void;
  onDelete: () => Promise<void>;
  onTabChange: (index: number) => void;
  nodeName: string;
  nodeDescription?: string;
  loading: boolean;
  mode: 'create' | 'edit' | 'tabs';
  activeReq: SafetyReqData | null;
  existingReqs: SafetyReqData[];
  activeTabIndex: number;
}

// Helper functions for UI styling
const getASILColor = (asil: string): string => {
  switch (asil) {
    case 'QM': return 'default';
    case 'A': return 'green';
    case 'B': return 'blue';
    case 'C': return 'orange';
    case 'D': return 'red';
    default: return 'default';
  }
};

// Utility function to strip HTML tags and convert to plain text
const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  
  // Remove HTML tags
  const stripped = html.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  const decoded = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Clean up extra whitespace
  return decoded.replace(/\s+/g, ' ').trim();
};

const SafetyReqModal: React.FC<SafetyReqModalProps> = ({
  open,
  onCancel,
  onSave,
  onCreateNew,
  onDelete,
  onTabChange,
  nodeName,
  nodeDescription,
  loading,
  mode,
  activeReq,
  existingReqs,
  activeTabIndex
}) => {
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jamaItemId, setJamaItemId] = useState<string>('');
  const [isLoadingJama, setIsLoadingJama] = useState(false);
  const [isJamaImported, setIsJamaImported] = useState(false); // Track if data was imported from Jama
  const { isConnected } = useJamaConnection();

  // Initialize form when activeReq changes
  useEffect(() => {
    if (activeReq) {
      form.setFieldsValue({
        name: activeReq.name,
        reqID: activeReq.reqID,
        reqText: activeReq.reqText,
        reqASIL: activeReq.reqASIL,
        reqLinkedTo: activeReq.reqLinkedTo || '',
        jamaCreatedDate: activeReq.jamaCreatedDate || '',
        jamaModifiedDate: activeReq.jamaModifiedDate || ''
      });
      // Reset Jama imported flag when loading existing requirement
      setIsJamaImported(false);
    } else {
      form.resetFields();
      setIsJamaImported(false); // Reset flag when clearing form
    }
  }, [activeReq, form]);

  // Reset Jama imported flag when modal closes
  useEffect(() => {
    if (!open) {
      setIsJamaImported(false);
      setJamaItemId('');
    }
  }, [open]);

  // Helper function to extract ASIL from Jama fields
  const extractAsilFromJama = (fields: any, itemType: number, asilInfo: any): SafetyReqASIL | undefined => {

    
    if (asilInfo?.optionName) {
      // Map Jama ASIL to our enum
      const asilMapping: { [key: string]: SafetyReqASIL } = {
        'QM': SafetyReqASIL.QM,
        'A': SafetyReqASIL.A,
        'B': SafetyReqASIL.B,
        'C': SafetyReqASIL.C,
        'D': SafetyReqASIL.D
      };
      
      const jamaAsil = asilInfo.optionName.toUpperCase();
      return asilMapping[jamaAsil];
    }
    
    // Return undefined when asilInfo is undefined or optionName is not found
    return undefined;
  };

  // Helper function to construct Jama URL
  const constructJamaUrl = (baseUrl: string, itemId: number, projectId: number): string => {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    return `${cleanBaseUrl}/perspective.req#/items/${itemId}?projectId=${projectId}`;
  };

  // Helper function to determine if fields should be read-only
  const shouldFieldsBeReadOnly = (): boolean => {
    // Fields are read-only if:
    // 1. Data was imported from Jama in this session (isJamaImported)
    // 2. Or if we're in edit/tabs mode and the requirement has jamaCreatedDate (indicating it came from Jama)
    const hasJamaDate = Boolean(activeReq?.jamaCreatedDate && 
                               activeReq.jamaCreatedDate !== '' && 
                               activeReq.jamaCreatedDate !== null && 
                               activeReq.jamaCreatedDate !== undefined);
    
    const shouldBeReadOnly = Boolean(isJamaImported || ((mode === 'edit' || mode === 'tabs') && hasJamaDate));
    return shouldBeReadOnly;
  };

  // Function to import requirement from Jama
  const handleImportFromJama = async () => {
    const numericItemId = parseInt(jamaItemId);
    if (!jamaItemId || isNaN(numericItemId)) {
      message.error('Please enter a valid Jama item ID');
      return;
    }

    if (!isConnected) {
      message.error('Please connect to Jama first');
      return;
    }

    setIsLoadingJama(true);
    
    try {
      // Load item data from Jama
      const itemData = await globalJamaService.getItem(numericItemId);
      
      // Extract ASIL information
      let asilInfo = null;
      const asilFieldName = `asil$${itemData.itemType}`;
      if (itemData.fields[asilFieldName]) {
        try {
          const picklistOption = await globalJamaService.getPicklistOption(itemData.fields[asilFieldName]);
          asilInfo = { optionName: picklistOption.name };
        } catch (error) {
          console.warn('Failed to load ASIL picklist option:', error);
        }
      }

      // Get connection config for URL construction
      const connectionConfig = globalJamaService.getConnectionConfig();
      const jamaUrl = connectionConfig?.baseUrl 
        ? constructJamaUrl(connectionConfig.baseUrl, itemData.id, itemData.project)
        : '';

      // Map Jama data to form fields
      const mappedData = {
        name: itemData.fields.name || `Jama Item ${itemData.id}`,
        reqID: itemData.id.toString(),
        reqText: stripHtmlTags(itemData.fields.description || ''),
        reqASIL: extractAsilFromJama(itemData.fields, itemData.itemType, asilInfo),
        reqLinkedTo: jamaUrl,
        jamaCreatedDate: itemData.createdDate,
        jamaModifiedDate: itemData.modifiedDate
      };

      // Populate the form
      form.setFieldsValue(mappedData);
      
      // Mark that data was imported from Jama (making fields read-only)
      setIsJamaImported(true);
      
      message.success(`Successfully imported requirement from Jama item ${itemData.id}`);
      setJamaItemId(''); // Clear the input field
      
    } catch (error: any) {
      message.error(`Failed to import from Jama: ${error.message || 'Unknown error'}`);
      console.error('Jama import failed:', error);
    } finally {
      setIsLoadingJama(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const values = await form.validateFields();
      
      const reqData: CreateSafetyReqInput = {
        name: values.name,
        reqID: values.reqID,
        reqText: values.reqText,
        reqASIL: values.reqASIL,
        reqLinkedTo: values.reqLinkedTo || undefined,
        jamaCreatedDate: values.jamaCreatedDate || undefined,
        jamaModifiedDate: values.jamaModifiedDate || undefined
      };

      await onSave(reqData);
      
      if (mode === 'create') {
        form.resetFields();
      }
    } catch (error) {
      console.error('Form validation failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFormContent = () => (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
    >
      {/* Show read-only message when fields are locked */}
      {shouldFieldsBeReadOnly() && (
        <Alert
          message="Jama-Linked Requirement"
          description="This requirement is linked to Jama Connect. Key fields are read-only to maintain data integrity. Please make changes in Jama Connect."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Form.Item
        label="Requirement Name"
        name="name"
        rules={[{ required: true, message: 'Please enter requirement name' }]}
      >
        <Input 
          placeholder="Enter requirement name"
          readOnly={shouldFieldsBeReadOnly()}
          style={shouldFieldsBeReadOnly() ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
        />
      </Form.Item>

      <Form.Item
        label="Requirement ID"
        name="reqID"
        rules={[{ required: true, message: 'Please enter requirement ID' }]}
      >
        <Input 
          placeholder="Enter requirement ID (e.g., REQ-001)" 
          readOnly={shouldFieldsBeReadOnly()}
          style={shouldFieldsBeReadOnly() ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
        />
      </Form.Item>

      <Form.Item
        label="Requirement Text"
        name="reqText"
        rules={[{ required: true, message: 'Please enter requirement text' }]}
      >
        <TextArea 
          rows={4} 
          placeholder="Enter detailed requirement description"
          readOnly={shouldFieldsBeReadOnly()}
          style={shouldFieldsBeReadOnly() ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
        />
      </Form.Item>

      <Form.Item
        label="ASIL Level"
        name="reqASIL"
        rules={[{ required: true, message: 'Please select ASIL level' }]}
      >
        <Select 
          placeholder="Select ASIL level"
          disabled={shouldFieldsBeReadOnly()}
          style={shouldFieldsBeReadOnly() ? { opacity: 0.7 } : {}}
        >
          {Object.values(SafetyReqASIL).map(asil => (
            <Option key={asil} value={asil}>
              <Tag color={getASILColor(asil)}>{asil}</Tag>
            </Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item
        label="Linked To"
        name="reqLinkedTo"
      >
        <Input 
          placeholder="Link to other requirements or documents"
          readOnly={shouldFieldsBeReadOnly()}
          style={shouldFieldsBeReadOnly() ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
        />
      </Form.Item>

      {/* Hidden fields for Jama metadata */}
      <Form.Item
        name="jamaCreatedDate"
        hidden
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="jamaModifiedDate"
        hidden
      >
        <Input />
      </Form.Item>
    </Form>
  );

  const renderCreateMode = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong>Create Safety Requirement for: {nodeName}</Text>
        {nodeDescription && (
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {nodeDescription}
            </Text>
          </div>
        )}
      </div>

      {/* Jama Import Section */}
      {isConnected && (
        <Alert
          message="Import from Jama Connect"
          description={
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 8 }}>
                <Input
                  placeholder="Enter Jama Item ID (e.g., 5905105)"
                  value={jamaItemId}
                  onChange={(e) => setJamaItemId(e.target.value)}
                  onPressEnter={handleImportFromJama}
                  style={{ flex: 1 }}
                />
                <Button 
                  type="primary"
                  icon={<LinkOutlined />}
                  onClick={handleImportFromJama}
                  loading={isLoadingJama}
                  disabled={!jamaItemId.trim()}
                >
                  Get data from Jama
                </Button>
              </div>
              <Text type="secondary" style={{ fontSize: '11px' }}>
                This will automatically populate the form fields with data from Jama
              </Text>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {!isConnected && (
        <Alert
          message="Connect to Jama to import requirements automatically"
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      <Divider style={{ margin: '16px 0' }} />

      {renderFormContent()}
    </div>
  );

  const renderEditMode = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong>Edit Safety Requirement</Text>
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Editing: {activeReq?.name}
          </Text>
          <div style={{ marginTop: 4 }}>
            <Tag color={getASILColor(activeReq?.reqASIL || '')}>
              {activeReq?.reqASIL}
            </Tag>
            <Text type="secondary" style={{ fontSize: '11px', marginLeft: 8 }}>
              ID: {activeReq?.reqID}
            </Text>
          </div>
        </div>
      </div>
      {renderFormContent()}
    </div>
  );

  const renderTabsMode = () => {
    if (existingReqs.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">No safety requirements found for this failure.</Text>
          <div style={{ marginTop: 16 }}>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={onCreateNew}
            >
              Create First Requirement
            </Button>
          </div>
        </div>
      );
    }

    const tabItems = existingReqs.map((req, index) => ({
      key: index.toString(),
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tag color={getASILColor(req.reqASIL)}>
            {req.reqASIL}
          </Tag>
          <span>{req.name}</span>
        </div>
      ),
      children: renderFormContent()
    }));

    return (
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 16 
        }}>
          <div>
            <Text strong>Safety Requirements for: {nodeName}</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {existingReqs.length} requirement(s) found
              </Text>
            </div>
            {/* Removed Created and Modified timestamps display */}
          </div>
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              size="small"
              onClick={onCreateNew}
            >
              New Requirement
            </Button>
            {activeReq && (
              <Popconfirm
                title="Delete Requirement"
                description="Are you sure you want to delete this safety requirement?"
                onConfirm={onDelete}
                okText="Yes, Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button 
                  danger 
                  icon={<DeleteOutlined />} 
                  size="small"
                >
                  Delete
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        <Tabs
          type="card"
          activeKey={activeTabIndex.toString()}
          onChange={(key) => onTabChange(parseInt(key))}
          items={tabItems}
        />
      </div>
    );
  };

  const renderContent = () => {
    switch (mode) {
      case 'create':
        return renderCreateMode();
      case 'edit':
        return renderEditMode();
      case 'tabs':
        return renderTabsMode();
      default:
        return renderCreateMode();
    }
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'create':
        return 'Create Safety Requirement';
      case 'edit':
        return 'Edit Safety Requirement';
      case 'tabs':
        return 'Manage Safety Requirements';
      default:
        return 'Safety Requirement';
    }
  };

  const showFooter = mode !== 'tabs' || (mode === 'tabs' && existingReqs.length > 0);

  return (
    <Modal
      title={getModalTitle()}
      open={open}
      onCancel={onCancel}
      footer={showFooter ? [
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={isSubmitting || loading}
          onClick={handleSubmit}
          disabled={mode === 'tabs' && existingReqs.length === 0}
        >
          {mode === 'create' ? 'Create Requirement' : 'Save Changes'}
        </Button>
      ] : [
        <Button key="close" onClick={onCancel}>
          Close
        </Button>      ]}
      width={700}
      destroyOnHidden
    >
      {renderContent()}
    </Modal>
  );
};

export default SafetyReqModal;
