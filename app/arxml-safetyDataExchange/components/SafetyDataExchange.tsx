'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button, Space, Typography, Spin, Alert, Card, Upload, Input, Modal } from 'antd';
import { UploadOutlined, DatabaseOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety'; // Assuming this path is correct
import { exportFullGraphOptimized, importFullGraph } from '@/app/services/neo4j/queries/general';
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

interface SafetyGraphData {
  failures: SafetyGraphNode[];
  causations: SafetyGraphNode[];
  occurrences: OccurrenceLink[];
  causationLinks: CausationLinkInfo[];
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
  const sanitizeFileName = (name: string): string => {
    // Remove or replace invalid characters for filesystem
    return name
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/[^\w\-_.]/g, '_') // Replace any remaining special characters
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 100); // Limit length to 100 characters
  };

  const handleFullGraphExport = async () => {
    try {
      // Check if File System Access API is supported
      if (!('showDirectoryPicker' in window)) {
        throw new Error('File System Access API is not supported in this browser. Please use Chrome or Edge.');
      }

      // Request directory picker IMMEDIATELY while user activation is fresh
      // @ts-expect-error - TypeScript doesn't have types for File System Access API yet
      const directoryHandle = await window.showDirectoryPicker();
      
      // Only now start the export UI and async operations
      setIsExportingFullGraph(true);
      setFullGraphExportLogs([
        '[INFO] Starting full graph export...',
        `[INFO] Selected folder: ${directoryHandle.name}`,
        '[INFO] Exporting nodes and relationships with optimized query...'
      ]);
      setFullGraphExportError(null);
      setShowFullGraphExportModal(true);

      // Get the data from Neo4j using optimized single transaction
      console.log('[EXPORT] Starting Neo4j data fetch...');
      const startTime = Date.now();
      const result = await exportFullGraphOptimized();
      const fetchTime = Date.now() - startTime;
      console.log(`[EXPORT] Neo4j data fetch completed in ${fetchTime}ms`);

      if (!result.success || !result.data) {
        throw new Error(`Failed to export data: ${result.message}`);
      }

      const { nodes, relationships } = result.data;

      setFullGraphExportLogs(prev => [
        ...prev, 
        `[INFO] Retrieved ${nodes.length} nodes and ${relationships.length} relationships in ${fetchTime}ms`
      ]);

      // Create directory structure
      console.log('[EXPORT] Creating directory structure...');
      setFullGraphExportLogs(prev => [...prev, '[INFO] Creating directory structure...']);
      
      const nodesDir = await directoryHandle.getDirectoryHandle('nodes', { create: true });
      const relationshipsDir = await directoryHandle.getDirectoryHandle('relationships', { create: true });
      const metadataDir = await directoryHandle.getDirectoryHandle('metadata', { create: true });

      // Export nodes by label with optimized batching
      const nodesByLabel: Record<string, number> = {};
      const nodesByLabelGroups: Record<string, any[]> = {};
      
      console.log(`[EXPORT] Starting to group ${nodes.length} nodes by label...`);
      setFullGraphExportLogs(prev => [...prev, '[INFO] Grouping nodes for optimized writing...']);
      
      // Group nodes by label first
      for (const node of nodes) {
        const primaryLabel = sanitizeFileName(node.labels[0] || 'UNKNOWN');
        nodesByLabel[primaryLabel] = (nodesByLabel[primaryLabel] || 0) + 1;
        if (!nodesByLabelGroups[primaryLabel]) {
          nodesByLabelGroups[primaryLabel] = [];
        }
        nodesByLabelGroups[primaryLabel].push(node);
      }
      
      console.log(`[EXPORT] Grouped into ${Object.keys(nodesByLabel).length} label groups. Starting parallel file writing...`);
      setFullGraphExportLogs(prev => [...prev, `[INFO] Writing ${Object.keys(nodesByLabel).length} node label groups in parallel...`]);
      
      const writeStartTime = Date.now();
      
      // Write each label group in parallel
      const labelWritePromises = Object.entries(nodesByLabelGroups).map(async ([labelName, labelNodes], index) => {
        try {
          console.log(`[EXPORT] Processing label group ${index + 1}/${Object.keys(nodesByLabelGroups).length}: ${labelName} (${labelNodes.length} nodes)`);
          const labelDir = await nodesDir.getDirectoryHandle(labelName, { create: true });
          
          // Write nodes in batches of 20 for this label
          const batchSize = 20;
          for (let i = 0; i < labelNodes.length; i += batchSize) {
            const batch = labelNodes.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (node) => {
              const safeUuid = sanitizeFileName(node.uuid);
              const filename = `${labelName}_${safeUuid}.json`;
              
              const nodeData = {
                uuid: node.uuid,
                labels: node.labels.sort(),
                properties: Object.keys(node.properties)
                  .sort()
                  .reduce((sorted: Record<string, any>, key) => {
                    sorted[key] = node.properties[key];
                    return sorted;
                  }, {})
              };
              
              const fileHandle = await labelDir.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(JSON.stringify(nodeData, null, 2));
              await writable.close();
            });
            
            await Promise.all(batchPromises);
          }
          console.log(`[EXPORT] Completed label group: ${labelName}`);
        } catch (labelError) {
          console.error(`[EXPORT] Error writing label ${labelName}:`, labelError);
          setFullGraphExportLogs(prev => [...prev, `[WARN] Failed to write some files in label ${labelName}: ${labelError instanceof Error ? labelError.message : 'Unknown error'}`]);
        }
      });
      
      await Promise.all(labelWritePromises);
      
      const writeTime = Date.now() - writeStartTime;
      console.log(`[EXPORT] All node files written in ${writeTime}ms. Starting relationships export...`);
      setFullGraphExportLogs(prev => [...prev, `[SUCCESS] Exported ${nodes.length} nodes across ${Object.keys(nodesByLabel).length} labels in ${writeTime}ms`]);

      // Export relationships
      setFullGraphExportLogs(prev => [...prev, '[INFO] Writing relationships file...']);
      
      const relationshipsData = relationships.map((rel: any) => ({
        endNodeUuid: rel.endNodeUuid,
        properties: Object.keys(rel.properties)
          .sort()
          .reduce((sorted: Record<string, any>, key) => {
            sorted[key] = rel.properties[key];
            return sorted;
          }, {}),
        startNodeUuid: rel.startNodeUuid,
        type: rel.type
      }));

      const relationshipsFileHandle = await relationshipsDir.getFileHandle('relationships.json', { create: true });
      const relationshipsWritable = await relationshipsFileHandle.createWritable();
      await relationshipsWritable.write(JSON.stringify(relationshipsData, null, 2));
      await relationshipsWritable.close();

      console.log(`[EXPORT] Relationships file written (${relationships.length} relationships)`);
      setFullGraphExportLogs(prev => [...prev, `[SUCCESS] Exported ${relationships.length} relationships`]);

      // Create export metadata
      console.log('[EXPORT] Writing metadata file...');
      setFullGraphExportLogs(prev => [...prev, '[INFO] Writing metadata...']);
      
      const metadata = {
        exportDate: new Date().toISOString(),
        exportSummary: {
          nodesExported: nodes.length,
          relationshipsExported: relationships.length,
          nodesByLabel
        },
        performance: {
          dataFetchTime: fetchTime,
          fileWriteTime: writeTime,
          totalExportTime: Date.now() - startTime + fetchTime
        }
      };

      const metadataFileHandle = await metadataDir.getFileHandle('export-info.json', { create: true });
      const metadataWritable = await metadataFileHandle.createWritable();
      await metadataWritable.write(JSON.stringify(metadata, null, 2));
      await metadataWritable.close();

      const totalTime = Date.now() - startTime;
      console.log(`[EXPORT] Export completed successfully! Total time: ${totalTime}ms (Neo4j: ${fetchTime}ms, Files: ${writeTime}ms)`);
      setFullGraphExportLogs(prev => [...prev, '[SUCCESS] Export completed successfully!']);
      
      // Show success message
      setTimeout(() => {
        Modal.success({
          title: 'Optimized Graph Export Completed',
          content: (
            <div>
              <p>Successfully exported the full graph as Graph-as-Code!</p>
              <p><strong>Location:</strong> {directoryHandle.name}</p>
              <div>
                <p><strong>Nodes:</strong> {nodes.length}</p>
                <p><strong>Relationships:</strong> {relationships.length}</p>
                <p><strong>Node Types:</strong> {Object.keys(nodesByLabel).join(', ')}</p>
                <p><strong>Performance:</strong> Data fetched in {fetchTime}ms, files written in {writeTime}ms</p>
                <p><small>Files organized by label for Git-friendly diffs using optimized parallel operations</small></p>
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
      
      // If File System Access API is not supported, offer alternative
      if (errorMessage.includes('File System Access API')) {
        setFullGraphExportLogs(prev => [
          ...prev,
          '[INFO] Alternative: You can still export data as JSON and manually save files',
          '[INFO] Consider using Chrome or Edge browser for folder selection feature'
        ]);
      }
      
      // If user activation error, provide helpful message
      if (errorMessage.includes('User activation')) {
        setFullGraphExportLogs(prev => [
          ...prev,
          '[INFO] The browser requires a fresh user interaction to access the file system.',
          '[INFO] Please try clicking the export button again.'
        ]);
      }
    } finally {
      setIsExportingFullGraph(false);
    }
  };

  const handleFullGraphImport = async () => {
    if (selectedImportFiles.length === 0) {
      setFullGraphImportError('Please select graph data files to import');
      return;
    }

    setIsImportingFullGraph(true);
    setFullGraphImportLogs(['[INFO] Starting full graph import...']);
    setFullGraphImportError(null);
    setShowFullGraphImportModal(true);

    try {
      setFullGraphImportLogs(prev => [...prev, `[INFO] Processing ${selectedImportFiles.length} files...`]);
      
      // Validate file structure
      const hasRelationships = selectedImportFiles.some(file => file.name === 'relationships.json');
      const nodeFiles = selectedImportFiles.filter(file => 
        file.webkitRelativePath?.includes('/nodes/') && file.name.endsWith('.json')
      );
      
      if (!hasRelationships) {
        throw new Error('relationships.json file is required for import');
      }
      
      if (nodeFiles.length === 0) {
        throw new Error('No node files found. Please ensure node files are in a "nodes" directory structure');
      }
      
      setFullGraphImportLogs(prev => [...prev, `[INFO] Found ${nodeFiles.length} node files and relationships.json`]);
      setFullGraphImportLogs(prev => [...prev, '[WARNING] This operation will COMPLETELY WIPE the current database!']);
      
      // Parse files directly
      setFullGraphImportLogs(prev => [...prev, '[INFO] Parsing node files...']);
      
      const nodesData: any[] = [];
      let relationshipsData: any[] = [];
      
      // Parse all files
      for (const file of selectedImportFiles) {
        const content = await file.text();
        const data = JSON.parse(content);
        
        if (file.name === 'relationships.json') {
          // This is the relationships file
          if (Array.isArray(data)) {
            // Map the exported format to the import format
            relationshipsData = data.map((rel: any) => ({
              type: rel.type,
              properties: rel.properties,
              start: rel.startNodeUuid, // Map startNodeUuid to start
              end: rel.endNodeUuid      // Map endNodeUuid to end
            }));
            setFullGraphImportLogs(prev => [...prev, `[INFO] Found ${data.length} relationships in ${file.name}`]);
          } else {
            throw new Error(`${file.name} does not contain an array of relationships`);
          }
        } else if (file.name.endsWith('.json')) {
          // This should be a node file
          if (data.labels && data.properties) {
            // Check if uuid is in the data, if not try to extract from filename
            let uuid = data.uuid;
            
            if (!uuid) {
              // Try to extract UUID from filename
              // Expected format: "LABEL_uuid-here.json" or similar
              const filenameWithoutExt = file.name.replace('.json', '');
              const parts = filenameWithoutExt.split('_');
              
              if (parts.length >= 2) {
                // Take everything after the first underscore as the UUID
                uuid = parts.slice(1).join('_');
              }
              
              if (!uuid) {
                setFullGraphImportLogs(prev => [...prev, `[WARN] ${file.name} has no uuid in data and couldn't extract from filename, skipping...`]);
                continue;
              }
            }
            
            nodesData.push({
              uuid: uuid,
              labels: data.labels,
              properties: data.properties
            });
          } else {
            setFullGraphImportLogs(prev => [...prev, `[WARN] ${file.name} does not have expected node structure (missing labels or properties), skipping...`]);
          }
        }
      }
      
      setFullGraphImportLogs(prev => [...prev, `[INFO] Successfully parsed ${nodesData.length} nodes and ${relationshipsData.length} relationships`]);
      setFullGraphImportLogs(prev => [...prev, '[INFO] Starting database import operation...']);
      
      const startTime = Date.now();
      
      // Call the import function directly
      const result = await importFullGraph(nodesData, relationshipsData);
      
      const duration = Date.now() - startTime;
      
      if (!result.success) {
        throw new Error(result.message || 'Import failed');
      }
      
      setFullGraphImportLogs(prev => [
        ...prev,
        `[SUCCESS] Import completed successfully in ${duration}ms!`,
        `[INFO] Nodes created: ${result.stats?.nodesCreated || 'N/A'}`,
        `[INFO] Relationships created: ${result.stats?.relationshipsCreated || 'N/A'}`,
        `[INFO] Constraints created: ${result.stats?.constraintsCreated || 'N/A'}`,
        `[INFO] Database performance: ${result.stats?.duration || 'N/A'}ms`,
      ]);
      
      // Clear selected files after successful import
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
      setFullGraphImportError(`Import failed: ${errorMessage}`);
      setFullGraphImportLogs(prev => [...prev, `[ERROR] ${errorMessage}`]);
    } finally {
      setIsImportingFullGraph(false);
    }
  };

  const handleImportFileSelect = (fileList: File[]) => {
    setSelectedImportFiles(fileList);
    setFullGraphImportError(null);
    setFullGraphImportLogs([]);
    
    // Validate file structure
    const hasRelationships = fileList.some(file => file.name === 'relationships.json');
    const nodeFiles = fileList.filter(file => 
      file.webkitRelativePath?.includes('/nodes/') && file.name.endsWith('.json')
    );
    
    if (fileList.length > 0) {
      if (!hasRelationships) {
        setFullGraphImportError('Missing relationships.json file. Please select the complete graph export folder.');
      } else if (nodeFiles.length === 0) {
        setFullGraphImportError('No node files found in nodes/ directory. Please select the complete graph export folder.');
      } else {
        setFullGraphImportLogs([
          `[INFO] Selected ${fileList.length} files for import`,
          `[INFO] Found ${nodeFiles.length} node files and relationships.json`,
          '[READY] Click "Import Complete Graph" to proceed with wipe-and-load operation'
        ]);
      }
    }
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
          setImportedData(parsedData);
          setImportedFileName(file.name);
        } else {
          setImportError('Invalid JSON structure for safety data.');
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

        <Card title="Full Graph Export (Graph-as-Code)">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Button 
                type="primary" 
                icon={<ExportOutlined />} 
                onClick={handleFullGraphExport} 
                loading={isExportingFullGraph}
              >
                Export Complete Graph to Files
              </Button>
            </div>
            <Paragraph style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              Exports the entire Neo4j graph as individual files organized by node labels and relationship types. 
              You can select a folder to save the files directly (modern browsers) or download them individually.
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
                onChange={(info) => handleImportFileSelect(info.fileList.map(f => f.originFileObj!).filter(Boolean))}
                showUploadList={false}
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
              Select the folder that contains the "nodes/" directory and "relationships.json" file from a previous export.
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
        title="Full Graph Export Progress"
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
