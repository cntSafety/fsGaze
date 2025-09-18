// Moved from app/arxml-importer/ArxmlImporter.tsx
import React, { useState } from 'react';
import { Button, Card, Typography, Space, message, Table, Checkbox, Input, Progress, theme, Spin, Modal, Alert } from 'antd';
import { FolderOpenOutlined, FilterOutlined, CheckSquareOutlined, BorderOutlined, MergeCellsOutlined } from '@ant-design/icons';
import { uploadArxmlToNeo4j, getLatestArxmlImportInfo } from '../../services/ArxmlToNeoService'; 

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

interface ArxmlImporterProps {
  onFileImported?: (fileData: unknown) => Promise<void>;
}

const ArxmlImporter: React.FC<ArxmlImporterProps> = () => {
  const { token } = theme.useToken();
  const [files, setFiles] = useState<ArxmlFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<ArxmlFile[]>([]);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [mergeNewFiles, setMergeNewFiles] = useState<boolean>(false);
  const [isLoadingLastImport, setIsLoadingLastImport] = useState<boolean>(false);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState<boolean>(false);
  const [lastImportMeta, setLastImportMeta] = useState<{
    importTimestamp: string;
    nodeCount: number;
    relationshipCount: number;
    fileNames: string[];
    fileSizes: number[];
  } | null>(null);
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
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
  });

  const handleTableChange = (newPagination: any) => {
    setPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  // Helper: Recursively scan directory for .arxml files
  const scanDirectory = async (dirHandle: FileSystemDirectoryHandle, basePath = ''): Promise<ArxmlFile[]> => {
    const arxmlFiles: ArxmlFile[] = [];
    // TypeScript definitions for File System API are incomplete, using any for values() method
    for await (const entry of (dirHandle as any).values()) {
      const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.kind === 'file' && entry.name.endsWith('.arxml')) {
        const file = await entry.getFile();
        
        // Try to get the absolute path if possible
        let absolutePath = entryPath;
        try {
          // Some browsers support getting the absolute path
          if (entry.getFilePath) {
            absolutePath = await entry.getFilePath();
          } else if (entry.path) {
            absolutePath = entry.path;
          }
        } catch (error) {
          // Fallback to relative path if absolute path is not available
          console.log('Absolute path not available, using relative path:', entryPath);
        }
        
        arxmlFiles.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: entry.name,
          path: absolutePath,
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

  const handleMergeToggle = async (checked: boolean) => {
    setMergeNewFiles(checked);
    if (checked) {
      setIsMetaModalOpen(true);
      setIsLoadingLastImport(true);
      try {
        const res = await getLatestArxmlImportInfo();
        if (res.success && res.data) {
          const { importTimestamp, nodeCount, relationshipCount, fileNames = [], fileSizes = [] } = res.data as any;
          setLastImportMeta({ importTimestamp, nodeCount, relationshipCount, fileNames, fileSizes });
          const joined = (fileNames || []).join(', ');
          if (joined) {
            setSearchText(joined);
            applyFilters(joined, selectedFilter);
          }
        } else {
          setLastImportMeta(null);
          messageApi.info(res.message || 'No previous import metadata found.');
        }
      } catch (e: any) {
        setLastImportMeta(null);
        messageApi.error(e?.message || 'Failed to load last import metadata');
      } finally {
        setIsLoadingLastImport(false);
      }
    } else {
      setLastImportMeta(null);
      setIsMetaModalOpen(false);
    }
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
          return { name: file.name, path: file.path, content };
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
        
        messageApi.success({
          content: `Successfully imported ${filesToUpload.length} file(s). ${neoResult.nodeCount} nodes, ${neoResult.relationshipCount} relationships created. You can now download the import summary.`,
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

  const handleDownloadSummary = async () => {
    if (lastImportSummary) {
      await generateImportSummary(
        lastImportSummary.files,
        lastImportSummary.startTime,
        lastImportSummary.nodeCount,
        lastImportSummary.relationshipCount
      );
    }
  };

  // Generate and download import summary file
  const generateImportSummary = async (importedFiles: string[], startTime: number, nodeCount?: number, relationshipCount?: number) => {
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

    const filename = `arxml-import-summary-${now.toISOString().slice(0, 19).replace(/[:.]/g, '-')}.txt`;

    try {
      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: 'Text files',
                accept: {
                  'text/plain': ['.txt'],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(summaryContent);
          await writable.close();
          
          console.log('Summary file saved successfully');
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('Error saving summary file:', err);
            // Fallback to traditional download
            fallbackDownloadSummary(summaryContent, filename);
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        fallbackDownloadSummary(summaryContent, filename);
      }
    } catch (error) {
      console.error('Error in generateImportSummary:', error);
      fallbackDownloadSummary(summaryContent, filename);
    }
  };

  const fallbackDownloadSummary = (summaryContent: string, filename: string) => {
    // Create and download the file
    const blob = new Blob([summaryContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
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
      render: (_: any, record: ArxmlFile) => (
        <Checkbox
          checked={record.selected}
          onChange={(e) => handleFileSelect(record.id, e.target.checked)}
        />
      ),
    },
    {
      title: 'File Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: ArxmlFile, b: ArxmlFile) => a.name.localeCompare(b.name),
      ellipsis: true,
    },
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      sorter: (a: ArxmlFile, b: ArxmlFile) => a.path.localeCompare(b.path),
      ellipsis: true,
    },
  ];

  const allSelected = filteredFiles.length > 0 && filteredFiles.every(file => file.selected);
  const someSelected = filteredFiles.some(file => file.selected);

  const headerCheckbox = (
    <Checkbox
      checked={allSelected}
      indeterminate={someSelected && !allSelected}
      onChange={(e) => handleSelectAll(e.target.checked)}
    >
      Select All on This Page
    </Checkbox>
  );

  return (
    <>
      {contextHolder}
      <Card
        title={<Title level={4}>ARXML File Importer</Title>}
        extra={
          <Space>
            <Button
              icon={<MergeCellsOutlined />}
              onClick={() => handleMergeToggle(true)}
              disabled={isExtracting}
            >
              Get ARXML file names from last import
            </Button>
            <Button type="primary" icon={<FolderOpenOutlined />} onClick={handleFolderSelect} disabled={isExtracting}>
              Change Folder
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Search
            placeholder="Search by filename or path (use commas to separate multiple terms)"
            value={searchText}
            allowClear
            onChange={(e) => {
              const v = e.target.value;
              setSearchText(v);
              if (!v.trim()) {
                // If cleared, immediately reset filters
                applyFilters('', selectedFilter);
              }
            }}
            onSearch={handleSearch}
            enterButton={<FilterOutlined />}
            disabled={isExtracting}
          />
          <Space>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onChange={(e) => handleSelectAll(e.target.checked)}
              disabled={isExtracting}
            >
              Select All
            </Checkbox>
            <Button
              type="link"
              onClick={() => handleSelectAll(false)}
              disabled={isExtracting || !someSelected}
              icon={<BorderOutlined />}
            >
              Deselect All
            </Button>
          </Space>
        </Space>
      </Card>
      <Modal
        open={isMetaModalOpen}
        onCancel={() => setIsMetaModalOpen(false)}
        footer={null}
        title="Last import metadata"
        width={800}
        destroyOnClose
      >
        <Spin spinning={isLoadingLastImport}>
          {lastImportMeta ? (
            <>
              <Space direction="vertical" size={0} style={{ marginBottom: 12 }}>
                <Text>
                  <strong>Import Timestamp:</strong> {new Date(lastImportMeta.importTimestamp).toLocaleString()}
                </Text>
                <Text>
                  <strong>Nodes:</strong> {lastImportMeta.nodeCount} <strong style={{ marginLeft: 8 }}>Relationships:</strong> {lastImportMeta.relationshipCount}
                </Text>
              </Space>
              <Table
                size="small"
                pagination={false}
                rowKey={(row) => row.fileName}
                columns={[
                  {
                    title: 'File Name',
                    dataIndex: 'fileName',
                    key: 'fileName',
                    sorter: (a: any, b: any) => a.fileName.localeCompare(b.fileName),
                  },
                  {
                    title: 'Size (MB)',
                    dataIndex: 'fileSize',
                    key: 'fileSize',
                    width: 140,
                    sorter: (a: any, b: any) => (a.fileSize ?? 0) - (b.fileSize ?? 0),
                    render: (size: number | null | undefined) =>
                      size != null ? `${(size / (1024 * 1024)).toFixed(2)} MB` : '-',
                  },
                ]}
                dataSource={(lastImportMeta.fileNames || []).map((fileName, idx) => ({
                  fileName,
                  fileSize: lastImportMeta.fileSizes?.[idx] ?? null,
                }))}
              />
            </>
          ) : (
            !isLoadingLastImport && <Text type="secondary">No metadata available.</Text>
          )}
        </Spin>
      </Modal>
      
      {isExtracting && (
        <Card style={{ marginTop: 16 }}>
          <Text strong>{progressPhase}</Text>
          <Progress percent={extractionProgress} status="active" />
        </Card>
      )}

      {files.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Table
            columns={columns}
            dataSource={filteredFiles}
            rowKey="id"
            pagination={{
              ...pagination,
              showSizeChanger: true,
              pageSizeOptions: ['10', '50', '100', '200'],
            }}
            onChange={handleTableChange}
            scroll={{ y: 'calc(100vh - 400px)' }}
            loading={isExtracting}
            className={token.colorBgContainer === '#141414' ? 'dark-mode-table' : ''}
          />
        </Card>
      )}

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <Button
          type="primary"
          size="large"
          onClick={handleImportSelected}
          loading={isExtracting}
          disabled={!files.some(f => f.selected)}
          icon={<CheckSquareOutlined />}
        >
          Import Selected Files
        </Button>
        {lastImportSummary && !isExtracting && (
          <Button
            style={{ marginLeft: '8px' }}
            size="large"
            onClick={handleDownloadSummary}
          >
            Download Import Summary
          </Button>
        )}
      </div>
    </>
  );
};

export default ArxmlImporter;
