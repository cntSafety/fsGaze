'use client';

import React, { useEffect, useState } from 'react';
import { Table, Spin, Alert, Typography, Input } from 'antd';
import { getComponentRelations } from '../../services/ArxmlToNeoService'; // Adjust path as needed

const { Title } = Typography;
const { Search } = Input;

interface Relation {
  relationshipType: string;
  sourceName: string;
  sourceType: string;
  targetName: string;
  targetType: string;
}

interface SWCompDetailsProps {
  componentUuid: string | null;
  componentName?: string;
}

const SWCompDetails: React.FC<SWCompDetailsProps> = ({ componentUuid, componentName }) => {
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (componentUuid) {
      fetchRelations(componentUuid);
      setCurrentPage(1); // Reset to first page when component changes
    } else {
      setRelations([]); // Clear relations if no component is selected
      setCurrentPage(1); // Reset to first page
    }
  }, [componentUuid]);

  const fetchRelations = async (uuid: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getComponentRelations(uuid);
      if (result.success && result.data) {
        setRelations(result.data);
      } else {
        setError(result.message || 'Failed to fetch component relations.');
        setRelations([]);
      }
    } catch (err) {
      setError('An unexpected error occurred while fetching relations.');
      setRelations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value.toLowerCase());
  };

  const handlePaginationChange = (page: number, newPageSize?: number) => {
    setCurrentPage(page);
    if (newPageSize) {
      setPageSize(newPageSize);
    }
  };

  const filteredRelations = relations.filter(relation => {
    return (
      relation.relationshipType.toLowerCase().includes(searchTerm) ||
      relation.sourceName?.toLowerCase().includes(searchTerm) ||
      relation.sourceType?.toLowerCase().includes(searchTerm) ||
      relation.targetName?.toLowerCase().includes(searchTerm) ||
      relation.targetType?.toLowerCase().includes(searchTerm)
    );
  });

  const columns = [
    {
      title: 'Relationship Type',
      dataIndex: 'relationshipType',
      key: 'relationshipType',
      sorter: (a: Relation, b: Relation) => a.relationshipType.localeCompare(b.relationshipType),
      filterSearch: true,
      // Enable table's built-in filter dropdown for this column
      filters: Array.from(new Set(relations.map(r => r.relationshipType))).map(type => ({ text: type, value: type })),
      onFilter: (value: string | number | boolean, record: Relation) => record.relationshipType.includes(value as string),
    },
    {
      title: 'Source Name',
      dataIndex: 'sourceName',
      key: 'sourceName',
      sorter: (a: Relation, b: Relation) => (a.sourceName || '').localeCompare(b.sourceName || ''),
      filterSearch: true,
      filters: Array.from(new Set(relations.map(r => r.sourceName).filter(Boolean))).map(name => ({ text: name, value: name })),
      onFilter: (value: string | number | boolean, record: Relation) => record.sourceName?.includes(value as string) ?? false,
    },
    {
      title: 'Source Type',
      dataIndex: 'sourceType',
      key: 'sourceType',
      sorter: (a: Relation, b: Relation) => (a.sourceType || '').localeCompare(b.sourceType || ''),
      filterSearch: true,
      filters: Array.from(new Set(relations.map(r => r.sourceType).filter(Boolean))).map(type => ({ text: type, value: type })),
      onFilter: (value: string | number | boolean, record: Relation) => record.sourceType?.includes(value as string) ?? false,
    },
    {
      title: 'Target Name',
      dataIndex: 'targetName',
      key: 'targetName',
      sorter: (a: Relation, b: Relation) => (a.targetName || '').localeCompare(b.targetName || ''),
      filterSearch: true,
      filters: Array.from(new Set(relations.map(r => r.targetName).filter(Boolean))).map(name => ({ text: name, value: name })),
      onFilter: (value: string | number | boolean, record: Relation) => record.targetName?.includes(value as string) ?? false,
    },
    {
      title: 'Target Type',
      dataIndex: 'targetType',
      key: 'targetType',
      sorter: (a: Relation, b: Relation) => (a.targetType || '').localeCompare(b.targetType || ''),
      filterSearch: true,
      filters: Array.from(new Set(relations.map(r => r.targetType).filter(Boolean))).map(type => ({ text: type, value: type })),
      onFilter: (value: string | number | boolean, record: Relation) => record.targetType?.includes(value as string) ?? false,
    },
  ];

  if (!componentUuid) {
    return <Alert message="Select a component from the table above to view its details." type="info" showIcon style={{ marginTop: 20 }} />;
  }

  return (
    <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #e8e8e8', borderRadius: '8px' }}>
      <Title level={4}>Relations for: {componentName || componentUuid}</Title>
      <Search
        placeholder="Search across all fields in relations..."
        onChange={(e) => handleSearch(e.target.value)}
        style={{ marginBottom: '20px', width: '100%', maxWidth: '400px' }}
        allowClear
        enterButton
      />
      {loading && <Spin tip="Loading relations..." style={{ display: 'block', marginTop: '20px' }} />}
      {error && <Alert message="Error Fetching Relations" description={error} type="error" showIcon style={{ marginBottom: '20px' }} />}
      {!loading && !error && relations.length === 0 && componentUuid && (
        <Alert message="No relations found for this component." description="This component might not have any direct relationships defined in the imported ARXML data, or the relationships are not captured by the current query." type="info" showIcon />
      )}
      {!loading && !error && relations.length > 0 && (
        <Table
          columns={columns}
          dataSource={filteredRelations}
          rowKey={(record) => `${record.relationshipType}-${record.sourceName}-${record.sourceType}-${record.targetName}-${record.targetType}`}
          bordered
          size="small"
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            onChange: handlePaginationChange,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
          scroll={{ x: 'max-content' }}
          sticky // Makes header sticky if table scrolls vertically
        />
      )}
    </div>
  );
};

export default SWCompDetails;
