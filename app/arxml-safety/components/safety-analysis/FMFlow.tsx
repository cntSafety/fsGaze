'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    Panel,
    MarkerType,
    NodeTypes,
    ConnectionLineType,
    Position,
    Handle,
    Connection,
    addEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Card, Typography, Space, Tag, Modal, message } from 'antd';
import { NodeCollapseOutlined, SaveOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import ELK from 'elkjs/lib/elk.bundled.js';
import { SwComponent, Failure, PortFailure, ProviderPort } from './types';
import { getSafetyGraph, deleteCausationNode, createCausationBetweenFailures } from '@/app/services/neo4j/queries/safety';

const { Title, Text } = Typography;

interface FMFlowProps {
  swComponent: SwComponent;
  failures: Failure[];
  providerPorts: ProviderPort[];
  portFailures: {[portUuid: string]: PortFailure[]};
  receiverPorts: ProviderPort[];
  receiverPortFailures: {[portUuid: string]: PortFailure[]};
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
  onRefresh?: () => void;
}

interface NodeData {
  label: string;
  asil: string;
  description?: string;
  failureUuid: string;
  portName?: string;
  portUuid?: string;
}

// Custom node component for SW Component failures (center)
function SwFailureNode({ data }: { data: NodeData }) {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '8px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: '2px solid #4C51BF',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
      minWidth: '180px',
      color: 'white',
      textAlign: 'center',
      position: 'relative'
    }}>
      {/* Input handle for receiving failures */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#FFA726', width: '10px', height: '10px', left: '-5px' }}
      />
      
      {/* Output handle for propagating failures */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#FFA726', width: '10px', height: '10px', right: '-5px' }}
      />
      
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
        {data.label}
      </div>
      <div style={{ fontSize: '11px', opacity: 0.9 }}>
        ASIL: {data.asil}
      </div>
      {data.description && (
        <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>
          {data.description.length > 30 ? `${data.description.substring(0, 30)}...` : data.description}
        </div>
      )}
    </div>
  );
}

// Custom node component for receiver port failures (left side)
function ReceiverPortFailureNode({ data }: { data: NodeData }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
      background: 'rgba(34, 197, 94, 0.15)',
      border: '2px solid #22C55E',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
      minWidth: '160px',
      position: 'relative'
    }}>
      {/* Output handle for propagating to SW component failures */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#22C55E', width: '8px', height: '8px', right: '-4px' }}
      />
      
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#15803d', marginBottom: '2px' }}>
        {data.portName}
      </div>
      <div style={{ fontSize: '11px', fontWeight: '500', color: '#374151' }}>
        {data.label}
      </div>
      <div style={{ fontSize: '10px', color: '#6B7280' }}>
        ASIL: {data.asil}
      </div>
    </div>
  );
}

// Custom node component for provider port failures (right side)
function ProviderPortFailureNode({ data }: { data: NodeData }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
      background: 'rgba(59, 130, 246, 0.15)',
      border: '2px solid #3B82F6',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
      minWidth: '160px',
      position: 'relative'
    }}>
      {/* Input handle for receiving from SW component failures */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#3B82F6', width: '8px', height: '8px', left: '-4px' }}
      />
      
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1d4ed8', marginBottom: '2px' }}>
        {data.portName}
      </div>
      <div style={{ fontSize: '11px', fontWeight: '500', color: '#374151' }}>
        {data.label}
      </div>
      <div style={{ fontSize: '10px', color: '#6B7280' }}>
        ASIL: {data.asil}
      </div>
    </div>
  );
}

export default function FMFlow({
  swComponent,
  failures,
  providerPorts,
  portFailures,
  receiverPorts,
  receiverPortFailures,
  onFailureSelect,
  selectedFailures,
  onRefresh
}: FMFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAutoLayout, setIsAutoLayout] = useState(false); // Disabled by default for simple layout
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingCausation, setIsCreatingCausation] = useState(false);
  
  // Context menu state for edge deletion
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    edgeId: string;
    causationUuid: string;
    causationName: string;
  } | null>(null);

  // Define custom node types
  const nodeTypes: NodeTypes = useMemo(() => ({
    swFailure: SwFailureNode,
    receiverPortFailure: ReceiverPortFailureNode,
    providerPortFailure: ProviderPortFailureNode,
  }), []);

  // ELK layout configuration
  const elk = useMemo(() => new ELK(), []);

  // Function to fetch causation relationships from Neo4j
  const fetchCausationRelationships = useCallback(async () => {
    try {
      // console.log('🔍 Fetching causation relationships...');
      const result = await getSafetyGraph();
      if (result.success && result.data?.causationLinks) {
        console.log(`✅ Found ${result.data.causationLinks.length} causation links:`, result.data.causationLinks);
        // console.log (`data from getSafetzGraph:`, result.data);
        return result.data.causationLinks;
      }
      console.warn('⚠️ Failed to fetch causation links:', result.message);
      return [];
    } catch (error) {
      console.error('❌ Error fetching causation relationships:', error);
      return [];
    }
  }, []);

  const onConnect = useCallback(async (params: Connection) => {
    // Prevent multiple simultaneous causation creations
    if (isCreatingCausation) return;
    
    // Find the source and target nodes to get failure UUIDs
    const sourceNode = nodes.find(node => node.id === params.source);
    const targetNode = nodes.find(node => node.id === params.target);
    
    if (!sourceNode || !targetNode) {
      message.error('Could not find source or target node');
      return;
    }
    
    const sourceFailureUuid = sourceNode.data.failureUuid;
    const targetFailureUuid = targetNode.data.failureUuid;
    
    if (!sourceFailureUuid || !targetFailureUuid) {
      message.error('Source or target node does not have a failure UUID');
      return;
    }
    
    setIsCreatingCausation(true);
    
    try {
      const result = await createCausationBetweenFailures(
        sourceFailureUuid,
        targetFailureUuid
      );
      
      if (result.success) {
        message.success(`Causation created: "${sourceNode.data.label}" → "${targetNode.data.label}"`);
        
        // Refresh the data to get the new causation edge
        if (onRefresh) {
          onRefresh();
        }
      } else {
        message.error(`Failed to create causation: ${result.message}`);
      }
    } catch (error) {
      console.error('Error creating causation:', error);
      message.error('Error creating causation');
    } finally {
      setIsCreatingCausation(false);
    }
  }, [nodes, onRefresh, isCreatingCausation]);

  // Handle right-click on edges (for causation deletion)
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    
    // Only show context menu for causation edges
    if (edge.data?.type === 'causation') {
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
        causationUuid: edge.data.causationUuid,
        causationName: edge.data.causationName
      });
    }
  }, []);

  // Hide context menu when clicking elsewhere
  const hideContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle causation deletion
  const handleDeleteCausation = useCallback(async () => {
    if (!contextMenu) return;

    try {
      const result = await deleteCausationNode(contextMenu.causationUuid);
      
      if (result.success) {
        message.success(`Causation "${contextMenu.causationName}" deleted successfully`);
        
        // Remove the edge from the diagram
        setEdges((edges) => edges.filter(edge => edge.id !== contextMenu.edgeId));
        
        // Optionally refresh the data
        if (onRefresh) {
          onRefresh();
        }
      } else {
        message.error(`Failed to delete causation: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting causation:', error);
      message.error('Error deleting causation');
    } finally {
      hideContextMenu();
    }
  }, [contextMenu, hideContextMenu, onRefresh, setEdges]);

  // Auto-layout function using ELK
  const getLayoutedElements = useCallback(async (nodes: Node[], edges: Edge[]) => {
    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '80',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        'elk.spacing.edgeNode': '40',
        'elk.spacing.edgeEdge': '20',
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: node.width || 180,
        height: node.height || 80,
        layoutOptions: {
          'elk.portConstraints': 'FIXED_SIDE',
        },
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    try {
      const layoutedGraph = await elk.layout(elkGraph);
      
      const layoutedNodes = nodes.map((node) => {
        const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);
        return {
          ...node,
          position: {
            x: layoutedNode?.x || 0,
            y: layoutedNode?.y || 0,
          },
        };
      });

      return { nodes: layoutedNodes, edges };
    } catch (error) {
      console.error('Layout failed:', error);
      return { nodes, edges };
    }
  }, [elk]);

  // Generate nodes and apply layout
  useEffect(() => {
    const generateNodes = async () => {
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Create receiver port failure nodes (left side)
      let receiverYOffset = 50;
      receiverPorts.forEach((port) => {
        const portFailuresList = receiverPortFailures[port.uuid] || [];
        portFailuresList.forEach((failure) => {
          if (failure.failureName && failure.failureName !== 'No failures defined') {
            newNodes.push({
              id: `receiver-${port.uuid}-${failure.failureUuid}`,
              type: 'receiverPortFailure',
              position: { x: 50, y: receiverYOffset },
              data: {
                label: failure.failureName,
                portName: port.name,
                asil: failure.asil || 'N/A',
                description: failure.failureDescription,
                failureUuid: failure.failureUuid,
                portUuid: port.uuid,
              },
            });
            receiverYOffset += 100; // Increased vertical spacing to 100px
          }
        });
      });

      // Create SW component failure nodes (center) - 400px from left
      let swYOffset = 50;
      failures.forEach((failure) => {
        if (failure.failureName && failure.failureName !== 'No failures defined') {
          newNodes.push({
            id: `sw-${failure.failureUuid}`,
            type: 'swFailure',
            position: { x: 450, y: swYOffset }, // 400px from left column
            data: {
              label: failure.failureName,
              asil: failure.asil || 'N/A',
              description: failure.failureDescription,
              failureUuid: failure.failureUuid,
            },
          });
          swYOffset += 100; // Increased vertical spacing to 100px
        }
      });

      // Create provider port failure nodes (right side) - 400px from center
      let providerYOffset = 50;
      providerPorts.forEach((port) => {
        const portFailuresList = portFailures[port.uuid] || [];
        portFailuresList.forEach((failure) => {
          if (failure.failureName && failure.failureName !== 'No failures defined') {
            newNodes.push({
              id: `provider-${port.uuid}-${failure.failureUuid}`,
              type: 'providerPortFailure',
              position: { x: 850, y: providerYOffset }, // 400px from center column
              data: {
                label: failure.failureName,
                portName: port.name,
                asil: failure.asil || 'N/A',
                description: failure.failureDescription,
                failureUuid: failure.failureUuid,
                portUuid: port.uuid,
              },
            });
            providerYOffset += 100; // Increased vertical spacing to 100px
          }
        });
      });

      // Fetch and create causation relationship edges
      try {
        const causationLinks = await fetchCausationRelationships();
        
        // Create a map of failure UUID to node ID for efficient lookups
        const failureUuidToNodeId = new Map<string, string>();
        newNodes.forEach(node => {
          if (node.data.failureUuid) {
            failureUuidToNodeId.set(node.data.failureUuid, node.id);
          }
        });

        // console.log(`📊 Processing ${causationLinks.length} causation links...`);
        // console.log('🗂️ Available failure UUIDs in nodes:', Array.from(failureUuidToNodeId.keys()));

        // Create edges for causation relationships
        // let createdEdgesCount = 0;
        causationLinks.forEach((link, linkIndex) => {
          const sourceNodeId = failureUuidToNodeId.get(link.causeFailureUuid);
          const targetNodeId = failureUuidToNodeId.get(link.effectFailureUuid);
          
          // console.log(`🔗 Processing causation: ${link.causeFailureName} → ${link.effectFailureName}`);
          // console.log(`   Source UUID: ${link.causeFailureUuid} → Node ID: ${sourceNodeId}`);
          // console.log(`   Target UUID: ${link.effectFailureUuid} → Node ID: ${targetNodeId}`);
          
          if (sourceNodeId && targetNodeId) {
            newEdges.push({
              id: `causation-${link.causationUuid}-${linkIndex}`,
              source: sourceNodeId,
              target: targetNodeId,
              type: 'smoothstep',
              animated: true,
              style: { 
                stroke: '#F59E0B', 
                strokeWidth: 3,
                strokeDasharray: '5,5'
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#F59E0B',
              },
              data: {
                causationUuid: link.causationUuid,
                causationName: link.causationName,
                type: 'causation'
              }
            });
            // createdEdgesCount++;
            // console.log(`✅ Created causation edge: ${sourceNodeId} → ${targetNodeId}`);
          } else {
            // console.log(`⚠️ Skipped causation edge - missing nodes: source=${sourceNodeId}, target=${targetNodeId}`);
          }
        });
        
        // console.log(`📈 Created ${createdEdgesCount} out of ${causationLinks.length} causation edges`);
      } catch (error) {
        console.error('❌ Error creating causation edges:', error);
      }

      if (isAutoLayout && newNodes.length > 0) {
        const { nodes: layoutedNodes, edges: layoutedEdges } = await getLayoutedElements(newNodes, newEdges);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } else {
        // Use simple three-column layout
        setNodes(newNodes);
        setEdges(newEdges);
      }
    };

    generateNodes();
  }, [
    failures,
    providerPorts,
    portFailures,
    receiverPorts,
    receiverPortFailures,
    isAutoLayout,
    getLayoutedElements,
    setNodes,
    setEdges,
    fetchCausationRelationships, // Add this dependency
  ]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Hide context menu when clicking on nodes
    hideContextMenu();
    
    if (onFailureSelect && node.data.failureUuid) {
      onFailureSelect({
        uuid: node.data.failureUuid,
        name: node.data.label,
      });
    }
  }, [onFailureSelect, hideContextMenu]);

  const toggleAutoLayout = async () => {
    setIsAutoLayout(!isAutoLayout);
    if (!isAutoLayout) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = await getLayoutedElements(nodes, edges);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  };

  const savePropagation = () => {
    Modal.info({
      title: 'Save Failure Propagation',
      content: 'Failure propagation model saved successfully! (Feature to be implemented)',
    });
  };

  const clearPropagation = () => {
    Modal.confirm({
      title: 'Clear All Propagation Links',
      content: 'Are you sure you want to remove all failure propagation connections?',
      onOk: () => {
        setEdges([]);
      },
    });
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
        Modal.success({
          title: 'Data Refreshed',
          content: 'Failure mode data has been refreshed successfully!',
        });
      } catch (error) {
        Modal.error({
          title: 'Refresh Failed',
          content: 'Failed to refresh failure mode data. Please try again.',
        });
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  return (
    <Card style={{ marginTop: '24px', height: '600px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Title level={3} style={{ margin: 0 }}>
          Failure Mode Propagation Flow - {swComponent.name}
        </Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={isRefreshing}
            type="default"
          >
            Refresh Data
          </Button>
          <Button
            icon={<NodeCollapseOutlined />}
            onClick={toggleAutoLayout}
            type={isAutoLayout ? 'primary' : 'default'}
          >
            Auto Layout
          </Button>
          <Button icon={<SaveOutlined />} onClick={savePropagation} type="primary">
            Save
          </Button>
          <Button icon={<DeleteOutlined />} onClick={clearPropagation} danger>
            Clear
          </Button>
        </Space>
      </div>

      {/* Legend */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <Space>
          <Tag color="green">Receiver Port Failures (Input)</Tag>
          <Tag color="purple">SW Component Failures (Internal)</Tag>
          <Tag color="blue">Provider Port Failures (Output)</Tag>
          <Tag 
            style={{ 
              borderColor: '#F59E0B', 
              color: '#F59E0B',
              borderStyle: 'dashed'
            }}
          >
            ⚡ Causation Relationships
          </Tag>
        </Space>
      </div>

      {/* Interaction help */}
      <div style={{ 
        marginBottom: '12px', 
        padding: '8px', 
        backgroundColor: isCreatingCausation ? '#fff7e6' : '#f6ffed', 
        borderRadius: '4px',
        border: isCreatingCausation ? '1px solid #ffd591' : '1px solid #b7eb8f'
      }}>
        <Text style={{ fontSize: '12px', color: isCreatingCausation ? '#fa8c16' : '#52c41a' }}>
          {isCreatingCausation 
            ? '⏳ Creating causation...' 
            : '💡 Drag from any failure node to another to create a causation relationship'
          }
        </Text>
      </div>

      <div style={{ 
        height: '480px', 
        border: '1px solid #d9d9d9', 
        borderRadius: '4px',
        position: 'relative',
        opacity: isCreatingCausation ? 0.7 : 1,
        pointerEvents: isCreatingCausation ? 'none' : 'auto'
      }} onClick={hideContextMenu}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onEdgeContextMenu={onEdgeContextMenu}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          attributionPosition="bottom-left"
        >
          <Background />
          <Controls />
          <Panel position="top-left">
            <div style={{ 
              backgroundColor: 'white', 
              padding: '8px', 
              borderRadius: '4px', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              fontSize: '12px'
            }}>
              <div><strong>Flow Diagram:</strong></div>
              <div>• Inputs (Left) → Internal (Center) → Outputs (Right)</div>
              <div>• Dashed orange arrows show causations</div>
              <div>• Drag from node to node to create causations</div>
              <div>• Right-click causation arrows to delete</div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Context Menu for Edge Deletion */}
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
            minWidth: '180px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <Text strong style={{ fontSize: '12px' }}>Delete Causation</Text>
          </div>
          <div style={{ padding: '4px 0' }}>
            <div style={{ padding: '6px 12px', fontSize: '11px', color: '#666' }}>
              {contextMenu.causationName}
            </div>
            <Button
              type="text"
              icon={<DeleteOutlined />}
              onClick={handleDeleteCausation}
              style={{ 
                width: '100%', 
                textAlign: 'left',
                color: '#ff4d4f',
                borderRadius: 0
              }}
              size="small"
            >
              Delete Causation
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
