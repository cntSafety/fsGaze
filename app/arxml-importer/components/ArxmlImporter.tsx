// Moved from app/arxml-importer/ArxmlImporter.tsx
import React, { useState, useEffect } from 'react';
import { Button, Card, Typography, Space, message, Table, Checkbox, Input, Select, Progress } from 'antd';
import { FolderOpenOutlined, SearchOutlined, CheckSquareOutlined, BorderOutlined } from '@ant-design/icons';
import '../ArxmlImporter.css';
import { uploadArxmlToNeo4j } from '../../services/ArxmlToNeoService';
import { useLoading } from '../../components/LoadingProvider';

const { Title, Text } = Typography;
const { Search } = Input;

interface ArxmlFile {
  id: string;
  name: string;
  path: string;
  file: File;
  selected: boolean;
}

type FilterType = 'all' | 'selected' | 'unselected';

const ArxmlImporter: React.FC<{ onFileImported?: (fileData: any) => Promise<void> }> = ({ onFileImported }) => {
  const [files, setFiles] = useState<ArxmlFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<ArxmlFile[]>([]);
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [searchText, setSearchText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState<string>('');
  const [messageApi, contextHolder] = message.useMessage();

  // Helper: Recursively scan directory for .arxml files
  const scanDirectory = async (dirHandle: any, basePath = ''): Promise<ArxmlFile[]> => {
    const arxmlFiles: ArxmlFile[] = [];
    for await (const entry of dirHandle.values()) {
      const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.kind === 'file' && entry.name.endsWith('.arxml')) {
        const file = await entry.getFile();
        arxmlFiles.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: entry.name,
          path: entryPath,
          file,
          selected: false,
        });
      } else if (entry.kind === 'directory') {
        const subDirFiles = await scanDirectory(entry, entryPath);
        arxmlFiles.push(...subDirFiles);
      }
    }
    return arxmlFiles;
  };

  const handleFolderSelect = async () => {
    try {
      // @ts-ignore
      const newDirHandle = await window.showDirectoryPicker();
      setDirHandle(newDirHandle);
      messageApi.loading({ content: 'Scanning directory...', key: 'scanning', duration: 0 });
      const arxmlFiles = await scanDirectory(newDirHandle);
      
      // Show processing message while setting up the table
      messageApi.loading({ content: 'Processing files and preparing table...', key: 'scanning', duration: 0 });
      
      // Small delay to ensure the processing message is visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setFiles(arxmlFiles);
      setFilteredFiles(arxmlFiles);
      
      messageApi.success({
        content: `Found ${arxmlFiles.length} ARXML files`,
        key: 'scanning',
        duration: 2,
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        messageApi.error({
          content: 'Failed to select folder',
          key: 'scanning',
          duration: 2,
        });
      }
    }
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    applyFilters(value, selectedFilter);
  };

  const handleFileSelect = (id: string, checked: boolean) => {
    const updatedFiles = files.map(file => file.id === id ? { ...file, selected: checked } : file);
    setFiles(updatedFiles);
    applyFilters(searchText, selectedFilter, updatedFiles);
  };

  const handleSelectAll = (select: boolean) => {
    // Only update the files that are currently visible (filtered)
    const filteredFileIds = new Set(filteredFiles.map(file => file.id));
    const updatedFiles = files.map(file => 
      filteredFileIds.has(file.id) ? { ...file, selected: select } : file
    );
    setFiles(updatedFiles);
    applyFilters(searchText, selectedFilter, updatedFiles);
  };

  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    applyFilters(searchText, filter);
  };

  const applyFilters = (searchValue: string, filter: FilterType, filesToFilter = files) => {
    let filtered = filesToFilter;
    if (searchValue) {
      const searchTerms = searchValue
        .split(',')
        .map(term => term.trim().toLowerCase())
        .filter(term => term.length > 0);
      
      if (searchTerms.length > 0) {
        filtered = filtered.filter(file => {
          const fileName = file.name.toLowerCase();
          const filePath = file.path.toLowerCase();
          
          // Check if any of the search terms match the file name or path
          return searchTerms.some(term => 
            fileName.includes(term) || filePath.includes(term)
          );
        });
      }
    }
    if (filter === 'selected') {
      filtered = filtered.filter(file => file.selected);
    } else if (filter === 'unselected') {
      filtered = filtered.filter(file => !file.selected);
    }
    setFilteredFiles(filtered);
  };

  const handleImportSelected = async () => {
    const selectedFiles = files.filter(file => file.selected);
    if (selectedFiles.length === 0) {
      messageApi.warning('Please select at least one file to import');
      return;
    }

    setExtractionProgress(0); // Reset for a new import
    setProgressPhase('Initializing...');
    setIsExtracting(true);    // Show progress bar and disable buttons
    const messageKey = 'importingStatus'; // Use a consistent key for the message
    messageApi.loading({ content: 'Initializing import...', key: messageKey, duration: 0 }); // duration 0 makes it sticky

    // Optional: Give a slight delay for the UI to update and show 0% progress before moving
    await new Promise(resolve => setTimeout(resolve, 100));
    setExtractionProgress(10); // Indicate start of process
    setProgressPhase('Preparing files...');
    messageApi.loading({ content: 'Preparing selected files (10%)...', key: messageKey, duration: 0 });

    let importSuccessful = false;

    try {
      const filesToUpload = await Promise.all(
        selectedFiles.map(async (file) => {
          const content = await file.file.text();
          return { name: file.name, content };
        })
      );
      setExtractionProgress(30); // Files prepared for upload
      setProgressPhase('Sending to server...');
      messageApi.loading({ content: 'Files ready. Sending to server for processing (30%)...', key: messageKey, duration: 0 });

      // Progress callback function to receive real-time updates from backend
      const progressCallback = (progress: number, phase: string) => {
        setExtractionProgress(Math.round(progress));
        setProgressPhase(phase);
        messageApi.loading({ 
          content: `${phase} (${Math.round(progress)}%)...`, 
          key: messageKey, 
          duration: 0 
        });
      };

      // Single call to the backend with progress callback
      const neoResult = await uploadArxmlToNeo4j(filesToUpload, progressCallback);
      
      // Backend processing is finished, now update progress and message
      setExtractionProgress(100); 
      setProgressPhase('Import complete!');
      
      if (neoResult.success) {
        messageApi.success({
          content: `Successfully imported ${filesToUpload.length} file(s). ${neoResult.nodeCount} nodes, ${neoResult.relationshipCount} relationships created.`,
          key: messageKey, // This will replace the loading message
          duration: 5,
        });
        importSuccessful = true;
      } else {
        messageApi.error({
          content: `Failed to import files: ${neoResult.error || neoResult.message}`,
          key: messageKey, // This will replace the loading message
          duration: 5,
        });
        // extractionProgress will be reset in finally if not successful
      }
    } catch (error: any) {
      messageApi.error({
        content: `Failed to import files: ${error.message || 'Unknown error. Please try again.'}`,
        key: messageKey, // This will replace the loading message
        duration: 3,
      });
      // extractionProgress will be reset in finally
    } finally {
      setIsExtracting(false); // Hide progress bar controls, buttons re-enabled
      if (!importSuccessful) {
        setExtractionProgress(0); // Ensure progress is reset if import failed or was incomplete
        setProgressPhase('');
        // If the error message didn't replace the loading message (e.g., due to an early crash not caught by try/catch),
        // ensure it's cleared. However, the above error handlers should cover this by using the same key.
      }
      // If import was successful, the success message is shown.
      // If a new import starts, the message will be replaced by the initial "Initializing import..."
    }
  };

  // Parse ARXML content to JSON
  const parseArxmlContent = (xmlString: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    return convertXmlToJson(xmlDoc.documentElement);
  };

  // Convert XML DOM to JSON
  const convertXmlToJson = (node: Element): any => {
    const result: any = {
      nodeName: node.nodeName,
      attributes: {},
      children: []
    };
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        result.attributes[attr.nodeName] = attr.nodeValue;
      }
    }
    node.childNodes.forEach((childNode: any) => {
      if (childNode.nodeType === Node.ELEMENT_NODE) {
        result.children.push(convertXmlToJson(childNode));
      } else if (childNode.nodeType === Node.TEXT_NODE) {
        const text = childNode.nodeValue?.trim();
        if (text && text.length > 0) {
          result.textContent = text;
        }
      }
    });
    return result;
  };

  const columns = [
    {
      title: 'Select',
      dataIndex: 'selected',
      key: 'selected',
      width: 80,
      render: (_: any, record: ArxmlFile) => (
        <Checkbox
          checked={record.selected}
          onChange={e => handleFileSelect(record.id, e.target.checked)}
          disabled={isExtracting}
        />
      ),
    },
    {
      title: 'File Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <div style={{
          maxHeight: '50px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {text}
        </div>
      ),
    },
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      render: (text: string) => (
        <div style={{
          maxHeight: '50px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {text}
        </div>
      ),
    }
  ];

  return (
    <div className="arxml-importer-container">
      {contextHolder}
      <Card size="small" style={{ width: '100%', margin: 0 }}>
        {files.length === 0 && (
          <div style={{ textAlign: 'center', margin: '32px 0 16px 0' }}>
            <FolderOpenOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 16 }} />
          </div>
        )}
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: files.length === 0 ? 32 : 0 }}>
            <Button
              type="primary"
              icon={<FolderOpenOutlined />}
              onClick={handleFolderSelect}
              size="middle"
              style={{ fontSize: 16, padding: '6px 20px', height: 40 }}
              disabled={isExtracting}
            >
              {dirHandle ? 'Change Folder' : 'Select Folder'}
            </Button>
          </div>
          {files.length > 0 && (
            <>
              <Space>
                <Button
                  icon={<CheckSquareOutlined />}
                  onClick={() => handleSelectAll(true)}
                  size="small"
                  disabled={isExtracting}
                >
                  Select All
                </Button>
                <Button
                  icon={<BorderOutlined />}
                  onClick={() => handleSelectAll(false)}
                  size="small"
                  disabled={isExtracting}
                >
                  Deselect All
                </Button>
                
              </Space>
              <Search
                placeholder="Search by filename or path... (use commas to separate multiple terms)"
                allowClear
                enterButton={<SearchOutlined />}
                value={searchText}
                onChange={e => handleSearch(e.target.value)}
                style={{ marginBottom: 8 }}
                disabled={isExtracting}
              />

              {/* Progress bar moved here, above the table */}
              {isExtracting && (
                <div style={{ margin: '16px 0' }}>
                  <div style={{ marginBottom: '8px', fontSize: '14px', color: '#666' }}>
                    {progressPhase || 'Processing...'}
                  </div>
                  <Progress 
                    percent={extractionProgress} 
                    status={extractionProgress === 100 ? "success" : "active"}
                    showInfo={true}
                    strokeColor={extractionProgress === 100 ? '#52c41a' : '#1890ff'}
                  />
                </div>
              )}

              <Table
                dataSource={filteredFiles}
                columns={columns}
                rowKey="id"
                pagination={false}
                className="arxml-files-table"
                size="small"
                scroll={{ y: 'calc(100vh - 300px)' }}
                bordered
                style={{ width: '100%' }}
              />
              {/* Button section remains after the table, Progress bar was removed from here */}
              <Button
                type="primary"
                onClick={handleImportSelected}
                disabled={!files.some(file => file.selected) || isExtracting}
                size="small"
                loading={isExtracting}
              >
                Import Selected to Neo4j
              </Button>
            </>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default ArxmlImporter;
