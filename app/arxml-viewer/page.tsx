'use client';

import React, { useEffect, useState } from 'react';
import ArxmlViewer from './components/ArxmlViewer';
import { useLoading } from '../components/LoadingProvider';
import DeleteNodeForm from '../safety/components/DeleteNodeForm';
import { Button } from 'antd';

const ArxmlViewerPage: React.FC = () => {
  const { hideLoading } = useLoading();
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Hide loading once component is mounted
    hideLoading();
    setIsLoaded(true);
  }, [hideLoading]);

  return (
    <div>
      <ArxmlViewer />

      {/* button to show the UI to delete specific nodes and all relationships */}
      {isLoaded && (
        <div className="mt-6 text-center">
          <Button
            color="pink"
            variant="dashed"
            onClick={() => setShowDeleteForm(!showDeleteForm)}
          >
            {showDeleteForm ? 'Hide Delete Form' : 'Delete One Element'}
          </Button>
        </div>
      )}

      {showDeleteForm && (
        <div className="mt-6">
          <DeleteNodeForm />
        </div>
      )}
    </div>
  );
};

export default ArxmlViewerPage;
