'use client';

import React, { useEffect, useState } from 'react';
import { Table, Spin, Alert, Button, Space } from 'antd'; // Added Space
import { getApplicationSwComponents } from '../../services/ArxmlToNeoService';
import SWCompDetails from './SWCompDetails';
import SWCompDetailsTree from './SWCompDetailsTree'; // Import the new Tree component
import { InfoCircleOutlined, ApartmentOutlined } from '@ant-design/icons'; // Import icons

interface SwComponent {
  name: string;
  uuid: string;
  arxmlPath: string;
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
      title: 'UUID',
      dataIndex: 'uuid',
      key: 'uuid',
    },
    {
      title: 'ARXML Path',
      dataIndex: 'arxmlPath',
      key: 'arxmlPath',
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
      <h2>ARXML Application Software Components</h2>
      <Button onClick={fetchComponents} type="primary" style={{ marginBottom: '20px' }} disabled={loading}>
        Refresh Data
      </Button>
      {loading && <Spin tip="Loading components..." />}
      {error && <Alert message="Error Fetching Components" description={error} type="error" showIcon style={{ marginBottom: '20px' }} />}
      {showEmptyDbMessage && !loading && !error && (
        <Alert
          message="No Software Components Found"
          description="The database is empty or contains no APPLICATION_SW_COMPONENT_TYPE nodes. Please ensure Neo4j is running and an ARXML file has been imported."
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
          pagination={{ pageSize: 15 }}
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
      {selectedComponentUuid && detailViewMode === 'table' && (
        <SWCompDetails componentUuid={selectedComponentUuid} componentName={selectedComponentName || undefined} />
      )}
      {selectedComponentUuid && detailViewMode === 'tree' && (
        <SWCompDetailsTree componentUuid={selectedComponentUuid} componentName={selectedComponentName || undefined} />
      )}
    </div>
  );
};

export default ArxmlViewer;
