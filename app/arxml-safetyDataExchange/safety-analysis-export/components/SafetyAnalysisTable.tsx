'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, message, Space, Typography, Alert, Input } from 'antd';
import { ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { InputRef } from 'antd';
import type { FilterConfirmProps } from 'antd/es/table/interface';

const { Title, Text } = Typography;

const SafetyAnalysisTable: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<ColumnsType<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [totalComponents, setTotalComponents] = useState<number>(0);
  const [processedComponents, setProcessedComponents] = useState<number>(0);
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef<InputRef>(null);
  const hasFetchedInitialData = useRef(false);

  const handleSearch = (
    selectedKeys: string[],
    confirm: (param?: FilterConfirmProps) => void,
    dataIndex: string,
  ) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters: () => void) => {
    clearFilters();
    setSearchText('');
  };

  // Helper function to detect data type
  const detectDataType = (value: any): 'number' | 'text' | 'longText' => {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') {
      return value.length > 50 ? 'longText' : 'text';
    }
    return 'text';
  };

  // Helper function to format field name as title
  const formatTitle = (fieldName: string): string => {
    return fieldName
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  };

  const getColumnSearchProps = (dataIndex: string, title: string, dataType: 'number' | 'text' | 'longText') => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: any) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`Search ${title}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block' }}
          type={dataType === 'number' ? 'number' : 'text'}
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
              setSearchedColumn(dataIndex);
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
    onFilter: (value: any, record: any) => {
      const fieldValue = record[dataIndex];
      if (fieldValue === null || fieldValue === undefined) return false;
      if (dataType === 'number') {
        return fieldValue.toString().includes(value.toString());
      }
      return fieldValue.toString().toLowerCase().includes(value.toString().toLowerCase());
    },
    onFilterDropdownOpenChange: (visible: boolean) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
  });

  // Generate columns dynamically based on data
  const generateColumnsFromData = (data: any[]): ColumnsType<any> => {
    if (data.length === 0) return [];

    // Get all unique keys from the data
    const allKeys = new Set<string>();
    data.slice(0, 10).forEach(item => { // Check first 10 items to get all possible keys
      Object.keys(item).forEach(key => allKeys.add(key));
    });

    const dynamicColumns: ColumnsType<any> = Array.from(allKeys).map((key, index) => {
      // Sample a few values to determine data type and width
      const sampleValues = data.slice(0, 5).map(item => item[key]).filter(val => val !== null && val !== undefined);
      const dataType = sampleValues.length > 0 ? detectDataType(sampleValues[0]) : 'text';
      
      // Determine column width based on data type and content
      let width = 150;
      if (dataType === 'number') width = 100;
      else if (dataType === 'longText') width = 300;
      else if (key.toLowerCase().includes('name')) width = 200;
      else if (key.toLowerCase().includes('description')) width = 350;
      else if (key.toLowerCase().includes('comment')) width = 300;

      const title = formatTitle(key);

      return {
        title,
        dataIndex: key,
        key,
        width,
        fixed: index === 0 ? 'left' : undefined, // Fix first column (usually componentName)
        sorter: dataType === 'number' 
          ? (a: any, b: any) => (a[key] || 0) - (b[key] || 0)
          : (a: any, b: any) => (a[key] || '').toString().localeCompare((b[key] || '').toString()),
        ...getColumnSearchProps(key, title, dataType),
        render: (value: any) => {
          if (value === null || value === undefined) return '-';
          
          if (dataType === 'longText') {
            return (
              <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                {value.toString()}
              </div>
            );
          }
          
          return value.toString();
        },
      };
    });

    return dynamicColumns;
  };

  const fetchSafetyData = async (): Promise<void> => {
    setLoading(true);
    
    try {
      message.info('Fetching functional safety analysis data...');
      const response = await fetch('/api/safety/safety-analysis-export?dataset=functional');

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to load safety analysis data');
      }

      const allSafetyData = Array.isArray(result.data) ? result.data : [];

      setData(allSafetyData);

      const totalComponentsFromMetadata = result.metadata?.totalComponents ?? new Set(
        allSafetyData
          .map((item: any) => item.componentUuid || item.componentName)
          .filter(Boolean)
      ).size;

      setTotalComponents(totalComponentsFromMetadata);
      setProcessedComponents(totalComponentsFromMetadata);

      if (allSafetyData.length > 0) {
        const dynamicColumns = generateColumnsFromData(allSafetyData);
        setColumns(dynamicColumns);
      } else {
        message.warning('No safety data found for any components');
      }

      if (allSafetyData.length > 0) {
        message.success(
          `Successfully loaded safety analysis data! 
          Total records: ${allSafetyData.length} 
          Components processed: ${totalComponentsFromMetadata}/${totalComponentsFromMetadata}`
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

  const convertToCSV = (data: any[]): string => {
    if (data.length === 0) return '';

    // Get all unique keys from the data (dynamically)
    const allKeys = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => allKeys.add(key));
    });
    
    // Create headers from the keys
    const headers = Array.from(allKeys).map(key => formatTitle(key));

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // Replace newlines with spaces to prevent CSV row breaks
      const cleanedValue = stringValue.replace(/\n/g, ' ');
      // Escape double quotes and wrap in quotes if contains comma, quote, or newline
      if (cleanedValue.includes(',') || cleanedValue.includes('"') || stringValue.includes('\n')) {
        return `"${cleanedValue.replace(/"/g, '""')}"`;
      }
      return cleanedValue;
    };

    // Create CSV rows dynamically
    const csvRows = [
      headers.join(','), // Header row
      ...data.map(item => 
        Array.from(allKeys).map(key => escapeCSV(item[key])).join(',')
      )
    ];

    return csvRows.join('\n');
  };

  const downloadCSV = async (csvContent: string, filename: string): Promise<void> => {
    try {
      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: 'CSV files',
                accept: {
                  'text/csv': ['.csv'],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(csvContent);
          await writable.close();
          
          console.log('CSV file saved successfully');
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('Error saving CSV file:', err);
            // Fallback to traditional download
            fallbackDownloadCSV(csvContent, filename);
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        fallbackDownloadCSV(csvContent, filename);
      }
    } catch (error) {
      console.error('Error in downloadCSV:', error);
      fallbackDownloadCSV(csvContent, filename);
    }
  };

  const fallbackDownloadCSV = (csvContent: string, filename: string): void => {
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

  const handleExportCSV = async (): Promise<void> => {
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
      
      await downloadCSV(csvContent, filename);
      
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
    if (hasFetchedInitialData.current) {
      return;
    }

    hasFetchedInitialData.current = true;
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
            Export Functional FM to CSV
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
          rowKey={(record, index) => `${record.componentName || 'unknown'}-${record.fmName || 'unknown'}-${index}`}
          scroll={{ x: columns.reduce((total, col) => total + (col.width as number || 150), 0), y: 600 }}
          pagination={false}
          size="small"
          bordered
        />
      </Space>
    </div>
  );
};

export default SafetyAnalysisTable;
