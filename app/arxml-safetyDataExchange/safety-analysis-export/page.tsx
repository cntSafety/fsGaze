'use client';

import React from 'react';
import { Card, Space } from 'antd';
import SafetyAnalysisTable from './components/SafetyAnalysisTable';
import SafetyAnalysisTablePorts from './components/SafetyAnalysisTablePorts';

const SafetyAnalysisExportPage: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="Functional Safety Analysis Export" style={{ width: '100%' }}>
          <SafetyAnalysisTable />
        </Card>
        
        <Card title="Port Safety Analysis Export" style={{ width: '100%' }}>
          <SafetyAnalysisTablePorts />
        </Card>
      </Space>
    </div>
  );
};

export default SafetyAnalysisExportPage;
