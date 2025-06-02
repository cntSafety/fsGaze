'use client';

import React, { useEffect } from 'react';
import ArxmlViewer from './components/ArxmlViewer';
import { useLoading } from '../components/LoadingProvider';

const ArxmlViewerPage: React.FC = () => {
  const { hideLoading } = useLoading();

  useEffect(() => {
    // Hide loading once component is mounted
    hideLoading();
  }, [hideLoading]);

  return (
    <div>
      <ArxmlViewer />
    </div>
  );
};

export default ArxmlViewerPage;
