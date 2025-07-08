'use client';

import React from 'react';
import SafetyTaskList from './components/SafetyTaskList';
import { Typography, Space } from 'antd';

const { Title } = Typography;

const SafetyStatusPage: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Title level={2}>Safety Task Status Overview</Title>
        <SafetyTaskList />
      </Space>
    </div>
  );
};

export default SafetyStatusPage; 