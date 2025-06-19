'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button, Space, Typography, Spin, Alert, Card, Upload, Input, Modal } from 'antd';
import { UploadOutlined, DatabaseOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import { importFullGraph } from '@/app/services/neo4j/queries/general';
import StatusDB, { StatusDBRef } from '@/app/components/statusDB';

const { Title, Paragraph } = Typography;

// Define the structure of the data
interface SafetyGraphNode {
  uuid: string;
  properties: Record<string, unknown>;
}

interface OccurrenceLink {
  failureUuid: string;
  failureName: string;
  occuranceSourceUuid: string;
  occuranceSourceName: string;
  occuranceSourceArxmlPath?: string;
  occuranceSourceimportLabel?: string;
  occuranceSourceimportTimestamp?: string;
  occuranceSourceoriginalXmlTag?: string;
}

interface CausationLinkInfo {
  causationUuid: string;
  causationName: string;
  causeFailureUuid: string;
  causeFailureName: string;
  effectFailureUuid: string;
  effectFailureName: string;
}

interface RiskRatingLink {
  failureUuid: string;
  failureName: string;
  riskRatingUuid: string;
  riskRatingName: string;
}

interface SafetyNoteLink {
  nodeUuid: string;
  nodeName: string;
  safetyNoteUuid: string;
  safetyNoteName: string;
}

interface SafetyGraphData {
  failures: SafetyGraphNode[];
  causations: SafetyGraphNode[];
  riskRatings: SafetyGraphNode[];
  safetyNotes?: SafetyGraphNode[];
  occurrences: OccurrenceLink[];
  causationLinks: CausationLinkInfo[];
  riskRatingLinks: RiskRatingLink[];
  safetyNoteLinks?: SafetyNoteLink[];
}

const SafetyDataExchange: React.FC = () => {
  const [safetyData, setSafetyData] = useState<SafetyGraphData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [importedData, setImportedData] = useState<SafetyGraphData | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showPostImportStats, setShowPostImportStats] = useState<boolean>(false);
  const [isStatusModalVisible, setIsStatusModalVisible] = useState<boolean>(false);

  // Full graph export state
  const [isExportingFullGraph, setIsExportingFullGraph] = useState<boolean>(false);
  const [fullGraphExportLogs, setFullGraphExportLogs] = useState<string[]>([]);
  const [fullGraphExportError, setFullGraphExportError] = useState<string | null>(null);
  const [showFullGraphExportModal, setShowFullGraphExportModal] = useState<boolean>(false);

  // Full graph import state
  const [isImportingFullGraph, setIsImportingFullGraph] = useState<boolean>(false);
  const [fullGraphImportLogs, setFullGraphImportLogs] = useState<string[]>([]);
  const [fullGraphImportError, setFullGraphImportError] = useState<string | null>(null);
  const [showFullGraphImportModal, setShowFullGraphImportModal] = useState<boolean>(false);
  const [selectedImportFiles, setSelectedImportFiles] = useState<File[]>([]);

  // Ref to trigger refresh of StatusDB component after import
  const statusDBRef = useRef<StatusDBRef | null>(null);


  const handleExport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSafetyData(null);
    try {
      const result = await getSafetyGraph();
      if (result.success && result.data) {
        setSafetyData(result.data);
      } else {
        setError(result.message || 'Failed to fetch safety data.');
      }
    } catch (err: unknown) {
      setError(`An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDownloadJson = () => {
    if (!safetyData) return;
    const jsonString = JSON.stringify(safetyData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'safety_analysis_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper function to sanitize filenames and folder names


  const handleFullGraphExport = async () => {
    try {
      setIsExportingFullGraph(true);
      setFullGraphExportLogs([
        '[INFO] Starting full graph export...',
        '[INFO] Requesting ZIP export from server...'
      ]);
      setFullGraphExportError(null);
      setShowFullGraphExportModal(true);

      console.log('[EXPORT] Starting server-side ZIP export...');
      const startTime = Date.now();

      // Call the new ZIP export API
      const response = await fetch('/api/graph/export/zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format: 'graph-as-code' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Export failed: ${errorData.message || response.statusText}`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`[EXPORT] Server response received in ${totalTime}ms`);

      setFullGraphExportLogs(prev => [
        ...prev, 
        `[INFO] Server processing completed in ${totalTime}ms`,
        '[INFO] Downloading ZIP file...'
      ]);

      // Get the ZIP blob
      const blob = await response.blob();
      const fileSize = (blob.size / 1024 / 1024).toFixed(2); // MB

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with current date
      const date = new Date().toISOString().split('T')[0];
      link.download = `graph-export-${date}.zip`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(url);

      const downloadTime = Date.now() - startTime;
      console.log(`[EXPORT] Download completed in ${downloadTime}ms`);
      setFullGraphExportLogs(prev => [
        ...prev, 
        `[SUCCESS] ZIP file downloaded successfully!`,
        `[INFO] File size: ${fileSize} MB`,
        `[INFO] Total time: ${downloadTime}ms`
      ]);
      
      // Show success message
      setTimeout(() => {
        Modal.success({
          title: 'Graph Export Completed',
          content: (
            <div>
              <p>Successfully exported the full graph as a ZIP file!</p>
              <div>
                <p><strong>File:</strong> graph-export-{date}.zip</p>
                <p><strong>Size:</strong> {fileSize} MB</p>
                <p><strong>Performance:</strong> Completed in {downloadTime}ms</p>
                <p><small>Contains organized node files by label and relationships JSON</small></p>
              </div>
            </div>
          ),
        });
      }, 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Ensure modal and state are set if they weren't already
      if (!showFullGraphExportModal) {
        setShowFullGraphExportModal(true);
        setIsExportingFullGraph(true);
        setFullGraphExportLogs(['[ERROR] Export failed before completion']);
      }
      
      setFullGraphExportError(`Export failed: ${errorMessage}`);
      setFullGraphExportLogs(prev => [...prev, `[ERROR] ${errorMessage}`]);
      
      console.error('[EXPORT] Export failed:', error);
    } finally {
      setIsExportingFullGraph(false);
    }
  };

  const handleFullGraphImport = async () => {
    console.log('[DEBUG] handleFullGraphImport called');
    console.log('[DEBUG] selectedImportFiles.length:', selectedImportFiles.length);
    console.log('[DEBUG] selectedImportFiles:', selectedImportFiles.map(f => ({ name: f.name, size: f.size, path: f.webkitRelativePath })));
    
    if (selectedImportFiles.length === 0) {
      setFullGraphImportError('Please select graph data files to import');
      return;
    }

    setIsImportingFullGraph(true);
    setFullGraphImportLogs(['[INFO] Starting full graph import...']);
    setFullGraphImportError(null);
    setShowFullGraphImportModal(true);

    try {
      console.log('[DEBUG] Starting file processing...');
      setFullGraphImportLogs(prev => [...prev, `[INFO] Processing ${selectedImportFiles.length} files...`]);
      
      // Validate file structure
      console.log('[DEBUG] Validating file structure...');
      const hasRelationships = selectedImportFiles.some(file => file.name === 'relationships.json');
      const nodeFiles = selectedImportFiles.filter(file => 
        file.webkitRelativePath?.includes('/nodes/') && file.name.endsWith('.json')
      );
      
      console.log('[DEBUG] hasRelationships:', hasRelationships);
      console.log('[DEBUG] nodeFiles.length:', nodeFiles.length);
      console.log('[DEBUG] nodeFiles:', nodeFiles.map(f => ({ name: f.name, path: f.webkitRelativePath })));
      
      if (!hasRelationships) {
        throw new Error('relationships.json file is required for import');
      }
      
      if (nodeFiles.length === 0) {
        throw new Error('No node files found. Please ensure node files are in a "nodes" directory structure');
      }
      
      setFullGraphImportLogs(prev => [...prev, `[INFO] Found ${nodeFiles.length} node files and relationships.json`]);
      setFullGraphImportLogs(prev => [...prev, '[WARNING] This operation will COMPLETELY WIPE the current database!']);
      
      // Parse files directly
      console.log('[DEBUG] Starting file parsing...');
      setFullGraphImportLogs(prev => [...prev, '[INFO] Parsing node files...']);
      
      const nodesData: any[] = [];
      let relationshipsData: any[] = [];
      
      console.log('[DEBUG] Processing files...');
      // Parse all files
      for (const file of selectedImportFiles) {
        console.log(`[DEBUG] Processing file: ${file.name}, size: ${file.size}, path: ${file.webkitRelativePath}`);
        
        const content = await file.text();
        console.log(`[DEBUG] File content length: ${content.length}`);
        
        const data = JSON.parse(content);
        console.log(`[DEBUG] Parsed data for ${file.name}:`, typeof data, Array.isArray(data) ? `Array(${data.length})` : 'Object');
        
        if (file.name === 'relationships.json') {
          // This is the relationships file
          console.log('[DEBUG] Processing relationships.json');
          if (Array.isArray(data)) {
            // Map the exported format to the import format
            relationshipsData = data.map((rel: any) => ({
              type: rel.type,
              properties: rel.properties,
              start: rel.startNodeUuid, // Map startNodeUuid to start
              end: rel.endNodeUuid      // Map endNodeUuid to end
            }));
            console.log(`[DEBUG] Mapped ${data.length} relationships`);
            setFullGraphImportLogs(prev => [...prev, `[INFO] Found ${data.length} relationships in ${file.name}`]);
          } else {
            throw new Error(`${file.name} does not contain an array of relationships`);
          }
        } else if (file.name.endsWith('.json')) {
          // This should be a node file
          console.log(`[DEBUG] Processing node file: ${file.name}`);
          if (data.labels && data.properties) {
            // Check if uuid is in the data, if not try to extract from filename
            let uuid = data.uuid;
            console.log(`[DEBUG] Node UUID from data: ${uuid}`);
            
            if (!uuid) {
              // Try to extract UUID from filename
              // Expected format: "LABEL_uuid-here.json" or similar
              const filenameWithoutExt = file.name.replace('.json', '');
              const parts = filenameWithoutExt.split('_');
              
              if (parts.length >= 2) {
                // Take everything after the first underscore as the UUID
                uuid = parts.slice(1).join('_');
              }
              
              console.log(`[DEBUG] Extracted UUID from filename: ${uuid}`);
              
              if (!uuid) {
                console.log(`[DEBUG] WARN: ${file.name} has no uuid in data and couldn't extract from filename, skipping...`);
                setFullGraphImportLogs(prev => [...prev, `[WARN] ${file.name} has no uuid in data and couldn't extract from filename, skipping...`]);
                continue;
              }
            }
            
            const nodeData = {
              uuid: uuid,
              labels: data.labels,
              properties: data.properties
            };
            nodesData.push(nodeData);
            console.log(`[DEBUG] Added node: ${uuid}, labels: ${data.labels.join(',')}`);
          } else {
            console.log(`[DEBUG] WARN: ${file.name} does not have expected node structure, skipping...`);
            setFullGraphImportLogs(prev => [...prev, `[WARN] ${file.name} does not have expected node structure (missing labels or properties), skipping...`]);
          }
        }
      }
      
      console.log(`[DEBUG] Final parsing results:`);
      console.log(`[DEBUG] - nodesData.length: ${nodesData.length}`);
      console.log(`[DEBUG] - relationshipsData.length: ${relationshipsData.length}`);
      console.log(`[DEBUG] - Sample node:`, nodesData[0]);
      console.log(`[DEBUG] - Sample relationship:`, relationshipsData[0]);
      
      setFullGraphImportLogs(prev => [...prev, `[INFO] Successfully parsed ${nodesData.length} nodes and ${relationshipsData.length} relationships`]);
      setFullGraphImportLogs(prev => [...prev, '[INFO] Starting database import operation...']);
      
      console.log('[DEBUG] About to call importFullGraph...');
      const startTime = Date.now();
      
      // Call the import function directly
      const result = await importFullGraph(nodesData, relationshipsData);
      
      const duration = Date.now() - startTime;
      console.log(`[DEBUG] importFullGraph completed in ${duration}ms`);
      console.log('[DEBUG] importFullGraph result:', result);
      
      if (!result.success) {
        console.log('[DEBUG] Import failed:', result);
        throw new Error(result.message || 'Import failed');
      }
      
      console.log('[DEBUG] Import successful:', result);
      setFullGraphImportLogs(prev => [
        ...prev,
        `[SUCCESS] Import completed successfully in ${duration}ms!`,
        `[INFO] Nodes created: ${result.stats?.nodesCreated || 'N/A'}`,
        `[INFO] Relationships created: ${result.stats?.relationshipsCreated || 'N/A'}`,
        `[INFO] Constraints created: ${result.stats?.constraintsCreated || 'N/A'}`,
        `[INFO] Database performance: ${result.stats?.duration || 'N/A'}ms`,
      ]);
      
      // Clear selected files after successful import
      console.log('[DEBUG] Clearing selected files and refreshing status...');
      setSelectedImportFiles([]);
      
      // Refresh database status
      if (statusDBRef.current) {
        statusDBRef.current.refresh();
      }
      
      // Show success modal
      setTimeout(() => {
        Modal.success({
          title: 'Full Graph Import Completed',
          content: (
            <div>
              <p>Successfully imported the complete graph from files!</p>
              <div>
                <p><strong>Nodes Created:</strong> {result.stats?.nodesCreated || 'N/A'}</p>
                <p><strong>Relationships Created:</strong> {result.stats?.relationshipsCreated || 'N/A'}</p>
                <p><strong>Import Time:</strong> {duration}ms</p>
                <p><strong>Database Operation Time:</strong> {result.stats?.duration || 'N/A'}ms</p>
                <p><small>Previous database content was completely replaced</small></p>
              </div>
            </div>
          ),
        });
      }, 1000);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DEBUG] Import error:', error);
      console.error('[DEBUG] Error message:', errorMessage);
      setFullGraphImportError(`Import failed: ${errorMessage}`);
      setFullGraphImportLogs(prev => [...prev, `[ERROR] ${errorMessage}`]);
    } finally {
      console.log('[DEBUG] Import process finished, setting loading to false');
      setIsImportingFullGraph(false);
    }
  };

  const handleImportFileSelect = (fileList: File[]) => {
    console.log('[DEBUG] handleImportFileSelect called');
    console.log('[DEBUG] fileList.length:', fileList.length);
    
    const startTime = Date.now();
    
    setSelectedImportFiles(fileList);
    setFullGraphImportError(null);
    setFullGraphImportLogs([]);
    
    if (fileList.length === 0) {
      console.log('[DEBUG] No files selected');
      return;
    }
    
    // More efficient validation - stop early when found
    console.log('[DEBUG] Starting optimized file validation...');
    
    let hasRelationships = false;
    let nodeFileCount = 0;
    
    // Single pass through files for efficiency
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      
      if (file.name === 'relationships.json') {
        hasRelationships = true;
        console.log('[DEBUG] Found relationships.json');
      }
      
      if (file.webkitRelativePath?.includes('/nodes/') && file.name.endsWith('.json')) {
        nodeFileCount++;
      }
      
      // Early break if we have what we need for validation (optional optimization)
      // We can still count all files for accuracy, but this shows the principle
    }
    
    const validationTime = Date.now() - startTime;
    console.log(`[DEBUG] File validation completed in ${validationTime}ms`);
    console.log(`[DEBUG] hasRelationships: ${hasRelationships}`);
    console.log(`[DEBUG] nodeFileCount: ${nodeFileCount}`);
    
    if (fileList.length > 0) {
      if (!hasRelationships) {
        console.log('[DEBUG] Missing relationships.json');
        setFullGraphImportError('Missing relationships.json file. Please select the complete graph export folder.');
      } else if (nodeFileCount === 0) {
        console.log('[DEBUG] No node files found');
        setFullGraphImportError('No node files found in nodes/ directory. Please select the complete graph export folder.');
      } else {
        console.log('[DEBUG] Validation successful');
        setFullGraphImportLogs([
          `[INFO] Selected ${fileList.length} files for import`,
          `[INFO] Found ${nodeFileCount} node files and relationships.json`,
          '[READY] Click "Import Complete Graph" to proceed with wipe-and-load operation'
        ]);
      }
    }
    
    console.log(`[DEBUG] handleImportFileSelect completed in ${Date.now() - startTime}ms`);
  };

  const handleFileSelect = (file: File) => {
    setIsProcessingFile(true);
    setImportError(null);
    setImportedData(null);
    setImportedFileName(null);
    setUploadLogs([]);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsedData: SafetyGraphData = JSON.parse(text);
        // Basic validation (can be more thorough)
        if (parsedData && parsedData.failures && parsedData.causations && parsedData.occurrences && parsedData.causationLinks) {
          // Allow riskRatings, riskRatingLinks, safetyNotes, and safetyNoteLinks to be optional for backward compatibility
          if (!parsedData.riskRatings) {
            parsedData.riskRatings = [];
          }
          if (!parsedData.riskRatingLinks) {
            parsedData.riskRatingLinks = [];
          }
          if (!parsedData.safetyNotes) {
            parsedData.safetyNotes = [];
          }
          if (!parsedData.safetyNoteLinks) {
            parsedData.safetyNoteLinks = [];
          }
          setImportedData(parsedData);
          setImportedFileName(file.name);
        } else {
          setImportError('Invalid JSON structure for safety data. Required fields: failures, causations, occurrences, causationLinks.');
        }
      } catch (err: unknown) {
        setImportError(`Error parsing JSON file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsProcessingFile(false);
      }
    };
    reader.onerror = () => {
      setImportError('Error reading file.');
      setIsProcessingFile(false);
    };
    reader.readAsText(file);
    return false; // Prevent antd Upload default behavior
  };

  const handleUploadToNeo4j = async () => {
    if (!importedData) {
      setUploadError("No data to upload.");
      return;
    }
    setIsUploading(true);
    setUploadLogs([]);
    setUploadError(null);
    setShowPostImportStats(false);
    
    try {
      const response = await fetch('/api/safety-graph/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(importedData),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setUploadLogs(result.logs || ['Upload successful, but no logs were returned.']);
        setImportedData(null); // Clear preview after successful upload
        setImportedFileName(null);
        setShowPostImportStats(true);
        
        // Trigger StatusDB refresh after successful import
        if (statusDBRef.current) {
          statusDBRef.current.refresh();
        }
      } else {
        setUploadError(result.message || 'Failed to upload data to Neo4j.');
        if(result.logs) {
          setUploadLogs(result.logs);
        }
      }
    } catch (err: unknown) {
      setUploadError(`An error occurred during upload: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const renderDataAsJson = (data: unknown, title: string) => (
    <Card title={title} style={{ marginTop: 16 }}>
      <pre style={{ maxHeight: 300, overflowY: 'auto', backgroundColor: '#f5f5f5', padding: 10 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </Card>
  );

  const handleOpenStatusModal = () => {
    setIsStatusModalVisible(true);
    // Refresh stats when modal opens
    setTimeout(() => {
      if (statusDBRef.current) {
        statusDBRef.current.refresh();
      }
    }, 100);
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Export and Import the Safety Analysis</Title>
      <Paragraph>
        Export safety analysis data from Neo4j or import it from a JSON file.
      </Paragraph>

      <Space direction="vertical" style={{ width: '100%' }}>
        {/* DB Status Button */}
        <div style={{ marginBottom: 16 }}>
          <Button 
            type="default" 
            icon={<DatabaseOutlined />} 
            onClick={handleOpenStatusModal}
          >
            DB Status and Info
          </Button>
        </div>

        <Card title="Export Safety Analysis Data">
          <Space>
            <Button onClick={handleExport} loading={isLoading}>
              Fetch Safety Data from DB
            </Button>
            {safetyData && (
              <Button icon={<DownloadOutlined />} onClick={handleDownloadJson}>
                Download as JSON
              </Button>
            )}
          </Space>
          {isLoading && <div style={{ textAlign: 'center', marginTop: 20 }}><Spin size="large" /></div>}
          {error && <Alert message={error} type="error" showIcon style={{ marginTop: 16 }} />}
          {safetyData && renderDataAsJson(safetyData, "Fetched Safety Data Preview")}
        </Card>

        <Card title="Full Graph Export (ZIP Archive)">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Button 
                type="primary" 
                icon={<ExportOutlined />} 
                onClick={handleFullGraphExport} 
                loading={isExportingFullGraph}
              >
                Export Complete Graph as ZIP
              </Button>
            </div>
            <Paragraph style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              Exports the entire Neo4j graph as a ZIP archive containing organized files by node labels and relationships. 
              Fast server-side processing with a single download. Works in all browsers.
              Uses optimized queries and parallel file writing for better performance.
              Creates a Git-friendly structure for version control and collaborative editing.
            </Paragraph>
          </Space>
        </Card>

        <Card title="Full Graph Import (Graph-as-Code)">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Upload
                multiple
                directory
                beforeUpload={() => false}
                onChange={(info) => {
                  console.log('[DEBUG] Upload onChange triggered');
                  console.log('[DEBUG] info.fileList.length:', info.fileList.length);
                  
                  // Process files more efficiently
                  const files = info.fileList
                    .map(f => f.originFileObj!)
                    .filter(Boolean);
                  
                  console.log('[DEBUG] Filtered files count:', files.length);
                  
                  // Use setTimeout to avoid blocking the UI
                  setTimeout(() => {
                    handleImportFileSelect(files);
                  }, 0);
                }}
                showUploadList={false}
                accept=".json"
              >
                <Button icon={<UploadOutlined />} disabled={isImportingFullGraph}>
                  {selectedImportFiles.length > 0 
                    ? `Selected ${selectedImportFiles.length} files` 
                    : "Select Graph Export Folder"}
                </Button>
              </Upload>
            </div>
            {selectedImportFiles.length > 0 && !fullGraphImportError && (
              <Button
                type="primary"
                danger
                onClick={handleFullGraphImport}
                loading={isImportingFullGraph}
                style={{ marginTop: 8 }}
              >
                Import Complete Graph (Wipe & Load)
              </Button>
            )}
            <Paragraph style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              <strong>⚠️ WARNING:</strong> This will COMPLETELY WIPE the current database and import the selected graph files.
              Select the folder that contains the &ldquo;nodes/&rdquo; directory and &ldquo;relationships.json&rdquo; file from a previous export.
              This is a three-phase atomic operation: (1) Wipe database, (2) Create nodes, (3) Create relationships.
            </Paragraph>
            {fullGraphImportError && (
              <Alert message={fullGraphImportError} type="error" showIcon style={{ marginTop: 8 }} />
            )}
          </Space>
        </Card>

        <Card title="Import Safety Analysis Data">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Upload
              beforeUpload={handleFileSelect}
              showUploadList={false}
              accept=".json"
            >
              <Button icon={<UploadOutlined />} loading={isProcessingFile}>
                {importedFileName ? `Selected: ${importedFileName}` : "Select JSON File"}
              </Button>
            </Upload>
            {isProcessingFile && <div style={{ textAlign: 'center', marginTop: 20 }}><Spin /></div>}
            {importError && <Alert message={importError} type="error" showIcon style={{ marginTop: 16 }} />}
            {importedData && renderDataAsJson(importedData, "Preview of Data to Import")}
            {importedData && (
              <Button
                type="primary"
                onClick={handleUploadToNeo4j}
                loading={isUploading}
                style={{ marginTop: 16 }}
                disabled={isProcessingFile}
              >
                Upload to Neo4j
              </Button>
            )}
          </Space>
          {isUploading && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <Spin tip="Uploading...">
                {/* This inner div makes Spin act as a wrapper, satisfying the "nest" pattern for the tip. 
                    A minHeight ensures space for the spinner and tip. */}
                <div style={{ minHeight: '50px' }} />
              </Spin>
            </div>
          )}
          {uploadError && <Alert message={uploadError} type="error" showIcon style={{ marginTop: 16 }} />}
          {uploadLogs.length > 0 && (
            <Card title="Import Logs" style={{ marginTop: 16 }}>
              <Input.TextArea
                rows={10}
                readOnly
                value={uploadLogs.join('\n')}
                style={{ backgroundColor: '#f0f0f0', fontFamily: 'monospace' }}
              />
            </Card>
          )}
          
          {/* Show updated database status after successful import */}
          {showPostImportStats && uploadLogs.length > 0 && (
            <Alert 
              message="Import completed successfully! Click 'DB Status and Info' to view updated database statistics." 
              type="success" 
              showIcon 
              style={{ marginTop: 16 }}
            />
          )}
        </Card>
      </Space>

      {/* Database Status Modal */}
      <Modal
        title="Database Status and Information"
        open={isStatusModalVisible}
        onCancel={() => setIsStatusModalVisible(false)}
        footer={null}
        width={800}
        destroyOnHidden={true}
      >
        <StatusDB ref={statusDBRef} />
      </Modal>

      {/* Full Graph Export Modal */}
      <Modal
        title="ZIP Export Progress"
        open={showFullGraphExportModal}
        onCancel={() => setShowFullGraphExportModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowFullGraphExportModal(false)}>
            Close
          </Button>
        ]}
        width={800}
      >
        {isExportingFullGraph && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Spin tip="Exporting graph to files...">
              <div style={{ minHeight: '50px' }} />
            </Spin>
          </div>
        )}
        
        {fullGraphExportError && (
          <Alert 
            message="Export Failed" 
            description={fullGraphExportError} 
            type="error" 
            showIcon 
            style={{ marginBottom: 16 }} 
          />
        )}
        
        {fullGraphExportLogs.length > 0 && (
          <Card title="Export Logs" size="small">
            <Input.TextArea
              rows={12}
              readOnly
              value={fullGraphExportLogs.join('\n')}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Card>
        )}
      </Modal>

      {/* Full Graph Import Modal */}
      <Modal
        title="Full Graph Import Progress"
        open={showFullGraphImportModal}
        onCancel={() => setShowFullGraphImportModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowFullGraphImportModal(false)}>
            Close
          </Button>
        ]}
        width={800}
      >
        {isImportingFullGraph && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Spin tip="Importing graph from files...">
              <div style={{ minHeight: '50px' }} />
            </Spin>
          </div>
        )}
        
        {fullGraphImportError && (
          <Alert 
            message="Import Failed" 
            description={fullGraphImportError} 
            type="error" 
            showIcon 
            style={{ marginBottom: 16 }} 
          />
        )}
        
        {fullGraphImportLogs.length > 0 && (
          <Card title="Import Logs" size="small">
            <Input.TextArea
              rows={12}
              readOnly
              value={fullGraphImportLogs.join('\n')}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Card>
        )}
      </Modal>
    </div>
  );
};

export default SafetyDataExchange;
