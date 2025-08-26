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
    ReactFlowInstance, // add type
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Collapse, Typography, Space, Tag, Modal, message, theme } from 'antd';
import { NodeCollapseOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { SwComponent, Failure, PortFailure, ProviderPort } from './types';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import { deleteCausationNode, createCausationBetweenFailureModes } from '@/app/services/neo4j/queries/safety/causation';
import ELK from 'elkjs/lib/elk.bundled.js'; // added

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
  const { token } = theme.useToken();
  const showBorder = ['A', 'B', 'C', 'D'].includes(data.asil);
  const isQM = data.asil === 'QM';
  const textColor = isQM ? token.colorTextQuaternary : token.colorText;
  
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '8px',
      // Legend update: SW should be green for readability (adaptive)
      background: token.colorSuccessBg,
      border: showBorder ? `3px solid ${token.colorWarning}` : 'none',
      boxShadow: token.boxShadow,
      minWidth: '180px',
      color: textColor,
      textAlign: 'center',
      position: 'relative'
    }}>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: token.colorTextSecondary, width: '10px', height: '10px', left: '-5px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: token.colorTextSecondary, width: '10px', height: '10px', right: '-5px' }}
      />
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
        {data.label}
      </div>
      <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
        <span style={{ fontWeight: 'bold' }}>ASIL:</span> <span style={{ fontWeight: 'bold' }}>{data.asil}</span>
      </div>
      {data.description && (
        <div style={{ fontSize: '10px', color: token.colorTextTertiary, marginTop: '2px' }}>
          {data.description.length > 30 ? `${data.description.substring(0, 30)}...` : data.description}
        </div>
      )}
    </div>
  );
}

// Custom node component for receiver port failures (left side)
function ReceiverPortFailureNode({ data }: { data: NodeData }) {
  const { token } = theme.useToken();
  const showBorder = ['A', 'B', 'C', 'D'].includes(data.asil);
  const isQM = data.asil === 'QM';
  // Receiver: solid primary background, light-solid text for contrast (adaptive)
  const labelTextColor = token.colorTextLightSolid;
  const asilTextColor = token.colorTextLightSolid;
  
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
      background: token.colorPrimary,
      border: showBorder ? `3px solid ${token.colorWarning}` : 'none',
      boxShadow: token.boxShadowSecondary,
      minWidth: '160px',
      maxWidth: '280px',
      position: 'relative',
      textAlign: 'right',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }}>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: token.colorTextLightSolid, width: '8px', height: '8px', left: '-4px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: token.colorTextLightSolid, width: '8px', height: '8px', right: '-4px' }}
      />
      <div style={{ fontSize: '12px', fontWeight: '600', color: labelTextColor, opacity: 0.85, marginBottom: '2px' }}>
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

// Custom node component for provider port failures (right side)
function ProviderPortFailureNode({ data }: { data: NodeData }) {
  const { token } = theme.useToken();
  const showBorder = ['A', 'B', 'C', 'D'].includes(data.asil);
  const isQM = data.asil === 'QM';
  // Provider: lighter warning background so ASIL border is visible (adaptive)
  const labelTextColor = token.colorText;
  const asilTextColor = token.colorTextSecondary;
  
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
      background: token.colorWarningBg,
      border: showBorder ? `3px solid ${token.colorWarning}` : 'none',
      boxShadow: token.boxShadowSecondary,
      minWidth: '160px',
      position: 'relative'
    }}>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: token.colorWarning, width: '8px', height: '8px', left: '-4px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: token.colorWarning, width: '8px', height: '8px', right: '-4px' }}
      />
      <div style={{ fontSize: '12px', fontWeight: '600', color: token.colorTextSecondary, marginBottom: '2px' }}>
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

// Replace barycenter layout with ELK layered layout
const elk = new ELK();

type ElkNode = {
  id: string;
  width: number;
  height: number;
  layoutOptions?: Record<string, string>;
};

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  receiverPortFailure: { width: 260, height: 72 },
  swFailure: { width: 220, height: 84 },
  providerPortFailure: { width: 240, height: 72 },
};

const layoutWithELK = async (nodes: Node[], edges: Edge[]) => {
  // Heuristic: detect SW->SW density; ELK will naturally add middle ranks,
  // but we bump spacing if dense to create clearer "bands".
  const swIds = new Set(nodes.filter(n => n.type === 'swFailure').map(n => n.id));
  const sw2swCount = edges.filter(e => swIds.has(e.source) && swIds.has(e.target)).length;
  const denseSW = sw2swCount > Math.max(8, swIds.size);

  const elkNodes: ElkNode[] = nodes.map((n) => {
    const size = DEFAULT_SIZES[n.type as keyof typeof DEFAULT_SIZES] ?? { width: 200, height: 60 };
    // Layer constraints to keep inputs left and outputs right
    let layerConstraint = 'NONE';
    if (n.type === 'receiverPortFailure') layerConstraint = 'FIRST';
    if (n.type === 'providerPortFailure') layerConstraint = 'LAST';

    return {
      id: n.id,
      width: size.width,
      height: size.height,
      layoutOptions: {
        'elk.layered.layering.layerConstraint': layerConstraint,
      },
    };
  });

  const elkEdges = edges.map(e => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'POLYLINE',
      'elk.spacing.nodeNode': '32',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '18',
      'elk.layered.spacing.nodeNodeBetweenLayers': denseSW ? '120' : '72',
      'elk.layered.spacing.edgeNodeBetweenLayers': denseSW ? '96' : '56',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.layered.crossingMinimization.semiInteractive': 'false',
      'elk.layered.mergeEdges': 'true',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await elk.layout(graph as any);

  // Map ELK positions back to React Flow nodes
  const posMap = new Map<string, { x: number; y: number }>();
  (layouted.children || []).forEach((c: any) => {
    posMap.set(c.id, { x: c.x || 0, y: c.y || 0 });
  });

  return nodes.map(n => {
    const p = posMap.get(n.id);
    return p ? { ...n, position: p } : n;
  });
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

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
        //console.log(`✅ Found ${result.data.causationLinks.length} causation links:`, result.data.causationLinks);
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
      const result = await createCausationBetweenFailureModes(
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
    
    // Removed onFailureSelect call to prevent automatic causation creation on node click
    // Causation creation should only happen via drag and drop from handles
  }, [hideContextMenu]);

  const applyLayout = useCallback(async () => {
    try {
      const layoutedNodes = await layoutWithELK(nodes, edges);
      setNodes(layoutedNodes);

      // Keep the diagram in view after layout
      requestAnimationFrame(() => {
        try {
          rfInstance?.fitView({ padding: 0.15, duration: 300 });
        } catch {
          // no-op
        }
      });
    } catch (e) {
      console.error('ELK layout failed:', e);
      message.error('Layout failed. See console for details.');
    }
  }, [nodes, edges, setNodes, rfInstance]);

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
    <Collapse 
      bordered={true} 
      defaultActiveKey={[]}
      style={{ marginTop: '24px' }}
    >
      <Collapse.Panel
        header={
          <Title level={4} style={{ margin: 0 }}>
            Failure Mode Propagation Flow - {swComponent.name}
          </Title>
        }
        key="1"
        extra={
          <Space onClick={(e) => e.stopPropagation()}>
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
        }
      >
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
              : '💡 Drag from any failure node to another to create a causation relationship. Right-click on causation arrows to delete them.'
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
            onInit={(instance) => setRfInstance(instance)}
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
      </Collapse.Panel>
    </Collapse>
  );
}