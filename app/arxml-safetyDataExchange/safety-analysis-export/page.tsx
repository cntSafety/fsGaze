'use client';

import React from 'react';
import { Card } from 'antd';
import SafetyAnalysisTable from './components/SafetyAnalysisTable';

const SafetyAnalysisExportPage: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Card title="Safety Analysis Export" style={{ width: '100%' }}>
        <SafetyAnalysisTable />
      </Card>
    </div>
  );
};

export default SafetyAnalysisExportPage;
