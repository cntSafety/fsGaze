'use client';
// Arch Viewer supports display of all ports
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { TreeSelect, Spin, Typography, Card, Button, Space, Dropdown, Menu, Input, notification, Collapse, Switch, Badge, Modal, Descriptions, List, Tag } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UsergroupAddOutlined, LinkOutlined, DeleteOutlined, InfoCircleOutlined, SaveOutlined, UploadOutlined, CopyOutlined, ExpandOutlined, NodeIndexOutlined } from '@ant-design/icons';
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
import { useTheme } from '@/app/components/ThemeProvider';

import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getPartnerPortsForComponentsOptimized, getAllPortsForComponents } from '@/app/services/neo4j/queries/ports';
import { PortInfo } from '@/app/services/neo4j/types';
import { getFailuresAndCountsForComponents } from '@/app/services/neo4j/queries/safety/failureModes';
import DetailsModal from './DetailsModal';

const { Title, Text } = Typography;

const getAsilColorWithOpacity = (asil: string, opacity: number = 0.7) => {
    const baseColor = getAsilColor(asil);
    if (baseColor.startsWith('rgb(')) {
        return `rgba(${baseColor.substring(4, baseColor.length - 1)}, ${opacity})`;
    }
    return baseColor; // Fallback for any other color format
};

const CustomNode = ({ data }: { data: CondensedNodeData & { condensed?: boolean } }) => {
    const { condensed = false } = data;
    
    if (condensed) {
        // Condensed view: single handles per side
        return (
            <div style={{ 
                width: '100%',
                height: '100%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 12px',
                boxSizing: 'border-box',
                minHeight: '60px'
            }}>
                {/* Single input handle if component has incoming connections */}
                {data.hasReceiverConnections && (
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={`${data.component.uuid}-input`}
                        style={{ 
                            left: '-6px',
                            background: '#52c41a',
                            border: '2px solid #ffffff',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%'
                        }}
                        isConnectable={true}
                    />
                )}
                
        {/* Component name (counts removed for condensed view) */}
        <div style={{ 
          textAlign: 'center',
          fontSize: '12px',
          fontWeight: 600,
          color: 'inherit',
          wordBreak: 'break-word',
          lineHeight: '1.2'
        }}>
          {data.label}
        </div>
                
                {/* Single output handle if component has outgoing connections */}
                {data.hasProviderConnections && (
                    <Handle
                        type="source"
                        position={Position.Right}
                        id={`${data.component.uuid}-output`}
                        style={{ 
                            right: '-6px',
                            background: '#1890ff',
                            border: '2px solid #ffffff',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%'
                        }}
                        isConnectable={true}
                    />
                )}
            </div>
        );
    } else {
        // Detailed view: individual port handles (original behavior)
        const maxPorts = Math.max(data.providerPorts.length, data.receiverPorts.length);
        const nodeHeight = Math.max(60, 30 + maxPorts * 15);
        
        return (
            <div style={{ 
                width: '100%',
                height: '100%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 12px',
                boxSizing: 'border-box'
            }}>
                {/* Receiver ports on the left */}
                {data.receiverPorts.map((port, index) => (
                    <Handle
                        key={`receiver-${port.uuid}`}
                        type="target"
                        position={Position.Left}
                        id={port.uuid}
                        style={{ 
                            top: `${25 + (index * 15)}px`,
                            left: '-4px',
                            background: '#6b7280',
                            border: '2px solid #ffffff',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%'
                        }}
                        isConnectable={true}
                    />
                ))}
                
                <div style={{ 
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'inherit',
                    wordBreak: 'break-word',
                    lineHeight: '1.2'
                }}>
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
                            top: `${25 + (index * 15)}px`,
                            right: '-4px',
                            background: '#6b7280',
                            border: '2px solid #ffffff',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%'
                        }}
                        isConnectable={true}
                    />
                ))}
            </div>
        );
    }
};

const nodeTypes: NodeTypes = {
    custom: CustomNode,
};

const getTextColorForBackground = (rgba: string) => {
    const rgb = rgba.match(/\d+/g);
    if (!rgb) return 'var(--ant-color-text, #000000)';
    // Formula to determine perceived brightness
    const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
    return brightness > 125 ? 'var(--ant-color-text, #000000)' : 'var(--ant-color-text-base, #ffffff)';
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

interface ConnectionGroup {
  sourceComponentId: string;
  targetComponentId: string;
  connections: Array<{
    sourcePortId: string;
    targetPortId: string;
    sourcePort: PortInfo;
    targetPort: PortInfo;
  }>;
  connectionCount: number;
}

interface CondensedNodeData {
  label: string;
  component: SWComponent;
  providerPorts: PortInfo[];
  receiverPorts: PortInfo[];
  hasProviderConnections: boolean;
  hasReceiverConnections: boolean;
  connectionCounts: {
    outgoing: number;
    incoming: number;
  };
}

const COMPOSITION_SW_COMPONENT_TYPE = 'COMPOSITION_SW_COMPONENT_TYPE';

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
            width: parseInt(String(node.style?.width)) || 150,
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
  const { themeMode } = useTheme();
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [allComponents, setAllComponents] = useState<SWComponent[]>([]);
  const [allPorts, setAllPorts] = useState<PortInfo[]>([]);
  const [connections, setConnections] = useState<Map<string, string>>(new Map());
  const [portToComponentMap, setPortToComponentMap] = useState<Map<string, string>>(new Map());
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [pendingComponentIds, setPendingComponentIds] = useState<string[]>([]);
  const [componentSelectionText, setComponentSelectionText] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<DetailViewItem>(null);
  const [condensedView, setCondensedView] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; top: number; left: number; type: 'node' | 'edge'; edgeData?: any } | null>(null);
  const [detailsModal, setDetailsModal] = useState<{
    isVisible: boolean;
    componentUuid: string | null;
    componentName: string | null;
    connectionInfo: {
      sourcePort: PortInfo;
      targetPort: PortInfo;
      sourceComponent: string;
      targetComponent: string;
    } | null;
  }>({
    isVisible: false,
    componentUuid: null,
    componentName: null,
    connectionInfo: null
  });
  const [connectionDetailsModal, setConnectionDetailsModal] = useState<{
    isVisible: boolean;
    sourceComponent: SWComponent | null;
    targetComponent: SWComponent | null;
    connections: Array<{
      sourcePortId: string;
      targetPortId: string;
      sourcePort: PortInfo;
      targetPort: PortInfo;
    }>;
  }>({
    isVisible: false,
    sourceComponent: null,
    targetComponent: null,
    connections: []
  });
  const animatedEdgeIdsRef = useRef<string[]>([]);
  
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Check for mobile screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsPanelVisible(false); // Auto-hide panel on mobile
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

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
      
      // ⏱️ Performance Measurement: Start timing
      const startTime = performance.now();
      console.log(`🚀 Loading component data for ${componentIds.length} components...`);
      
      const selectedComponents = allComponents.filter(c => componentIds.includes(c.uuid));

      const newConnections = new Map<string, string>();
      const newPortToComponentMap = new Map<string, string>();
      const allPortsList: PortInfo[] = [];

      // ⏱️ Performance Measurement: Port fetching phase
      const portFetchStart = performance.now();
      
      // SUPER OPTIMIZED: Single batch query to get all ports for all components at once
      const allPortsResult = await getAllPortsForComponents(componentIds);
      
      const portFetchEnd = performance.now();
      console.log(`⚡ Batch port fetching completed in ${(portFetchEnd - portFetchStart).toFixed(2)}ms (single query for all components)`);

      // Process the batch port results
      if (allPortsResult.success && allPortsResult.data) {
        allPortsResult.data.forEach((ports: PortInfo[], componentUuid: string) => {
          allPortsList.push(...ports);
          ports.forEach((port: PortInfo) => {
            newPortToComponentMap.set(port.uuid, componentUuid);
          });
        });
        
        console.log(`📦 Processed ${allPortsList.length} ports across ${allPortsResult.data.size} components`);
      } else {
        console.error('Batch port fetch failed - no fallback available');
        throw new Error('Failed to load port data');
      }

      // ⏱️ Performance Measurement: Partner connection fetching phase
      const connectionFetchStart = performance.now();
      
      // SUPER OPTIMIZED: Try the optimized assembly connector query first
      console.log(`🚀 Executing OPTIMIZED connection fetching...`);
      
      const partnerResult = await getPartnerPortsForComponentsOptimized(componentIds);
      console.log(`✅ OPTIMIZED query completed successfully`);
      
      const connectionFetchEnd = performance.now();
      const connectionFetchTime = connectionFetchEnd - connectionFetchStart;
      console.log(`⚡ Partner connection fetching completed in ${connectionFetchTime.toFixed(2)}ms`);
      
      // ⏱️ Performance Measurement: Connection processing phase
      const connectionProcessingStart = performance.now();
      
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
      
      const connectionProcessingEnd = performance.now();
      const connectionProcessingTime = connectionProcessingEnd - connectionProcessingStart;
      console.log(`⚡ Connection processing completed in ${connectionProcessingTime.toFixed(2)}ms`);

      setConnections(newConnections);
      setPortToComponentMap(newPortToComponentMap);
      setAllPorts(allPortsList);
      
      // ⏱️ Performance Measurement: Total time
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      console.log(`✅ Component data loading completed in ${totalTime.toFixed(2)}ms total`);
      console.log(`📊 DETAILED Performance breakdown:
        - Port fetching: ${(portFetchEnd - portFetchStart).toFixed(2)}ms (${((portFetchEnd - portFetchStart) / totalTime * 100).toFixed(1)}%)
        - Connection fetching: ${connectionFetchTime.toFixed(2)}ms (${(connectionFetchTime / totalTime * 100).toFixed(1)}%)
        - Connection processing: ${connectionProcessingTime.toFixed(2)}ms (${(connectionProcessingTime / totalTime * 100).toFixed(1)}%)
        - Other processing: ${(totalTime - (portFetchEnd - portFetchStart) - connectionFetchTime - connectionProcessingTime).toFixed(2)}ms
        - Components processed: ${selectedComponents.length}
        - Total ports loaded: ${allPortsList.length}
        - Total connections found: ${newConnections.size}
        - PORT OPTIMIZATION: Used SINGLE BATCH QUERY for port fetching
        - CONNECTION OPTIMIZATION: Used OPTIMIZED ASSEMBLY CONNECTOR query
        - Connection efficiency: ${newConnections.size > 0 ? (newConnections.size / connectionFetchTime * 1000).toFixed(0) : 0} connections/second
        - Overall efficiency: ${((allPortsList.length + newConnections.size) / totalTime * 1000).toFixed(0)} total records/second`);
        
    } catch (error) {
      console.error('Failed to load component data:', error);
    } finally {
      setLoadingData(false);
    }
  }, [allComponents]);

  // Load component data when components are loaded
  useEffect(() => {
    loadComponentData(selectedComponentIds);
  }, [selectedComponentIds, loadComponentData]);

  // Update text field when selection changes
  useEffect(() => {
    setComponentSelectionText(selectedComponentIds.join(', '));
  }, [selectedComponentIds]);

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
    const allIds = allComponents.map(c => c.uuid);
    setSelectedComponentIds(allIds);
    setPendingComponentIds(allIds);
  }, [allComponents]);

  const handleClearSelection = useCallback(() => {
    setSelectedComponentIds([]);
    setPendingComponentIds([]);
  }, []);

  // Handle loading component IDs from text input
  const handleLoadFromText = useCallback(() => {
    if (!componentSelectionText.trim()) {
      notification.warning({
        message: 'No Input',
        description: 'Please enter component UUIDs in the text field.',
      });
      return;
    }

    const inputIds = componentSelectionText
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (inputIds.length === 0) {
      notification.warning({
        message: 'Invalid Input',
        description: 'Please enter valid component UUIDs separated by commas.',
      });
      return;
    }

    // Validate that the IDs exist in available components
    const validIds = inputIds.filter(id => 
      allComponents.some(component => component.uuid === id)
    );

    const invalidIds = inputIds.filter(id => 
      !allComponents.some(component => component.uuid === id)
    );

    if (invalidIds.length > 0) {
      notification.warning({
        message: 'Some Components Not Found',
        description: `${invalidIds.length} component(s) were not found and will be ignored. ${validIds.length} valid components will be selected.`,
      });
    }

    if (validIds.length > 0) {
      setSelectedComponentIds(validIds);
      setPendingComponentIds(validIds);
      notification.success({
        message: 'Components Loaded',
        description: `Successfully loaded ${validIds.length} component(s) from text input.`,
      });
    } else {
      notification.error({
        message: 'No Valid Components',
        description: 'None of the provided UUIDs match available components.',
      });
    }
  }, [componentSelectionText, allComponents]);

  // Handle copying current selection to clipboard
  const handleCopySelection = useCallback(async () => {
    if (selectedComponentIds.length === 0) {
      notification.warning({
        message: 'No Selection',
        description: 'No components are currently selected.',
      });
      return;
    }

    const selectionText = selectedComponentIds.join(', ');
    
    try {
      await navigator.clipboard.writeText(selectionText);
      notification.success({
        message: 'Copied to Clipboard',
        description: `${selectedComponentIds.length} component UUIDs copied to clipboard.`,
      });
    } catch (error) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = selectionText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      notification.success({
        message: 'Copied to Clipboard',
        description: `${selectedComponentIds.length} component UUIDs copied to clipboard.`,
      });
    }
  }, [selectedComponentIds]);

  const handleTreeSelectionChange = useCallback((selectedValues: string[]) => {
    // Filter out type nodes (they start with 'type-')
    const componentIds = selectedValues.filter(value => !value.startsWith('type-'));
    // Only update pending state, don't trigger diagram update yet
    setPendingComponentIds(componentIds);
  }, []);

  // Handle when TreeSelect dropdown closes - commit the pending selection
  const handleTreeDropdownVisibleChange = useCallback((open: boolean) => {
    if (!open && pendingComponentIds !== selectedComponentIds) {
      // Dropdown closed and selection has changed, commit the changes
      setSelectedComponentIds(pendingComponentIds);
    }
  }, [pendingComponentIds, selectedComponentIds]);

  // Helper function to create condensed connections from detailed connections
  const createCondensedConnections = useCallback((
    allConnections: Map<string, string>,
    selectedComponents: SWComponent[]
  ): Map<string, ConnectionGroup> => {
    const componentConnections = new Map<string, ConnectionGroup>();
    const selectedComponentUuids = selectedComponents.map(c => c.uuid);
    
    allConnections.forEach((targetPortUuid, sourcePortUuid) => {
      const sourcePort = allPorts.find(p => p.uuid === sourcePortUuid);
      const targetPort = allPorts.find(p => p.uuid === targetPortUuid);
      
      if (!sourcePort || !targetPort) return;
      
      const sourceCompId = portToComponentMap.get(sourcePortUuid);
      const targetCompId = portToComponentMap.get(targetPortUuid);
      
      if (!sourceCompId || !targetCompId) return;
      if (!selectedComponentUuids.includes(sourceCompId) || !selectedComponentUuids.includes(targetCompId)) return;
      if (sourceCompId === targetCompId) return;
      
      // Determine correct direction based on port types
      let providerCompId: string, receiverCompId: string;
      let providerPort: PortInfo, receiverPort: PortInfo;
      
      if (sourcePort.type === 'P_PORT_PROTOTYPE' && targetPort.type === 'R_PORT_PROTOTYPE') {
        providerCompId = sourceCompId;
        receiverCompId = targetCompId;
        providerPort = sourcePort;
        receiverPort = targetPort;
      } else if (sourcePort.type === 'R_PORT_PROTOTYPE' && targetPort.type === 'P_PORT_PROTOTYPE') {
        providerCompId = targetCompId;
        receiverCompId = sourceCompId;
        providerPort = targetPort;
        receiverPort = sourcePort;
      } else {
        return; // Skip invalid connections
      }
      
      const connectionKey = `${providerCompId}->${receiverCompId}`;
      
      if (!componentConnections.has(connectionKey)) {
        componentConnections.set(connectionKey, {
          sourceComponentId: providerCompId,
          targetComponentId: receiverCompId,
          connections: [],
          connectionCount: 0
        });
      }
      
      const group = componentConnections.get(connectionKey)!;
      group.connections.push({
        sourcePortId: sourcePortUuid,
        targetPortId: targetPortUuid,
        sourcePort: providerPort,
        targetPort: receiverPort
      });
      group.connectionCount++;
    });
    
    return componentConnections;
  }, [allPorts, portToComponentMap]);

  // Helper function to calculate connection counts for condensed nodes
  const calculateConnectionCounts = useCallback((
    componentId: string,
    connectionGroups: Map<string, ConnectionGroup>
  ) => {
    let outgoing = 0;
    let incoming = 0;
    
    connectionGroups.forEach((group) => {
      if (group.sourceComponentId === componentId) {
        outgoing += group.connectionCount;
      }
      if (group.targetComponentId === componentId) {
        incoming += group.connectionCount;
      }
    });
    
    return { outgoing, incoming };
  }, []);

  const createVisualization = useCallback(() => {
    // Filter to only show selected components
    const selectedComponents: SWComponent[] = allComponents.filter((c: SWComponent) => selectedComponentIds.includes(c.uuid));
    
    if (selectedComponents.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

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

    if (condensedView) {
      // Create condensed view
      const connectionGroups = createCondensedConnections(connections, selectedComponents);
      
      const newNodes: Node[] = selectedComponents.map((c: SWComponent) => {
        const backgroundColor = getAsilColorWithOpacity(c.asil);
        const ports = componentPorts.get(c.uuid) || { provider: [], receiver: [] };
        const connectionCounts = calculateConnectionCounts(c.uuid, connectionGroups);
        
        // Check if component has connections
        const hasProviderConnections = Array.from(connectionGroups.values())
          .some(group => group.sourceComponentId === c.uuid);
        const hasReceiverConnections = Array.from(connectionGroups.values())
          .some(group => group.targetComponentId === c.uuid);
        
        const nodeWidth = Math.max(150, c.name.length * 8 + 60); // Extra space for badges
        const nodeHeight = 80; // Fixed height for condensed view
        
        return {
          id: c.uuid,
          type: 'custom',
          data: { 
            label: c.name, 
            component: c,
            providerPorts: ports.provider,
            receiverPorts: ports.receiver,
            hasProviderConnections,
            hasReceiverConnections,
            connectionCounts,
            condensed: true
          } as CondensedNodeData & { condensed: boolean },
          position: { x: 0, y: 0 },
          style: {
            backgroundColor: backgroundColor,
            color: getTextColorForBackground(backgroundColor),
            border: '2px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '8px',
            width: nodeWidth,
            height: nodeHeight,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            fontSize: '12px',
            fontWeight: '600'
          }
        };
      });

      // Create condensed edges
      const newEdges: Edge[] = Array.from(connectionGroups.values()).map((group) => {
        const strokeWidth = Math.min(2 + group.connectionCount * 0.5, 8);
        return {
          id: `${group.sourceComponentId}->${group.targetComponentId}`,
          source: group.sourceComponentId,
          target: group.targetComponentId,
          sourceHandle: `${group.sourceComponentId}-output`,
          targetHandle: `${group.targetComponentId}-input`,
          style: {
            strokeWidth,
            opacity: Math.min(0.7 + group.connectionCount * 0.05, 1)
          },
          // label removed in condensed view; stroke color left default like detailed view
          data: {
            connectionGroup: group,
            isCondensed: true
          },
          animated: true
        };
      });

      elkLayout(newNodes, newEdges).then(({nodes: layoutedNodes, edges: layoutedEdges}) => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        
        setTimeout(() => {
          if (layoutedNodes.length > 0) {
            fitView({ padding: 0.1, duration: 800 });
          }
        }, 100);
      });

    } else {
      // Create detailed view (original behavior)
      const newNodes: Node[] = selectedComponents.map((c: SWComponent) => {
        const backgroundColor = getAsilColorWithOpacity(c.asil);
        const ports = componentPorts.get(c.uuid) || { provider: [], receiver: [] };
        const maxPorts = Math.max(ports.provider.length, ports.receiver.length);
        const nodeHeight = Math.max(80, 50 + maxPorts * 15);
        const nodeWidth = Math.max(150, c.name.length * 8 + 40);
        
        return {
          id: c.uuid,
          type: 'custom',
          data: { 
            label: c.name, 
            component: c,
            providerPorts: ports.provider,
            receiverPorts: ports.receiver,
            hasProviderConnections: false,
            hasReceiverConnections: false,
            connectionCounts: { incoming: 0, outgoing: 0 },
            condensed: false
          } as CondensedNodeData & { condensed: boolean },
          position: { x: 0, y: 0 },
          style: {
            backgroundColor: backgroundColor,
            color: getTextColorForBackground(backgroundColor),
            border: '2px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '8px',
            width: nodeWidth,
            height: nodeHeight,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            fontSize: '12px',
            fontWeight: '600'
          }
        };
      });
      
      // Create detailed edges (original logic)
      const selectedComponentUuids: string[] = selectedComponents.map((c: SWComponent) => c.uuid);
      const newEdges: Edge[] = [];
      let edgeCount = 0;
      const processedConnections = new Set<string>();
      
      connections.forEach((targetPortUuid, sourcePortUuid) => {
        const sourcePort = allPorts.find(p => p.uuid === sourcePortUuid);
        const targetPort = allPorts.find(p => p.uuid === targetPortUuid);

        if (!sourcePort || !targetPort) return;
        
        let providerPort: PortInfo;
        let receiverPort: PortInfo;
        let providerPortUuid: string;
        let receiverPortUuid: string;
        
        if (sourcePort.type === 'P_PORT_PROTOTYPE' && targetPort.type === 'R_PORT_PROTOTYPE') {
          providerPort = sourcePort;
          receiverPort = targetPort;
          providerPortUuid = sourcePortUuid;
          receiverPortUuid = targetPortUuid;
        } else if (sourcePort.type === 'R_PORT_PROTOTYPE' && targetPort.type === 'P_PORT_PROTOTYPE') {
          providerPort = targetPort;
          receiverPort = sourcePort;
          providerPortUuid = targetPortUuid;
          receiverPortUuid = sourcePortUuid;
        } else {
          return;
        }

        const sortedIds = [providerPortUuid, receiverPortUuid].sort();
        const connectionId = `${sortedIds[0]}<->${sortedIds[1]}`;
        
        if (processedConnections.has(connectionId)) return;
        processedConnections.add(connectionId);

        const providerComponentUuid = portToComponentMap.get(providerPortUuid);
        const receiverComponentUuid = portToComponentMap.get(receiverPortUuid);

        if (!providerComponentUuid || !receiverComponentUuid) return;
        if (!selectedComponentUuids.includes(providerComponentUuid) || !selectedComponentUuids.includes(receiverComponentUuid)) return;
        if (providerComponentUuid === receiverComponentUuid) return;
        
        edgeCount++;
        const edge = {
          id: `${providerComponentUuid}->${receiverComponentUuid}-${edgeCount}`,
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
            connectionMapping: `${sourcePortUuid}->${targetPortUuid}`,
            isCondensed: false
          }
        };
        
        newEdges.push(edge);
      });

      elkLayout(newNodes, newEdges).then(({nodes: layoutedNodes, edges: layoutedEdges}) => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        
        setTimeout(() => {
          if (layoutedNodes.length > 0) {
            fitView({ padding: 0.1, duration: 800 });
          }
        }, 100);
      });
    }
  }, [allComponents, allPorts, connections, portToComponentMap, selectedComponentIds, condensedView, createCondensedConnections, calculateConnectionCounts, setNodes, setEdges, fitView]);

  // Auto-create visualization when component selection changes and data is loaded
  useEffect(() => {
    if (selectedComponentIds.length > 0 && allComponents.length > 0) {
      createVisualization();
    } else if (selectedComponentIds.length === 0) {
      // Clear visualization when no components selected
      setNodes([]);
      setEdges([]);
    }
  }, [allComponents, allPorts, connections, selectedComponentIds, condensedView, createVisualization]);

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
      // Check if this is a condensed edge
      if (edge.data?.isCondensed) {
        const group = edge.data.connectionGroup as ConnectionGroup;
        
        // Show detailed connection modal for condensed edge
        setConnectionDetailsModal({
          isVisible: true,
          sourceComponent: allComponents.find(c => c.uuid === group.sourceComponentId) || null,
          targetComponent: allComponents.find(c => c.uuid === group.targetComponentId) || null,
          connections: group.connections
        });
      }

      // Standard edge highlighting behavior
      setEdges((eds: Edge[]) =>
          eds.map((e: Edge) => {
              const isSelected = e.id === edge.id;
              return {
                  ...e,
                  animated: isSelected,
                  style: {
                      ...e.style,
                      stroke: isSelected ? 'var(--ant-color-primary, #1677ff)' : undefined,
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
  }, [setEdges, setNodes, allComponents]);



  const handleShowPartners = useCallback(async () => {
    if (!contextMenu) return;
    
    const nodeId = contextMenu.id;
    
    try {
      // ⏱️ Performance Measurement: Start timing
      const startTime = performance.now();
      console.log(`🔍 Finding partners for component: ${allComponents.find(c => c.uuid === nodeId)?.name || nodeId}`);
      
      // ⏱️ Performance Measurement: Partner query phase
      const partnerQueryStart = performance.now();
      
      // SUPER OPTIMIZED: Try the optimized assembly connector query first
      console.log(`🚀 Executing OPTIMIZED partner query for single component...`);
      
      const partnerResult = await getPartnerPortsForComponentsOptimized([nodeId]);
      console.log(`✅ OPTIMIZED single component query completed successfully`);
      
      const partnerQueryEnd = performance.now();
      const partnerQueryTime = partnerQueryEnd - partnerQueryStart;
      console.log(`⚡ Partner query completed in ${partnerQueryTime.toFixed(2)}ms`);
      
      const allPartnerComponentIds = new Set<string>();
      allPartnerComponentIds.add(nodeId); // Include the original component
      
      let partnerPortsFound = 0;
      let uniquePartnersFound = 0;
      let portLoadingTime = 0;
      let partnerProcessingTime = 0;
      
      if (partnerResult && typeof partnerResult === 'object' && 'records' in partnerResult && 
          Array.isArray(partnerResult.records)) {
          
          // ⏱️ Performance Measurement: Port loading phase
          const portLoadingStart = performance.now();
          
          // OPTIMIZED: Check if we need to load ports for this component (batch check)
          const componentPorts = allPorts.filter(port => 
            portToComponentMap.get(port.uuid) === nodeId
          );
          
          // If we don't have ports loaded for this component, load them using batch query
          if (componentPorts.length === 0) {
            const component = allComponents.find(c => c.uuid === nodeId);
            if (component) {
              console.log(`📦 Loading ports for component: ${component.name}`);
              
              // OPTIMIZED: Use batch query instead of individual calls
              const batchPortResult = await getAllPortsForComponents([component.uuid]);
              
              if (batchPortResult.success && batchPortResult.data && batchPortResult.data.has(component.uuid)) {
                const componentPortsList = batchPortResult.data.get(component.uuid) || [];
                componentPortsList.forEach((port: PortInfo) => {
                  portToComponentMap.set(port.uuid, component.uuid);
                });
                allPorts.push(...componentPortsList);
                setPortToComponentMap(new Map(portToComponentMap));
                setAllPorts([...allPorts]);
                
                console.log(`✅ Batch loaded ${componentPortsList.length} ports for ${component.name}`);
              } else {
                console.error('Batch port loading failed - no fallback available');
                throw new Error(`Failed to load ports for component: ${component.name}`);
              }
            }
          }
          
          const portLoadingEnd = performance.now();
          portLoadingTime = portLoadingEnd - portLoadingStart;
          console.log(`⚡ Port loading phase completed in ${portLoadingTime.toFixed(2)}ms`);
          
          // ⏱️ Performance Measurement: Partner processing phase  
          const partnerProcessingStart = performance.now();
          
          // OPTIMIZED: Process all partner connections in a single loop (no sequential queries)
          partnerResult.records.forEach(record => {
            if (record && typeof record.get === 'function') {
              const sourcePortUUID = record.get('sourcePortUUID');
              const partnerPortUUID = record.get('partnerPortUUID');
              const partnerPortOwnerUUID = record.get('partnerPortOwnerUUID');
              
              if (partnerPortOwnerUUID) {
                const wasNew = !allPartnerComponentIds.has(partnerPortOwnerUUID);
                allPartnerComponentIds.add(partnerPortOwnerUUID);
                if (wasNew) uniquePartnersFound++;
              }
              
              if (sourcePortUUID && partnerPortUUID) {
                partnerPortsFound++;
              }
            }
          });
          
          const partnerProcessingEnd = performance.now();
          partnerProcessingTime = partnerProcessingEnd - partnerProcessingStart;
          console.log(`⚡ Partner processing completed in ${partnerProcessingTime.toFixed(2)}ms`);
      }
      
      // ⏱️ Performance Measurement: UI update phase
      const uiUpdateStart = performance.now();
      
      // Update the selection to show only the component and its partners
      const partnerComponentArray = Array.from(allPartnerComponentIds);
      setSelectedComponentIds(partnerComponentArray);
      
      // Close the context menu
      setContextMenu(null);
      
      const uiUpdateEnd = performance.now();
      const uiUpdateTime = uiUpdateEnd - uiUpdateStart;
      console.log(`⚡ UI update completed in ${uiUpdateTime.toFixed(2)}ms`);
      
      // ⏱️ Performance Measurement: Total time and summary
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      console.log(`✅ Show Partners completed in ${totalTime.toFixed(2)}ms total`);
      console.log(`📊 DETAILED Partner analysis results:
        - Partner query: ${partnerQueryTime.toFixed(2)}ms (${(partnerQueryTime / totalTime * 100).toFixed(1)}%)
        - Port loading: ${portLoadingTime.toFixed(2)}ms (${(portLoadingTime / totalTime * 100).toFixed(1)}%)
        - Partner processing: ${partnerProcessingTime.toFixed(2)}ms (${(partnerProcessingTime / totalTime * 100).toFixed(1)}%)
        - UI update: ${uiUpdateTime.toFixed(2)}ms (${(uiUpdateTime / totalTime * 100).toFixed(1)}%)
        - Components to display: ${partnerComponentArray.length}
        - Unique partners found: ${uniquePartnersFound}
        - Partner ports found: ${partnerPortsFound}
        - Original component: ${allComponents.find(c => c.uuid === nodeId)?.name || 'Unknown'}
        - QUERY OPTIMIZATION: Used OPTIMIZED ASSEMBLY CONNECTOR query
        - Query efficiency: ${partnerPortsFound > 0 ? (partnerPortsFound / partnerQueryTime * 1000).toFixed(0) : 0} partner connections/second`);
    } catch (error) {
      console.error('Failed to load partners:', error);
      setContextMenu(null);
    }
  }, [contextMenu, allPorts, portToComponentMap, allComponents, setSelectedComponentIds]);

  const handleShowComponentDetails = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'node') return;
    
    const nodeId = contextMenu.id;
    const component = allComponents.find(c => c.uuid === nodeId);
    
    if (component) {
      setDetailsModal({
        isVisible: true,
        componentUuid: component.uuid,
        componentName: component.name,
        connectionInfo: null
      });
    }
    
    setContextMenu(null);
  }, [contextMenu, allComponents]);

  const handleShowConnectionDetails = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'edge' || !contextMenu.edgeData) return;
    
    const { sourcePort, targetPort } = contextMenu.edgeData;
    const sourceComponent = allComponents.find(c => c.uuid === portToComponentMap.get(sourcePort.uuid));
    const targetComponent = allComponents.find(c => c.uuid === portToComponentMap.get(targetPort.uuid));
    
    if (sourcePort && targetPort && sourceComponent && targetComponent) {
      setDetailsModal({
        isVisible: true,
        componentUuid: null,
        componentName: null,
        connectionInfo: {
          sourcePort,
          targetPort,
          sourceComponent: sourceComponent.name,
          targetComponent: targetComponent.name
        }
      });
    }
    
    setContextMenu(null);
  }, [contextMenu, allComponents, portToComponentMap]);

  const handleCloseDetailsModal = useCallback(() => {
    setDetailsModal({
      isVisible: false,
      componentUuid: null,
      componentName: null,
      connectionInfo: null
    });
  }, []);

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

  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];
    
    if (contextMenu.type === 'node') {
      return [
        {
          key: 'show-partners',
          icon: <UsergroupAddOutlined />,
          label: 'Show Partners',
          onClick: handleShowPartners
        },
        {
          key: 'show-details',
          icon: <InfoCircleOutlined />,
          label: 'Show Component Details',
          onClick: handleShowComponentDetails
        },
        {
          key: 'go-to-component',
          icon: <LinkOutlined />,
          label: (
            <Link href={contextMenu ? `/arxml-safety/${contextMenu.id}` : '#'} legacyBehavior>
              <a onClick={() => setContextMenu(null)} style={{ textDecoration: 'none', color: 'inherit' }}>
                Go to component
              </a>
            </Link>
          )
        },
        {
          type: 'divider' as const
        },
        {
          key: 'remove-component',
          icon: <DeleteOutlined />,
          label: 'Remove from Diagram',
          danger: true,
          onClick: handleRemoveComponent
        }
      ];
    } else if (contextMenu.type === 'edge') {
      const isCondensed = contextMenu.edgeData?.isCondensed;
      
      if (isCondensed) {
        return [
          {
            key: 'expand-connections',
            icon: <ExpandOutlined />,
            label: 'Show Individual Connections',
            onClick: () => {
              if (contextMenu.edgeData?.connectionGroup) {
                const group = contextMenu.edgeData.connectionGroup as ConnectionGroup;
                setConnectionDetailsModal({
                  isVisible: true,
                  sourceComponent: allComponents.find(c => c.uuid === group.sourceComponentId) || null,
                  targetComponent: allComponents.find(c => c.uuid === group.targetComponentId) || null,
                  connections: group.connections
                });
              }
              setContextMenu(null);
            }
          },
          {
            key: 'switch-to-detailed',
            icon: <NodeIndexOutlined />,
            label: 'Switch to Detailed View',
            onClick: () => {
              setCondensedView(false);
              setContextMenu(null);
            }
          }
        ];
      } else {
        return [
          {
            key: 'show-connection-details',
            icon: <InfoCircleOutlined />,
            label: 'Show Connection Details',
            onClick: handleShowConnectionDetails
          }
        ];
      }
    }
    
    return [];
  }, [contextMenu, handleShowPartners, handleShowComponentDetails, handleRemoveComponent, handleShowConnectionDetails, allComponents, setCondensedView]);

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    
    // Get the ReactFlow container bounds to calculate relative position
    const reactFlowBounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
    const adjustedX = reactFlowBounds ? event.clientX - reactFlowBounds.left : event.clientX;
    const adjustedY = reactFlowBounds ? event.clientY - reactFlowBounds.top : event.clientY;
    
    setContextMenu({
        id: node.id,
        top: adjustedY,
        left: adjustedX,
        type: 'node'
    });
  }, []);

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => {
    event.preventDefault();
    
    // Get the ReactFlow container bounds to calculate relative position
    const reactFlowBounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
    const adjustedX = reactFlowBounds ? event.clientX - reactFlowBounds.left : event.clientX;
    const adjustedY = reactFlowBounds ? event.clientY - reactFlowBounds.top : event.clientY;
    
    setContextMenu({
        id: edge.id,
        top: adjustedY,
        left: adjustedX,
        type: 'edge',
        edgeData: edge.data
    });
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

  // Utility: compute lower→higher ASIL connections summary (grouped by component pair)
  const computeLowerToHigherAsil = useCallback(() => {
    const asilRank: Record<string, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };
    const compById = new Map(allComponents.map((c) => [c.uuid, c] as const));
    const selectedSet = new Set(selectedComponentIds);

    let inspectedConnections = 0;
    const pairKey = (a: string, b: string) => `${a} -> ${b}`;
    const byPair = new Map<string, { lower: SWComponent; higher: SWComponent; count: number }>();

    connections.forEach((targetPortUuid, sourcePortUuid) => {
      const sourcePort = allPorts.find((p) => p.uuid === sourcePortUuid);
      const targetPort = allPorts.find((p) => p.uuid === targetPortUuid);
      if (!sourcePort || !targetPort) return;

      // Normalize to provider/receiver
      let providerPort: PortInfo | undefined;
      let receiverPort: PortInfo | undefined;
      if (sourcePort.type === 'P_PORT_PROTOTYPE' && targetPort.type === 'R_PORT_PROTOTYPE') {
        providerPort = sourcePort;
        receiverPort = targetPort;
      } else if (sourcePort.type === 'R_PORT_PROTOTYPE' && targetPort.type === 'P_PORT_PROTOTYPE') {
        providerPort = targetPort;
        receiverPort = sourcePort;
      } else {
        return;
      }

      const providerCompId = providerPort ? portToComponentMap.get(providerPort.uuid) : undefined;
      const receiverCompId = receiverPort ? portToComponentMap.get(receiverPort.uuid) : undefined;
      if (!providerCompId || !receiverCompId) return;
      if (!selectedSet.has(providerCompId) || !selectedSet.has(receiverCompId)) return;
      if (providerCompId === receiverCompId) return;

      const providerComp = compById.get(providerCompId);
      const receiverComp = compById.get(receiverCompId);
      if (!providerComp || !receiverComp) return;

      const pRank = asilRank[providerComp.asil] ?? -1;
      const rRank = asilRank[receiverComp.asil] ?? -1;
      if (pRank < 0 || rRank < 0) return; // skip unknown

      inspectedConnections += 1;

      let lower: SWComponent | null = null;
      let higher: SWComponent | null = null;
      if (pRank < rRank) {
        lower = providerComp; higher = receiverComp;
      } else if (rRank < pRank) {
        lower = receiverComp; higher = providerComp;
      }
      if (!lower || !higher) return;

      const key = pairKey(lower.uuid, higher.uuid);
      const entry = byPair.get(key) ?? { lower, higher, count: 0 };
      entry.count += 1;
      byPair.set(key, entry);
    });

    return { byPair, inspectedConnections };
  }, [allComponents, allPorts, connections, portToComponentMap, selectedComponentIds]);

  // Highlight connections where a lower-ASIL component connects to a higher-ASIL component
  const handleFindLowerToHigherAsil = useCallback(() => {
    if (selectedComponentIds.length === 0) {
      console.warn('[ASIL Check] No components selected. Select components first.');
      return;
    }

    const asilRank: Record<string, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };

    const highlightedNodeIds = new Set<string>();

    setEdges((eds) => {
      const next = eds.map((e) => {
        const src = allComponents.find((c) => c.uuid === e.source);
        const tgt = allComponents.find((c) => c.uuid === e.target);
        if (!src || !tgt) {
          return {
            ...e,
            style: {
              ...e.style,
              opacity: 0.2,
              transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s'
            },
            animated: false
          };
        }
        const sRank = asilRank[src.asil] ?? -1;
        const tRank = asilRank[tgt.asil] ?? -1;
        const highlight = sRank >= 0 && tRank >= 0 && sRank !== tRank; // different levels only

        if (highlight) {
          highlightedNodeIds.add(e.source);
          highlightedNodeIds.add(e.target);
        }

        return {
          ...e,
          style: {
            ...e.style,
            stroke: highlight ? '#ff4d4f' : e.style?.stroke,
            strokeWidth: highlight ? Math.max(2.5, Number(e.style?.strokeWidth ?? 1.5) + 0.5) : e.style?.strokeWidth,
            opacity: highlight ? 1 : 0.15,
            transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s'
          },
          animated: highlight
        } as Edge;
      });

      // After computing edge highlights, dim unrelated nodes
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          style: {
            ...n.style,
            opacity: highlightedNodeIds.size === 0 ? 1 : highlightedNodeIds.has(n.id) ? 1 : 0.3,
            transition: 'opacity 0.2s'
          }
        }))
      );

      return next;
    });
  }, [allComponents, setEdges, setNodes, selectedComponentIds.length]);

  // Export CSV for the lower→higher ASIL summary
  const handleExportLowerToHigherCsv = useCallback(() => {
    if (selectedComponentIds.length === 0) {
      notification.warning({
        message: 'No components selected',
        description: 'Select components first to analyze connections.'
      });
      return;
    }

    const { byPair } = computeLowerToHigherAsil();
    if (!byPair || byPair.size === 0) {
      notification.info({
        message: 'No lower→higher ASIL links',
        description: 'No qualifying connections were found in the current selection.'
      });
      return;
    }

    const header = ['Source Component', 'Source ASIL', 'Target Component', 'Target ASIL', 'Connections'];
    const escape = (v: string) => '"' + (v ?? '').replace(/"/g, '""') + '"';
    const rows: string[] = [header.map(escape).join(',')];
    // Sort rows by descending connections for readability
    const entries = Array.from(byPair.values()).sort((a, b) => b.count - a.count);
    for (const { lower, higher, count } of entries) {
      rows.push([
        escape(lower.name),
        escape(lower.asil),
        escape(higher.name),
        escape(higher.asil),
        String(count)
      ].join(','));
    }
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lower_to_higher_asil_connections.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    notification.success({
      message: 'CSV exported',
      description: 'lower_to_higher_asil_connections.csv was generated.'
    });
  }, [computeLowerToHigherAsil, selectedComponentIds.length]);


  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: 'calc(100vh - 96px)', 
        width: 'calc(100% + 48px)',
        backgroundColor: themeMode === 'dark' ? '#141414' : '#f5f5f5',
        margin: '-24px',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ 
      height: '100vh', // Use full viewport height
      width: 'calc(100% + 48px)', // Account for left and right padding
      position: 'relative', 
      display: 'flex',
      backgroundColor: themeMode === 'dark' ? '#141414' : '#f5f5f5',
      margin: '-24px', // Counteract the main content padding
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
        {isPanelVisible && (
            <>
                {/* Mobile overlay backdrop */}
                {isMobile && (
                    <div 
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: themeMode === 'dark' ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)',
                            zIndex: 999
                        }}
                        onClick={() => setIsPanelVisible(false)}
                    />
                )}
                
                <div style={{ 
                  width: isMobile ? '300px' : '350px', 
                  minWidth: isMobile ? '300px' : '300px',
                  maxWidth: isMobile ? '300px' : '400px',
                  height: '100vh', // fill full viewport height
                  borderRight: !isMobile ? `1px solid ${themeMode === 'dark' ? '#434343' : '#d9d9d9'}` : 'none',
                  backgroundColor: themeMode === 'dark' ? '#1f1f1f' : '#ffffff',
                  overflow: 'auto',
                  padding: '16px',
                  position: isMobile ? 'fixed' : 'relative',
                  left: isMobile ? 0 : 'auto',
                  top: isMobile ? 0 : 'auto',
                  zIndex: isMobile ? 1000 : 1,
                  boxShadow: isMobile ? (themeMode === 'dark' ? '0 6px 16px 0 rgba(0, 0, 0, 0.3)' : '0 6px 16px 0 rgba(0, 0, 0, 0.08)') : 'none'
                }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <Title level={4} style={{ margin: 0 }}>Component Selection</Title>
                        <Button
                            icon={<MenuFoldOutlined />}
                            onClick={() => setIsPanelVisible(false)}
                            size="small"
                        />
                    </Space>
                
                {/* Information Card - moved above TreeSelect for better visibility */}
                <Card title="Information" size="small" style={{ marginBottom: '16px' }}>
                    {loadingData ? (
                        <Space>
                            <Spin size="small" />
                            <Text>Loading component data...</Text>
                        </Space>
                    ) : (
                        <>
                            <Text>Selected: {selectedComponentIds.length} / {allComponents.length} components</Text>
                            {pendingComponentIds.length !== selectedComponentIds.length && (
                                <>
                                    <br />
                                    <Text type="warning" style={{ fontSize: '12px' }}>
                                        Pending: {pendingComponentIds.length} components (close dropdown to apply)
                                    </Text>
                                </>
                            )}

                            <br />
                            {selectedComponentIds.length === 0 ? (
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Select components from the tree above to visualize their connections.
                                </Text>
                            ) : (
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Only connections between selected components are shown.
                                </Text>
                            )}
                        </>
                    )}
                </Card>
                
                {/* View Mode Controls */}
                <Card title="View Options" size="small" style={{ marginBottom: '16px' }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text>Condensed View:</Text>
                            <Switch 
                                checked={condensedView} 
                                onChange={setCondensedView}
                                size="small"
                                disabled={loadingData || selectedComponentIds.length === 0}
                            />
                        </div>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                            {condensedView 
                                ? 'Connections grouped by component pairs with count labels'
                                : 'Individual port-to-port connections shown'
                            }
                        </Text>
                    </Space>
                </Card>
                
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
                    value={pendingComponentIds}
                    onChange={handleTreeSelectionChange}
                    onDropdownVisibleChange={handleTreeDropdownVisibleChange}
                    treeCheckable
                    showCheckedStrategy={TreeSelect.SHOW_PARENT}
                    placeholder="Search and select components to display"
                    style={{ width: '100%', marginBottom: '16px' }}
                    maxTagCount="responsive"
                    treeDefaultExpandAll
                    disabled={loadingData}
                    showSearch
                    treeNodeFilterProp="title"
                    filterTreeNode={(input, node) => {
                        // Search in both component type and component name
                        const searchText = input.toLowerCase();
                        const nodeTitle = (node.title || '').toString().toLowerCase();
                        return nodeTitle.includes(searchText);
                    }}
                />
                
                <Collapse 
                    size="small" 
                    style={{ marginBottom: '16px' }}
                    items={[
                        {
                            key: '1',
                            label: 'Load/Save Selection',
                            children: (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <Input.TextArea
                                        value={componentSelectionText}
                                        onChange={(e) => setComponentSelectionText(e.target.value)}
                                        placeholder="Enter component UUIDs separated by commas..."
                                        rows={3}
                                        style={{ fontSize: '11px' }}
                                    />
                                    <Space wrap>
                                        <Button 
                                            icon={<UploadOutlined />} 
                                            onClick={handleLoadFromText}
                                            size="small"
                                            disabled={!componentSelectionText.trim() || loadingData}
                                        >
                                            Load
                                        </Button>
                                        <Button 
                                            icon={<CopyOutlined />} 
                                            onClick={handleCopySelection}
                                            size="small"
                                            disabled={selectedComponentIds.length === 0}
                                        >
                                            Copy
                                        </Button>
                                    </Space>
                                    <Text type="secondary" style={{ fontSize: '10px' }}>
                                        Copy current selection or paste UUIDs to quickly restore a view
                                    </Text>
                                </Space>
                            )
                        }
                    ]}
                />

                {/* ASIL Legend */}
                <Card title="ASIL Legend" size="small" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        {['D', 'C', 'B', 'A', 'QM', 'TBC', 'N/A'].map((asil) => (
                            <div key={asil} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div 
                                    style={{ 
                                        width: '16px', 
                                        height: '16px', 
                                        backgroundColor: getAsilColor(asil),
                                        border: '1px solid rgba(255, 255, 255, 0.3)',
                                        borderRadius: '3px',
                                        flexShrink: 0
                                    }} 
                                />
                                <Text style={{ fontSize: '11px', fontWeight: 500 }}>
                                    {asil === 'N/A' ? 'N/A' : asil === 'TBC' ? 'TBC' : `ASIL ${asil}`}
                                </Text>
                            </div>
                        ))}
                    </div>
                </Card>
                </div>
            </>
        )}
        
        <div style={{ 
          flex: 1, 
          height: '100%', 
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
            <Card 
                size="small" 
                style={{ 
                    borderRadius: 0, 
                    border: 'none',
                    borderBottom: `1px solid ${themeMode === 'dark' ? '#434343' : '#d9d9d9'}`,
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: themeMode === 'dark' ? '#1f1f1f' : '#ffffff'
                }}
                bodyStyle={{ 
                    padding: '0 16px', 
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center'
                }}
            >
                <Space align="center" style={{ gap: 12 }}>
                    {!isPanelVisible && (
                        <Button
                            icon={<MenuUnfoldOutlined />}
                            onClick={() => setIsPanelVisible(true)}
                            size="small"
                        />
                    )}
                    <Title level={4} style={{ margin: 0 }}>
                        Software Component Architecture Viewer
                    </Title>
                    <Button
                      size="small"
                      onClick={handleFindLowerToHigherAsil}
                      disabled={loadingData || selectedComponentIds.length === 0}
                    >
                      Find lower ASIL to higher ASIL
                    </Button>
                    <Button
                      size="small"
                      onClick={handleExportLowerToHigherCsv}
                      disabled={loadingData || selectedComponentIds.length === 0}
                    >
                      Export CSV for CURRENT VIEW
                    </Button>
                </Space>
            </Card>
            
            <div style={{ flex: 1, position: 'relative' }}>
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
                    style={{
                        backgroundColor: themeMode === 'dark' ? '#141414' : '#f5f5f5'
                    }}
                >
                    <Controls 
                        style={{
                            backgroundColor: themeMode === 'dark' ? '#1f1f1f' : 'white',
                            border: `1px solid ${themeMode === 'dark' ? '#434343' : '#d9d9d9'}`,
                            borderRadius: '6px'
                        }}
                    />
                    <Background 
                        color={themeMode === 'dark' ? '#434343' : '#f0f0f0'}
                        gap={20}
                    />
                </ReactFlow>
            </div>
        </div>
        {contextMenu && (
            <>
                {/* Invisible overlay to handle click outside */}
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 999,
                        background: 'transparent'
                    }}
                    onClick={() => setContextMenu(null)}
                />
                <div
                    style={{
                        position: 'absolute',
                        top: contextMenu.top,
                        left: contextMenu.left,
                        zIndex: 1000,
                        pointerEvents: 'auto'
                    }}
                >
                    <Dropdown
                        menu={{ items: contextMenuItems }}
                        trigger={[]}
                        open={true}
                        onOpenChange={(open) => !open && setContextMenu(null)}
                        placement="bottomLeft"
                    >
                        <div
                            style={{
                                width: 1,
                                height: 1,
                                pointerEvents: 'none'
                            }}
                        />
                    </Dropdown>
                </div>
            </>
        )}
        <DetailsModal
            componentUuid={detailsModal.componentUuid}
            componentName={detailsModal.componentName}
            connectionInfo={detailsModal.connectionInfo}
            isVisible={detailsModal.isVisible}
            onClose={handleCloseDetailsModal}
        />
        
        {/* Connection Details Modal for Condensed View */}
        <Modal
          title={`Connection Details: ${connectionDetailsModal.sourceComponent?.name || 'Unknown'} → ${connectionDetailsModal.targetComponent?.name || 'Unknown'}`}
          open={connectionDetailsModal.isVisible}
          onCancel={() => setConnectionDetailsModal({
            isVisible: false,
            sourceComponent: null,
            targetComponent: null,
            connections: []
          })}
          footer={[
            <Button
              key="close"
              onClick={() => setConnectionDetailsModal({
                isVisible: false,
                sourceComponent: null,
                targetComponent: null,
                connections: []
              })}
            >
              Close
            </Button>
          ]}
          width={800}
          style={{ top: 20 }}
        >
          {connectionDetailsModal.sourceComponent && connectionDetailsModal.targetComponent && (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {/* Component Information */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Card title="Source Component" size="small" bordered>
                  <Descriptions column={1} size="small" colon>
                    <Descriptions.Item label="Name">
                      <Text strong>{connectionDetailsModal.sourceComponent.name}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Type">
                      {connectionDetailsModal.sourceComponent.componentType}
                    </Descriptions.Item>
                    <Descriptions.Item label="ASIL">
                      <Badge
                        color={getAsilColor(connectionDetailsModal.sourceComponent.asil)}
                        text={connectionDetailsModal.sourceComponent.asil}
                      />
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
                <Card title="Target Component" size="small" bordered>
                  <Descriptions column={1} size="small" colon>
                    <Descriptions.Item label="Name">
                      <Text strong>{connectionDetailsModal.targetComponent.name}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Type">
                      {connectionDetailsModal.targetComponent.componentType}
                    </Descriptions.Item>
                    <Descriptions.Item label="ASIL">
                      <Badge
                        color={getAsilColor(connectionDetailsModal.targetComponent.asil)}
                        text={connectionDetailsModal.targetComponent.asil}
                      />
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </div>
              {/* Connection Details */}
              <Card
                title={`Port-to-Port Connections (${connectionDetailsModal.connections.length})`}
                size="small"
                bordered
              >
                <List
                  size="small"
                  dataSource={connectionDetailsModal.connections}
                  style={{ maxHeight: 300, overflowY: 'auto' }}
                  renderItem={(connection, index) => (
                    <List.Item key={index} style={{ alignItems: 'flex-start' }}>
                      <Space direction="vertical" style={{ flex: 1 }} size={4}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Provider Port</Text>
                        <Tag>{connection.sourcePort.name}</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>{connection.sourcePort.type}</Text>
                      </Space>
                      <Text type="secondary">→</Text>
                      <Space direction="vertical" style={{ flex: 1 }} size={4}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Receiver Port</Text>
                        <Tag>{connection.targetPort.name}</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>{connection.targetPort.type}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Space>
          )}
        </Modal>
    </div>
  );
};

const ArchViewer = () => (
    <ReactFlowProvider>
        <ArchViewerInner />
    </ReactFlowProvider>
);

export default ArchViewer;