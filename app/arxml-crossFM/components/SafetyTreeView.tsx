'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Tree, Card, Typography, Tag, Spin, Alert, Button, message } from 'antd';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import type { SafetyGraphData } from '@/app/services/neo4j/queries/safety/types';
import { deleteCausationNode } from '@/app/services/neo4j/queries/safety/causation';
import { FolderOutlined, ApiOutlined, BugOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface TreeNode {
  key: string;
  title: React.ReactNode;
  children?: TreeNode[];
  isLeaf?: boolean;
  type: 'SW_COMPONENT' | 'PORT' | 'FAILURE_MODE' | 'CAUSATION';
  causationUuid?: string; // Add causationUuid for deletion
  causationName?: string; // Add causationName for display
  failureModes?: Array<{
    uuid: string;
    name: string;
    asil: string;
    description: string;
  }>;
}

interface SafetyTreeViewProps {
  onFailureSelect?: (failure: { uuid: string; name: string; asil: string }) => void;
}

export default function SafetyTreeView({ onFailureSelect }: SafetyTreeViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    causationUuid: string;
    causationName: string;
  } | null>(null);

  useEffect(() => {
    loadSafetyTreeData();
  }, []);

  const loadSafetyTreeData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await getSafetyGraph();
      
      if (result.success && result.data) {
        const tree = buildSafetyTree(result.data);
        setTreeData(tree);
      } else {
        setError(result.message || 'Failed to load safety graph data');
      }
    } catch (err) {
      console.error('Error loading safety tree:', err);
      setError('An error occurred while loading the safety tree data');
    } finally {
      setLoading(false);
    }
  }, []);

  const hideContextMenu = useCallback(() => setContextMenu(null), []);

  const handleDeleteCausation = useCallback(async () => {
    if (!contextMenu) return;

    message.loading({ content: 'Deleting causation...', key: 'delete-causation' });
    try {
      const result = await deleteCausationNode(contextMenu.causationUuid);
      if (result.success) {
        message.success({ content: 'Causation deleted successfully!', key: 'delete-causation', duration: 2 });
        await loadSafetyTreeData(); // Reload everything
      } else {
        message.error({ content: `Failed to delete causation: ${result.message}`, key: 'delete-causation', duration: 4 });
      }
    } catch (error) {
      message.error({ content: 'An error occurred while deleting causation.', key: 'delete-causation', duration: 4 });
    } finally {
      hideContextMenu();
    }
  }, [contextMenu, hideContextMenu, loadSafetyTreeData]);

  const onRightClick = useCallback((info: any) => {
    const { node, event } = info;
    if (node.type === 'CAUSATION' && node.causationUuid) {
      event.preventDefault();
      setContextMenu({
        visible: true,
        x: event.pageX,
        y: event.pageY,
        causationUuid: node.causationUuid,
        causationName: node.causationName || 'Unknown Causation'
      });
    }
  }, []);

  const buildSafetyTree = (safetyGraph: SafetyGraphData): TreeNode[] => {
    const tree: TreeNode[] = [];
    const componentMap = new Map<string, TreeNode>();
    
    // Create efficient lookup maps
    const failureToSourceElementMap = new Map<string, any>(); // failureUuid -> source element occurrence data
    const failureToSourceElementUuidMap = new Map<string, string>(); // failureUuid -> source element UUID
    
    // Build lookup maps for fast access
    safetyGraph.occurrences.forEach(occurrence => {
      failureToSourceElementMap.set(occurrence.failureUuid, occurrence);
      failureToSourceElementUuidMap.set(occurrence.failureUuid, occurrence.occuranceSourceUuid);
    });
    
    // Define SW Component types
    const swComponentTypes = [
      'APPLICATION_SW_COMPONENT_TYPE',
      'COMPOSITION_SW_COMPONENT_TYPE', 
      'SW_COMPONENT_PROTOTYPE'
    ];
    
    // Define Port types
    const portTypes = [
      'P_PORT_PROTOTYPE',
      'R_PORT_PROTOTYPE'
    ];
    
    // Group occurrences by source
    const occurrencesBySource = new Map<string, any[]>();
    safetyGraph.occurrences.forEach(occurrence => {
      const sourceUuid = occurrence.occuranceSourceUuid;
      if (!occurrencesBySource.has(sourceUuid)) {
        occurrencesBySource.set(sourceUuid, []);
      }
      occurrencesBySource.get(sourceUuid)!.push(occurrence);
    });
    
    // Create tree nodes
    safetyGraph.occurrences.forEach(occurrence => {
      const sourceUuid = occurrence.occuranceSourceUuid;
      const sourceName = occurrence.occuranceSourceName;
      const sourcePath = occurrence.occuranceSourceArxmlPath;
      const sourceLabels = occurrence.occuranceSourceLabels || [];
      
      // Determine if it's a SW Component or Port
      const isSWComponent = sourceLabels.some(label => swComponentTypes.includes(label));
      const isPort = sourceLabels.some(label => portTypes.includes(label));
      
      if (isSWComponent) {
        // Create SW Component node
        if (!componentMap.has(sourceUuid)) {
          const componentNode: TreeNode = {
            key: sourceUuid,
            title: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderOutlined style={{ color: '#1890ff' }} />
                <span>{sourceName}</span>
                <Tag color="blue">SW Component</Tag>
              </div>
            ),
            type: 'SW_COMPONENT',
            children: [],
            failureModes: []
          };
          componentMap.set(sourceUuid, componentNode);
          tree.push(componentNode);
        }
      } else if (isPort) {
        // Create Port node and find its parent SW Component
        const pathParts = sourcePath?.split('/') || [];
        const componentPath = pathParts.slice(0, -1).join('/'); // Remove port name
        
        // Find parent component by matching path
        const parentComponent = Array.from(componentMap.values())
          .find(comp => comp.type === 'SW_COMPONENT' && 
                safetyGraph.occurrences.some(occ => 
                  occ.occuranceSourceUuid === comp.key && 
                  occ.occuranceSourceArxmlPath === componentPath
                ));
        
        if (parentComponent && !componentMap.has(sourceUuid)) {
          const portNode: TreeNode = {
            key: sourceUuid,
            title: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ApiOutlined style={{ color: '#52c41a' }} />
                <span>{sourceName}</span>
                <Tag color="green">Port</Tag>
              </div>
            ),
            type: 'PORT',
            children: [],
            failureModes: []
          };
          componentMap.set(sourceUuid, portNode);
          parentComponent.children!.push(portNode);
        }
      }
    });
    
    // Add failure modes to their respective nodes
    safetyGraph.occurrences.forEach(occurrence => {
      const sourceUuid = occurrence.occuranceSourceUuid;
      const node = componentMap.get(sourceUuid);
      
      if (node) {
        // Find failure mode details
        const failure = safetyGraph.failures.find(f => f.uuid === occurrence.failureUuid);
        if (failure) {
          const failureMode = {
            uuid: failure.uuid,
            name: failure.properties.name as string,
            asil: failure.properties.asil as string,
            description: failure.properties.description as string
          };
          
          if (!node.failureModes) {
            node.failureModes = [];
          }
          
          // Avoid duplicates
          if (!node.failureModes.find(fm => fm.uuid === failureMode.uuid)) {
            node.failureModes.push(failureMode);
          }
        }
      }
    });
    
    // Create failure mode tree nodes and add causations
    componentMap.forEach(node => {
      if (node.failureModes && node.failureModes.length > 0) {
        if (!node.children) {
          node.children = [];
        }
        
        node.failureModes.forEach(failureMode => {
          const failureNode: TreeNode = {
            key: failureMode.uuid,
            title: (
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => onFailureSelect?.(failureMode)}
              >
                <BugOutlined style={{ color: '#ff4d4f' }} />
                <span>{failureMode.name}</span>
                <Tag color={getAsilColor(failureMode.asil)}>ASIL {failureMode.asil}</Tag>
              </div>
            ),
            type: 'FAILURE_MODE',
            children: [],
            isLeaf: false
          };
          
          // Add causation relationships
          const causations = safetyGraph.causationLinks.filter(link => 
            link.causeFailureUuid === failureMode.uuid || link.effectFailureUuid === failureMode.uuid
          );
          
          if (causations.length > 0) {
            causations.forEach(causation => {
              const isCause = causation.causeFailureUuid === failureMode.uuid;
              const relatedFailureUuid = isCause ? causation.effectFailureUuid : causation.causeFailureUuid;
              const relatedFailureName = isCause ? causation.effectFailureName : causation.causeFailureName;
              
              // Find the source component/port of the related failure
              const relatedSourceElement = failureToSourceElementMap.get(relatedFailureUuid);
              const relatedSourceElementUuid = failureToSourceElementUuidMap.get(relatedFailureUuid);
              
              if (relatedSourceElement && relatedSourceElementUuid) {
                const relatedComponent = componentMap.get(relatedSourceElementUuid);
                const relationshipText = isCause ? 'causes' : 'caused by';
                
                const causationNode: TreeNode = {
                  key: `${failureMode.uuid}-causation-${causation.causationUuid}`,
                  title: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <LinkOutlined style={{ color: '#722ed1' }} />
                      <span style={{ fontSize: '12px' }}>
                        {relationshipText} <strong>{relatedFailureName}</strong>
                      </span>
                      <Tag color="purple" style={{ fontSize: '10px' }}>
                        {relatedComponent?.type === 'SW_COMPONENT' ? 'SWC' : 'Port'}
                      </Tag>
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        ({relatedSourceElement.occuranceSourceName})
                      </span>
                    </div>
                  ),
                  type: 'CAUSATION',
                  causationUuid: causation.causationUuid,
                  causationName: causation.causationName,
                  isLeaf: true
                };
                
                failureNode.children!.push(causationNode);
              }
            });
          }
          
          node.children!.push(failureNode);
        });
      }
    });
    
    return tree;
  };

  const getAsilColor = (asil: string): string => {
    switch (asil) {
      case 'A': return 'green';
      case 'B': return 'blue';
      case 'C': return 'orange';
      case 'D': return 'red';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Error"
        description={error}
        type="error"
        showIcon
        action={
          <button onClick={loadSafetyTreeData} className="text-blue-600 hover:text-blue-800">
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div style={{ position: 'relative' }} onClick={hideContextMenu}>
      <Card title="Safety Analysis Tree" className="mb-4">
        <Tree
          showLine
          defaultExpandAll
          treeData={treeData}
          onRightClick={onRightClick}
          style={{ background: 'transparent' }}
        />
      </Card>

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'white',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <Typography.Text strong>Delete Causation</Typography.Text>
          </div>
          <div style={{ padding: '4px 0' }}>
            <Button
              type="text"
              icon={<DeleteOutlined />}
              onClick={handleDeleteCausation}
              style={{ width: '100%', textAlign: 'left', color: '#ff4d4f' }}
              danger
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 