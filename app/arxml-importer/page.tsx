'use client';

import React, { useState } from 'react';
import ArxmlImporter from './components/ArxmlImporter';
import ArxmlTransformer from './components/ArxmlTransformer';

const ArxmlImporterPage: React.FC = () => {
  const [importedFiles, setImportedFiles] = useState<any[]>([]);

  // Collect all imported files in state
  const handleFileImported = async (fileData: any) => {
    setImportedFiles(prev => [...prev, fileData]);
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="w-full max-w-3xl">
        <ArxmlImporter onFileImported={handleFileImported} />
      </div>
    </div>
  );
};

export default ArxmlImporterPage;
