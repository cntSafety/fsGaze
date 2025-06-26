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
import { Card, Typography, Space, Tag, Button, message, Spin, Alert, Tooltip, Modal } from 'antd';
import { NodeCollapseOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import { SafetyGraphData } from '@/app/services/neo4j/queries/safety/types';
import { deleteCausationNode, createCausationBetweenFailureModes } from '@/app/services/neo4j/queries/safety/causation';
import { getLayoutedElements } from '../services/diagramLayoutService';
import InteractiveSmoothStepEdge from './InteractiveSmoothStepEdge';
import { getAsilColor } from '@/app/components/asilColors';

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
          {receiverPorts.map((port: any) => (
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
              {port.failureModes.map((failure: any, index: number) => (
                <div key={`${failure.uuid}-${index}`} style={{ position: 'relative', marginBottom: '2px' }}>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`failure-${port.uuid}-${failure.uuid}`}
                    style={{
                      background: '#3B82F6',
                      width: '8px',
                      height: '8px',
                      left: '-20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: '1px solid white',
                      zIndex: 10
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
                    <span style={{
                      fontWeight: 'bold',
                      color: '#CC5500' // Dark orange color
                    }}>
                      {failure.name.replace(/_/g, ' ')}
                    </span>
                    {failure.asil && <Tag 
                      color={getAsilColor(failure.asil)}
                      style={{ 
                        fontSize: '8px', 
                        marginLeft: '4px',
                        border: 'none',
                        padding: '1px 4px',
                        lineHeight: '1'
                      }}
                    >
                      {failure.asil}
                    </Tag>}
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
          {providerPorts.map((port: any) => (
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
              {port.failureModes.map((failure: any, index: number) => (
                <div key={`${failure.uuid}-${index}`} style={{ position: 'relative', marginBottom: '2px' }}>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`failure-${port.uuid}-${failure.uuid}`}
                    style={{
                      background: '#F59E0B',
                      width: '8px',
                      height: '8px',
                      right: '-20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: '1px solid white',
                      zIndex: 10
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
                    {failure.asil && <Tag 
                      color={getAsilColor(failure.asil)}
                      style={{ 
                        fontSize: '8px', 
                        marginRight: '4px',
                        border: 'none',
                        padding: '1px 4px',
                        lineHeight: '1'
                      }}
                    >
                      {failure.asil}
                    </Tag>}
                    <span style={{
                      fontWeight: 'bold',
                      color: '#CC5500' // Dark orange color
                    }}>
                      {failure.name.replace(/_/g, ' ')}
                    </span>
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
        {receiverPorts.reduce((sum: number, port: any) => sum + port.failureModes.length, 0)} in / {providerPorts.reduce((sum: number, port: any) => sum + port.failureModes.length, 0)} out
      </div>
    </div>
  );
}

export default function CrossCompFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingCausation, setIsCreatingCausation] = useState(false);
  
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    edgeId: string;
    causationUuid: string;
    causationName: string;
  } | null>(null);

  const nodeTypes: NodeTypes = useMemo(() => ({
    swComponent: SwComponentNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    interactive: InteractiveSmoothStepEdge,
  }), []);

  const buildFlowDiagram = (safetyGraph: SafetyGraphData) => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const swComponents = new Map<string, any>();

    safetyGraph.occurrences.forEach(occ => {
        if (!occ.occuranceSourceArxmlPath || !occ.occuranceSourceLabels) return;

        const pathParts = occ.occuranceSourceArxmlPath.split('/');
        const componentName = pathParts[2];
        const portName = pathParts[3];

        // If there's no port name, this is an internal failure, so we skip it.
        if (!portName) {
            return;
        }

        const portType = occ.occuranceSourceLabels.includes('P_PORT_PROTOTYPE') ? 'provider' : 'receiver';

        if (!swComponents.has(componentName)) {
            swComponents.set(componentName, {
                uuid: componentName,
                name: componentName,
                providerPorts: [],
                receiverPorts: [],
            });
        }

        const component = swComponents.get(componentName);
        const portArray = portType === 'provider' ? component.providerPorts : component.receiverPorts;
        
        let port = portArray.find((p: any) => p.name === portName);
        if (!port) {
            port = {
                uuid: occ.occuranceSourceUuid,
                name: portName,
                failureModes: [],
            };
            portArray.push(port);
        }

        const failure = safetyGraph.failures.find(f => f.uuid === occ.failureUuid);
        if (failure) {
            port.failureModes.push({
                uuid: failure.uuid,
                name: failure.properties.name,
                asil: failure.properties.asil,
                description: failure.properties.description,
            });
        }
    });

    Array.from(swComponents.values()).forEach(comp => {
        // Create a mapping from handle IDs to failure UUIDs for robust lookup
        const handleToFailureMap = new Map<string, string>();
        
        // Map provider port failure handles
        comp.providerPorts.forEach((port: any) => {
            port.failureModes.forEach((failure: any) => {
                const handleId = `failure-${port.uuid}-${failure.uuid}`;
                handleToFailureMap.set(handleId, failure.uuid);
            });
        });
        
        // Map receiver port failure handles
        comp.receiverPorts.forEach((port: any) => {
            port.failureModes.forEach((failure: any) => {
                const handleId = `failure-${port.uuid}-${failure.uuid}`;
                handleToFailureMap.set(handleId, failure.uuid);
            });
        });

        nodes.push({
            id: comp.uuid,
            type: 'swComponent',
            position: { x: 0, y: 0 },
            data: {
                component: comp,
                providerPorts: comp.providerPorts,
                receiverPorts: comp.receiverPorts,
                handleToFailureMap: handleToFailureMap, // Add the mapping to node data
            },
        });
    });

    if (safetyGraph.causationLinks) {
        safetyGraph.causationLinks.forEach((causation, index) => {
            const causeOccurrences = safetyGraph.occurrences.filter(o => o.failureUuid === causation.causeFailureUuid);
            const effectOccurrences = safetyGraph.occurrences.filter(o => o.failureUuid === causation.effectFailureUuid);

            causeOccurrences.forEach((causeOcc, causeIndex) => {
                effectOccurrences.forEach((effectOcc, effectIndex) => {
                    if (causeOcc?.occuranceSourceArxmlPath && effectOcc?.occuranceSourceArxmlPath) {
                        
                        // Ensure we only link failures that are on ports
                        if (!causeOcc.occuranceSourceArxmlPath.split('/')[3] || !effectOcc.occuranceSourceArxmlPath.split('/')[3]) {
                            return;
                        }

                        const causeComponent = swComponents.get(causeOcc.occuranceSourceArxmlPath.split('/')[2]);
                        const effectComponent = swComponents.get(effectOcc.occuranceSourceArxmlPath.split('/')[2]);

                        if (causeComponent && effectComponent) {
                            const sourceHandle = `failure-${causeOcc.occuranceSourceUuid}-${causeOcc.failureUuid}`;
                            const targetHandle = `failure-${effectOcc.occuranceSourceUuid}-${effectOcc.failureUuid}`;
                            
                            edges.push({
                                id: `causation-${causation.causationUuid}-${causeOcc.occuranceSourceUuid}-${effectOcc.occuranceSourceUuid}`,
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
            });
        });
    }
    return { nodes, edges };
  };

  const loadDataAndLayout = useCallback(async () => {
    setLoading(true);
    const safetyData = await getSafetyGraph();
    console.log("safetyData::::", safetyData);
    
    if (safetyData.success && safetyData.data) {
      const { nodes: initialNodes, edges: initialEdges } = buildFlowDiagram(safetyData.data);
      if(initialNodes.length > 0) {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } else {
        setNodes([]);
        setEdges([]);
      }
    } else {
      message.error("Failed to load safety graph data.");
    }
    setLoading(false);
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadDataAndLayout();
  }, [loadDataAndLayout]);

  const onConnect = useCallback(async (params: Connection) => {
    if (isCreatingCausation) return;

    // Find source and target nodes to get their handle mappings
    const sourceNode = nodes.find(node => node.id === params.source);
    const targetNode = nodes.find(node => node.id === params.target);

    if (!sourceNode || !targetNode) {
        message.error('Could not find source or target component node.');
        return;
    }

    // Get failure UUIDs from the handle mappings stored in node data
    const sourceHandleMap = sourceNode.data.handleToFailureMap as Map<string, string>;
    const targetHandleMap = targetNode.data.handleToFailureMap as Map<string, string>;

    const sourceFailureUuid = sourceHandleMap?.get(params.sourceHandle || '');
    const targetFailureUuid = targetHandleMap?.get(params.targetHandle || '');



    if (!sourceFailureUuid || !targetFailureUuid) {
        message.error('Could not determine source or target failure mode from handle mapping.');
        return;
    }
    
    setIsCreatingCausation(true);
    message.loading({ content: 'Creating causation...', key: 'create-causation' });
    
    try {
      const result = await createCausationBetweenFailureModes(sourceFailureUuid, targetFailureUuid);
      if (result.success && result.causationUuid) {
        message.success({ content: 'Causation created successfully!', key: 'create-causation', duration: 2 });
        
        // Instead of reloading, add the new edge to the state
        const newEdge = {
          id: `causation-${result.causationUuid}`,
          source: params.source!,
          target: params.target!,
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
          type: 'interactive',
          animated: false,
          style: {
            strokeWidth: 1.5,
            stroke: '#94a3b8', // A neutral slate color
          },
          markerEnd: {
              type: MarkerType.ArrowClosed,
          },
          data: {
              causationUuid: result.causationUuid,
              causationName: result.message, // Using the message as a placeholder for name
              type: 'causation'
          }
        };

        setEdges((eds) => addEdge(newEdge, eds));
      } else {
        message.error({ content: `Failed to create causation: ${result.message}`, key: 'create-causation', duration: 4 });
      }
    } catch (error) {
      message.error({ content: 'An error occurred while creating causation.', key: 'create-causation', duration: 4 });
    } finally {
      setIsCreatingCausation(false);
    }
  }, [isCreatingCausation, nodes, setEdges]);

  const hideContextMenu = useCallback(() => setContextMenu(null), []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
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

  const handleDeleteCausation = useCallback(async () => {
    if (!contextMenu) return;

    message.loading({ content: 'Deleting causation...', key: 'delete-causation' });
    try {
      const result = await deleteCausationNode(contextMenu.causationUuid);
      if (result.success) {
        message.success({ content: 'Causation deleted successfully!', key: 'delete-causation', duration: 2 });
        // Instead of reloading, remove the edge from the state
        setEdges((eds) => eds.filter((edge) => edge.id !== contextMenu.edgeId));
      } else {
        message.error({ content: `Failed to delete causation: ${result.message}`, key: 'delete-causation', duration: 4 });
      }
    } catch (error) {
      message.error({ content: 'An error occurred while deleting causation.', key: 'delete-causation', duration: 4 });
    } finally {
      hideContextMenu();
    }
  }, [contextMenu, hideContextMenu, setEdges]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ height: '80vh', width: '100%', position: 'relative' }} onClick={hideContextMenu}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeContextMenu={onEdgeContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ 
            padding: 0.1,
            includeHiddenNodes: false,
            minZoom: 0.1,
            maxZoom: 1.2
          }}
          proOptions={{ hideAttribution: true }}
          connectionLineType={ConnectionLineType.Straight}
          minZoom={0.1}
          maxZoom={2}
        >
          <Panel position="top-right">
            <Space>
              <Button onClick={loadDataAndLayout} icon={<ReloadOutlined />} size="small">
                Reload Layout
              </Button>
            </Space>
          </Panel>
          <Background />
          <Controls />
        </ReactFlow>

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
              <Text strong>Delete Causation</Text>
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