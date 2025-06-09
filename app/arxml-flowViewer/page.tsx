'use client';

import React, { useEffect } from 'react';
import ArxmlFlowViewer from './components/ArxmlFlowViewer';
import { useLoading } from '../components/LoadingProvider';

const ArxmlFlowViewerPage: React.FC = () => {
  const { hideLoading } = useLoading();

  useEffect(() => {
    // Hide loading once component is mounted
    hideLoading();
  }, [hideLoading]);

  return (
    <div>
      <ArxmlFlowViewer />
    </div>
  );
};

export default ArxmlFlowViewerPage;
