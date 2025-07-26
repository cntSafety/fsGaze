'use client';

import React from 'react';
import { Button } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import Link from 'next/link';

interface SafetyAnalysisExportLinkProps {
  style?: React.CSSProperties;
}

const SafetyAnalysisExportLink: React.FC<SafetyAnalysisExportLinkProps> = ({ style }) => {
  return (
    <div style={style}>
      <Link href="/arxml-safetyDataExchange/safety-analysis-export" legacyBehavior passHref>
        <a>
          <Button
            type="primary"
            icon={<ExportOutlined />}
          >
            View and Export Safety Analysis
          </Button>
        </a>
      </Link>
    </div>
  );
};

export default SafetyAnalysisExportLink;
