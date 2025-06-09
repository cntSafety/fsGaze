'use client';

import React, { useEffect } from 'react';
import SWCProtoGraph from './components/SWCProtoGraph';
import { useLoading } from '../components/LoadingProvider';

const ArxmlGraphViewerPage: React.FC = () => {
  const { hideLoading } = useLoading();

  useEffect(() => {
    // Hide loading once component is mounted
    hideLoading();
  }, [hideLoading]);

  return (
    <div>
      <SWCProtoGraph />
    </div>
  );
};

export default ArxmlGraphViewerPage;
