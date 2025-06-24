'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, message, Spin, Space, Typography, Alert, Input } from 'antd';
import { ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { InputRef } from 'antd';
import type { FilterConfirmProps } from 'antd/es/table/interface';
import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getSafetyNodesForComponent } from '@/app/services/neo4j/queries/safety/exportSWCSafety';
import type { ComponentSafetyData } from '@/app/services/neo4j/queries/safety/exportSWCSafety';

const { Title, Text } = Typography;

const SafetyAnalysisTable: React.FC = () => {
  const [data, setData] = useState<ComponentSafetyData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [totalComponents, setTotalComponents] = useState<number>(0);
  const [processedComponents, setProcessedComponents] = useState<number>(0);
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef<InputRef>(null);

  const handleSearch = (
    selectedKeys: string[],
    confirm: (param?: FilterConfirmProps) => void,
    dataIndex: keyof ComponentSafetyData,
  ) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex as string);
  };

  const handleReset = (clearFilters: () => void) => {
    clearFilters();
    setSearchText('');
  };

  const getColumnSearchProps = (dataIndex: keyof ComponentSafetyData, title: string) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: any) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`Search ${title}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters)}
            size="small"
            style={{ width: 90 }}
          >
            Reset
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              confirm({ closeDropdown: false });
              setSearchText((selectedKeys as string[])[0]);
              setSearchedColumn(dataIndex as string);
            }}
          >
            Filter
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              close();
            }}
          >
            Close
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
    ),
    onFilter: (value: any, record: ComponentSafetyData) => {
      const fieldValue = record[dataIndex];
      return fieldValue
        ? fieldValue.toString().toLowerCase().includes(value.toString().toLowerCase())
        : false;
    },
    onFilterDropdownOpenChange: (visible: boolean) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
  });

  const getNumericColumnSearchProps = (dataIndex: keyof ComponentSafetyData, title: string) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: any) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`Search ${title}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block' }}
          type="number"
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters)}
            size="small"
            style={{ width: 90 }}
          >
            Reset
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              close();
            }}
          >
            Close
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
    ),
    onFilter: (value: any, record: ComponentSafetyData) => {
      const fieldValue = record[dataIndex];
      if (fieldValue === null || fieldValue === undefined) return false;
      return fieldValue.toString().includes(value.toString());
    },
    onFilterDropdownOpenChange: (visible: boolean) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
  });

  const columns: ColumnsType<ComponentSafetyData> = [
    {
      title: 'Component Name',
      dataIndex: 'componentName',
      key: 'componentName',
      width: 200,
      fixed: 'left',
      sorter: (a, b) => (a.componentName || '').localeCompare(b.componentName || ''),
      ...getColumnSearchProps('componentName', 'Component Name'),
      render: (text: string) => text || '-',
    },
    {
      title: 'Safety Note',
      dataIndex: 'safetyNote',
      key: 'safetyNote',
      width: 250,
      ...getColumnSearchProps('safetyNote', 'Safety Note'),
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'Failure Mode',
      dataIndex: 'fmName',
      key: 'fmName',
      width: 200,
      ...getColumnSearchProps('fmName', 'Failure Mode'),
      render: (text: string) => text || '-',
    },
    {
      title: 'FM Description',
      dataIndex: 'fmDescription',
      key: 'fmDescription',
      width: 300,
      ...getColumnSearchProps('fmDescription', 'FM Description'),
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'FM Note',
      dataIndex: 'fmNote',
      key: 'fmNote',
      width: 250,
      ...getColumnSearchProps('fmNote', 'FM Note'),
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'FM Task',
      dataIndex: 'fmTask',
      key: 'fmTask',
      width: 200,
      ...getColumnSearchProps('fmTask', 'FM Task'),
      render: (text: string) => text || '-',
    },
    {
      title: 'Risk Rating',
      dataIndex: 'riskRatingName',
      key: 'riskRatingName',
      width: 180,
      ...getColumnSearchProps('riskRatingName', 'Risk Rating'),
      render: (text: string) => text || '-',
    },
    {
      title: 'Severity',
      dataIndex: 'Severity',
      key: 'Severity',
      width: 100,
      sorter: (a, b) => (a.Severity || 0) - (b.Severity || 0),
      ...getNumericColumnSearchProps('Severity', 'Severity'),
      render: (value: number | null) => value !== null ? value : '-',
    },
    {
      title: 'Occurrence',
      dataIndex: 'Occurrence',
      key: 'Occurrence',
      width: 100,
      sorter: (a, b) => (a.Occurrence || 0) - (b.Occurrence || 0),
      ...getNumericColumnSearchProps('Occurrence', 'Occurrence'),
      render: (value: number | null) => value !== null ? value : '-',
    },
    {
      title: 'Detection',
      dataIndex: 'Detection',
      key: 'Detection',
      width: 100,
      sorter: (a, b) => (a.Detection || 0) - (b.Detection || 0),
      ...getNumericColumnSearchProps('Detection', 'Detection'),
      render: (value: number | null) => value !== null ? value : '-',
    },
    {
      title: 'Rating Comment',
      dataIndex: 'RatingComment',
      key: 'RatingComment',
      width: 300,
      ...getColumnSearchProps('RatingComment', 'Rating Comment'),
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'RR Task Name',
      dataIndex: 'RiskRatingTaskName',
      key: 'RiskRatingTaskName',
      width: 200,
      ...getColumnSearchProps('RiskRatingTaskName', 'RR Task Name'),
      render: (text: string) => text || '-',
    },
    {
      title: 'RR Task Description',
      dataIndex: 'RiskRatingTaskDescription',
      key: 'RiskRatingTaskDescription',
      width: 350,
      ...getColumnSearchProps('RiskRatingTaskDescription', 'RR Task Description'),
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'RR Task Responsible',
      dataIndex: 'RiskRatingTaskResponsible',
      key: 'RiskRatingTaskResponsible',
      width: 200,
      ...getColumnSearchProps('RiskRatingTaskResponsible', 'RR Task Responsible'),
      render: (text: string) => text || '-',
    },
    {
      title: 'RR Task Status',
      dataIndex: 'RiskRatingTaskStatus',
      key: 'RiskRatingTaskStatus',
      width: 150,
      ...getColumnSearchProps('RiskRatingTaskStatus', 'RR Task Status'),
      render: (text: string) => text || '-',
    },
  ];

  const fetchSafetyData = async (): Promise<void> => {
    setLoading(true);
    
    try {
      // Step 1: Get all SW components
      message.info('Fetching SW components...');
      const componentsResult = await getApplicationSwComponents();
      
      if (!componentsResult.success || !componentsResult.data) {
        throw new Error(componentsResult.message || 'Failed to fetch SW components');
      }

      const components = componentsResult.data;
      setTotalComponents(components.length);
      message.info(`Found ${components.length} SW components. Fetching safety data...`);

      // Step 2: Get safety data for each component
      const allSafetyData: ComponentSafetyData[] = [];
      let processedCount = 0;

      for (const component of components) {
        try {
          const safetyResult = await getSafetyNodesForComponent(component.uuid);
          
          if (safetyResult.success && safetyResult.data) {
            allSafetyData.push(...safetyResult.data);
          }
          
          processedCount++;
          setProcessedComponents(processedCount);
          
          // Update progress every 10 components
          if (processedCount % 10 === 0) {
            message.info(`Processed ${processedCount}/${components.length} components...`);
          }
        } catch (error) {
          // Continue with other components even if one fails
        }
      }

      setData(allSafetyData);
      
      if (allSafetyData.length === 0) {
        message.warning('No safety data found for any components');
      } else {
        message.success(
          `Successfully loaded safety analysis data! 
          Total records: ${allSafetyData.length} 
          Components processed: ${processedCount}/${components.length}`
        );
      }

    } catch (error) {
      message.error(
        `Failed to fetch safety analysis: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const convertToCSV = (data: ComponentSafetyData[]): string => {
    if (data.length === 0) return '';

    // Define CSV headers
    const headers = [
      'Component Name',
      'Safety Note',
      'Failure Mode Name',
      'Failure Mode Description',
      'Failure Mode Note',
      'Failure Mode Task',
      'Risk Rating Name',
      'Severity',
      'Occurrence',
      'Detection',
      'Rating Comment',
      'Risk Rating Task Name',
      'Risk Rating Task Description',
      'Risk Rating Task Responsible',
      'Risk Rating Task Status'
    ];

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // Escape double quotes and wrap in quotes if contains comma, quote, or newline
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // Create CSV rows
    const csvRows = [
      headers.join(','), // Header row
      ...data.map(item => [
        escapeCSV(item.componentName),
        escapeCSV(item.safetyNote),
        escapeCSV(item.fmName),
        escapeCSV(item.fmDescription),
        escapeCSV(item.fmNote),
        escapeCSV(item.fmTask),
        escapeCSV(item.riskRatingName),
        escapeCSV(item.Severity),
        escapeCSV(item.Occurrence),
        escapeCSV(item.Detection),
        escapeCSV(item.RatingComment),
        escapeCSV(item.RiskRatingTaskName),
        escapeCSV(item.RiskRatingTaskDescription),
        escapeCSV(item.RiskRatingTaskResponsible),
        escapeCSV(item.RiskRatingTaskStatus)
      ].join(','))
    ];

    return csvRows.join('\n');
  };

  const downloadCSV = (csvContent: string, filename: string): void => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = (): void => {
    setExporting(true);
    
    try {
      if (data.length === 0) {
        message.warning('No data available to export');
        return;
      }

      // Convert to CSV
      message.info('Converting data to CSV format...');
      const csvContent = convertToCSV(data);

      // Download CSV file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `safety_analysis_export_${timestamp}.csv`;
      
      downloadCSV(csvContent, filename);
      
      message.success(
        `Successfully exported safety analysis data! 
        Total records: ${data.length}`
      );

    } catch (error) {
      message.error(
        `Failed to export CSV: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchSafetyData();
  }, []);

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header with statistics */}
        <div>
          <Title level={3}>Safety Analysis Data</Title>
          <Space direction="horizontal" size="large">
            <Text>
              <strong>Total Records:</strong> {data.length}
            </Text>
            <Text>
              <strong>Components Processed:</strong> {processedComponents}/{totalComponents}
            </Text>
          </Space>
        </div>

        {/* Action buttons */}
        <Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={fetchSafetyData}
            loading={loading}
            disabled={loading}
          >
            Refresh Data
          </Button>
          <Button
            type="primary"
            icon={<ExportOutlined />}
            onClick={handleExportCSV}
            loading={exporting}
            disabled={exporting || data.length === 0}
          >
            Export to CSV
          </Button>
        </Space>

        {/* Info alert */}
        {data.length === 0 && !loading && (
          <Alert
            message="No Data Available"
            description="No safety analysis data was found. Try refreshing or check if there are safety nodes in the database."
            type="info"
            showIcon
          />
        )}

        {/* Data table */}
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey={(record, index) => `${record.componentName}-${record.fmName}-${index}`}
          scroll={{ x: 2850, y: 600 }}
          pagination={false}
          size="small"
          bordered
        />
      </Space>
    </div>
  );
};

export default SafetyAnalysisTable;
