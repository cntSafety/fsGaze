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
    ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Collapse, Typography, Space, Tag, Modal, message, theme } from 'antd';
import { NodeCollapseOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { SwComponent, Failure, PortFailure, ProviderPort } from './types';
import { getSafetyGraphForComponent } from '@/app/services/neo4j/queries/safety/exportGraph';
import { deleteCausationNode, createCausationBetweenFailureModes } from '@/app/services/neo4j/queries/safety/causation';
import { useRouter } from 'next/navigation';
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
  // Force high-contrast text regardless of theme
  const textColor = '#fff';
  
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '8px',
  // Use Ant Design blue-7 with 70% transparency
  background: 'rgba(9, 88, 217, 0.7)',
  border: showBorder ? '3px solid #9254de' : 'none',
      boxShadow: token.boxShadow,
      width: 320,
      color: textColor,
      textAlign: 'center',
      position: 'relative',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      lineHeight: 1.25
    }}>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#0958d9', width: '10px', height: '10px', left: '-5px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#0958d9', width: '10px', height: '10px', right: '-5px' }}
      />
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
        {data.label}
      </div>
      <div style={{ fontSize: '11px', color: '#fff' }}>
        <span style={{ fontWeight: 'bold' }}>ASIL:</span> <span style={{ fontWeight: 'bold' }}>{data.asil}</span>
      </div>
      {data.description && (
        <div style={{ fontSize: '10px', color: '#fff', marginTop: '2px' }}>
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
  // Receiver: force high-contrast white text regardless of theme
  const labelTextColor = '#fff';
  const asilTextColor = '#fff';
  
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
  // Ant Design gold-7 with 20% transparency
  background: 'rgba(207, 144, 18, 0.8)',
  border: showBorder ? '3px solid #9254de' : 'none',
      boxShadow: token.boxShadowSecondary,
      width: 300,
      position: 'relative',
      textAlign: 'right',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      lineHeight: 1.25
    }}>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#d48806', width: '8px', height: '8px', left: '-4px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#d48806', width: '8px', height: '8px', right: '-4px' }}
      />
      <div style={{ fontSize: '12px', fontWeight: '600', color: labelTextColor, opacity: 0.85, marginBottom: '2px' }}>
        {`>> ${data.portName ?? ''}`}
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
  // Provider: cyan-7 @ 10% background so ASIL border is visible
  const labelTextColor = '#fff';
  const asilTextColor = '#fff';
  
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
  // Ant Design cyan-7 with 10% transparency
  background: 'rgba(8, 151, 156, 0.7)',
  border: showBorder ? '3px solid #9254de' : 'none',
      boxShadow: token.boxShadowSecondary,
      width: 300,
      position: 'relative',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      lineHeight: 1.25
    }}>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#08979c', width: '8px', height: '8px', left: '-4px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#08979c', width: '8px', height: '8px', right: '-4px' }}
      />
  <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff', marginBottom: '2px' }}>
        {`${data.portName ?? ''} >>`}
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

// Replace previous ELK code: keep layered layout, let it distribute everything.
// Remove fixed column constraints and SW lane logic.
const elk = new ELK();

type ElkNode = {
  id: string;
  width: number;
  height: number;
  layoutOptions?: Record<string, string>;
};

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  receiverPortFailure: { width: 300, height: 92 },
  swFailure: { width: 320, height: 100 },
  providerPortFailure: { width: 300, height: 92 },
};

// Roughly estimate extra lines for text given an average chars-per-line at the
// current fixed widths. Adds height so long port names don't hide the ASIL.
function estimateExtraLines(text?: string, charsPerLine = 30): number {
  if (!text) return 0;
  const lines = Math.ceil(text.length / charsPerLine);
  return Math.max(0, lines - 1);
}

function getDynamicNodeSize(n: Node): { width: number; height: number } {
  const typeKey = (n.type || '') as keyof typeof DEFAULT_SIZES;
  const base = DEFAULT_SIZES[typeKey] || { width: 200, height: 60 };

  // Heuristic: count extra wrapped lines for title/port fields and add ~16px/line.
  // This keeps ASIL visible by growing the node used for ELK layout.
  const perLinePx = 16; // line-height budget per extra wrapped line

  if (n.type === 'receiverPortFailure' || n.type === 'providerPortFailure') {
    const portName = (n as any).data?.portName as string | undefined;
    const label = (n as any).data?.label as string | undefined;
    const extraLines = estimateExtraLines(portName) + estimateExtraLines(label);
    return { width: base.width, height: base.height + extraLines * perLinePx };
  }

  if (n.type === 'swFailure') {
    const label = (n as any).data?.label as string | undefined;
    const description = (n as any).data?.description as string | undefined;
    const extraLines = estimateExtraLines(label) + estimateExtraLines(description, 36);
    return { width: base.width, height: base.height + extraLines * perLinePx };
  }

  return base;
}

const layoutWithELK = async (nodes: Node[], edges: Edge[]) => {
  const elkNodes: ElkNode[] = nodes.map((n) => {
    const size = getDynamicNodeSize(n);
    return {
      id: n.id,
      width: size.width,
      height: size.height,
      // no layer constraints: ELK computes best layering
      layoutOptions: {},
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
      // ELK edge routing doesn’t affect React Flow edges, but keep spacing tidy
      'elk.spacing.nodeNode': '40',
      'elk.spacing.edgeNode': '32',
      'elk.spacing.edgeEdge': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.layered.spacing.edgeNodeBetweenLayers': '80',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.layered.mergeEdges': 'true',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await elk.layout(graph as any);

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
  const { token } = theme.useToken();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingCausation, setIsCreatingCausation] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [hasAppliedInitialLayout, setHasAppliedInitialLayout] = useState(false);
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

  // Function to fetch causation relationships scoped to this component from Neo4j
  const fetchCausationRelationships = useCallback(async () => {
    try {
      const result = await getSafetyGraphForComponent(swComponent.uuid);
      if (result.success && result.data) {
        return result.data.map((row: any) => ({
          causationUuid: row.cuuid,
          causeFailureUuid: row.causeFailureUuid,
          effectFailureUuid: row.effectFailureUuid,
        }));
      }
      console.warn('⚠️ Failed to fetch component-scoped causation links:', result.message);
      return [];
    } catch (error) {
      console.error('❌ Error fetching component-scoped causation relationships:', error);
      return [];
    }
  }, [swComponent.uuid]);

  // Keep applyLayout defined before dependent callbacks
  const applyLayout = useCallback(async () => {
    try {
      const layoutedNodes = await layoutWithELK(nodes, edges);
      setNodes(layoutedNodes);
      requestAnimationFrame(() => {
        try {
          rfInstance?.fitView({ padding: 0.15, duration: 300 });
        } catch { /* no-op */ }
      });
    } catch (e) {
      console.error('ELK layout failed:', e);
      message.error('Layout failed. See console for details.');
    }
  }, [nodes, edges, setNodes, rfInstance]);

  // Build nodes from props, fetch component-scoped causations, build edges, apply layout
  const generateGraph = useCallback(async () => {
    console.log(`[FMFlow] Generating graph for component: ${swComponent.uuid}`);
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    let usedServiceData = false;

    // 1) Try to fetch component-scoped graph data from Neo4j
    try {
      const result = await getSafetyGraphForComponent(swComponent.uuid);
      if (result.success && result.data && result.data.length > 0) {
        const rows: any[] = result.data as any[];

        const nodesMap = new Map<string, Node>();
        const failureUuidToNodeId = new Map<string, string[]>();

        // Build nodes from service rows (SW failures and port failures)
        rows.forEach((row) => {
          if (!row.failureUuid || !row.failureName) return;

          const isPort = row.locLabels.includes('P_PORT_PROTOTYPE') || row.locLabels.includes('R_PORT_PROTOTYPE');
          const isReceiver = isPort && row.locLabels.includes('R_PORT_PROTOTYPE');
          const isComponent = !isPort;

          let nodeId: string;
          let nodeType: string;
          let nodeData: any;

          if (isComponent) {
            nodeId = `sw-${row.failureUuid}`;
            nodeType = 'swFailure';
            nodeData = {
              label: row.failureName,
              asil: row.failureAsil || 'N/A',
              description: undefined,
              failureUuid: row.failureUuid,
            };
          } else { // isPort
            const prefix = isReceiver ? 'receiver' : 'provider';
            nodeId = `${prefix}-${row.locationUuid}-${row.failureUuid}`;
            nodeType = isReceiver ? 'receiverPortFailure' : 'providerPortFailure';
            nodeData = {
              label: row.failureName,
              portName: row.locationName,
              asil: row.failureAsil || 'N/A',
              description: undefined,
              failureUuid: row.failureUuid,
              portUuid: row.locationUuid,
            };
          }

          if (!nodesMap.has(nodeId)) {
            const node: Node = {
              id: nodeId,
              type: nodeType,
              position: { x: 0, y: 0 },
              data: nodeData,
            };
            nodesMap.set(nodeId, node);
            if (!failureUuidToNodeId.has(row.failureUuid)) {
              failureUuidToNodeId.set(row.failureUuid, []);
            }
            failureUuidToNodeId.get(row.failureUuid)!.push(nodeId);
          }
        });

        // Build causation edges for pairs that exist inside this component
        const edgesSet = new Set<string>();
        rows.forEach((row, idx) => {
          if (!row.cuuid || !row.causeFailureUuid || !row.effectFailureUuid) return;
          
          const sourceNodeIds = failureUuidToNodeId.get(row.causeFailureUuid);
          const targetNodeIds = failureUuidToNodeId.get(row.effectFailureUuid);

          if (sourceNodeIds && targetNodeIds) {
            sourceNodeIds.forEach(sourceNodeId => {
              targetNodeIds.forEach(targetNodeId => {
                const edgeKey = `${row.cuuid}|${sourceNodeId}|${targetNodeId}`;
                if (edgesSet.has(edgeKey)) return;
                edgesSet.add(edgeKey);

                newEdges.push({
                  id: `causation-${row.cuuid}-${sourceNodeId}-${targetNodeId}`,
                  source: sourceNodeId,
                  target: targetNodeId,
                  type: 'default',
                  animated: true,
                  style: { stroke: '#F59E0B', strokeWidth: 3, strokeDasharray: '5,5' },
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#F59E0B' },
                  data: {
                    causationUuid: row.cuuid,
                    causationName: row.causeFailureName && row.effectFailureName
                      ? `${row.causeFailureName} → ${row.effectFailureName}`
                      : undefined,
                    type: 'causation',
                  },
                });
              });
            });
          }
        });

        newNodes.push(...Array.from(nodesMap.values()));
        usedServiceData = newNodes.length > 0;
        console.log(`[FMFlow] Created ${newNodes.length} nodes and ${newEdges.length} edges from component-scoped service data`);
      }
    } catch (e) {
      console.warn('[FMFlow] getSafetyGraphForComponent failed, will fallback to props:', e);
    }

    // 2) Fallback to props when service data is unavailable or empty
    if (!usedServiceData) {
      // Receiver port failures from props
      receiverPorts.forEach((port) => {
        const portFailuresList = receiverPortFailures[port.uuid] || [];
        portFailuresList.forEach((failure) => {
          if (failure.failureName && failure.failureName !== 'No failures defined') {
            newNodes.push({
              id: `receiver-${port.uuid}-${failure.failureUuid}`,
              type: 'receiverPortFailure',
              position: { x: 0, y: 0 },
              data: {
                label: failure.failureName,
                portName: port.name,
                asil: failure.asil || 'N/A',
                description: failure.failureDescription,
                failureUuid: failure.failureUuid,
                portUuid: port.uuid,
              },
            });
          }
        });
      });
      
      // SW failures from props
      failures.forEach((failure) => {
        if (failure.failureName && failure.failureName !== 'No failures defined') {
          newNodes.push({
            id: `sw-${failure.failureUuid}`,
            type: 'swFailure',
            position: { x: 0, y: 0 },
            data: {
              label: failure.failureName,
              asil: failure.asil || 'N/A',
              description: failure.failureDescription,
              failureUuid: failure.failureUuid,
            },
          });
        }
      });

      // Provider port failures from props
      providerPorts.forEach((port) => {
        const portFailuresList = portFailures[port.uuid] || [];
        portFailuresList.forEach((failure) => {
          if (failure.failureName && failure.failureName !== 'No failures defined') {
            newNodes.push({
              id: `provider-${port.uuid}-${failure.failureUuid}`,
              type: 'providerPortFailure',
              position: { x: 0, y: 0 },
              data: {
                label: failure.failureName,
                portName: port.name,
                asil: failure.asil || 'N/A',
                description: failure.failureDescription,
                failureUuid: failure.failureUuid,
                portUuid: port.uuid,
              },
            });
          }
        });
      });

      // Causation edges (from component-scoped service query)
      try {
        const causationLinks = await fetchCausationRelationships();
        const failureUuidToNodeId = new Map<string, string>();
        newNodes.forEach(node => {
          if (node.data.failureUuid) failureUuidToNodeId.set(node.data.failureUuid, node.id);
        });
        causationLinks.forEach((link: any, linkIndex: number) => {
          const sourceNodeId = failureUuidToNodeId.get(link.causeFailureUuid);
          const targetNodeId = failureUuidToNodeId.get(link.effectFailureUuid);
          if (sourceNodeId && targetNodeId) {
            newEdges.push({
              id: `causation-${link.causationUuid}-${linkIndex}`,
              source: sourceNodeId,
              target: targetNodeId,
              type: 'default',
              animated: true,
              style: { stroke: '#F59E0B', strokeWidth: 3, strokeDasharray: '5,5' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#F59E0B' },
              data: {
                causationUuid: link.causationUuid,
                type: 'causation',
              },
            });
          }
        });
      } catch (e) {
        console.error('Error fetching causation links:', e);
      }
    }

    // Apply ELK layout on freshly built graph
    setEdges(newEdges);
    console.log('[FMFlow] Set edges:', newEdges.length);
    try {
      const layouted = await layoutWithELK(newNodes, newEdges);
      setNodes(layouted);
      console.log('[FMFlow] Set nodes:', layouted.length);
      requestAnimationFrame(() => {
        try {
          rfInstance?.fitView({ padding: 0.15, duration: 300 });
          console.log('[FMFlow] Fit view applied');
        } catch { /* no-op */ }
      });
      setHasAppliedInitialLayout(true);
    } catch (e) {
      console.error('[FMFlow] ELK layout failed, setting raw nodes:', e);
      setNodes(newNodes);
      console.log('[FMFlow] Set raw nodes:', newNodes.length);
    }
    console.log('[FMFlow] generateGraph completed');
  }, [
    fetchCausationRelationships,
    setNodes,
    setEdges,
    rfInstance,
    failures,
    providerPorts,
    portFailures,
    receiverPorts,
    receiverPortFailures,
  ]);

  // Generate once on initial mount (do not auto-update on prop changes)
  useEffect(() => {
    // Only generate graph if we have data and haven't done the initial layout
    if (failures.length > 0 && !hasAppliedInitialLayout) {
      generateGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failures, generateGraph]);

  // Fallback: if initial layout didn't run, guard and run once when data is ready
  useEffect(() => {
    if (nodes.length > 0 && edges.length > 0 && !hasAppliedInitialLayout) {
      applyLayout();
      setHasAppliedInitialLayout(true);
    }
  }, [nodes, edges, hasAppliedInitialLayout, applyLayout]);

  // Add back the context-menu handlers
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    if (edge.data?.type === 'causation') {
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
        causationUuid: edge.data.causationUuid,
        causationName: edge.data.causationName,
      });
    }
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleDeleteCausation = useCallback(async () => {
    if (!contextMenu) return;
    try {
      const result = await deleteCausationNode(contextMenu.causationUuid);
      if (result.success) {
        message.success(`Causation "${contextMenu.causationName}" deleted successfully`);
        setEdges((edges) => edges.filter(edge => edge.id !== contextMenu.edgeId));
    // Do not re-run layout; keep current node positions intact after deletion
      } else {
        message.error(`Failed to delete causation: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting causation:', error);
      message.error('Error deleting causation');
    } finally {
      hideContextMenu();
    }
  }, [contextMenu, setEdges, hideContextMenu]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    hideContextMenu();
  }, [hideContextMenu]);

  // Create causation on connect and refresh graph
  const onConnect = useCallback(async (params: Connection) => {
    if (isCreatingCausation) return;

    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) {
      message.error('Could not find source or target node');
      return;
    }

    const sourceFailureUuid = sourceNode.data?.failureUuid;
    const targetFailureUuid = targetNode.data?.failureUuid;
    if (!sourceFailureUuid || !targetFailureUuid) {
      message.error('Source or target node does not have a failure UUID');
      return;
    }

    setIsCreatingCausation(true);
    try {
      const result = await createCausationBetweenFailureModes(sourceFailureUuid, targetFailureUuid);
      if (result.success) {
        const causationName = `${sourceNode.data.label} → ${targetNode.data.label}`;
        message.success(`Causation created: "${causationName}"`);
        const newEdge = {
          id: `causation-${result.causationUuid}`,
          source: params.source!,
          target: params.target!,
          type: 'default',
          animated: true,
          style: { stroke: '#F59E0B', strokeWidth: 3, strokeDasharray: '5,5' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#F59E0B' },
          data: {
            causationUuid: result.causationUuid,
            causationName: causationName,
            type: 'causation',
          },
        };
        setEdges((eds) => addEdge(newEdge, eds));
      } else {
        message.error(`Failed to create causation: ${result.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error creating causation:', err);
      message.error('Error creating causation');
    } finally {
      setIsCreatingCausation(false);
    }
  }, [nodes, isCreatingCausation, setEdges]);

  // Refresh Data: fetch from DB and rebuild the graph (no page reload)
  const handleRefresh = async () => {
    console.log('[FMFlow] Refresh Data button clicked');
    setIsRefreshing(true);
    try {
      await generateGraph();
    } catch (error) {
      console.error('[FMFlow] Error during refresh:', error);
      Modal.error({
        title: 'Refresh Failed',
        content: 'Failed to refresh failure mode data. Please try again.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Collapse bordered={true} defaultActiveKey={[]} style={{ marginTop: '24px' }}>
      <Collapse.Panel
        header={<Title level={4} style={{ margin: 0 }}>Failure Mode Propagation Flow - {swComponent.name}</Title>}
        key="1"
        extra={
          <Space onClick={(e) => e.stopPropagation()}>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isRefreshing} type="default" size="small">
              Refresh Data
            </Button>
            <Button icon={<NodeCollapseOutlined />} onClick={applyLayout} type="primary" size="small">
              Optimize Layout
            </Button>
          </Space>
        }
      >
        {/* Legend */}
        <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Space>
            {/* Receiver (gold-7 @ 70%) */}
            <Tag style={{
              background: 'rgba(250, 173, 20, 0.7)',
              color: '#ffffffff',
              borderColor: '#d48806'
            }}>Receiver Port Failures (Input)</Tag>
            {/* SW (blue-7 @ 70%) */}
            <Tag style={{
              background: 'rgba(9, 88, 217, 0.7)',
              color: '#ffffffff',
              borderColor: '#0958d9'
            }}>SW Component Failures (Internal)</Tag>
            {/* Provider (cyan-7 @ 70%) */}
            <Tag style={{
              background: 'rgba(8, 151, 156, 0.7)',
              color: '#ffffffff',
              borderColor: '#08979c'
            }}>Provider Port Failures (Output)</Tag>
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
                borderColor: '#9254de', 
                color: '#9254de',
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
          border: `1px solid ${token.colorBorderSecondary}`, 
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
            connectionLineType={ConnectionLineType.Bezier}
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
              backgroundColor: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadius,
              boxShadow: token.boxShadowSecondary,
              zIndex: 1000,
              minWidth: '180px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorSplit}` }}>
              <Text strong style={{ fontSize: '12px' }}>Delete Causation</Text>
            </div>
            <div style={{ padding: '4px 0' }}>
              <div style={{ padding: '6px 12px', fontSize: '11px', color: token.colorTextSecondary }}>
                {contextMenu.causationName}
              </div>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={handleDeleteCausation}
                style={{ 
                  width: '100%', 
                  textAlign: 'left',
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