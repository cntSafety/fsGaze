'use client';

import React, { useState, useEffect } from 'react';
import { getAllSwComponentPrototypes, getComponentDependencyGraph, ComponentVisualizationResult } from '@/app/services/ArxmlToNeoService';

interface SwcPrototype {
  uuid: string;
  name: string;
  shortName: string;
  arxmlPath: string;
}

interface TreeNodeProps {
  label: string | React.ReactNode;
  children?: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  level?: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ label, children, isExpanded = false, onToggle, level = 0 }) => {
  const indent = level * 20;
  
  return (
    <div>
      <div 
        className={`flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={onToggle}
      >
        {children && (
          <span className="mr-2 text-gray-500 w-4">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        <span className="text-sm">{label}</span>
      </div>
      {isExpanded && children && (
        <div>{children}</div>
      )}
    </div>
  );
};

const SWCProtoRelations: React.FC = () => {
  const [swcPrototypes, setSwcPrototypes] = useState<SwcPrototype[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<SwcPrototype | null>(null);
  const [dependencyGraph, setDependencyGraph] = useState<ComponentVisualizationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Load all SW Component Prototypes on component mount
  useEffect(() => {
    const loadSwcPrototypes = async () => {
      try {
        setLoading(true);
        const result = await getAllSwComponentPrototypes();
        
        if (result.success && result.data) {
          setSwcPrototypes(result.data);
        } else {
          setError(result.error || 'Failed to load SW Component Prototypes');
        }
      } catch (err) {
        setError('Error loading SW Component Prototypes');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSwcPrototypes();
  }, []);

  // Handle component selection and load dependency graph
  const handleComponentSelect = async (component: SwcPrototype) => {
    setSelectedComponent(component);
    setLoadingGraph(true);
    setDependencyGraph(null);
    setGraphError(null); // Clear previous graph errors
    setExpandedNodes(new Set());
    
    try {
      const result = await getComponentDependencyGraph(component.uuid);
      
      // Console log the result for debugging
      // console.log('getComponentDependencyGraph result for component:', component.name, result);
      
      if (result.success && result.data) {
        setDependencyGraph(result.data);
        setGraphError(null);
      } else {
        setGraphError(result.error || 'Failed to load dependency graph');
        setDependencyGraph(null);
      }
    } catch (err) {
      setGraphError('Error loading dependency graph');
      setDependencyGraph(null);
      console.error('Error:', err);
    } finally {
      setLoadingGraph(false);
    }
  };

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderDependencyTree = () => {
    if (!dependencyGraph) return null;

    const { nodes, relationships, metadata } = dependencyGraph;

    // Find center component
    const centerComponentNode = nodes.find(node => 
      node.type === 'APPLICATION_SW_COMPONENT_TYPE' || 
      node.type === 'SERVICE_SW_COMPONENT_TYPE' ||
      node.id === metadata.centerComponentId
    );

    if (!centerComponentNode) {
      return (
        <div className="text-red-500 text-center py-8">
          Could not identify center component in the dependency graph
        </div>
      );
    }

    // Group nodes by type for better organization
    const nodesByType = nodes.reduce((acc, node) => {
      if (!acc[node.type]) acc[node.type] = [];
      acc[node.type].push(node);
      return acc;
    }, {} as Record<string, any[]>);

    // Group relationships by type
    const relationshipsByType = relationships.reduce((acc, rel) => {
      if (!acc[rel.type]) acc[rel.type] = [];
      acc[rel.type].push(rel);
      return acc;
    }, {} as Record<string, any[]>);

    return (
      <div className="mt-4 border rounded-lg p-4 bg-gray-50">
        <h3 className="font-semibold text-lg mb-3">
          Dependency Graph: {metadata.componentName}
        </h3>
        <div className="text-sm text-gray-600 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-medium">Total Nodes:</span> {metadata.totalNodes}
            </div>
            <div>
              <span className="font-medium">Total Relationships:</span> {metadata.totalRelationships}
            </div>
          </div>
        </div>

        <div className="bg-white rounded border">
          {/* Center Component */}
          <TreeNode
            label={`🎯 ${centerComponentNode.name} (Center Component)`}
            isExpanded={expandedNodes.has('center')}
            onToggle={() => toggleNode('center')}
          >
            <TreeNode
              label={`📋 Type: ${centerComponentNode.type}`}
              level={1}
            />
            <TreeNode
              label={`🆔 UUID: ${centerComponentNode.id}`}
              level={1}
            />
          </TreeNode>

          {/* All Nodes by Type */}
          <TreeNode
            label={`📦 All Nodes (${nodes.length})`}
            isExpanded={expandedNodes.has('all-nodes')}
            onToggle={() => toggleNode('all-nodes')}
          >
            {Object.entries(nodesByType).map(([nodeType, nodesOfType]) => (
              <TreeNode
                key={nodeType}
                label={`${nodeType} (${nodesOfType.length})`}
                isExpanded={expandedNodes.has(`nodes-${nodeType}`)}
                onToggle={() => toggleNode(`nodes-${nodeType}`)}
                level={1}
              >
                {nodesOfType.map((node, index) => (
                  <TreeNode
                    key={`${nodeType}-${node.id}-${index}`}
                    label={`${node.name} [${node.id.substring(0, 8)}...]`}
                    level={2}
                  />
                ))}
              </TreeNode>
            ))}
          </TreeNode>

          {/* All Relationships by Type */}
          <TreeNode
            label={`🔗 All Relationships (${relationships.length})`}
            isExpanded={expandedNodes.has('all-relationships')}
            onToggle={() => toggleNode('all-relationships')}
          >
            {Object.entries(relationshipsByType).map(([relType, relsOfType]) => (
              <TreeNode
                key={relType}
                label={`${relType} (${relsOfType.length})`}
                isExpanded={expandedNodes.has(`rels-${relType}`)}
                onToggle={() => toggleNode(`rels-${relType}`)}
                level={1}
              >
                {relsOfType.map((rel, index) => {
                  const sourceNode = nodes.find(n => n.id === rel.source);
                  const targetNode = nodes.find(n => n.id === rel.target);
                  return (
                    <TreeNode
                      key={`${relType}-${rel.id}-${index}`}
                      label={`${sourceNode?.name || 'Unknown'} → ${targetNode?.name || 'Unknown'}`}
                      level={2}
                    />
                  );
                })}
              </TreeNode>
            ))}
          </TreeNode>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading SW Component Prototypes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">SW Component Prototype Relations</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Component List */}
        <div className="bg-white rounded-lg shadow border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">
              SW Component Prototypes ({swcPrototypes.length})
            </h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {swcPrototypes.map((component) => (
              <div
                key={component.uuid}
                className={`p-3 border-b cursor-pointer hover:bg-blue-50 transition-colors ${
                  selectedComponent?.uuid === component.uuid ? 'bg-blue-100 border-blue-300' : ''
                }`}
                onClick={() => handleComponentSelect(component)}
              >
                <div className="font-medium text-blue-600">{component.name}</div>
                <div className="text-sm text-gray-500">{component.shortName}</div>
                <div className="text-xs text-gray-400 truncate">{component.arxmlPath}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dependency Graph */}
        <div className="bg-white rounded-lg shadow border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Dependency Graph</h2>
          </div>
          <div className="p-4">
            {!selectedComponent ? (
              <div className="text-gray-500 text-center py-8">
                Select a component to view its dependency graph
              </div>
            ) : loadingGraph ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <div className="mt-2">Loading dependency graph...</div>
              </div>
            ) : graphError ? (
              <div className="py-4">
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
                  <div className="flex items-center">
                    <span className="mr-2">⚠️</span>
                    <strong>Warning:</strong> {graphError}
                  </div>
                </div>
                <div className="text-gray-600 text-center py-4">
                  <div className="font-medium mb-2">Selected Component: {selectedComponent.name}</div>
                  <div className="text-sm text-gray-500">
                    Unable to load dependency graph for this component.
                    <br />
                    Please try selecting another component.
                  </div>
                </div>
              </div>
            ) : (
              renderDependencyTree()
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SWCProtoRelations;