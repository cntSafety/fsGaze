'use client';

import { useState } from 'react';
import { deleteNodeByUuid } from '../../services/neo4j/queries/general';
import { Button } from 'antd';

export default function DeleteNodeForm() {
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState<'uuid' | 'elementId'>('uuid');
  const [entityType, setEntityType] = useState<'node' | 'relationship'>('node');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!identifier.trim()) {
      setMessage({ type: 'error', text: `Please enter a valid ${identifierType}` });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await deleteNodeByUuid(identifier.trim(), identifierType, entityType);
      
      if (result.success) {
        setMessage({ type: 'success', text: result.message || `${entityType} deleted successfully` });
        setIdentifier(''); // Clear the input on success
      } else {
        setMessage({ type: 'error', text: result.message || `Failed to delete ${entityType}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setIdentifier('');
    setMessage(null);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Delete {entityType === 'node' ? 'Node' : 'Relationship'}</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="entityType" className="block text-sm font-medium text-gray-700 mb-2">
            Entity Type
          </label>
          <select
            id="entityType"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as 'node' | 'relationship')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            disabled={loading}
          >
            <option value="node">Node</option>
            <option value="relationship">Relationship</option>
          </select>
        </div>

        <div>
          <label htmlFor="identifierType" className="block text-sm font-medium text-gray-700 mb-2">
            Identifier Type
          </label>
          <select
            id="identifierType"
            value={identifierType}
            onChange={(e) => setIdentifierType(e.target.value as 'uuid' | 'elementId')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            disabled={loading}
          >
            <option value="uuid">UUID</option>
            <option value="elementId">Element ID</option>
          </select>
        </div>

        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-2">
            {entityType === 'node' ? 'Node' : 'Relationship'} {identifierType === 'uuid' ? 'UUID' : 'Element ID'}
          </label>
          <input
            type="text"
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={`Enter ${entityType} ${identifierType === 'uuid' ? 'UUID' : 'element ID'}...`}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        <div className="flex space-x-3">
          <Button 
            color="pink" 
            variant="dashed"
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={!identifier.trim()}
            className="flex-1"
          >
            {loading ? 'Deleting...' : `Delete ${entityType === 'node' ? 'Node' : 'Relationship'}`}
          </Button>
          
          <Button
            color="pink"
            variant="dashed"
            onClick={handleClear}
            disabled={loading}
          >
            Clear
          </Button>
        </div>
      </form>

      {message && (
        <div className={`mt-4 p-3 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
