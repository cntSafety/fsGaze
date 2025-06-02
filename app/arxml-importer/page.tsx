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
    <div className="w-full h-full">
      <ArxmlImporter onFileImported={handleFileImported} />
    </div>
  );
};

export default ArxmlImporterPage;
