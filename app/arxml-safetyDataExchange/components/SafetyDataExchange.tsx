'use client';

import React, { useState, useCallback } from 'react';
import { Button, Space, Typography, Spin, Alert, Card, Upload, Input } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety'; // Assuming this path is correct

const { Title, Paragraph } = Typography;

// Define the structure of the data
interface SafetyGraphNode {
  uuid: string;
  properties: Record<string, any>;
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
    } catch (err: any) {
      setError(`An error occurred: ${err.message}`);
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
      } catch (err: any) {
        setImportError(`Error parsing JSON file: ${err.message}`);
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
      } else {
        setUploadError(result.message || 'Failed to upload data to Neo4j.');
        if(result.logs) {
          setUploadLogs(result.logs);
        }
      }
    } catch (err: any) {
      setUploadError(`An error occurred during upload: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const renderDataAsJson = (data: any, title: string) => (
    <Card title={title} style={{ marginTop: 16 }}>
      <pre style={{ maxHeight: 300, overflowY: 'auto', backgroundColor: '#f5f5f5', padding: 10 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </Card>
  );

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Safety Data Exchange</Title>
      <Paragraph>
        Export safety analysis data from Neo4j or import it from a JSON file.
      </Paragraph>

      <Space direction="vertical" style={{ width: '100%' }}>
        <Card title="Export Safety Analysis Data">
          <Space>
            <Button type="primary" onClick={handleExport} loading={isLoading}>
              Fetch Safety Data from Neo4j
            </Button>
            {safetyData && (
              <Button onClick={handleDownloadJson}>
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
        </Card>
      </Space>
    </div>
  );
};

export default SafetyDataExchange;
