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
import { Card, Typography, Space, Tag, Button, message, Spin, Alert, Tooltip } from 'antd';
import { NodeCollapseOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import { SafetyGraphData } from '@/app/services/neo4j/queries/safety/types';
import { deleteCausationNode, createCausationBetweenFailureModes } from '@/app/services/neo4j/queries/safety/causation';
import { getLayoutedElements } from '../services/diagramLayoutService';
import { useLoading } from '@/app/components/LoadingProvider';
import InteractiveSmoothStepEdge from './InteractiveSmoothStepEdge';

const { Title, Text } = Typography;

interface ComponentData {
  uuid: string;
  name: string;
  type: 'SW_COMPONENT';
  providerPorts: PortData[];
  receiverPorts: PortData[];
}

interface PortData {
  uuid: string;
  name: string;
  type: 'P_PORT_PROTOTYPE' | 'R_PORT_PROTOTYPE';
  failureModes: FailureModeData[];
}

interface FailureModeData {
  uuid: string;
  name: string;
  asil: string;
  description: string;
}

interface CrossCompFlowProps {
  onFailureSelect?: (failure: { uuid: string; name: string; asil: string }) => void;
}

// Custom node component for SW Components
function SwComponentNode({ data }: { data: any }) {
  const { component, providerPorts, receiverPorts } = data;
  
  return (
    <div style={{
      padding: '16px',
      borderRadius: '12px',
      background: 'rgba(248, 250, 252, 0.3)',
      border: '2px solid rgba(24, 144, 255, 0.3)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      minWidth: '350px',
      minHeight: '120px',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between'
    }}>
      {/* Component Title */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '12px',
        fontSize: '14px',
        fontWeight: '600',
        color: '#1890ff'
      }}>
        {component.name}
      </div>

      {/* Ports Container */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'stretch',
        flex: 1,
        gap: '8px'
      }}>
        {/* Receiver Ports (Left) */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '4px',
          minWidth: '120px'
        }}>
          {receiverPorts.map((port: PortData) => (
            <div key={port.uuid}>
              <Tooltip title={port.name} placement="left">
                <div style={{
                  fontSize: '10px',
                  color: '#6B7280',
                  textAlign: 'left',
                  paddingLeft: '8px',
                  marginBottom: '4px',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {port.name}
                </div>
              </Tooltip>
              {port.failureModes.map((failure: FailureModeData, index: number) => (
                <div key={failure.uuid} style={{ position: 'relative', marginBottom: '2px' }}>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`failure-${failure.uuid}`}
                    style={{
                      background: '#3B82F6',
                      width: '10px',
                      height: '10px',
                      left: '-18px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: '1px solid white'
                    }}
                  />
                  <div style={{
                    fontSize: '11px',
                    color: '#374151',
                    textAlign: 'left',
                    paddingLeft: '12px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {failure.name}
                    <Tag 
                      style={{ 
                        fontSize: '8px', 
                        marginLeft: '4px',
                        backgroundColor: getAsilColor(failure.asil),
                        color: 'white',
                        border: 'none',
                        padding: '1px 4px',
                        lineHeight: '1'
                      }}
                    >
                      {failure.asil}
                    </Tag>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Provider Ports (Right) */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '4px',
          minWidth: '120px'
        }}>
          {providerPorts.map((port: PortData) => (
            <div key={port.uuid}>
              <Tooltip title={port.name} placement="right">
                <div style={{
                  fontSize: '10px',
                  color: '#6B7280',
                  textAlign: 'right',
                  paddingRight: '8px',
                  marginBottom: '4px',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {port.name}
                </div>
              </Tooltip>
              {port.failureModes.map((failure: FailureModeData, index: number) => (
                <div key={failure.uuid} style={{ position: 'relative', marginBottom: '2px' }}>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`failure-${failure.uuid}`}
                    style={{
                      background: '#F59E0B',
                      width: '10px',
                      height: '10px',
                      right: '-18px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: '1px solid white'
                    }}
                  />
                  <div style={{
                    fontSize: '11px',
                    color: '#374151',
                    textAlign: 'right',
                    paddingRight: '12px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    <Tag 
                      style={{ 
                        fontSize: '8px', 
                        marginRight: '4px',
                        backgroundColor: getAsilColor(failure.asil),
                        color: 'white',
                        border: 'none',
                        padding: '1px 4px',
                        lineHeight: '1'
                      }}
                    >
                      {failure.asil}
                    </Tag>
                    {failure.name}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Component Info */}
      <div style={{ 
        fontSize: '10px', 
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: '8px'
      }}>
        {receiverPorts.reduce((sum: number, port: PortData) => sum + port.failureModes.length, 0)} in / {providerPorts.reduce((sum: number, port: PortData) => sum + port.failureModes.length, 0)} out
      </div>
    </div>
  );
}

// Helper function to get ASIL color
const getAsilColor = (asil: string): string => {
  switch (asil) {
    case 'A': return '#10B981';
    case 'B': return '#3B82F6';
    case 'C': return '#F59E0B';
    case 'D': return '#EF4444';
    default: return '#6B7280';
  }
};

export default function CrossCompFlow({ onFailureSelect }: CrossCompFlowProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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
    swComponent: SwComponentNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    interactive: InteractiveSmoothStepEdge,
  }), []);

  const loadSafetyData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await getSafetyGraph();
      
      if (result.success && result.data) {
        buildFlowDiagram(result.data);
      } else {
        setError(result.message || 'Failed to load safety graph data');
      }
    } catch (err) {
      console.error('Error loading safety data:', err);
      setError('An error occurred while loading the safety data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSafetyData();
  }, []);

  const buildFlowDiagram = (safetyGraph: SafetyGraphData) => {
    // Group occurrences by source element
    const sourceElementMap = new Map<string, any[]>();
    safetyGraph.occurrences.forEach(occurrence => {
      const sourceUuid = occurrence.occuranceSourceUuid;
      if (!sourceElementMap.has(sourceUuid)) {
        sourceElementMap.set(sourceUuid, []);
      }
      sourceElementMap.get(sourceUuid)!.push(occurrence);
    });

    // Separate SW components and ports
    const swComponents = new Map<string, ComponentData>();
    const ports = new Map<string, PortData>();

    safetyGraph.occurrences.forEach(occurrence => {
      const sourceUuid = occurrence.occuranceSourceUuid;
      const sourceName = occurrence.occuranceSourceName;
      const sourceLabels = occurrence.occuranceSourceLabels || [];
      
      // Find failure mode details
      const failure = safetyGraph.failures.find(f => f.uuid === occurrence.failureUuid);
      if (!failure) return;

      const failureMode: FailureModeData = {
        uuid: failure.uuid,
        name: failure.properties.name as string,
        asil: failure.properties.asil as string,
        description: failure.properties.description as string
      };

      const isSWComponent = sourceLabels.some(label => 
        ['APPLICATION_SW_COMPONENT_TYPE', 'COMPOSITION_SW_COMPONENT_TYPE', 'SW_COMPONENT_PROTOTYPE'].includes(label)
      );
      const isProviderPort = sourceLabels.includes('P_PORT_PROTOTYPE');
      const isReceiverPort = sourceLabels.includes('R_PORT_PROTOTYPE');

      if (isSWComponent) {
        // Create or update SW component
        if (!swComponents.has(sourceUuid)) {
          swComponents.set(sourceUuid, {
            uuid: sourceUuid,
            name: sourceName,
            type: 'SW_COMPONENT',
            providerPorts: [],
            receiverPorts: []
          });
        }
        // SW components don't have failure modes directly, they're on their ports
      } else if (isProviderPort || isReceiverPort) {
        // Create or update port
        if (!ports.has(sourceUuid)) {
          ports.set(sourceUuid, {
            uuid: sourceUuid,
            name: sourceName,
            type: isProviderPort ? 'P_PORT_PROTOTYPE' : 'R_PORT_PROTOTYPE',
            failureModes: []
          });
        }
        ports.get(sourceUuid)!.failureModes.push(failureMode);
      }
    });

    // Associate ports with their parent components using ARXML paths
    swComponents.forEach(component => {
      ports.forEach(port => {
        // Find occurrences for this port to get its ARXML path
        const portOccurrences = sourceElementMap.get(port.uuid) || [];
        if (portOccurrences.length > 0) {
          const portPath = portOccurrences[0].occuranceSourceArxmlPath;
          const componentPath = `/ComponentTypes/${component.name}`;
          
          if (portPath?.startsWith(componentPath)) {
            if (port.type === 'P_PORT_PROTOTYPE') {
              component.providerPorts.push(port);
            } else {
              component.receiverPorts.push(port);
            }
          }
        }
      });
    });

    // Create React Flow nodes
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    let nodeIndex = 0;
    const nodeSpacing = 300;

    swComponents.forEach(component => {
      // Calculate node size based on number of ports
      const maxPorts = Math.max(component.providerPorts.length, component.receiverPorts.length);
      const nodeHeight = Math.max(120, maxPorts * 25 + 80);

      newNodes.push({
        id: component.uuid,
        type: 'swComponent',
        position: { x: nodeIndex * nodeSpacing, y: 100 },
        data: {
          component,
          providerPorts: component.providerPorts,
          receiverPorts: component.receiverPorts
        },
        style: {
          width: 200,
          height: nodeHeight
        }
      });
      nodeIndex++;
    });

    // Create causation edges
    const failureToPortMap = new Map<string, { portUuid: string; isProvider: boolean }>();
    
    // Build failure to port mapping
    ports.forEach(port => {
      port.failureModes.forEach(failure => {
        failureToPortMap.set(failure.uuid, {
          portUuid: port.uuid,
          isProvider: port.type === 'P_PORT_PROTOTYPE'
        });
      });
    });

    safetyGraph.causationLinks.forEach((causation, index) => {
      const causePort = failureToPortMap.get(causation.causeFailureUuid);
      const effectPort = failureToPortMap.get(causation.effectFailureUuid);

      if (causePort && effectPort) {
        // Find the component that contains the cause port
        const causeComponent = Array.from(swComponents.values()).find(comp =>
          comp.providerPorts.some(p => p.uuid === causePort.portUuid) ||
          comp.receiverPorts.some(p => p.uuid === causePort.portUuid)
        );

        // Find the component that contains the effect port
        const effectComponent = Array.from(swComponents.values()).find(comp =>
          comp.providerPorts.some(p => p.uuid === effectPort.portUuid) ||
          comp.receiverPorts.some(p => p.uuid === effectPort.portUuid)
        );

        if (causeComponent && effectComponent) {
          const sourceHandle = `failure-${causation.causeFailureUuid}`;
          const targetHandle = `failure-${causation.effectFailureUuid}`;

          newEdges.push({
            id: `causation-${causation.causationUuid}-${index}`,
            source: causeComponent.uuid,
            target: effectComponent.uuid,
            sourceHandle,
            targetHandle,
            type: 'interactive',
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
            data: {
              causationUuid: causation.causationUuid,
              causationName: causation.causationName,
              type: 'causation'
            }
          });
        }
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  };

  const onConnect = useCallback(async (params: Connection) => {
    if (isCreatingCausation) return;
    
    // Extract failure UUIDs from handle IDs
    const sourceHandle = params.sourceHandle;
    const targetHandle = params.targetHandle;
    
    if (!sourceHandle || !targetHandle) {
      message.error('Invalid connection');
      return;
    }

    // Parse handle IDs to get port UUIDs and find failure modes
    const sourcePortUuid = sourceHandle.replace('provider-', '');
    const targetPortUuid = targetHandle.replace('receiver-', '');

    // Find failure modes for these ports (simplified - you might want to show a selection dialog)
    // For now, we'll use the first failure mode of each port
    
    setIsCreatingCausation(true);
    
    try {
      // This is a simplified implementation - you might want to add a dialog to select specific failure modes
      message.info('Causation creation between ports - implementation needed');
    } catch (error) {
      console.error('Error creating causation:', error);
      message.error('Error creating causation');
    } finally {
      setIsCreatingCausation(false);
    }
  }, [isCreatingCausation]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadSafetyData();
      message.success('Data refreshed successfully!');
    } catch (error) {
      message.error('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const applyLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges
    );
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
  }, [nodes, edges, setNodes, setEdges]);

  // Apply initial layout only when nodes are first loaded
  const [hasAppliedInitialLayout, setHasAppliedInitialLayout] = useState(false);
  
  useEffect(() => {
    if (nodes.length > 0 && !hasAppliedInitialLayout) {
      applyLayout();
      setHasAppliedInitialLayout(true);
    }
  }, [nodes, hasAppliedInitialLayout, applyLayout]);

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
          <button onClick={loadSafetyData} className="text-blue-600 hover:text-blue-800">
            Retry
          </button>
        }
      />
    );
  }

  return (
    <Card title="Cross-Component Failure Flow" className="mb-4">
      <div style={{ marginBottom: '16px' }}>
        <Space>
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

      {/* Legend */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <Space>
          <Tag color="blue">Receiver Ports (Input)</Tag>
          <Tag color="gold">Provider Ports (Output)</Tag>
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

      <div style={{ 
        height: '600px', 
        border: '1px solid #d9d9d9', 
        borderRadius: '4px',
        position: 'relative',
        opacity: isCreatingCausation ? 0.7 : 1,
        pointerEvents: isCreatingCausation ? 'none' : 'auto'
      }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionLineType={ConnectionLineType.Straight}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
} 