'use client';

import React from 'react';
import { Button } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import Link from 'next/link';

interface AsilCheckLinkProps {
  style?: React.CSSProperties;
}

const AsilCheckLink: React.FC<AsilCheckLinkProps> = ({ style }) => {
  return (
    <div style={style}>
      <Link href="/arxml-safetyDataExchange/asil-check" legacyBehavior passHref>
        <a>
          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
          >
            ASIL Consistency Check
          </Button>
        </a>
      </Link>
    </div>
  );
};

export default AsilCheckLink; 