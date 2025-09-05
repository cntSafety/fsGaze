'use client';

import React, { useState } from 'react';
import { Card, Typography, Upload, Button, Space, Alert, Spin, Divider, Tag, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { importSysML } from '../services/SysMLImportService';

const { Title, Text } = Typography;

interface ImportResult {
  success: boolean;
  message: string;
  error?: string | null;
  stats?: {
    nodesCreated: number;
    relationshipsCreated: number;
  };
}

const SysMLImportPage: React.FC = () => {
  const [importing, setImporting] = useState<boolean>(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve((e.target?.result || '') as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleBeforeUpload: UploadProps['beforeUpload'] = async (file) => {
    setImporting(true);
    setResult(null);
    try {
      const text = await readFileContent(file as File);
      const response = await importSysML(text, file.name);
      setResult(response);
      if (response.success) {
        message.success('SysML imported to Neo4j successfully');
      } else {
        message.error(response.message || 'Import failed');
      }
    } catch (err: any) {
      const res: ImportResult = {
        success: false,
        message: 'Import failed',
        error: err?.message || 'Unknown error',
      };
      setResult(res);
      message.error(res.error || res.message);
    } finally {
      setImporting(false);
    }
    return false; // prevent default upload
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={2}>SysML-v2 Import</Title>
        <Text type="secondary">Upload SysML textual files (.sysml). They will be parsed and ingested into Neo4j.</Text>

        <Divider />

        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Upload
            accept=".sysml"
            multiple={false}
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            disabled={importing}
          >
            <Button icon={<UploadOutlined />} loading={importing} size="large">
              {importing ? 'Importing…' : 'Import .sysml file'}
            </Button>
          </Upload>

          {importing && (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <Spin size="large" />
            </div>
          )}

          {result && (
            <Alert
              type={result.success ? 'success' : 'error'}
              message={result.message}
              showIcon
              description={
                result.success ? (
                  <Space direction="vertical" size="small">
                    <Text>
                      Created nodes: <Text strong>{result.stats?.nodesCreated ?? 0}</Text>
                    </Text>
                    <Text>
                      Created relationships: <Text strong>{result.stats?.relationshipsCreated ?? 0}</Text>
                    </Text>
                  </Space>
                ) : (
                  result.error && <Text>{result.error}</Text>
                )
              }
            />
          )}

          {result?.success && (
            <Space>
              <Tag color="blue">SysML</Tag>
              <Tag color="green">Neo4j</Tag>
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default SysMLImportPage;


