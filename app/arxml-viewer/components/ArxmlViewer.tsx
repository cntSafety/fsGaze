'use client';

import React, { useEffect, useState } from 'react';
import { Table, Spin, Alert, Button, Space, Input } from 'antd'; // Added Input
import { getApplicationSwComponents } from '../../services/ArxmlToNeoService';
import SWCompDetails from './SWCompDetails';
import SWCompDetailsTree from './SWCompDetailsTree'; // Import the new Tree component
import SWCProtoRelations from './SWCProtoRelations'; // Import the SW Component Relations component
import SWCProtoGraph from './SWCProtoGraph'; // Import the SW Component Graph component
import { InfoCircleOutlined, ApartmentOutlined } from '@ant-design/icons'; // Import icons

interface SwComponent {
  name: string;
  uuid: string;
  arxmlPath: string;
  componentType: string;
}

const ArxmlViewer: React.FC = () => {
  const [components, setComponents] = useState<SwComponent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showEmptyDbMessage, setShowEmptyDbMessage] = useState<boolean>(false);
  const [selectedComponentUuid, setSelectedComponentUuid] = useState<string | null>(null);
  const [selectedComponentName, setSelectedComponentName] = useState<string | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<'table' | 'tree' | null>(null); // 'table', 'tree', or null

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: SwComponent, b: SwComponent) => a.name.localeCompare(b.name),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="Search name"
            value={selectedKeys[0]}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 188, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              size="small"
              style={{ width: 90 }}
            >
              Search
            </Button>
            <Button onClick={() => clearFilters && clearFilters()} size="small" style={{ width: 90 }}>
              Reset
            </Button>
          </Space>
        </div>
      ),
      onFilter: (value: any, record: SwComponent) => 
        record.name.toLowerCase().includes(value.toLowerCase()),
      render: (text: string, record: SwComponent) => (
        <Space>
          {text}
          <Button 
            icon={<InfoCircleOutlined />} 
            size="small" 
            type="text" 
            onClick={(e) => { 
              e.stopPropagation(); // Prevent row click event
              setSelectedComponentUuid(record.uuid);
              setSelectedComponentName(record.name);
              setDetailViewMode('table');
            }}
            title="Show Table Details"
          />
          <Button 
            icon={<ApartmentOutlined />} 
            size="small" 
            type="text" 
            onClick={(e) => { 
              e.stopPropagation(); // Prevent row click event
              setSelectedComponentUuid(record.uuid);
              setSelectedComponentName(record.name);
              setDetailViewMode('tree');
            }}
            title="Show Tree Details"
          />
        </Space>
      )
    },
    {
      title: 'Component Type',
      dataIndex: 'componentType',
      key: 'componentType',
      sorter: (a: SwComponent, b: SwComponent) => a.componentType.localeCompare(b.componentType),
      filters: [
        { text: 'Application SW Component', value: 'APPLICATION_SW_COMPONENT_TYPE' },
        { text: 'Service SW Component', value: 'SERVICE_SW_COMPONENT_TYPE' },
      ],
      onFilter: (value: any, record: SwComponent) => record.componentType === value,
      render: (text: string) => (
        <span style={{ 
          color: text === 'APPLICATION_SW_COMPONENT_TYPE' ? '#1890ff' : '#52c41a',
          fontWeight: 'bold'
        }}>
          {text === 'APPLICATION_SW_COMPONENT_TYPE' ? 'Application' : 'Service'}
        </span>
      ),
    },
    {
      title: 'UUID',
      dataIndex: 'uuid',
      key: 'uuid',
      sorter: (a: SwComponent, b: SwComponent) => a.uuid.localeCompare(b.uuid),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="Search UUID"
            value={selectedKeys[0]}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 188, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              size="small"
              style={{ width: 90 }}
            >
              Search
            </Button>
            <Button onClick={() => clearFilters && clearFilters()} size="small" style={{ width: 90 }}>
              Reset
            </Button>
          </Space>
        </div>
      ),
      onFilter: (value: any, record: SwComponent) => 
        record.uuid.toLowerCase().includes(value.toLowerCase()),
    },
    {
      title: 'ARXML Path',
      dataIndex: 'arxmlPath',
      key: 'arxmlPath',
      sorter: (a: SwComponent, b: SwComponent) => a.arxmlPath.localeCompare(b.arxmlPath),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="Search path"
            value={selectedKeys[0]}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 188, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              size="small"
              style={{ width: 90 }}
            >
              Search
            </Button>
            <Button onClick={() => clearFilters && clearFilters()} size="small" style={{ width: 90 }}>
              Reset
            </Button>
          </Space>
        </div>
      ),
      onFilter: (value: any, record: SwComponent) => 
        record.arxmlPath.toLowerCase().includes(value.toLowerCase()),
    },
  ];

  const fetchComponents = async () => {
    setLoading(true);
    setError(null);
    setShowEmptyDbMessage(false); // Reset on new fetch
    try {
      const result = await getApplicationSwComponents();
      if (result.success && result.data) {
        setComponents(result.data);
        if (result.data.length === 0) {
          setShowEmptyDbMessage(true); // Set if data is empty
        }
      } else {
        setError(result.message || 'Failed to fetch components.');
      }
    } catch (err) {
      setError('An unexpected error occurred while fetching components.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComponents();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h2>ARXML Software Components</h2>
      <Button onClick={fetchComponents} type="primary" style={{ marginBottom: '20px' }} disabled={loading}>
        Refresh Data
      </Button>
      {loading && (
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Spin tip="Loading components..." />
        </div>
      )}
      {error && <Alert message="Error Fetching Components" description={error} type="error" showIcon style={{ marginBottom: '20px' }} />}
      {showEmptyDbMessage && !loading && !error && (
        <Alert
          message="No Software Components Found"
          description="The database is empty or contains no APPLICATION_SW_COMPONENT_TYPE or SERVICE_SW_COMPONENT_TYPE nodes. Please ensure Neo4j is running and an ARXML file has been imported."
          type="info"
          showIcon
          style={{ marginBottom: '20px' }}
        />
      )}
      {!loading && !error && components.length > 0 && (
        <Table
          columns={columns}
          dataSource={components}
          rowKey="uuid"
          bordered
          pagination={{ 
            pageSize: 15,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} components`,
            pageSizeOptions: ['10', '15', '20', '50', '100'],
          }}
          onRow={(record) => {
            return {
              onClick: () => { // Default click on row can be table view or removed if icons are preferred
                // setSelectedComponentUuid(record.uuid);
                // setSelectedComponentName(record.name);
                // setDetailViewMode('table'); 
              },
            };
          }}
        />
      )}
      
      {/* SW Component Prototype Relations Section */}
      {!loading && !error && components.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <SWCProtoRelations />
        </div>
      )}

      {/* SW Component Prototype Graph Section */}
      {!loading && !error && components.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <SWCProtoGraph />
        </div>
      )}

      {selectedComponentUuid && detailViewMode === 'table' && (
        <SWCompDetails componentUuid={selectedComponentUuid} componentName={selectedComponentName || undefined} />
      )}
      {selectedComponentUuid && detailViewMode === 'tree' && (
        <SWCompDetailsTree 
          componentUuid={selectedComponentUuid} 
          componentName={selectedComponentName} 
        />
      )}
    </div>
  );
};

export default ArxmlViewer;
