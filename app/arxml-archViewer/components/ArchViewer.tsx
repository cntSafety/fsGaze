'use client';
// Arch Viewer supports display of all ports
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { TreeSelect, Spin, Typography, Row, Col, Card, Button, Space } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UsergroupAddOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons';
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
    NodeTypes,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import Link from 'next/link';
import { getAsilColor } from '@/app/components/asilColors';

import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getProviderPortsForSWComponent, getReceiverPortsForSWComponent, getPartnerPortsForComponents } from '@/app/services/neo4j/queries/ports';
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

interface FailureData {
  swComponentUuid: string;
  asil?: string;
  [key: string]: any;
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

const ArchViewerInner = () => {
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [allComponents, setAllComponents] = useState<SWComponent[]>([]);
  const [allPorts, setAllPorts] = useState<PortInfo[]>([]);
  const [connections, setConnections] = useState<Map<string, string>>(new Map());
  const [portToComponentMap, setPortToComponentMap] = useState<Map<string, string>>(new Map());
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<DetailViewItem>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; top: number; left: number; } | null>(null);
  const animatedEdgeIdsRef = useRef<string[]>([]);
  
  const { fitView } = useReactFlow();
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
        const allComponentUuids = allDbComponents.map((c: any) => c.uuid);
        const failuresResult = await getFailuresAndCountsForComponents(allComponentUuids);

        const failuresByComponent = new Map<string, FailureData[]>();
        if (failuresResult.success && failuresResult.data) {
          for (const failure of failuresResult.data) {
            if (!failuresByComponent.has(failure.swComponentUuid)) {
              failuresByComponent.set(failure.swComponentUuid, []);
            }
            failuresByComponent.get(failure.swComponentUuid)!.push(failure);
          }
        }

        const asilOrder: { [key: string]: number } = { 'QM': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'TBC': -1 };
        const getHighestAsil = (failures: FailureData[]): string => {
          if (!failures || failures.length === 0) return 'N/A';
          return failures.reduce((highest: string, current: FailureData) => {
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

        // Filter out COMPOSITION_SW_COMPONENT_TYPE as they are not needed for visualization
        const filteredComponents = augmentedComponents.filter(
          (c: SWComponent) => c.componentType !== COMPOSITION_SW_COMPONENT_TYPE
        );
        
        setAllComponents(filteredComponents);
        
        // Don't load ports and connections initially - only when user selects components
        setConnections(new Map());
        setPortToComponentMap(new Map());
        setAllPorts([]);
        
        // Start with no components selected - user will choose what to visualize
        setSelectedComponentIds([]);
      } catch (error) {
        console.error('Failed to fetch architecture data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Function to load ports and connections for selected components
  const loadComponentData = useCallback(async (componentIds: string[]) => {
    if (componentIds.length === 0) {
      setConnections(new Map());
      setPortToComponentMap(new Map());
      setAllPorts([]);
      return;
    }

    try {
      setLoadingData(true);
      const selectedComponents = allComponents.filter(c => componentIds.includes(c.uuid));

      const newConnections = new Map<string, string>();
      const newPortToComponentMap = new Map<string, string>();
      const allPortsList: PortInfo[] = [];

      // Fetch ports for selected components
      for (const component of selectedComponents) {
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
          
          componentPorts.forEach((port: PortInfo) => {
              newPortToComponentMap.set(port.uuid, component.uuid);
          });
      }

      // Fetch partner connections for selected components
      const partnerResult = await getPartnerPortsForComponents(componentIds);
      
      if (partnerResult && typeof partnerResult === 'object' && 'records' in partnerResult && 
          Array.isArray(partnerResult.records)) {
          partnerResult.records.forEach(record => {
            if (record && typeof record.get === 'function') {
              const sourcePortUUID = record.get('sourcePortUUID');
              const partnerPortUUID = record.get('partnerPortUUID');
              if (sourcePortUUID && partnerPortUUID) {
                newConnections.set(sourcePortUUID, partnerPortUUID);
              }
            }
          });
      }

      setConnections(newConnections);
      setPortToComponentMap(newPortToComponentMap);
      setAllPorts(allPortsList);
    } catch (error) {
      console.error('Failed to load component data:', error);
    } finally {
      setLoadingData(false);
    }
  }, [allComponents]);

  // Load component data when selection changes
  useEffect(() => {
    loadComponentData(selectedComponentIds);
  }, [selectedComponentIds, loadComponentData]);

  // Create tree data for component selection
  const treeData = useMemo((): TreeNode[] => {
    const componentsByType = new Map<string, SWComponent[]>();
    
    // Group components by type
    allComponents.forEach(component => {
      if (!componentsByType.has(component.componentType)) {
        componentsByType.set(component.componentType, []);
      }
      componentsByType.get(component.componentType)!.push(component);
    });

    // Create tree structure
    return Array.from(componentsByType.entries()).map(([type, components]) => ({
      title: `${type} (${components.length})`,
      value: `type-${type}`,
      key: `type-${type}`,
      children: components.map(component => ({
        title: component.name,
        value: component.uuid,
        key: component.uuid
      }))
    }));
  }, [allComponents]);

  const handleSelectAll = useCallback(() => {
    setSelectedComponentIds(allComponents.map(c => c.uuid));
  }, [allComponents]);

  const handleClearSelection = useCallback(() => {
    setSelectedComponentIds([]);
  }, []);

  const handleTreeSelectionChange = useCallback((selectedValues: string[]) => {
    // Filter out type nodes (they start with 'type-')
    const componentIds = selectedValues.filter(value => !value.startsWith('type-'));
    setSelectedComponentIds(componentIds);
  }, []);

  const createVisualization = useCallback(() => {
    // console.log('Creating visualization...');
    // console.log('Total components:', allComponents.length);
    // console.log('Selected components:', selectedComponentIds.length);
    // console.log('Total ports:', allPorts.length);
    // console.log('Total connections:', connections.size);

    // Filter to only show selected components
    const selectedComponents: SWComponent[] = allComponents.filter((c: SWComponent) => selectedComponentIds.includes(c.uuid));
    
    if (selectedComponents.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Debug: Log all connections to see the pattern
    // console.log('All connections:');
    // Array.from(connections.entries()).slice(0, 10).forEach(([source, target]) => {
    //   const sourcePort = allPorts.find(p => p.uuid === source);
    //   const targetPort = allPorts.find(p => p.uuid === target);
    //   console.log(`${source} (${sourcePort?.type}) -> ${target} (${targetPort?.type})`);
    // });

    const componentPorts = new Map<string, { provider: PortInfo[], receiver: PortInfo[] }>();
    
    for (const component of selectedComponents) {
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

    const newNodes: Node[] = selectedComponents.map((c: SWComponent) => {
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
    
    // Create direct port-to-port connections only between selected components
    const selectedComponentUuids: string[] = selectedComponents.map((c: SWComponent) => c.uuid);
    const newEdges: Edge[] = [];
    let edgeCount = 0;
    const processedConnections = new Set<string>(); // Track unique connections to prevent duplicates
    
    // console.log('Processing connections...');
    connections.forEach((targetPortUuid, sourcePortUuid) => {
        const sourcePort = allPorts.find(p => p.uuid === sourcePortUuid);
        const targetPort = allPorts.find(p => p.uuid === targetPortUuid);

        if (!sourcePort || !targetPort) {
            // console.log('Missing port:', { sourcePortUuid, targetPortUuid, sourcePort: !!sourcePort, targetPort: !!targetPort });
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
            // console.log('Reversing connection direction:', {
            //     sourcePortUuid,
            //     targetPortUuid
            // });
            providerPort = targetPort;
            receiverPort = sourcePort;
            providerPortUuid = targetPortUuid;
            receiverPortUuid = sourcePortUuid;
        } else {
            //Skip connections that don't match expected port types
            const sourceComponentUuid = portToComponentMap.get(sourcePortUuid);
            const targetComponentUuid = portToComponentMap.get(targetPortUuid);
            const sourceComponent = allComponents.find(c => c.uuid === sourceComponentUuid);
            const targetComponent = allComponents.find(c => c.uuid === targetComponentUuid);
            
            // console.log('Unexpected port types:', { 
            //     sourceType: sourcePort.type, 
            //     targetType: targetPort.type,
            //     sourcePortUuid: sourcePortUuid,
            //     targetPortUuid: targetPortUuid,
            //     sourcePortName: sourcePort.name,
            //     targetPortName: targetPort.name,
            //     sourceComponent: sourceComponent?.name || 'Unknown',
            //     targetComponent: targetComponent?.name || 'Unknown',
            //     sourceComponentUuid: sourceComponentUuid,
            //     targetComponentUuid: targetComponentUuid
            // });
            return;
        }

        // Create bidirectional connection ID to prevent duplicates
        // Always put the lexicographically smaller UUID first to ensure consistency
        const sortedIds = [providerPortUuid, receiverPortUuid].sort();
        const connectionId = `${sortedIds[0]}<->${sortedIds[1]}`;
        
        if (processedConnections.has(connectionId)) {
            // console.log('Duplicate connection skipped:', {
            //     connectionId,
            //     originalMapping: `${sourcePortUuid}->${targetPortUuid}`,
            //     providerPort: providerPort.name,
            //     receiverPort: receiverPort.name
            // });
            return;
        }
        
        processedConnections.add(connectionId);

        const providerComponentUuid = portToComponentMap.get(providerPortUuid);
        const receiverComponentUuid = portToComponentMap.get(receiverPortUuid);

        if (!providerComponentUuid || !receiverComponentUuid) {
            // console.log('Missing component mapping:', { providerPortUuid, receiverPortUuid, providerComponentUuid, receiverComponentUuid });
            return;
        }

        // Only show connections between selected components
        if (!selectedComponentUuids.includes(providerComponentUuid) || !selectedComponentUuids.includes(receiverComponentUuid)) {
            return;
        }

        if (providerComponentUuid === receiverComponentUuid) {
            // console.log('Self connection skipped:', { providerComponentUuid, receiverComponentUuid });
            return;
        }
        
        edgeCount++;
        const edge = {
            id: `${providerComponentUuid}->${receiverComponentUuid}-${edgeCount}`, // Include edge count to make truly unique
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
                targetPort: receiverPort,
                connectionMapping: `${sourcePortUuid}->${targetPortUuid}`
            }
        };
        
        newEdges.push(edge);
        
        // if (edgeCount <= 10) { // Log first 10 edges for debugging
        //     console.log(`Edge ${edgeCount}:`, {
        //         id: edge.id,
        //         source: providerComponentUuid,
        //         target: receiverComponentUuid,
        //         sourceHandle: providerPortUuid,
        //         targetHandle: receiverPortUuid,
        //         providerComponent: allComponents.find(c => c.uuid === providerComponentUuid)?.name,
        //         receiverComponent: allComponents.find(c => c.uuid === receiverComponentUuid)?.name,
        //         originalMapping: `${sourcePortUuid}->${targetPortUuid}`,
        //         connectionId
        //     });
        // }
    });

    // console.log(`Created ${edgeCount} edges from ${connections.size} connections`);
    // console.log(`Processed connections size: ${processedConnections.size}`);

    elkLayout(newNodes, newEdges).then(({nodes: layoutedNodes, edges: layoutedEdges}) => {
        // console.log('Layout complete:', { nodes: layoutedNodes.length, edges: layoutedEdges.length });
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        
        // Fit view to new nodes after a short delay to ensure rendering is complete
        setTimeout(() => {
          if (layoutedNodes.length > 0) {
            fitView({ padding: 0.1, duration: 800 });
          }
        }, 100);
    });
  }, [allComponents, allPorts, connections, portToComponentMap, selectedComponentIds, setNodes, setEdges, fitView]);

  // Auto-create visualization when component selection changes and data is loaded
  useEffect(() => {
    if (selectedComponentIds.length > 0 && allComponents.length > 0) {
      createVisualization();
    } else if (selectedComponentIds.length === 0) {
      // Clear visualization when no components selected
      setNodes([]);
      setEdges([]);
    }
  }, [allComponents, allPorts, connections, selectedComponentIds, createVisualization]);

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
      const component = allComponents.find((c: SWComponent) => c.uuid === node.id);
      if(component) {
        setSelectedItem(component);
      }

      const connectedEdges = edges.filter((e: Edge) => e.source === node.id || e.target === node.id);
      const partnerNodeIds = new Set(
        connectedEdges.flatMap((e: Edge) => [e.source, e.target])
      );

      setNodes((nds: Node[]) =>
        nds.map((n: Node) => ({
          ...n,
          style: { ...n.style, opacity: partnerNodeIds.has(n.id) ? 1 : 0.3, transition: 'opacity 0.2s' }
        }))
      );

      setEdges((eds: Edge[]) =>
        eds.map((e: Edge) => {
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

  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
      setEdges((eds: Edge[]) =>
          eds.map((e: Edge) => {
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
      setNodes((nds: Node[]) =>
          nds.map((n: Node) => {
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



  const handleShowPartners = useCallback(async () => {
    if (!contextMenu) return;
    
    const nodeId = contextMenu.id;
    
    try {
      // Get fresh partner data for this specific component
      const partnerResult = await getPartnerPortsForComponents([nodeId]);
      
      const allPartnerComponentIds = new Set<string>();
      allPartnerComponentIds.add(nodeId); // Include the original component
      
      if (partnerResult && typeof partnerResult === 'object' && 'records' in partnerResult && 
          Array.isArray(partnerResult.records)) {
          
          // First, get all ports for this component to build a comprehensive partner list
          const componentPorts = allPorts.filter(port => 
            portToComponentMap.get(port.uuid) === nodeId
          );
          
          // If we don't have ports loaded for this component, load them
          if (componentPorts.length === 0) {
            const component = allComponents.find(c => c.uuid === nodeId);
            if (component) {
              const [providerPortsResult, receiverPortsResult] = await Promise.all([
                getProviderPortsForSWComponent(component.uuid),
                getReceiverPortsForSWComponent(component.uuid),
              ]);
              
              if (providerPortsResult.success && receiverPortsResult.success) {
                const componentPortsList = [...(providerPortsResult.data || []), ...(receiverPortsResult.data || [])];
                componentPortsList.forEach((port: PortInfo) => {
                  portToComponentMap.set(port.uuid, component.uuid);
                });
                allPorts.push(...componentPortsList);
                setPortToComponentMap(new Map(portToComponentMap));
                setAllPorts([...allPorts]);
              }
            }
          }
          
          // Process partner connections from the fresh query result
          partnerResult.records.forEach(record => {
            if (record && typeof record.get === 'function') {
              const sourcePortUUID = record.get('sourcePortUUID');
              const partnerPortUUID = record.get('partnerPortUUID');
              const partnerPortOwnerUUID = record.get('partnerPortOwnerUUID');
              
              if (partnerPortOwnerUUID) {
                allPartnerComponentIds.add(partnerPortOwnerUUID);
              }
            }
          });
      }
      
      // Update the selection to show only the component and its partners
      const partnerComponentArray = Array.from(allPartnerComponentIds);
      setSelectedComponentIds(partnerComponentArray);
      
      // Close the context menu
      setContextMenu(null);
      
    } catch (error) {
      console.error('Failed to load partners:', error);
      setContextMenu(null);
    }
  }, [contextMenu, allPorts, portToComponentMap, allComponents, setSelectedComponentIds]);

  const handleRemoveComponent = useCallback(() => {
    if (!contextMenu) return;
    
    const nodeId = contextMenu.id;
    
    // Remove the component from the selection
    setSelectedComponentIds(prevIds => prevIds.filter(id => id !== nodeId));
    
    // Close the context menu
    setContextMenu(null);
    
    // console.log(`Removed component from view:`, {
    //   removedComponent: allComponents.find(c => c.uuid === nodeId)?.name,
    //   remainingCount: selectedComponentIds.length - 1
    // });
  }, [contextMenu, selectedComponentIds, allComponents, setSelectedComponentIds]);

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({
        id: node.id,
        top: event.clientY,
        left: event.clientX,
    });
  }, []);

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => {
    event.preventDefault();
    // Simple edge context menu removed for now - could show port details here
  }, []);

  const onNodeDragStart: NodeMouseHandler = useCallback((event, node) => {
    // Optional: Add any logic when node drag starts
  }, []);

  const onNodeDragStop: NodeMouseHandler = useCallback((event, node) => {
    // Optional: Add any logic when node drag stops
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
                <Title level={4}>Component Selection</Title>
                <div style={{ marginBottom: '16px' }}>
                    <Space>
                        <Button onClick={handleSelectAll} size="small">
                            Select All
                        </Button>
                        <Button onClick={handleClearSelection} size="small">
                            Clear Selection
                        </Button>
                    </Space>
                </div>
                <TreeSelect
                    treeData={treeData}
                    value={selectedComponentIds}
                    onChange={handleTreeSelectionChange}
                    treeCheckable
                    showCheckedStrategy={TreeSelect.SHOW_PARENT}
                    placeholder="Select components to display"
                    style={{ width: '100%', marginBottom: '16px' }}
                    maxTagCount="responsive"
                    treeDefaultExpandAll
                    disabled={loadingData}
                />
                <div style={{ marginTop: '20px' }}>
                    <Card title="Information" size="small">
                        {loadingData ? (
                            <div style={{ textAlign: 'center' }}>
                                <Spin size="small" />
                                <Text style={{ marginLeft: '8px' }}>Loading component data...</Text>
                            </div>
                        ) : (
                            <>
                                <Text>Selected: {selectedComponentIds.length} / {allComponents.length} components</Text>
                                <br />
                                {selectedComponentIds.length === 0 ? (
                                    <Text style={{ fontSize: '12px', color: '#666' }}>
                                        Select components from the tree above to visualize their connections.
                                    </Text>
                                ) : (
                                    <Text style={{ fontSize: '12px', color: '#666' }}>
                                        Only connections between selected components are shown.
                                    </Text>
                                )}
                            </>
                        )}
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
                minZoom={0.1}
                nodeTypes={nodeTypes}
            >
                <Controls />
                <Background />
            </ReactFlow>
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
                <Button
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={handleRemoveComponent}
                    danger
                >
                    Remove from Diagram
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

const ArchViewer = () => (
    <ReactFlowProvider>
        <ArchViewerInner />
    </ReactFlowProvider>
);

export default ArchViewer;