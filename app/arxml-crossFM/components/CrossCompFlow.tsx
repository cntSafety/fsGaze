/**
 * @file Simplified Cross-Component Flow viewer showing all components and ports.
 * Uses the same styling and layout algorithm as ArchViewer.
 */
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    ReactFlowProvider,
    Node,
    Edge,
    Position,
    Handle,
    NodeTypes,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Spin, Typography, TreeSelect, Card, Button, Space, Input, Collapse, notification } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UploadOutlined, CopyOutlined } from '@ant-design/icons';
import ELK from 'elkjs/lib/elk.bundled.js';
import { getAsilColor } from '@/app/components/asilColors';
import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getAllPortsForComponents, getPartnerPortsForComponentsOptimized } from '@/app/services/neo4j/queries/ports';
import { PortInfo } from '@/app/services/neo4j/types';
import { useTheme } from '@/app/components/ThemeProvider';

const { Title, Text } = Typography;

interface SWComponent {
  uuid: string;
  name: string;
  componentType: string;
  arxmlPath: string;
  asil: string;
}

interface TreeNode {
  title: string;
  value: string;
  key: string;
  children?: TreeNode[];
}

const getAsilColorWithOpacity = (asil: string, opacity: number = 0.7) => {
    const baseColor = getAsilColor(asil);
    if (baseColor.startsWith('rgb(')) {
        return `rgba(${baseColor.substring(4, baseColor.length - 1)}, ${opacity})`;
    }
    return baseColor;
};

const getTextColorForBackground = (rgba: string) => {
    const rgb = rgba.match(/\d+/g);
    if (!rgb) return '#000000';
    const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
    return brightness > 125 ? '#000000' : '#ffffff';
};

const CustomNode = ({ data }: { data: { label: string, component: SWComponent, providerPorts: PortInfo[], receiverPorts: PortInfo[] } }) => {
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
                    isConnectable={false}
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
                    isConnectable={false}
                />
            ))}
        </div>
    );
};

const nodeTypes: NodeTypes = {
    custom: CustomNode,
};

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

const COMPOSITION_SW_COMPONENT_TYPE = 'COMPOSITION_SW_COMPONENT_TYPE';

const CrossCompFlowInner = () => {
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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const componentsResult = await getApplicationSwComponents();
        if (!componentsResult.success) {
          throw new Error(componentsResult.message);
        }
        
        const allDbComponents = componentsResult.data;
        
        // Filter out COMPOSITION_SW_COMPONENT_TYPE
        const filteredComponents = allDbComponents.filter(
          (c: any) => c.componentType !== COMPOSITION_SW_COMPONENT_TYPE
        ).map((component: any) => ({
            ...component,
            asil: 'QM' // Default ASIL for now
        }));
        
        setAllComponents(filteredComponents);
        
        // Don't load ports initially - only when user selects components
        setAllPorts([]);
        setPortToComponentMap(new Map());
        
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
      setAllPorts([]);
      setConnections(new Map());
      setPortToComponentMap(new Map());
      return;
    }

    try {
      setLoadingData(true);
      
      const selectedComponents = allComponents.filter(c => componentIds.includes(c.uuid));

      const newConnections = new Map<string, string>();
      const newPortToComponentMap = new Map<string, string>();
      const allPortsList: PortInfo[] = [];

      // Load ports for selected components
      const allPortsResult = await getAllPortsForComponents(componentIds);
      
      if (allPortsResult.success && allPortsResult.data) {
        allPortsResult.data.forEach((ports: PortInfo[], componentUuid: string) => {
          allPortsList.push(...ports);
          ports.forEach((port: PortInfo) => {
            newPortToComponentMap.set(port.uuid, componentUuid);
          });
        });

        console.log(`📦 Processed ${allPortsList.length} ports across ${allPortsResult.data.size} components`);
      } else {
        throw new Error('Failed to load port data');
      }

      // Load connections using optimized query
      console.log(`🚀 Executing OPTIMIZED connection fetching...`);
      const partnerResult = await getPartnerPortsForComponentsOptimized(componentIds);
      console.log(`✅ OPTIMIZED query completed successfully`);
      
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
      
      console.log(`✅ Component data loading completed`);
      console.log(`- Components processed: ${selectedComponents.length}`);
      console.log(`- Total ports loaded: ${allPortsList.length}`);
      console.log(`- Total connections found: ${newConnections.size}`);
      
    } catch (error) {
      console.error('Failed to load component data:', error);
    } finally {
      setLoadingData(false);
    }
  }, [allComponents]);

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
                receiverPorts: ports.receiver
            },
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
        }
    });
    
    // Create direct port-to-port connections only between selected components
    const selectedComponentUuids: string[] = selectedComponents.map((c: SWComponent) => c.uuid);
    const newEdges: Edge[] = [];
    let edgeCount = 0;
    const processedConnections = new Set<string>(); // Track unique connections to prevent duplicates
    
    console.log('Processing connections...');
    connections.forEach((targetPortUuid, sourcePortUuid) => {
        const sourcePort = allPorts.find(p => p.uuid === sourcePortUuid);
        const targetPort = allPorts.find(p => p.uuid === targetPortUuid);

        if (!sourcePort || !targetPort) {
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
            return;
        }

        // Create bidirectional connection ID to prevent duplicates
        const sortedIds = [providerPortUuid, receiverPortUuid].sort();
        const connectionId = `${sortedIds[0]}<->${sortedIds[1]}`;
        
        if (processedConnections.has(connectionId)) {
            return;
        }
        
        processedConnections.add(connectionId);

        const providerComponentUuid = portToComponentMap.get(providerPortUuid);
        const receiverComponentUuid = portToComponentMap.get(receiverPortUuid);

        if (!providerComponentUuid || !receiverComponentUuid) {
            return;
        }

        // Only show connections between selected components
        if (!selectedComponentUuids.includes(providerComponentUuid) || !selectedComponentUuids.includes(receiverComponentUuid)) {
            return;
        }

        if (providerComponentUuid === receiverComponentUuid) {
            return;
        }
        
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
                connectionMapping: `${sourcePortUuid}->${targetPortUuid}`
            }
        };
        
        newEdges.push(edge);
    });

    console.log(`Created ${edgeCount} edges from ${connections.size} connections`);

    elkLayout(newNodes, newEdges).then(({nodes: layoutedNodes, edges: layoutedEdges}) => {
        console.log('Layout complete:', { nodes: layoutedNodes.length, edges: layoutedEdges.length });
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        
        setTimeout(() => {
          if (layoutedNodes.length > 0) {
            fitView({ padding: 0.1, duration: 800 });
          }
        }, 100);
    });
  }, [allComponents, allPorts, connections, portToComponentMap, selectedComponentIds, setNodes, setEdges, fitView]);

  // Load component data when components are selected
  useEffect(() => {
    loadComponentData(selectedComponentIds);
  }, [selectedComponentIds, loadComponentData]);

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

  const handleSelectAll = useCallback(() => {
    const allIds = allComponents.map(c => c.uuid);
    setSelectedComponentIds(allIds);
    setPendingComponentIds(allIds);
  }, [allComponents]);

  const handleClearSelection = useCallback(() => {
    setSelectedComponentIds([]);
    setPendingComponentIds([]);
  }, []);

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
    setPendingComponentIds(componentIds);
  }, []);

  const handleTreeDropdownVisibleChange = useCallback((open: boolean) => {
    if (!open && pendingComponentIds !== selectedComponentIds) {
      setSelectedComponentIds(pendingComponentIds);
    }
  }, [pendingComponentIds, selectedComponentIds]);



  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: 'calc(100vh - 200px)',
        backgroundColor: themeMode === 'dark' ? '#141414' : '#f5f5f5'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ 
      height: 'calc(100vh - 200px)', 
      width: '100%', 
      position: 'relative', 
      display: 'flex',
      backgroundColor: themeMode === 'dark' ? '#141414' : '#f5f5f5'
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
                  height: '100%',
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
                
                {/* Information Card */}
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
                                    Select components from the tree below to visualize their connections.
                                </Text>
                            ) : (
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Only connections between selected components are shown.
                                </Text>
                            )}
                        </>
                    )}
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
                <Space align="center">
                    {!isPanelVisible && (
                        <Button
                            icon={<MenuUnfoldOutlined />}
                            onClick={() => setIsPanelVisible(true)}
                            size="small"
                        />
                    )}
                    <Title level={4} style={{ margin: 0 }}>
                        Cross-Component Failure Propagation
                    </Title>
                </Space>
            </Card>
            
            <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ 
            padding: 0.1,
            includeHiddenNodes: false,
            minZoom: 0.1,
            maxZoom: 1.2
          }}
          minZoom={0.1}
          maxZoom={2}
          style={{
            backgroundColor: themeMode === 'dark' ? '#141414' : '#f5f5f5'
          }}
        >
          <Background 
            color={themeMode === 'dark' ? '#434343' : '#f0f0f0'}
            gap={20}
          />
          <Controls 
            style={{
              backgroundColor: themeMode === 'dark' ? '#1f1f1f' : 'white',
              border: `1px solid ${themeMode === 'dark' ? '#434343' : '#d9d9d9'}`,
              borderRadius: '6px'
            }}
          />
        </ReactFlow>
            </div>
        </div>
    </div>
  );
};

export default function CrossCompFlow() {
  return (
    <ReactFlowProvider>
      <CrossCompFlowInner />
    </ReactFlowProvider>
  );
}