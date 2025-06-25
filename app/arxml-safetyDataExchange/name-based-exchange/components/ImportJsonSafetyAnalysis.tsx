'use client';

import React, { useState } from 'react';
import { getComponentByName } from '../../../services/neo4j/queries/components';
import { createFailureModeNode } from '../../../services/neo4j/queries/safety/failureModes';
import { createSafetyNote, getSafetyNotesForNode } from '../../../services/neo4j/queries/safety/safetyNotes';

interface ComponentData {
  functions: Array<{
    description: string;
    failureModes: Array<{
      mode: string;
      effect: string;
      initialRiskRating: string;
      asil: string;
      developmentMeasures: string;
      runtimeMeasures: string;
      finalRiskRating: string;
      notes: string;
    }>;
  }>;
}

interface JsonFileStructure {
  metadata: {
    exportDate: string;
    version: string;
  };
  components: Record<string, ComponentData>;
}

interface ComponentCheckResult {
  jsonName: string;
  databaseResult: {
    found: boolean;
    name?: string;
    uuid?: string;
    componentType?: string;
    arxmlPath?: string;
  };
}

interface UploadResult {
  componentName: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  details: {
    safetyNotesCreated: number;
    failureModesCreated: number;
    duplicatesSkipped: number;
  };
}

interface UploadProgress {
  current: number;
  total: number;
  message: string;
}

export default function ImportJsonSafetyAnalysis() {
  const [jsonData, setJsonData] = useState<JsonFileStructure | null>(null);
  const [checkResults, setCheckResults] = useState<ComponentCheckResult[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData: JsonFileStructure = JSON.parse(content);
        
        // Validate the structure
        if (!parsedData.metadata || !parsedData.components) {
          throw new Error('Invalid JSON structure. Expected metadata and components properties.');
        }
        
        setJsonData(parsedData);
        setCheckResults([]);
        setError('');
      } catch (err) {
        setError(`Error parsing JSON file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setJsonData(null);
      }
    };
    reader.readAsText(file);
  };

  const checkComponents = async () => {
    if (!jsonData) return;

    setIsChecking(true);
    setError('');
    
    try {
      const componentNames = Object.keys(jsonData.components);
      const results: ComponentCheckResult[] = [];

      // Check each component sequentially to avoid overwhelming the database
      for (const componentName of componentNames) {
        try {
          const dbResult = await getComponentByName(componentName);
          
          if (dbResult.success && dbResult.data) {
            // Handle both single component and array of components
            const componentData = Array.isArray(dbResult.data) ? dbResult.data[0] : dbResult.data;
            
            results.push({
              jsonName: componentName,
              databaseResult: {
                found: true,
                name: componentData.name,
                uuid: componentData.uuid,
                componentType: componentData.componentType,
                arxmlPath: componentData.arxmlPath,
              },
            });
          } else {
            results.push({
              jsonName: componentName,
              databaseResult: {
                found: false,
              },
            });
          }
        } catch (error) {
          console.error(`Error checking component ${componentName}:`, error);
          results.push({
            jsonName: componentName,
            databaseResult: {
              found: false,
            },
          });
        }
      }

      setCheckResults(results);
    } catch (error) {
      setError(`Error during component checking: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsChecking(false);
    }
  };

  const checkForDuplicateSafetyNote = async (nodeUuid: string, noteContent: string): Promise<boolean> => {
    try {
      const result = await getSafetyNotesForNode(nodeUuid);
      if (result.success && result.data) {
        return result.data.some(note => note.note.trim() === noteContent.trim());
      }
      return false;
    } catch (error) {
      console.error('Error checking for duplicate safety note:', error);
      return false;
    }
  };

  const uploadSafetyData = async () => {
    if (!jsonData || checkResults.length === 0) return;

    setIsUploading(true);
    setUploadResults([]);
    setError('');

    try {
      const foundComponents = checkResults.filter(result => result.databaseResult.found);
      const totalComponents = foundComponents.length;
      const results: UploadResult[] = [];

      for (let i = 0; i < foundComponents.length; i++) {
        const component = foundComponents[i];
        const componentUuid = component.databaseResult.uuid!;
        const componentData = jsonData.components[component.jsonName];

        setUploadProgress({
          current: i + 1,
          total: totalComponents,
          message: `Processing component: ${component.jsonName}`
        });

        let safetyNotesCreated = 0;
        let failureModesCreated = 0;
        let duplicatesSkipped = 0;
        const errors: string[] = [];

        try {
          // Process each function in the component
          if (componentData.functions && componentData.functions.length > 0) {
            for (const func of componentData.functions) {
              // Create safety note for component function description
              if (func.description && func.description.trim()) {
                const isDuplicate = await checkForDuplicateSafetyNote(componentUuid, func.description);
                if (isDuplicate) {
                  duplicatesSkipped++;
                  console.log(`Duplicate safety note skipped for component ${component.jsonName}: ${func.description}`);
                } else {
                  const safetyNoteResult = await createSafetyNote(componentUuid, func.description);
                  if (safetyNoteResult.success) {
                    safetyNotesCreated++;
                  } else {
                    errors.push(`Failed to create safety note: ${safetyNoteResult.error || safetyNoteResult.message}`);
                  }
                }
              }

              // Process failure modes
              if (func.failureModes && func.failureModes.length > 0) {
                for (const failureMode of func.failureModes) {
                  if (failureMode.mode && failureMode.effect) {
                    // Create failure mode node
                    const failureModeResult = await createFailureModeNode(
                      componentUuid,
                      failureMode.mode,
                      failureMode.effect,
                      failureMode.asil || ''
                    );

                    if (failureModeResult.success && failureModeResult.failureUuid) {
                      failureModesCreated++;

                      // Create safety note for failure mode if notes exist
                      if (failureMode.notes && failureMode.notes.trim()) {
                        const isDuplicate = await checkForDuplicateSafetyNote(failureModeResult.failureUuid, failureMode.notes);
                        if (isDuplicate) {
                          duplicatesSkipped++;
                          console.log(`Duplicate failure mode safety note skipped for ${failureMode.mode}: ${failureMode.notes}`);
                        } else {
                          const failureNotesResult = await createSafetyNote(failureModeResult.failureUuid, failureMode.notes);
                          if (failureNotesResult.success) {
                            safetyNotesCreated++;
                          } else {
                            errors.push(`Failed to create failure mode safety note: ${failureNotesResult.error || failureNotesResult.message}`);
                          }
                        }
                      }
                    } else {
                      errors.push(`Failed to create failure mode "${failureMode.mode}": ${failureModeResult.error || failureModeResult.message}`);
                    }
                  }
                }
              }
            }
          }

          results.push({
            componentName: component.jsonName,
            status: errors.length > 0 ? 'error' : 'success',
            message: errors.length > 0 
              ? `Completed with ${errors.length} error(s)`
              : 'Successfully processed',
            details: {
              safetyNotesCreated,
              failureModesCreated,
              duplicatesSkipped
            }
          });

          if (errors.length > 0) {
            console.error(`Errors processing ${component.jsonName}:`, errors);
          }

        } catch (error) {
          console.error(`Error processing component ${component.jsonName}:`, error);
          results.push({
            componentName: component.jsonName,
            status: 'error',
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              safetyNotesCreated,
              failureModesCreated,
              duplicatesSkipped
            }
          });
        }
      }

      setUploadResults(results);
      setUploadProgress(null);

    } catch (error) {
      setError(`Error during upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setUploadProgress(null);
    } finally {
      setIsUploading(false);
    }
  };

  const exportResults = async () => {
    try {
      const csvContent = [
        ['JSON Component Name', 'Database Found', 'Database Name', 'Database UUID', 'Component Type', 'ARXML Path'],
        ...checkResults.map(result => [
          result.jsonName,
          result.databaseResult.found ? 'Yes' : 'No',
          result.databaseResult.name || '',
          result.databaseResult.uuid || '',
          result.databaseResult.componentType || '',
          result.databaseResult.arxmlPath || '',
        ])
      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: 'component-check-results.csv',
            types: [
              {
                description: 'CSV files',
                accept: {
                  'text/csv': ['.csv'],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(csvContent);
          await writable.close();
          
          console.log('File saved successfully');
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('Error saving file:', err);
            // Fallback to traditional download
            fallbackDownload(csvContent, 'component-check-results.csv', 'text/csv');
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        fallbackDownload(csvContent, 'component-check-results.csv', 'text/csv');
      }
    } catch (error) {
      console.error('Error exporting results:', error);
      setError('Failed to export results. Please try again.');
    }
  };

  const fallbackDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportUploadResults = async () => {
    try {
      const csvContent = [
        ['Component Name', 'Status', 'Safety Notes Created', 'Failure Modes Created', 'Duplicates Skipped', 'Message'],
        ...uploadResults.map(result => [
          result.componentName,
          result.status,
          result.details.safetyNotesCreated.toString(),
          result.details.failureModesCreated.toString(),
          result.details.duplicatesSkipped.toString(),
          result.message,
        ])
      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: 'upload-results.csv',
            types: [
              {
                description: 'CSV files',
                accept: {
                  'text/csv': ['.csv'],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(csvContent);
          await writable.close();
          
          console.log('Upload results file saved successfully');
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('Error saving upload results file:', err);
            // Fallback to traditional download
            fallbackDownload(csvContent, 'upload-results.csv', 'text/csv');
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        fallbackDownload(csvContent, 'upload-results.csv', 'text/csv');
      }
    } catch (error) {
      console.error('Error exporting upload results:', error);
      setError('Failed to export upload results. Please try again.');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Name-Based Exchange Checker</h1>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload JSON File</h2>
        <div className="mb-4">
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-full file:border-0
                       file:text-sm file:font-semibold
                       file:bg-blue-50 file:text-blue-700
                       hover:file:bg-blue-100"
          />
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {jsonData && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            <p><strong>File loaded successfully!</strong></p>
            <p>Components found: {Object.keys(jsonData.components).length}</p>
            <p>Export date: {jsonData.metadata.exportDate}</p>
            <p>Version: {jsonData.metadata.version}</p>
          </div>
        )}

        {jsonData && (
          <div className="flex space-x-4">
            <button
              onClick={checkComponents}
              disabled={isChecking || isUploading}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            >
              {isChecking ? 'Checking Components...' : 'Check Components in Database'}
            </button>

            {checkResults.length > 0 && checkResults.some(r => r.databaseResult.found) && (
              <button
                onClick={uploadSafetyData}
                disabled={isUploading || isChecking}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Upload Safety Data to Database'}
              </button>
            )}
          </div>
        )}
      </div>

      {uploadProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Upload Progress</h2>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600">
            {uploadProgress.current} of {uploadProgress.total} components - {uploadProgress.message}
          </p>
        </div>
      )}

      {uploadResults.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Upload Results</h2>
            <button
              onClick={exportUploadResults}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Export Upload Results
            </button>
          </div>
          
          <div className="mb-4 grid grid-cols-4 gap-4">
            <div className="bg-blue-100 p-3 rounded">
              <p className="font-semibold">Total Processed</p>
              <p className="text-2xl">{uploadResults.length}</p>
            </div>
            <div className="bg-green-100 p-3 rounded">
              <p className="font-semibold">Successful</p>
              <p className="text-2xl">{uploadResults.filter(r => r.status === 'success').length}</p>
            </div>
            <div className="bg-red-100 p-3 rounded">
              <p className="font-semibold">Errors</p>
              <p className="text-2xl">{uploadResults.filter(r => r.status === 'error').length}</p>
            </div>
            <div className="bg-yellow-100 p-3 rounded">
              <p className="font-semibold">Total Duplicates Skipped</p>
              <p className="text-2xl">{uploadResults.reduce((sum, r) => sum + r.details.duplicatesSkipped, 0)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left">Component</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Safety Notes</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Failure Modes</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Duplicates Skipped</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Message</th>
                </tr>
              </thead>
              <tbody>
                {uploadResults.map((result, index) => (
                  <tr key={index} className={
                    result.status === 'success' ? 'bg-green-50' : 
                    result.status === 'error' ? 'bg-red-50' : 'bg-gray-50'
                  }>
                    <td className="border border-gray-300 px-4 py-2 font-medium">
                      {result.componentName}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className={`px-2 py-1 rounded text-sm ${
                        result.status === 'success' ? 'bg-green-200 text-green-800' :
                        result.status === 'error' ? 'bg-red-200 text-red-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {result.details.safetyNotesCreated}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {result.details.failureModesCreated}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      {result.details.duplicatesSkipped}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">
                      {result.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {checkResults.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Check Results</h2>
            <button
              onClick={exportResults}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Export Check Results
            </button>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-4">
            <div className="bg-blue-100 p-3 rounded">
              <p className="font-semibold">Total Components</p>
              <p className="text-2xl">{checkResults.length}</p>
            </div>
            <div className="bg-green-100 p-3 rounded">
              <p className="font-semibold">Found in Database</p>
              <p className="text-2xl">{checkResults.filter(r => r.databaseResult.found).length}</p>
            </div>
            <div className="bg-red-100 p-3 rounded">
              <p className="font-semibold">Not Found</p>
              <p className="text-2xl">{checkResults.filter(r => !r.databaseResult.found).length}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left">JSON Component Name</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Database Name</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Database UUID</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Component Type</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">ARXML Path</th>
                </tr>
              </thead>
              <tbody>
                {checkResults.map((result, index) => (
                  <tr key={index} className={result.databaseResult.found ? 'bg-green-50' : 'bg-red-50'}>
                    <td className="border border-gray-300 px-4 py-2 font-medium">
                      {result.jsonName}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className={`px-2 py-1 rounded text-sm ${
                        result.databaseResult.found 
                          ? 'bg-green-200 text-green-800' 
                          : 'bg-red-200 text-red-800'
                      }`}>
                        {result.databaseResult.found ? 'Found' : 'Not Found'}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {result.databaseResult.name || '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 font-mono text-sm">
                      {result.databaseResult.uuid || '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {result.databaseResult.componentType || '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">
                      {result.databaseResult.arxmlPath || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
