'use client';

import React, { useState } from 'react';
import {
  Button,
  Upload,
  Card,
  Typography,
  Table,
  Space,
  Alert,
  Progress,
  Tag,
  Tooltip,
} from 'antd';
import {
  UploadOutlined,
  SyncOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  FileTextOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { getComponentByName } from '../../../services/neo4j/queries/components';
import { createFailureModeNode } from '../../../services/neo4j/queries/safety/failureModes';
import { createSafetyNote, getSafetyNotesForNode } from '../../../services/neo4j/queries/safety/safetyNotes';

const { Title, Text, Paragraph } = Typography;

interface ComponentData {
  functions: Array<{
    description: string;
    failureModes: Array<{
      mode: string;
      effect: string;
      initialRiskRating: string;
      asil: string;
      developmentMeasures: string;
      runtimeMeasures: string;
      finalRiskRating: string;
      notes: string;
    }>;
  }>;
}

interface JsonFileStructure {
  metadata: {
    exportDate: string;
    version: string;
  };
  components: Record<string, ComponentData>;
}

interface ComponentCheckResult {
  jsonName: string;
  databaseResult: {
    found: boolean;
    name?: string;
    uuid?: string;
    componentType?: string;
    arxmlPath?: string;
  };
}

interface UploadResult {
  componentName: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  details: {
    safetyNotesCreated: number;
    failureModesCreated: number;
    duplicatesSkipped: number;
  };
}

interface UploadProgress {
  current: number;
  total: number;
  message: string;
}

export default function ImportJsonSafetyAnalysis() {
  const [jsonData, setJsonData] = useState<JsonFileStructure | null>(null);
  const [checkResults, setCheckResults] = useState<ComponentCheckResult[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData: JsonFileStructure = JSON.parse(content);
        
        if (!parsedData.metadata || !parsedData.components) {
          throw new Error('Invalid JSON structure. Expected metadata and components properties.');
        }
        
        setJsonData(parsedData);
        setCheckResults([]);
        setUploadResults([]);
        setError('');
      } catch (err) {
        setError(`Error parsing JSON file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setJsonData(null);
      }
    };
    reader.readAsText(file);
    return false; // Prevent antd's default upload action
  };

  const checkComponents = async () => {
    if (!jsonData) return;

    setIsChecking(true);
    setError('');
    
    try {
      const componentNames = Object.keys(jsonData.components);
      const results: ComponentCheckResult[] = [];

      // Check each component sequentially to avoid overwhelming the database
      for (const componentName of componentNames) {
        try {
          const dbResult = await getComponentByName(componentName);
          
          if (dbResult.success && dbResult.data) {
            // Handle both single component and array of components
            const componentData = Array.isArray(dbResult.data) ? dbResult.data[0] : dbResult.data;
            
            results.push({
              jsonName: componentName,
              databaseResult: {
                found: true,
                name: componentData.name,
                uuid: componentData.uuid,
                componentType: componentData.componentType,
                arxmlPath: componentData.arxmlPath,
              },
            });
          } else {
            results.push({
              jsonName: componentName,
              databaseResult: {
                found: false,
              },
            });
          }
        } catch (error) {
          console.error(`Error checking component ${componentName}:`, error);
          results.push({
            jsonName: componentName,
            databaseResult: {
              found: false,
            },
          });
        }
      }

      setCheckResults(results);
    } catch (error) {
      setError(`Error during component checking: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsChecking(false);
    }
  };

  const checkForDuplicateSafetyNote = async (nodeUuid: string, noteContent: string): Promise<boolean> => {
    try {
      const result = await getSafetyNotesForNode(nodeUuid);
      if (result.success && result.data) {
        return result.data.some(note => note.note.trim() === noteContent.trim());
      }
      return false;
    } catch (error) {
      console.error('Error checking for duplicate safety note:', error);
      return false;
    }
  };

  const uploadSafetyData = async () => {
    if (!jsonData || checkResults.length === 0) return;

    setIsUploading(true);
    setUploadResults([]);
    setError('');

    try {
      const foundComponents = checkResults.filter(result => result.databaseResult.found);
      const totalComponents = foundComponents.length;
      const results: UploadResult[] = [];

      for (let i = 0; i < foundComponents.length; i++) {
        const component = foundComponents[i];
        const componentUuid = component.databaseResult.uuid!;
        const componentData = jsonData.components[component.jsonName];

        setUploadProgress({
          current: i + 1,
          total: totalComponents,
          message: `Processing: ${component.jsonName}`
        });

        let safetyNotesCreated = 0;
        let failureModesCreated = 0;
        let duplicatesSkipped = 0;
        const errors: string[] = [];

        try {
          if (componentData.functions && componentData.functions.length > 0) {
            for (const func of componentData.functions) {
              if (func.description && func.description.trim()) {
                const isDuplicate = await checkForDuplicateSafetyNote(componentUuid, func.description);
                if (isDuplicate) {
                  duplicatesSkipped++;
                } else {
                  const safetyNoteResult = await createSafetyNote(componentUuid, func.description);
                  if (safetyNoteResult.success) {
                    safetyNotesCreated++;
                  } else {
                    errors.push(`Failed to create safety note: ${safetyNoteResult.error || safetyNoteResult.message}`);
                  }
                }
              }

              if (func.failureModes && func.failureModes.length > 0) {
                for (const failureMode of func.failureModes) {
                  if (failureMode.mode && failureMode.effect) {
                    const failureModeResult = await createFailureModeNode(
                      componentUuid,
                      failureMode.mode,
                      failureMode.effect,
                      failureMode.asil || ''
                    );

                    if (failureModeResult.success && failureModeResult.failureUuid) {
                      failureModesCreated++;
                      if (failureMode.notes && failureMode.notes.trim()) {
                        const isDuplicate = await checkForDuplicateSafetyNote(failureModeResult.failureUuid, failureMode.notes);
                        if (isDuplicate) {
                          duplicatesSkipped++;
                        } else {
                          const failureNotesResult = await createSafetyNote(failureModeResult.failureUuid, failureMode.notes);
                          if (failureNotesResult.success) {
                            safetyNotesCreated++;
                          } else {
                            errors.push(`Failed to create failure mode safety note: ${failureNotesResult.error || failureNotesResult.message}`);
                          }
                        }
                      }
                    } else {
                      errors.push(`Failed to create failure mode "${failureMode.mode}": ${failureModeResult.error || failureModeResult.message}`);
                    }
                  }
                }
              }
            }
          }
          
          results.push({
            componentName: component.jsonName,
            status: errors.length > 0 ? 'error' : 'success',
            message: errors.length > 0 ? errors.join('; ') : 'Upload successful',
            details: {
              safetyNotesCreated,
              failureModesCreated,
              duplicatesSkipped,
            },
          });

        } catch (error) {
          results.push({
            componentName: component.jsonName,
            status: 'error',
            message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              safetyNotesCreated: 0,
              failureModesCreated: 0,
              duplicatesSkipped: 0,
            },
          });
        }
      }

      setUploadResults(results);
    } catch (error) {
      setError(`Error during safety data upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const exportResults = async (data: any[], filename: string) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const checkColumns = [
    {
      title: 'Component Name in JSON',
      dataIndex: 'jsonName',
      key: 'jsonName',
      sorter: (a: ComponentCheckResult, b: ComponentCheckResult) => a.jsonName.localeCompare(b.jsonName),
    },
    {
      title: 'Database Status',
      dataIndex: ['databaseResult', 'found'],
      key: 'found',
      render: (found: boolean) => 
        found ? <Tag icon={<CheckCircleOutlined />} color="success">Found</Tag> 
              : <Tag icon={<CloseCircleOutlined />} color="error">Not Found</Tag>,
    },
    {
      title: 'Database Name',
      dataIndex: ['databaseResult', 'name'],
      key: 'dbName',
    },
    {
      title: 'Database UUID',
      dataIndex: ['databaseResult', 'uuid'],
      key: 'uuid',
      render: (uuid?: string) => uuid ? <Text code>{uuid}</Text> : 'N/A',
    },
    {
      title: 'ARXML Path',
      dataIndex: ['databaseResult', 'arxmlPath'],
      key: 'arxmlPath',
      ellipsis: true,
      render: (path?: string) => path ? <Tooltip title={path}><Text>{path}</Text></Tooltip> : 'N/A',
    },
  ];

  const uploadColumns = [
    {
      title: 'Component Name',
      dataIndex: 'componentName',
      key: 'componentName',
      sorter: (a: UploadResult, b: UploadResult) => a.componentName.localeCompare(b.componentName),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: 'success' | 'error' | 'skipped') => {
        switch (status) {
          case 'success':
            return <Tag icon={<CheckCircleOutlined />} color="success">Success</Tag>;
          case 'error':
            return <Tag icon={<CloseCircleOutlined />} color="error">Error</Tag>;
          case 'skipped':
            return <Tag icon={<WarningOutlined />} color="warning">Skipped</Tag>;
          default:
            return <Tag>{status}</Tag>;
        }
      },
    },
    {
      title: 'Details',
      key: 'details',
      render: (_: any, record: UploadResult) => (
        <Space direction="vertical" size="small">
          <Text>Safety Notes: {record.details.safetyNotesCreated}</Text>
          <Text>Failure Modes: {record.details.failureModesCreated}</Text>
          <Text>Duplicates Skipped: {record.details.duplicatesSkipped}</Text>
          {record.status === 'error' && <Text type="danger" ellipsis={{ tooltip: record.message }}>{record.message}</Text>}
        </Space>
      ),
    },
  ];
  
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card>
        <Title level={4}>Import Safety Analysis from JSON</Title>
        <Paragraph>
          This tool allows you to import safety analysis data (such as failure modes and safety notes) from a structured JSON file and link it to existing components in the database by name.
        </Paragraph>
        <Space>
          <Upload
            accept=".json"
            beforeUpload={handleFileUpload}
            showUploadList={false}
          >
            <Button icon={<UploadOutlined />} disabled={isChecking || isUploading}>
              Select JSON File
            </Button>
          </Upload>
          <Button
            icon={<SyncOutlined />}
            onClick={checkComponents}
            disabled={!jsonData || isChecking || isUploading}
            loading={isChecking}
          >
            Check Components
          </Button>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={uploadSafetyData}
            disabled={!jsonData || isUploading || isChecking || checkResults.length === 0}
            loading={isUploading}
          >
            Upload Safety Data
          </Button>
        </Space>
        {jsonData && (
          <Alert
            message={`File loaded: Contains data for ${Object.keys(jsonData.components).length} components.`}
            type="info"
            showIcon
            style={{ marginTop: 16 }}
            icon={<FileTextOutlined />}
          />
        )}
        {error && <Alert message={error} type="error" showIcon style={{ marginTop: 16 }} />}
      </Card>

      {isUploading && uploadProgress && (
        <Card>
          <Title level={5}>Upload in Progress</Title>
          <Progress
            percent={Math.round((uploadProgress.current / uploadProgress.total) * 100)}
            status="active"
          />
          <Text style={{ marginTop: 8, display: 'block' }}>
            {uploadProgress.message} ({uploadProgress.current} / {uploadProgress.total})
          </Text>
        </Card>
      )}

      {checkResults.length > 0 && (
        <Card
          title="Component Check Results"
          extra={
            <Button
              icon={<ExportOutlined />}
              onClick={() => exportResults(checkResults, 'component-check-results.json')}
            >
              Export Results
            </Button>
          }
        >
          <Table
            columns={checkColumns}
            dataSource={checkResults}
            rowKey="jsonName"
            pagination={{ pageSize: 10 }}
            loading={isChecking}
            scroll={{ x: true }}
          />
        </Card>
      )}
      
      {uploadResults.length > 0 && (
        <Card
          title="Upload Results"
          extra={
            <Button
              icon={<ExportOutlined />}
              onClick={() => exportResults(uploadResults, 'upload-results.json')}
            >
              Export Results
            </Button>
          }
        >
          <Table
            columns={uploadColumns}
            dataSource={uploadResults}
            rowKey="componentName"
            pagination={{ pageSize: 10 }}
            loading={isUploading}
            scroll={{ x: true }}
          />
        </Card>
      )}
    </Space>
  );
}
