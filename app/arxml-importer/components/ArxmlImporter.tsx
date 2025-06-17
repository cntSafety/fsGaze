// Moved from app/arxml-importer/ArxmlImporter.tsx
import React, { useState } from 'react';
import { Button, Card, Typography, Space, message, Table, Checkbox, Input, Progress } from 'antd';
import { FolderOpenOutlined, SearchOutlined, CheckSquareOutlined, BorderOutlined } from '@ant-design/icons';
import '../ArxmlImporter.css';
import { uploadArxmlToNeo4j } from '../../services/ArxmlToNeoService';

const { Text } = Typography;
const { Search } = Input;

interface ArxmlFile {
  id: string;
  name: string;
  path: string;
  file: File;
  selected: boolean;
}

type FilterType = 'all' | 'selected' | 'unselected';

interface ArxmlImporterProps {
  onFileImported?: (fileData: unknown) => Promise<void>;
}

const ArxmlImporter: React.FC<ArxmlImporterProps> = () => {
  const [files, setFiles] = useState<ArxmlFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<ArxmlFile[]>([]);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [selectedFilter] = useState<FilterType>('all');
  const [searchText, setSearchText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState<string>('');
  const [messageApi, contextHolder] = message.useMessage();
  const [lastImportSummary, setLastImportSummary] = useState<{
    files: string[];
    startTime: number;
    nodeCount?: number;
    relationshipCount?: number;
  } | null>(null);

  // Helper: Recursively scan directory for .arxml files
  const scanDirectory = async (dirHandle: FileSystemDirectoryHandle, basePath = ''): Promise<ArxmlFile[]> => {
    const arxmlFiles: ArxmlFile[] = [];
    // TypeScript definitions for File System API are incomplete, using any for values() method
    for await (const entry of (dirHandle as any).values()) {
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
      // @ts-expect-error - showDirectoryPicker is not yet in TypeScript types but exists in modern browsers
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
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
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

    const startTime = Date.now(); // Track import start time
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
        // Generate import summary file
        const importedFileNames = selectedFiles.map(file => file.name);
        const summaryData = {
          files: importedFileNames,
          startTime,
          nodeCount: neoResult.nodeCount,
          relationshipCount: neoResult.relationshipCount
        };
        setLastImportSummary(summaryData);
        generateImportSummary(importedFileNames, startTime, neoResult.nodeCount, neoResult.relationshipCount);
        
        messageApi.success({
          content: `Successfully imported ${filesToUpload.length} file(s). ${neoResult.nodeCount} nodes, ${neoResult.relationshipCount} relationships created. Import summary downloaded.`,
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
    } catch (error: unknown) {
      messageApi.error({
        content: `Failed to import files: ${error instanceof Error ? error.message : 'Unknown error. Please try again.'}`,
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

  // Generate and download import summary file
  const generateImportSummary = (importedFiles: string[], startTime: number, nodeCount?: number, relationshipCount?: number) => {
    const now = new Date();
    const endTime = Date.now();
    const processingTime = Math.round((endTime - startTime) / 1000); // Convert to seconds
    
    const importDate = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const summaryContent = [
      `ARXML Import Summary`,
      `===================`,
      ``,
      `Import Date: ${importDate}`,
      `Total Files Imported: ${importedFiles.length}`,
      `Processing Time: ${processingTime} seconds`,
      ...(nodeCount !== undefined ? [`Nodes Created: ${nodeCount}`] : []),
      ...(relationshipCount !== undefined ? [`Relationships Created: ${relationshipCount}`] : []),
      ``,
      `Imported Files:`,
      importedFiles.join(', ')
    ].join('\n');

    // Create and download the file
    const blob = new Blob([summaryContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arxml-import-summary-${now.toISOString().slice(0, 19).replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: 'Select',
      dataIndex: 'selected',
      key: 'selected',
      width: 80,
      render: (_: unknown, record: ArxmlFile) => (
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
              <Space>
                <Button
                  type="primary"
                  onClick={handleImportSelected}
                  disabled={!files.some(file => file.selected) || isExtracting}
                  size="small"
                  loading={isExtracting}
                >
                  Import Selected to Neo4j
                </Button>
                {lastImportSummary && (
                  <Button
                    type="default"
                    onClick={() => generateImportSummary(
                      lastImportSummary.files,
                      lastImportSummary.startTime,
                      lastImportSummary.nodeCount,
                      lastImportSummary.relationshipCount
                    )}
                    size="small"
                    disabled={isExtracting}
                  >
                    Download Last Import Summary
                  </Button>
                )}
              </Space>
            </>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default ArxmlImporter;
