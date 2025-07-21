'use client';
// Arch Viewer supports display of all ports
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { TreeSelect, Spin, Typography, Row, Col, Card, Button, Space } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UsergroupAddOutlined, LinkOutlined } from '@ant-design/icons';
import ReactFlow, {
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    ReactFlowProvider,
    Node,
    Edge,
    NodeMouseHandler,
    EdgeMouseHandler,
    Handle,
    Position,
    NodeTypes
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import Link from 'next/link';
import { getAsilColor } from '@/app/components/asilColors';

import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getProviderPortsForSWComponent, getReceiverPortsForSWComponent, getPartnerPort } from '@/app/services/neo4j/queries/ports';
import { PortInfo } from '@/app/services/neo4j/types';
import { getFailuresAndCountsForComponents } from '@/app/services/neo4j/queries/safety/failureModes';

const { Title, Text } = Typography;

const getAsilColorWithOpacity = (asil: string, opacity: number = 0.6) => {
    const baseColor = getAsilColor(asil);
    if (baseColor.startsWith('rgb(')) {
        return `rgba(${baseColor.substring(4, baseColor.length - 1)}, ${opacity})`;
    }
    return baseColor; // Fallback for any other color format
};

const CustomNode = ({ data }: { data: { label: string, component: SWComponent, providerPorts: PortInfo[], receiverPorts: PortInfo[] } }) => {
    return (
        <div style={{ padding: '10px', minHeight: '60px', position: 'relative' }}>
            {/* Receiver ports on the left */}
            {data.receiverPorts.map((port, index) => (
                <Handle
                    key={`receiver-${port.uuid}`}
                    type="target"
                    position={Position.Left}
                    id={port.uuid}
                    style={{ 
                        top: `${20 + (index * 15)}px`,
                        background: '#555',
                        width: '8px',
                        height: '8px'
                    }}
                    isConnectable={true}
                />
            ))}
            
            <div style={{ textAlign: 'center', padding: '5px 0' }}>
                {data.label}
            </div>
            
            {/* Provider ports on the right */}
            {data.providerPorts.map((port, index) => (
                <Handle
                    key={`provider-${port.uuid}`}
                    type="source"
                    position={Position.Right}
                    id={port.uuid}
                    style={{ 
                        top: `${20 + (index * 15)}px`,
                        background: '#555',
                        width: '8px',
                        height: '8px'
                    }}
                    isConnectable={true}
                />
            ))}
        </div>
    );
};

const nodeTypes: NodeTypes = {
    custom: CustomNode,
};

const getTextColorForBackground = (rgba: string) => {
    const rgb = rgba.match(/\d+/g);
    if (!rgb) return '#000000';
    // Formula to determine perceived brightness
    const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
    return brightness > 125 ? '#000000' : '#FFFFFF';
};

interface SWComponent {
  uuid: string;
  name: string;
  componentType: string;
  arxmlPath: string;
  asil: string;
}

type DetailViewItem = SWComponent | PortInfo | null;

interface TreeNode {
  title: string;
  value: string;
  key: string;
  children?: TreeNode[];
}

const COMPOSITION_SW_COMPONENT_TYPE = 'COMPOSITION-SW-COMPONENT-TYPE';

const elk = new ELK();

const elkLayout = async (nodes: Node[], edges: Edge[]): Promise<{nodes: Node[], edges: Edge[]}> => {
    if (nodes.length === 0) return { nodes, edges };

    const elkGraph = {
        id: "root",
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.spacing.nodeNode": "80",
            "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "80",
        },
        children: nodes.map(node => ({
            id: node.id,
            width: parseInt(String(node.style?.minWidth)) || 150,
            height: parseInt(String(node.style?.height)) || 80
        })),
        edges: edges.map(edge => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target]
        }))
    };

    try {
        const layout = await elk.layout(elkGraph);
        const newNodes = nodes.map(node => {
            const elkNode = layout.children?.find(child => child.id === node.id);
            return {
                ...node,
                position: { x: elkNode?.x ?? 0, y: elkNode?.y ?? 0 },
            };
        });
        return { nodes: newNodes, edges };
    } catch (error) {
        console.error('ELK layout failed:', error);
        return { nodes, edges };
    }
};

const DetailView = ({ item, portToComponentMap, allComponents }: { item: DetailViewItem, portToComponentMap: Map<string,string>, allComponents: SWComponent[] }) => {
    if (!item) {
        return (
            <Card title="Details">
                <Text>Select a component or port to see details.</Text>
            </Card>
        );
    }

    if ('componentType' in item) { // It's a SWComponent
        return (
            <Card title={item.name}>
                <p><Text strong>UUID:</Text> {item.uuid}</p>
                <p><Text strong>Type:</Text> {item.componentType}</p>
                <p><Text strong>ARXML Path:</Text> {item.arxmlPath}</p>
            </Card>
        );
    } else { // It's a PortInfo
        const componentUuid = portToComponentMap.get(item.uuid);
        const component = allComponents.find(c => c.uuid === componentUuid);
        return (
             <Card title={item.name}>
                <p><Text strong>UUID:</Text> {item.uuid}</p>
                <p><Text strong>Type:</Text> {item.type}</p>
                {component && <p><Text strong>Component:</Text> {component.name}</p>}
            </Card>
        )
    }
};

const ArchViewer = () => {
  const [loading, setLoading] = useState(true);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [allComponents, setAllComponents] = useState<SWComponent[]>([]);
  const [allPorts, setAllPorts] = useState<PortInfo[]>([]);
  const [connections, setConnections] = useState<Map<string, string>>(new Map());
  const [portToComponentMap, setPortToComponentMap] = useState<Map<string, string>>(new Map());
  const [selectedItem, setSelectedItem] = useState<DetailViewItem>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; top: number; left: number; } | null>(null);
  const animatedEdgeIdsRef = useRef<string[]>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const componentsResult = await getApplicationSwComponents();
        if (!componentsResult.success) {
          throw new Error(componentsResult.message);
        }
        
        const allDbComponents = componentsResult.data;
        const componentUuids = allDbComponents.map(c => c.uuid);
        const failuresResult = await getFailuresAndCountsForComponents(componentUuids);

        const failuresByComponent = new Map<string, any[]>();
        if (failuresResult.success && failuresResult.data) {
          for (const failure of failuresResult.data) {
            if (!failuresByComponent.has(failure.swComponentUuid)) {
              failuresByComponent.set(failure.swComponentUuid, []);
            }
            failuresByComponent.get(failure.swComponentUuid)!.push(failure);
          }
        }

        const asilOrder: { [key: string]: number } = { 'QM': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'TBC': -1 };
        const getHighestAsil = (failures: any[]): string => {
          if (!failures || failures.length === 0) return 'N/A';
          return failures.reduce((highest, current) => {
            const currentAsil = current.asil || 'TBC';
            const highestAsil = highest || 'TBC';
            if ((asilOrder[currentAsil] ?? -1) > (asilOrder[highestAsil] ?? -1)) {
              return currentAsil;
            }
            return highest;
          }, 'TBC');
        };

        const augmentedComponents: SWComponent[] = allDbComponents.map((component: any) => {
            const componentFailures = failuresByComponent.get(component.uuid) || [];
            return {
                ...component,
                asil: getHighestAsil(componentFailures)
            };
        });

        const filteredComponents = augmentedComponents.filter(
          (c: SWComponent) => c.componentType !== COMPOSITION_SW_COMPONENT_TYPE
        );
        
        setAllComponents(filteredComponents);

        const newConnections = new Map<string, string>();
        const newPortToComponentMap = new Map<string, string>();
        const allPortsList: PortInfo[] = [];

        // Fetch ports and connections for all components
        for (const component of filteredComponents) {
            const [providerPortsResult, receiverPortsResult] = await Promise.all([
              getProviderPortsForSWComponent(component.uuid),
              getReceiverPortsForSWComponent(component.uuid),
            ]);

            if (!providerPortsResult.success || !receiverPortsResult.success) {
                console.error(`Failed to fetch ports for ${component.name}`);
                continue;
            }

            const componentPorts = [...(providerPortsResult.data || []), ...(receiverPortsResult.data || [])];
            allPortsList.push(...componentPorts);
            
            componentPorts.forEach(port => {
                newPortToComponentMap.set(port.uuid, component.uuid);
            });

            // Fetch partner connections for each port
            for (const port of componentPorts) {
              const partnerResult = await getPartnerPort(port.uuid) as any;
              
              if (partnerResult.records && partnerResult.records.length > 0) {
                  const record = partnerResult.records[0];
                  const partnerPortUUID = record.get('partnerPortUUID');
                  if (partnerPortUUID) {
                    newConnections.set(port.uuid, partnerPortUUID);
                  }
              }
            }
        }

        setConnections(newConnections);
        setPortToComponentMap(newPortToComponentMap);
        setAllPorts(allPortsList);
      } catch (error) {
        console.error('Failed to fetch architecture data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const createVisualization = useCallback(() => {
    console.log('Creating visualization...');
    console.log('Total components:', allComponents.length);
    console.log('Total ports:', allPorts.length);
    console.log('Total connections:', connections.size);

    // Show ALL components, no filtering

    // Show ALL components, no filtering
    const componentPorts = new Map<string, { provider: PortInfo[], receiver: PortInfo[] }>();
    
    for (const component of allComponents) {
        const providerPorts = allPorts.filter(p => 
            portToComponentMap.get(p.uuid) === component.uuid && p.type === 'P_PORT_PROTOTYPE'
        );
        const receiverPorts = allPorts.filter(p => 
            portToComponentMap.get(p.uuid) === component.uuid && p.type === 'R_PORT_PROTOTYPE'
        );
        
        componentPorts.set(component.uuid, {
            provider: providerPorts,
            receiver: receiverPorts
        });
    }

    const newNodes: Node[] = allComponents.map(c => {
        const backgroundColor = getAsilColorWithOpacity(c.asil);
        const ports = componentPorts.get(c.uuid) || { provider: [], receiver: [] };
        const nodeHeight = Math.max(80, 40 + Math.max(ports.provider.length, ports.receiver.length) * 15);
        
        return {
            id: c.uuid,
            type: 'custom',
            data: { 
                label: c.name, 
                component: c,
                providerPorts: ports.provider,
                receiverPorts: ports.receiver
            },
            position: { x: 0, y: 0 },
            style: {
                backgroundColor: backgroundColor,
                color: getTextColorForBackground(backgroundColor),
                border: '1px solid #555',
                borderRadius: 4,
                height: nodeHeight,
                minWidth: 150
            }
        }
    });
    
    // Create direct port-to-port connections for ALL components
    const newEdges: Edge[] = [];
    let edgeCount = 0;
    const processedConnections = new Set<string>(); // Track unique connections to prevent duplicates
    
    connections.forEach((targetPortUuid, sourcePortUuid) => {
        const sourcePort = allPorts.find(p => p.uuid === sourcePortUuid);
        const targetPort = allPorts.find(p => p.uuid === targetPortUuid);

        if (!sourcePort || !targetPort) {
            console.log('Missing port:', { sourcePortUuid, targetPortUuid, sourcePort: !!sourcePort, targetPort: !!targetPort });
            return;
        }
        
        // Determine the correct direction: Provider -> Receiver
        let providerPort: PortInfo;
        let receiverPort: PortInfo;
        let providerPortUuid: string;
        let receiverPortUuid: string;
        
        if (sourcePort.type === 'P_PORT_PROTOTYPE' && targetPort.type === 'R_PORT_PROTOTYPE') {
            // Normal direction: source is provider, target is receiver
            providerPort = sourcePort;
            receiverPort = targetPort;
            providerPortUuid = sourcePortUuid;
            receiverPortUuid = targetPortUuid;
        } else if (sourcePort.type === 'R_PORT_PROTOTYPE' && targetPort.type === 'P_PORT_PROTOTYPE') {
            // Reverse direction: target is provider, source is receiver
            providerPort = targetPort;
            receiverPort = sourcePort;
            providerPortUuid = targetPortUuid;
            receiverPortUuid = sourcePortUuid;
        } else {
            // Skip connections that don't match expected port types
            const sourceComponentUuid = portToComponentMap.get(sourcePortUuid);
            const targetComponentUuid = portToComponentMap.get(targetPortUuid);
            const sourceComponent = allComponents.find(c => c.uuid === sourceComponentUuid);
            const targetComponent = allComponents.find(c => c.uuid === targetComponentUuid);
            
            console.log('Unexpected port types:', { 
                sourceType: sourcePort.type, 
                targetType: targetPort.type,
                sourcePortUuid: sourcePortUuid,
                targetPortUuid: targetPortUuid,
                sourcePortName: sourcePort.name,
                targetPortName: targetPort.name,
                sourceComponent: sourceComponent?.name || 'Unknown',
                targetComponent: targetComponent?.name || 'Unknown',
                sourceComponentUuid: sourceComponentUuid,
                targetComponentUuid: targetComponentUuid
            });
            return;
        }

        // Create unique connection ID to prevent duplicates
        const connectionId = `${providerPortUuid}->${receiverPortUuid}`;
        
        if (processedConnections.has(connectionId)) {
            //console.log('Duplicate connection skipped:', connectionId);
            return;
        }
        
        processedConnections.add(connectionId);

        const providerComponentUuid = portToComponentMap.get(providerPortUuid);
        const receiverComponentUuid = portToComponentMap.get(receiverPortUuid);

        if (!providerComponentUuid || !receiverComponentUuid) {
            console.log('Missing component mapping:', { providerPortUuid, receiverPortUuid, providerComponentUuid, receiverComponentUuid });
            return;
        }

        if (providerComponentUuid === receiverComponentUuid) {
            console.log('Self connection skipped:', { providerComponentUuid, receiverComponentUuid });
            return;
        }
        
        edgeCount++;
        const edge = {
            id: connectionId,
            source: providerComponentUuid,
            target: receiverComponentUuid,
            sourceHandle: providerPortUuid,
            targetHandle: receiverPortUuid,
            animated: true,
            style: {
                strokeWidth: 1.5
            },
            data: {
                sourcePort: providerPort,
                targetPort: receiverPort
            }
        };
        
        newEdges.push(edge);
        
        if (edgeCount <= 5) { // Log first few edges for debugging
            console.log(`Edge ${edgeCount}:`, {
                id: edge.id,
                source: providerComponentUuid,
                target: receiverComponentUuid,
                sourceHandle: providerPortUuid,
                targetHandle: receiverPortUuid,
                providerComponent: allComponents.find(c => c.uuid === providerComponentUuid)?.name,
                receiverComponent: allComponents.find(c => c.uuid === receiverComponentUuid)?.name
            });
        }
    });

    console.log(`Created ${edgeCount} edges from ${connections.size} connections`);

    elkLayout(newNodes, newEdges).then(({nodes: layoutedNodes, edges: layoutedEdges}) => {
        console.log('Layout complete:', { nodes: layoutedNodes.length, edges: layoutedEdges.length });
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    });
  }, [allComponents, allPorts, connections, portToComponentMap, setNodes, setEdges]);

  // Auto-create visualization when data is loaded
  useEffect(() => {
    if (allComponents.length > 0 && allPorts.length > 0 && connections.size > 0) {
      createVisualization();
    }
  }, [allComponents, allPorts, connections, createVisualization]);

  const handleSelectionChange = useCallback((newSelectedValues: string[]) => {
    const lastSelected = newSelectedValues[newSelectedValues.length - 1];
    const component = allComponents.find(c => c.uuid === lastSelected);
    setSelectedItem(component || null);

    // No longer recreating the visualization on selection change
    // The visualization is now static and shows all components

  }, [allComponents]);

  const onNodeDragStart: NodeMouseHandler = useCallback((_event, _node) => {
    setEdges(currentEdges => {
        animatedEdgeIdsRef.current = currentEdges.filter(e => e.animated).map(e => e.id);
        return currentEdges.map(e => ({ ...e, animated: false }));
    });
  }, [setEdges]);

  const onNodeDragStop: NodeMouseHandler = useCallback((_event, _node) => {
      setEdges(currentEdges => {
          const animatedIds = new Set(animatedEdgeIdsRef.current);
          return currentEdges.map(e => ({ ...e, animated: animatedIds.has(e.id) }));
      });
  }, [setEdges]);

  const handleShowPartners = useCallback(() => {
    // This function could be enhanced to highlight partner components
    // For now, just close the context menu
    setContextMenu(null);
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
      const component = allComponents.find(c => c.uuid === node.id);
      if(component) {
        setSelectedItem(component);
      }

      const connectedEdges = edges.filter(e => e.source === node.id || e.target === node.id);
      const partnerNodeIds = new Set(
        connectedEdges.flatMap(e => [e.source, e.target])
      );

      setNodes(nds =>
        nds.map(n => ({
          ...n,
          style: { ...n.style, opacity: partnerNodeIds.has(n.id) ? 1 : 0.3, transition: 'opacity 0.2s' }
        }))
      );

      setEdges(eds =>
        eds.map(e => {
            const isConnected = e.source === node.id || e.target === node.id;
            return {
                ...e,
                style: {
                    ...e.style,
                    opacity: isConnected ? 1 : 0.3,
                    transition: 'opacity 0.2s',
                }
            }
        })
      );

  }, [allComponents, edges, setNodes, setEdges]);

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({
        id: node.id,
        top: event.clientY,
        left: event.clientX,
    });
  }, []);

  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
      setEdges(eds =>
          eds.map(e => {
              const isSelected = e.id === edge.id;
              return {
                  ...e,
                  animated: isSelected,
                  style: {
                      ...e.style,
                      stroke: isSelected ? '#ff0072' : undefined,
                      strokeWidth: isSelected ? 2.5 : undefined,
                      opacity: isSelected ? 1 : 0.5,
                      transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s',
                  }
              };
          })
      );
      setNodes(nds =>
          nds.map(n => {
              const isConnected = n.id === edge.source || n.id === edge.target;
              return {
                  ...n,
                  style: {
                      ...n.style,
                      opacity: isConnected ? 1 : 0.3,
                      transition: 'opacity 0.2s',
                  }
              };
          })
      );
      setSelectedItem(null);
  }, [setEdges, setNodes]);

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => {
    event.preventDefault();
    // Simple edge context menu removed for now - could show port details here
  }, []);

  const onPaneClick = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        style: { ...n.style, opacity: 1, transition: 'opacity 0.2s' },
      }))
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: {
            ...e.style,
            stroke: undefined,
            strokeWidth: undefined,
            opacity: 1,
            transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s'
        },
        animated: true,
      }))
    );
    setSelectedItem(null);
    setContextMenu(null);
  }, [setNodes, setEdges]);


  if (loading) {
    return <div className="flex justify-center items-center h-full"><Spin size="large" /></div>;
  }

  return (
    <Row gutter={16} style={{ padding: '24px', height: '80vh' }}>
        {isPanelVisible && (
            <Col span={6}>
                <Title level={4}>Component Details</Title>
                <div style={{marginTop: '20px'}}>
                    <DetailView item={selectedItem} portToComponentMap={portToComponentMap} allComponents={allComponents} />
                </div>
                <div style={{ marginTop: '20px' }}>
                    <Card title="Instructions" size="small">
                        <Text>Click on a component to see its connections highlighted. All components and their connections are always visible.</Text>
                    </Card>
                </div>
            </Col>
        )}
        <Col span={isPanelVisible ? 18 : 24} style={{position: 'relative', height: '100%'}}>
            <Button
                icon={isPanelVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                onClick={() => setIsPanelVisible(!isPanelVisible)}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 10
                }}
            />
             <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={onPaneClick}
                    onNodeContextMenu={onNodeContextMenu}
                    onEdgeContextMenu={onEdgeContextMenu}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDragStop={onNodeDragStop}
                    fitView
                    minZoom={0.1}
                    nodeTypes={nodeTypes}
                >
                    <Controls />
                    <Background />
                </ReactFlow>
            </ReactFlowProvider>
        </Col>
        {contextMenu && (
            <div
                style={{
                    position: 'absolute',
                    top: contextMenu.top,
                    left: contextMenu.left,
                    zIndex: 1000,
                    background: 'white',
                    border: '1px solid #ddd',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                <Button
                    type="text"
                    icon={<UsergroupAddOutlined />}
                    onClick={handleShowPartners}
                >
                    Show Partners
                </Button>
                <Link href={contextMenu ? `/arxml-safety/${contextMenu.id}` : '#'} legacyBehavior>
                    <a onClick={() => setContextMenu(null)} style={{ textDecoration: 'none' }}>
                        <Button
                            type="text"
                            icon={<LinkOutlined />}
                            style={{width: '100%', textAlign: 'left'}}
                        >
                            Go to component
                        </Button>
                    </a>
                </Link>
            </div>
        )}
    </Row>
  );
};

const ArchViewerWrapper = () => (
    <ReactFlowProvider>
        <ArchViewer />
    </ReactFlowProvider>
)

export default ArchViewerWrapper;