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
import { NodeCollapseOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
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
  const showBorder = ['A', 'B', 'C', 'D'].includes(data.asil);
  const isQM = data.asil === 'QM';
  const textColor = isQM ? '#9CA3AF' : '#1F2937'; // Medium gray for QM, dark gray for ASIL
  
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '8px',
      background: 'rgba(248, 250, 252, 1)', // Light gray/white background
      border: showBorder ? '3px solid #F59E0B' : 'none', // Orange border for ASIL A-D
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
      minWidth: '180px',
      color: textColor,
      textAlign: 'center',
      position: 'relative'
    }}>
      {/* Input handle for receiving failures */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#6B7280', width: '10px', height: '10px', left: '-5px' }}
      />
      
      {/* Output handle for propagating failures */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#6B7280', width: '10px', height: '10px', right: '-5px' }}
      />
      
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: textColor }}>
        {data.label}
      </div>
      <div style={{ fontSize: '11px', opacity: 0.9 }}>
        <span style={{ fontWeight: 'bold', color: textColor }}>ASIL:</span> <span style={{ fontWeight: 'bold', color: textColor }}>{data.asil}</span>
      </div>
      {data.description && (
        <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', color: textColor }}>
          {data.description.length > 30 ? `${data.description.substring(0, 30)}...` : data.description}
        </div>
      )}
    </div>
  );
}

// Custom node component for receiver port failures (left side)
function ReceiverPortFailureNode({ data }: { data: NodeData }) {
  const showBorder = ['A', 'B', 'C', 'D'].includes(data.asil);
  const isQM = data.asil === 'QM';
  const labelTextColor = isQM ? '#9CA3AF' : '#374151'; // Medium gray for QM, darker for ASIL
  const asilTextColor = isQM ? '#9CA3AF' : '#6B7280'; // Medium gray for QM, gray for ASIL
  
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
      background: 'rgba(219, 234, 254, 1)', // Light blue background for receivers
      border: showBorder ? '3px solid #F59E0B' : 'none', // Orange border for ASIL A-D
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
      minWidth: '160px', // Minimum width, can expand for longer content
      maxWidth: '280px', // Maximum width to prevent excessive expansion
      position: 'relative',
      textAlign: 'right', // Right-align the text content
      whiteSpace: 'nowrap', // Prevent text wrapping for port names
      overflow: 'hidden', // Hide overflow if text is too long
      textOverflow: 'ellipsis', // Show ellipsis for very long text
      transform: 'translateX(calc(200px - 100%))', // Move so right edge aligns at 200px (250px gap from SW at 450px)
      marginLeft: '0'
    }}>
      {/* Input handle for receiving from other failure modes */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#3B82F6', width: '8px', height: '8px', left: '-4px' }}
      />
      
      {/* Output handle for propagating to SW component failures */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#3B82F6', width: '8px', height: '8px', right: '-4px' }}
      />
      
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#9CA3AF', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.portName}
      </div>
      <div style={{ fontSize: '13px', fontWeight: '700', color: labelTextColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.label}
      </div>
      <div style={{ fontSize: '10px', color: asilTextColor }}>
        <span style={{ fontWeight: 'bold' }}>ASIL:</span> <span style={{ fontWeight: 'bold' }}>{data.asil}</span>
      </div>
    </div>
  );
}

// Custom node component for provider port failures (right side)
function ProviderPortFailureNode({ data }: { data: NodeData }) {
  const showBorder = ['A', 'B', 'C', 'D'].includes(data.asil);
  const isQM = data.asil === 'QM';
  const labelTextColor = isQM ? '#9CA3AF' : '#374151'; // Medium gray for QM, darker for ASIL
  const asilTextColor = isQM ? '#9CA3AF' : '#6B7280'; // Medium gray for QM, gray for ASIL
  
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
      background: 'rgba(254, 240, 138, 1)', // Light yellow background for providers
      border: showBorder ? '3px solid #F59E0B' : 'none', // Orange border for ASIL A-D
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
      minWidth: '160px',
      position: 'relative'
    }}>
      {/* Input handle for receiving from SW component failures */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#F59E0B', width: '8px', height: '8px', left: '-4px' }}
      />
      
      {/* Output handle for propagating to other failure modes */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#F59E0B', width: '8px', height: '8px', right: '-4px' }}
      />
      
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#9CA3AF', marginBottom: '2px' }}>
        {data.portName}
      </div>
      <div style={{ fontSize: '13px', fontWeight: '700', color: labelTextColor }}>
        {data.label}
      </div>
      <div style={{ fontSize: '10px', color: asilTextColor }}>
        <span style={{ fontWeight: 'bold' }}>ASIL:</span> <span style={{ fontWeight: 'bold' }}>{data.asil}</span>
      </div>
    </div>
  );
}

// *** NEW: BARYCENTER LAYOUT ALGORITHM ***
const layoutNodesWithBarycenter = (nodes: Node[], edges: Edge[]): Node[] => {
  const receiverNodes = nodes.filter(n => n.type === 'receiverPortFailure');
  const swNodes = nodes.filter(n => n.type === 'swFailure');
  const providerNodes = nodes.filter(n => n.type === 'providerPortFailure');

  if (swNodes.length === 0) return nodes; // No central nodes to align

  const nodePositions = new Map(nodes.map(n => [n.id, { ...n.position }]));
  const forwardNeighbors = new Map<string, string[]>();
  const backwardNeighbors = new Map<string, string[]>();

  edges.forEach(edge => {
    if (!forwardNeighbors.has(edge.source)) forwardNeighbors.set(edge.source, []);
    forwardNeighbors.get(edge.source)!.push(edge.target);
    if (!backwardNeighbors.has(edge.target)) backwardNeighbors.set(edge.target, []);
    backwardNeighbors.get(edge.target)!.push(edge.source);
  });

  const calculateBarycenter = (nodeId: string, neighborsMap: Map<string, string[]>) => {
    const neighborIds = neighborsMap.get(nodeId);
    if (!neighborIds || neighborIds.length === 0) {
      return nodePositions.get(nodeId)?.y ?? 0;
    }
    const sum = neighborIds.reduce((acc, neighborId) => acc + (nodePositions.get(neighborId)?.y ?? 0), 0);
    return sum / neighborIds.length;
  };

  const ITERATIONS = 8;
  const V_SPACING = 120; // Vertical spacing between nodes in a column

  for (let i = 0; i < ITERATIONS; i++) {
    // Left -> Right Sweep
    swNodes.sort((a, b) => calculateBarycenter(a.id, backwardNeighbors) - calculateBarycenter(b.id, backwardNeighbors));
    swNodes.forEach((node, index) => {
      const currentPos = nodePositions.get(node.id)!;
      nodePositions.set(node.id, { x: currentPos.x, y: index * V_SPACING }); // Preserve X position
    });
    
    providerNodes.sort((a, b) => calculateBarycenter(a.id, backwardNeighbors) - calculateBarycenter(b.id, backwardNeighbors));
    providerNodes.forEach((node, index) => {
      const currentPos = nodePositions.get(node.id)!;
      nodePositions.set(node.id, { x: currentPos.x, y: index * V_SPACING }); // Preserve X position
    });

    // Right -> Left Sweep
    swNodes.sort((a, b) => calculateBarycenter(a.id, forwardNeighbors) - calculateBarycenter(b.id, forwardNeighbors));
    swNodes.forEach((node, index) => {
      const currentPos = nodePositions.get(node.id)!;
      nodePositions.set(node.id, { x: currentPos.x, y: index * V_SPACING }); // Preserve X position
    });

    receiverNodes.sort((a, b) => calculateBarycenter(a.id, forwardNeighbors) - calculateBarycenter(b.id, forwardNeighbors));
    receiverNodes.forEach((node, index) => {
      const currentPos = nodePositions.get(node.id)!;
      nodePositions.set(node.id, { x: currentPos.x, y: index * V_SPACING }); // Preserve X position (right-aligned)
    });
  }

  return nodes.map(node => ({ ...node, position: nodePositions.get(node.id)! }));
};

export default function FMFlow({
  swComponent,
  failures,
  providerPorts,
  portFailures,
  receiverPorts,
  receiverPortFailures,
  onFailureSelect,
  selectedFailures
}: FMFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingCausation, setIsCreatingCausation] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to refresh causation data
  
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

  // Function to refresh only causation edges without affecting layout
  const refreshCausationEdges = useCallback(async () => {
    try {
      const causationLinks = await fetchCausationRelationships();
      
      // Create a map of failure UUID to node ID for efficient lookups
      const failureUuidToNodeId = new Map<string, string>();
      nodes.forEach(node => {
        if (node.data.failureUuid) {
          failureUuidToNodeId.set(node.data.failureUuid, node.id);
        }
      });

      // Create new causation edges
      const newCausationEdges: Edge[] = [];
      causationLinks.forEach((link, linkIndex) => {
        const sourceNodeId = failureUuidToNodeId.get(link.causeFailureUuid);
        const targetNodeId = failureUuidToNodeId.get(link.effectFailureUuid);
        
        if (sourceNodeId && targetNodeId) {
          newCausationEdges.push({
            id: `causation-${link.causationUuid}-${linkIndex}`,
            source: sourceNodeId,
            target: targetNodeId,
            type: 'straight',
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
        }
      });

      // Update edges by removing old causation edges and adding new ones
      setEdges(currentEdges => {
        const nonCausationEdges = currentEdges.filter(edge => edge.data?.type !== 'causation');
        return [...nonCausationEdges, ...newCausationEdges];
      });
    } catch (error) {
      console.error('Error refreshing causation edges:', error);
    }
  }, [nodes, fetchCausationRelationships, setEdges]);

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
        
        // Refresh causation edges to show new causation (without layout)
        refreshCausationEdges();
      } else {
        message.error(`Failed to create causation: ${result.message}`);
      }
    } catch (error) {
      console.error('Error creating causation:', error);
      message.error('Error creating causation');
    } finally {
      setIsCreatingCausation(false);
    }
  }, [nodes, isCreatingCausation]);

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
        
        // Remove the edge from the diagram immediately
        setEdges((edges) => edges.filter(edge => edge.id !== contextMenu.edgeId));
        
        // Refresh causation edges to ensure data consistency (without layout)
        refreshCausationEdges();
      } else {
        message.error(`Failed to delete causation: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting causation:', error);
      message.error('Error deleting causation');
    } finally {
      hideContextMenu();
    }
  }, [contextMenu, hideContextMenu, setEdges]);

  // Generate nodes and apply layout
  useEffect(() => {
    const generateNodes = async () => {
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Create receiver port failure nodes (left side) - positioned for right-alignment
      let receiverYOffset = 50;
      const receiverColumnLeft = 50; // Left position of the receiver column
      
      receiverPorts.forEach((port) => {
        const portFailuresList = receiverPortFailures[port.uuid] || [];
        portFailuresList.forEach((failure) => {
          if (failure.failureName && failure.failureName !== 'No failures defined') {
            newNodes.push({
              id: `receiver-${port.uuid}-${failure.failureUuid}`,
              type: 'receiverPortFailure',
              position: { x: receiverColumnLeft, y: receiverYOffset },
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
              type: 'straight',
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

      // Set nodes and edges without automatic layout (layout only on startup and manual trigger)
      setNodes(newNodes);
      setEdges(newEdges);
    };

    generateNodes();
  }, [
    failures,
    providerPorts,
    portFailures,
    receiverPorts,
    receiverPortFailures,
    setNodes,
    setEdges,
    fetchCausationRelationships,
    // refreshTrigger removed - we don't want auto-layout after causation creation
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

  const applyLayout = useCallback(() => {
    // Apply Barycenter layout to reduce edge crossings
    const layoutedNodes = layoutNodesWithBarycenter(nodes, edges);
    setNodes(layoutedNodes);
  }, [nodes, edges, setNodes]);

  // Apply initial layout only when nodes are first loaded
  const [hasAppliedInitialLayout, setHasAppliedInitialLayout] = useState(false);
  
  useEffect(() => {
    if (nodes.length > 0 && !hasAppliedInitialLayout) {
      // Use the same applyLayout function as the button
      applyLayout();
      setHasAppliedInitialLayout(true);
    }
  }, [nodes, hasAppliedInitialLayout, applyLayout]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Refresh causation edges without affecting layout
      await refreshCausationEdges();
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
  };

  return (
    <Card style={{ marginTop: '24px' }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <Title level={3} style={{ margin: 0, flex: '1 1 auto', minWidth: '200px' }}>
            Failure Mode Propagation Flow - {swComponent.name}
          </Title>
          <Space style={{ flexShrink: 0 }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={isRefreshing}
              type="default"
              size="small"
            >
              Refresh Data
            </Button>
            <Button
              icon={<NodeCollapseOutlined />}
              onClick={applyLayout}
              type="primary"
              size="small"
            >
              Optimize Layout
            </Button>
          </Space>
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <Space>
          <Tag color="blue">Receiver Port Failures (Input)</Tag>
          <Tag color="default">SW Component Failures (Internal)</Tag>
          <Tag color="gold">Provider Port Failures (Output)</Tag>
          <Tag 
            style={{ 
              borderColor: '#F59E0B', 
              color: '#F59E0B',
              borderStyle: 'dashed'
            }}
          >
            ⚡ Causation Relationships
          </Tag>
          <Tag 
            style={{ 
              borderColor: '#F59E0B', 
              color: '#F59E0B',
              borderWidth: '2px',
              fontWeight: 'bold'
            }}
          >
            🔶 ASIL A/B/C/D Border
          </Tag>
        </Space>
      </div>

      {/* Interaction help */}
      <div style={{ 
        marginBottom: '12px', 
        padding: '8px'
      }}>
        <Text style={{ fontSize: '12px', color: isCreatingCausation ? '#fa8c16' : '#6B7280' }}>
          {isCreatingCausation 
            ? '⏳ Creating causation...' 
            : '💡 Drag from any failure node to another to create a causation relationship'
          }
        </Text>
      </div>

      <div style={{ 
        height: '700px', 
        border: '1px solid #d9d9d9', 
        borderRadius: '4px',
        position: 'relative',
        opacity: isCreatingCausation ? 0.7 : 1,
        pointerEvents: isCreatingCausation ? 'none' : 'auto',
        overflow: 'hidden'
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
          connectionLineType={ConnectionLineType.Straight}
          fitView
          attributionPosition="bottom-left"
        >
          <Background />
          <Controls />
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
