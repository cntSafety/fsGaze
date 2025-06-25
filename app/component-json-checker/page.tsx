'use client';

import React, { useState } from 'react';
import { getComponentByName } from '../services/neo4j/queries/components';

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

export default function ComponentJsonChecker() {
  const [jsonData, setJsonData] = useState<JsonFileStructure | null>(null);
  const [checkResults, setCheckResults] = useState<ComponentCheckResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
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

  const exportResults = () => {
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

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'component-check-results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Component JSON Checker</h1>
      
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
          <button
            onClick={checkComponents}
            disabled={isChecking}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {isChecking ? 'Checking Components...' : 'Check Components in Database'}
          </button>
        )}
      </div>

      {checkResults.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Check Results</h2>
            <button
              onClick={exportResults}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Export to CSV
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
