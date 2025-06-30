'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Space, Typography, Spin, Alert, Card, Upload, Input, Modal, Tabs, Popover } from 'antd';
import { UploadOutlined, DatabaseOutlined, DownloadOutlined, ExportOutlined, LinkOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import { importFullGraph } from '@/app/services/neo4j/queries/general';
import StatusDB, { StatusDBRef } from '@/app/components/statusDB';
import SafetyAnalysisExport from './SafetyAnalysisExport';

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
  occuranceSourceoriginalXmlTag?: string;
  occuranceSourceLabels?: string[];
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

interface SafetyTaskLink {
  nodeUuid: string;
  nodeName: string;
  safetyTaskUuid: string;
  safetyTaskName: string;
}

interface SafetyReqLink {
  nodeUuid: string;
  nodeName: string;
  safetyReqUuid: string;
  safetyReqName: string;
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
  safetyTasks?: SafetyGraphNode[];
  safetyReqs?: SafetyGraphNode[];
  safetyNotes?: SafetyGraphNode[];
  occurrences: OccurrenceLink[];
  causationLinks: CausationLinkInfo[];
  riskRatingLinks: RiskRatingLink[];
  safetyTaskLinks?: SafetyTaskLink[];
  safetyReqLinks?: SafetyReqLink[];
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

  // State for pre-parsed import data
  const [parsedNodes, setParsedNodes] = useState<any[]>([]);
  const [parsedRelationships, setParsedRelationships] = useState<any[]>([]);

  // Ref to trigger refresh of StatusDB component after import
  const statusDBRef = useRef<StatusDBRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importLogTextAreaRef = useRef<any>(null);

  useEffect(() => {
    if (importLogTextAreaRef.current) {
      // The actual textarea element is nested within Ant Design's component structure
      const textArea = importLogTextAreaRef.current.resizableTextArea?.textArea;
      if (textArea) {
        textArea.scrollTop = textArea.scrollHeight;
      }
    }
  }, [fullGraphImportLogs]);

  const unzipHelpContent = (
    <div>
      <Paragraph style={{ margin: 0, fontSize: '14px' }}>
        <strong>Win PowerShell:</strong>
        <Typography.Paragraph code copyable>
          {'Expand-Archive -Path "myPath\\graph-export.zip" -DestinationPath "myPath\\extracted-graph"'}
        </Typography.Paragraph>
      </Paragraph>
      <Paragraph style={{ margin: 0, fontSize: '14px' }}>
        <strong>Linux:</strong>
        <Typography.Paragraph code copyable>
          {'unzip path/to/graph-export.zip -d path/to/extracted-graph'}
        </Typography.Paragraph>
      </Paragraph>
    </div>
  );


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

  // Utility function for File System Access API downloads
  const saveFileWithFileSystemAPI = async (content: Blob | string, suggestedName: string, mimeType: string, description: string) => {
    try {
      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [
              {
                description,
                accept: {
                  [mimeType]: [suggestedName.substring(suggestedName.lastIndexOf('.'))],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();
          
          console.log(`File saved successfully: ${suggestedName}`);
          return true;
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('Error saving file:', err);
            // Fallback to traditional download
            fallbackDownload(content, suggestedName, mimeType);
          }
          return false;
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        fallbackDownload(content, suggestedName, mimeType);
        return true;
      }
    } catch (error) {
      console.error('Error in saveFileWithFileSystemAPI:', error);
      fallbackDownload(content, suggestedName, mimeType);
      return false;
    }
  };

  const fallbackDownload = (content: Blob | string, filename: string, mimeType: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = async () => {
    if (!safetyData) return;
    const jsonString = JSON.stringify(safetyData, null, 2);
    await saveFileWithFileSystemAPI(
      jsonString,
      'safety_analysis_export.json',
      'application/json',
      'JSON files'
    );
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

      // Generate filename with current date
      const date = new Date().toISOString().split('T')[0];
      const filename = `graph-export-${date}.zip`;
      
      // Use File System Access API for download
      const saved = await saveFileWithFileSystemAPI(
        blob,
        filename,
        'application/zip',
        'ZIP files'
      );
      
      const downloadTime = Date.now() - startTime;
      console.log(`[EXPORT] Download completed in ${downloadTime}ms`);
      setFullGraphExportLogs(prev => [
        ...prev, 
        `[SUCCESS] ZIP file ${saved ? 'saved' : 'downloaded'} successfully!`,
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

  // Helper function to transform Neo4j Integer-like objects back to numbers
  const transformProperties = (properties: Record<string, any>): Record<string, any> => {
    if (!properties) return properties;
    const newProps: Record<string, any> = {};
    for (const key in properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        const value = properties[key];
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          'low' in value &&
          'high' in value &&
          typeof value.low === 'number' &&
          typeof value.high === 'number'
        ) {
          // This looks like a Neo4j Integer object that was JSON.stringified.
          // Reconstruct it as a number. Note: This might lose precision for very large numbers,
          // but it's often sufficient and solves the import error.
          // A more robust solution for 64-bit integers would require a BigInt library.
          newProps[key] = value.high * Math.pow(2, 32) + value.low;
        } else if (typeof value === 'object' && value !== null) {
          // Recursively transform nested objects (though Neo4j properties are typically flat)
          newProps[key] = transformProperties(value);
        } else {
          newProps[key] = value;
        }
      }
    }
    return newProps;
  };

  const handleFullGraphImport = async () => {
    console.log('[DEBUG] handleFullGraphImport called');
    
    if (parsedNodes.length === 0 || parsedRelationships.length === 0) {
      setFullGraphImportError('No parsed graph data available. Please select a folder first.');
      return;
    }

    setIsImportingFullGraph(true);
    // Keep existing logs, just add new ones
    setFullGraphImportLogs(prev => [
      ...prev, 
      '[INFO] Starting database import operation...',
      '[WARNING] This operation will COMPLETELY WIPE the current database!'
    ]);
    setFullGraphImportError(null);
    setShowFullGraphImportModal(true);

    try {
      console.log('[DEBUG] About to call importFullGraph with pre-parsed data...');
      const startTime = Date.now();
      
      // Define the progress callback
      const onProgress = (message: string) => {
        setFullGraphImportLogs(prev => [...prev, message]);
      };
      
      // Call the import function directly with the pre-parsed data and the callback
      const result = await importFullGraph(parsedNodes, parsedRelationships, onProgress);
      
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
        `[SUCCESS] Client-side operation completed in ${duration}ms!`,
        `[INFO] Nodes created: ${result.stats?.nodesCreated || 'N/A'}`,
        `[INFO] Relationships created: ${result.stats?.relationshipsCreated || 'N/A'}`,
        `[INFO] Constraints created: ${result.stats?.constraintsCreated || 'N/A'}`,
        `[INFO] Database performance: ${result.stats?.duration || 'N/A'}ms`,
      ]);
      
      // Clear selected files and parsed data after successful import
      console.log('[DEBUG] Clearing selected files and refreshing status...');
      setSelectedImportFiles([]);
      setParsedNodes([]);
      setParsedRelationships([]);
      
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

  const handleImportFileSelect = async (fileList: any[]) => {
    console.log('[DEBUG] handleImportFileSelect called with fileList.length:', fileList.length);
    const startTime = Date.now();
  
    // The modal is already visible, now we process the files
    const files = fileList.map(f => f.originFileObj!).filter(Boolean);
    console.log('[DEBUG] Filtered files count:', files.length);
    
    setSelectedImportFiles(files);
    setParsedNodes([]);
    setParsedRelationships([]);
    setFullGraphImportError(null);
    setFullGraphImportLogs([`[INFO] Analyzing and parsing ${files.length} selected files...`]);
  
    if (files.length === 0) {
      console.log('[DEBUG] No files selected');
      setFullGraphImportLogs([]);
      setIsImportingFullGraph(false);
      return;
    }
  
    // Asynchronous validation and parsing in batches to prevent UI freeze
    console.log('[DEBUG] Starting async batched file parsing...');
    
    let hasRelationships = false;
    const allParsedNodes: any[] = [];
    let tempRelationships: any[] = [];
    const batchSize = 100; // Smaller batch size for parsing
  
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const promises = batch.map(async (file) => {
        try {
          const content = await file.text();
          const data = JSON.parse(content);

          if (file.name === 'relationships.json' && Array.isArray(data)) {
            hasRelationships = true;
            // This can be assigned directly as there should only be one such file.
            tempRelationships = data.map((rel: any) => ({
              type: rel.type,
              properties: transformProperties(rel.properties),
              start: rel.startNodeUuid,
              end: rel.endNodeUuid
            }));
            return null; // Return null for non-node files
          } else {
            const normalizedPath = file.webkitRelativePath?.replace(/\\/g, '/');
            if (normalizedPath?.includes('nodes/') && data.labels && data.properties) {
              let uuid = data.uuid;
              if (!uuid) {
                const filenameWithoutExt = file.name.replace('.json', '');
                const parts = filenameWithoutExt.split('_');
                if (parts.length >= 2) uuid = parts.slice(1).join('_');
              }
              if (uuid) {
                // Return the parsed node object
                return { uuid, labels: data.labels, properties: transformProperties(data.properties) };
              }
            }
          }
        } catch (e) {
          console.warn(`[WARN] Could not parse file ${file.name}, skipping.`, e);
        }
        return null; // Return null on error or if not a node file
      });

      const parsedBatchResults = await Promise.all(promises);
      const newNodes = parsedBatchResults.filter(Boolean); // Filter out nulls
      allParsedNodes.push(...newNodes);
  
      // Update progress and yield to the main thread
      const processedCount = Math.min(i + batchSize, files.length);
      const progressMessage = `[INFO] Parsed ${processedCount} / ${files.length} files...`;
      setFullGraphImportLogs(prev => {
        const newLogs = [...prev];
        if (newLogs.length > 1 && newLogs[newLogs.length - 1].startsWith('[INFO] Parsed')) {
          newLogs[newLogs.length - 1] = progressMessage; // Update last line
        } else {
          newLogs.push(progressMessage); // Add new line
        }
        return newLogs;
      });
      
      // Yield to the event loop to allow UI updates
      await new Promise(resolve => setTimeout(resolve, 0)); 
    }
    
    setParsedNodes(allParsedNodes);
    setParsedRelationships(tempRelationships);
    const validationTime = Date.now() - startTime;
    
    if (!hasRelationships) {
      console.log('[DEBUG] Missing relationships.json');
      setFullGraphImportError('Missing relationships.json file. Please select the complete graph export folder.');
      setFullGraphImportLogs(prev => [...prev, '[ERROR] Missing relationships.json file.']);
    } else if (allParsedNodes.length === 0) {
      console.log('[DEBUG] No node files found');
      setFullGraphImportError('No node files found in nodes/ directory. Please select the complete graph export folder.');
      setFullGraphImportLogs(prev => [...prev, '[ERROR] No node files found in nodes/ directory.']);
    } else {
      console.log('[DEBUG] Validation successful');
      setFullGraphImportError(null); // Clear previous errors
      setFullGraphImportLogs([
        `[INFO] Parsed ${files.length} files for import.`,
        `[INFO] Found ${allParsedNodes.length} nodes and ${tempRelationships.length} relationships.`,
        `[INFO] File parsing completed in ${validationTime}ms.`,
        '[READY] Click "Import Complete Graph" to proceed with wipe-and-load operation.'
      ]);
    }
    
    // Stop the spinner after validation is complete
    setIsImportingFullGraph(false);
    console.log(`[DEBUG] handleImportFileSelect completed in ${Date.now() - startTime}ms`);
  };

  const handleFolderSelect = async () => {
    // Modern async directory picker for Chrome/Edge
    if ('showDirectoryPicker' in window) {
      try {
        const directoryHandle = await (window as any).showDirectoryPicker();
        setShowFullGraphImportModal(true);
        setIsImportingFullGraph(true);
        setFullGraphImportLogs(['[INFO] Scanning and parsing directory for .json files...']);
        const startTime = Date.now();

        const allFiles: File[] = [];
        const tempNodes: any[] = [];
        let tempRelationships: any[] = [];
        let hasRelationships = false;

        const processDirectory = async (dirHandle: any, path: string = '') => {
          for await (const entry of dirHandle.values()) {
            const newPath = path ? `${path}/${entry.name}` : entry.name;
            if (entry.kind === 'file' && entry.name.endsWith('.json')) {
              const file = await entry.getFile();
              Object.defineProperty(file, 'webkitRelativePath', { value: newPath, configurable: true });
              allFiles.push(file);

              try {
                const content = await file.text();
                const data = JSON.parse(content);

                if (file.name === 'relationships.json' && Array.isArray(data)) {
                  hasRelationships = true;
                  tempRelationships = data.map((rel: any) => ({
                    type: rel.type,
                    properties: transformProperties(rel.properties),
                    start: rel.startNodeUuid,
                    end: rel.endNodeUuid
                  }));
                } else {
                  // Normalize path for robust checking
                  const normalizedPath = newPath.replace(/\\/g, '/');
                  if (normalizedPath.includes('nodes/') && data.labels && data.properties) {
                    let uuid = data.uuid;
                    if (!uuid) {
                      const filenameWithoutExt = file.name.replace('.json', '');
                      const parts = filenameWithoutExt.split('_');
                      if (parts.length >= 2) uuid = parts.slice(1).join('_');
                    }
                    if (uuid) {
                      tempNodes.push({ uuid, labels: data.labels, properties: transformProperties(data.properties) });
                    }
                  }
                }
              } catch (e) {
                console.warn(`[WARN] Could not parse file ${file.name}, skipping.`, e);
              }

              if (allFiles.length % 100 === 0) {
                const progressMessage = `[INFO] Parsed ${allFiles.length} files... Found ${tempNodes.length} nodes.`;
                setFullGraphImportLogs(prev => {
                  const newLogs = [...prev];
                  if (newLogs.length > 0 && newLogs[newLogs.length - 1].startsWith('[INFO] Parsed')) {
                    newLogs[newLogs.length - 1] = progressMessage; // Update last line
                  } else {
                    newLogs.push(progressMessage); // Add new line
                  }
                  return newLogs;
                });
                await new Promise(r => setTimeout(r, 0));
              }
            } else if (entry.kind === 'directory') {
              await processDirectory(entry, newPath);
            }
          }
        };

        await processDirectory(directoryHandle);
        const analysisTime = Date.now() - startTime;
        setSelectedImportFiles(allFiles);
        setParsedNodes(tempNodes);
        setParsedRelationships(tempRelationships);

        if (!hasRelationships) {
          setFullGraphImportError('Missing relationships.json file.');
          setFullGraphImportLogs(prev => [...prev, '[ERROR] Missing relationships.json file.']);
        } else if (tempNodes.length === 0) {
          setFullGraphImportError('No node files found in nodes/ directory.');
          setFullGraphImportLogs(prev => [...prev, '[ERROR] No node files found in nodes/ directory.']);
        } else {
          setFullGraphImportError(null);
          setFullGraphImportLogs([
            `[INFO] Parsed ${allFiles.length} files for import.`,
            `[INFO] Found ${tempNodes.length} nodes and ${tempRelationships.length} relationships.`,
            `[INFO] File parsing completed in ${analysisTime}ms.`,
            '[READY] Click "Import Complete Graph" to proceed.'
          ]);
        }
        setIsImportingFullGraph(false);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error selecting directory:', err);
          setFullGraphImportError('Could not read the selected directory.');
        } else {
          setShowFullGraphImportModal(false);
        }
        setIsImportingFullGraph(false);
      }
    } else {
      // Fallback for other browsers
      fileInputRef.current?.click();
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
          // Allow newer fields to be optional for backward compatibility
          if (!parsedData.riskRatings) {
            parsedData.riskRatings = [];
          }
          if (!parsedData.riskRatingLinks) {
            parsedData.riskRatingLinks = [];
          }
          if (!parsedData.safetyTasks) {
            parsedData.safetyTasks = [];
          }
          if (!parsedData.safetyTaskLinks) {
            parsedData.safetyTaskLinks = [];
          }
          if (!parsedData.safetyReqs) {
            parsedData.safetyReqs = [];
          }
          if (!parsedData.safetyReqLinks) {
            parsedData.safetyReqLinks = [];
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
      <Input.TextArea
        readOnly
        rows={10}
        value={JSON.stringify(data, null, 2)}
      />
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

  const tabItems = [
    {
      key: 'graph-as-code',
      label: 'Graph-as-Code',
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
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
                <Button icon={<UploadOutlined />} disabled={isImportingFullGraph} onClick={handleFolderSelect}>
                  {selectedImportFiles.length > 0 
                    ? `Selected ${selectedImportFiles.length} files` 
                    : "Select Graph Export Folder (unzip archive first)"}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  // @ts-expect-error -- webkitdirectory is a non-standard attribute for folder selection fallback
                  webkitdirectory="true"
                  multiple
                  onChange={(e) => {
                    if (!e.target.files || e.target.files.length === 0) return;
                    console.log('[DEBUG] Legacy input onChange triggered');
                    setShowFullGraphImportModal(true);
                    setIsImportingFullGraph(true);
                    setFullGraphImportLogs(['[INFO] Preparing file list... This may take a moment for large folders.']);
                    
                    const antdFileList = Array.from(e.target.files).map(file => ({ originFileObj: file }));

                    setTimeout(() => {
                      handleImportFileSelect(antdFileList);
                    }, 100);
                  }}
                />
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
                <Paragraph style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                <strong>Note:</strong> To extract the ZIP file, you can use the commands shown here.
                <Popover content={unzipHelpContent} title="Extraction Commands" trigger="hover">
                  <InfoCircleOutlined style={{ marginLeft: 8, color: '#1677ff', cursor: 'pointer' }} />
                </Popover>
                </Paragraph>
              {fullGraphImportError && (
                <Alert message={fullGraphImportError} type="error" showIcon style={{ marginTop: 8 }} />
              )}
            </Space>
          </Card>
        </Space>
      ),
    },
    {
      key: 'safety-csv',
      label: 'Safety CSV',
      children: (
        <Card title="Export Safety Analysis to CSV">
          <Space direction="vertical" style={{ width: '100%' }}>
            <SafetyAnalysisExport />
            <Paragraph style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              Exports safety analysis data for all SW components to a CSV file. 
              This includes component safety notes, failure modes, risk ratings, and associated tasks.
            </Paragraph>
          </Space>
        </Card>
      ),
    },
    {
      key: 'safety-json',
      label: 'Safety JSON',
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
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
              {importedData && (
                <Button
                  type="primary"
                  onClick={handleUploadToNeo4j}
                  loading={isUploading}
                  style={{ marginTop: 16, marginBottom: 16 }}
                  disabled={isProcessingFile}
                >
                  Upload to Neo4j
                </Button>
              )}
              {importedData && (
                <pre>
                  {JSON.stringify(importedData, null, 2)}
                </pre>
              )}
            </Space>
            {isUploading && (
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <Spin tip="Uploading...">
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
      ),
    },
    {
      key: 'safety-name-based',
      label: 'Safety Name Based',
      children: (
        <Card title="Name-Based Exchange">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Button 
                type="primary" 
                icon={<LinkOutlined />} 
                onClick={() => window.open('/arxml-safetyDataExchange/name-based-exchange', '_blank')}
              >
                Open Name-Based Exchange Tool
              </Button>
            </div>
            <Paragraph style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              Upload JSON files with component safety data and check component names against the database.
              This tool helps validate component mappings and identify missing components in your safety analysis.
            </Paragraph>
          </Space>
        </Card>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Export and Import the Safety Analysis</Title>
      <Paragraph>
        Export safety analysis data from Neo4j or import it from a JSON file.
      </Paragraph>

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

      <Tabs items={tabItems} defaultActiveKey="graph-as-code" />

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
              ref={importLogTextAreaRef}
              rows={12}
              readOnly
              value={fullGraphImportLogs.join('\n')}
            />
          </Card>
        )}
      </Modal>
    </div>
  );
};
export default SafetyDataExchange;
