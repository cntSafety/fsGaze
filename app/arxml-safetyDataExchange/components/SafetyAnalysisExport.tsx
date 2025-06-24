'use client';

import React from 'react';
import { Button } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

interface SafetyAnalysisExportProps {
  style?: React.CSSProperties;
}

const SafetyAnalysisExport: React.FC<SafetyAnalysisExportProps> = ({ style }) => {
  const router = useRouter();

  const handleNavigateToExport = (): void => {
    router.push('/arxml-safetyDataExchange/safety-analysis-export');
  };

  return (
    <div style={style}>
      <Button
        type="primary"
        icon={<ExportOutlined />}
        onClick={handleNavigateToExport}
      >
        Export Safety Analysis
      </Button>
    </div>
  );
};

export default SafetyAnalysisExport;
