'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { TreeSelect, Spin, Typography, Row, Col, Card, Button, Space } from 'antd';
import { CheckSquareOutlined, ClearOutlined, MenuFoldOutlined, MenuUnfoldOutlined, UsergroupAddOutlined, LinkOutlined } from '@ant-design/icons';
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

import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getProviderPortsForSWComponent, getReceiverPortsForSWComponent, getPartnerPort } from '@/app/services/neo4j/queries/ports';
import { PortInfo } from '@/app/services/neo4j/types';
import ConnectionDetailsModal, { PortConnection } from './ConnectionDetailsModal';
import { getFailuresAndCountsForComponents } from '@/app/services/neo4j/queries/safety/failureModes';

const { Title, Text } = Typography;

const getAsilColorWithOpacity = (asil: string, opacity: number = 0.6) => {
    const colorMap: { [key: string]: string } = {
        'D': `rgba(217, 0, 27, ${opacity})`,       // Red
        'C': `rgba(237, 109, 0, ${opacity})`,      // Orange
        'B': `rgba(242, 204, 21, ${opacity})`,     // Yellow
        'A': `rgba(132, 201, 73, ${opacity})`,     // Light Green
        'QM': `rgba(68, 148, 201, ${opacity})`,     // Blue
        'TBC': `rgba(128, 128, 128, ${opacity})`,   // Grey
        'N/A': `rgba(200, 200, 200, ${opacity})`,  // Light Grey
    };
    return colorMap[asil] || `rgba(200, 200, 200, ${opacity})`;
};

const CustomNode = ({ data }: { data: { label: string } }) => {
    return (
        <div style={{ padding: '10px' }}>
            <Handle
                type="target"
                position={Position.Left}
                id="receivers"
                style={{ top: '50%', background: '#555' }}
                isConnectable={true}
            />
            {data.label}
            <Handle
                type="source"
                position={Position.Right}
                id="providers"
                style={{ top: '50%', background: '#555' }}
                isConnectable={true}
            />
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
            width: 150,
            height: 50
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
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [allComponents, setAllComponents] = useState<SWComponent[]>([]);
  const [allPorts, setAllPorts] = useState<PortInfo[]>([]);
  const [connections, setConnections] = useState<Map<string, string>>(new Map());
  const [portToComponentMap, setPortToComponentMap] = useState<Map<string, string>>(new Map());
  const [selectedItem, setSelectedItem] = useState<DetailViewItem>(null);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalConnections, setModalConnections] = useState<PortConnection[]>([]);
  const [modalSourceComponent, setModalSourceComponent] = useState<SWComponent | undefined>();
  const [modalTargetComponent, setModalTargetComponent] = useState<SWComponent | undefined>();
  const [contextMenu, setContextMenu] = useState<{ id: string; top: number; left: number; } | null>(null);


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

        const treeNodes = await Promise.all(
          filteredComponents.map(async (component: SWComponent) => {
            const [providerPortsResult, receiverPortsResult] = await Promise.all([
              getProviderPortsForSWComponent(component.uuid),
              getReceiverPortsForSWComponent(component.uuid),
            ]);

            if (!providerPortsResult.success || !receiverPortsResult.success) {
                console.error(`Failed to fetch ports for ${component.name}`);
                return null;
            }

            const componentPorts = [...(providerPortsResult.data || []), ...(receiverPortsResult.data || [])];
            allPortsList.push(...componentPorts);
            
            componentPorts.forEach(port => {
                newPortToComponentMap.set(port.uuid, component.uuid);
            });

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

            const portNodes = componentPorts.map((port: PortInfo) => ({
              title: port.name,
              value: port.uuid,
              key: port.uuid,
              disableCheckbox: true,
            }));
            
            return {
              title: component.name,
              value: component.uuid,
              key: component.uuid,
              children: portNodes,
            };
          })
        );

        setTreeData(treeNodes.filter(Boolean) as TreeNode[]);
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

  const handleSelectionChange = useCallback((newSelectedValues: string[]) => {
    setSelectedValues(newSelectedValues);

    const lastSelected = newSelectedValues[newSelectedValues.length - 1];
    const component = allComponents.find(c => c.uuid === lastSelected);
    setSelectedItem(component || null);

    const selectedComponentUuids = new Set<string>(newSelectedValues);

    const newNodes: Node[] = allComponents
        .filter(c => selectedComponentUuids.has(c.uuid))
        .map(c => {
            const backgroundColor = getAsilColorWithOpacity(c.asil);
            return {
                id: c.uuid,
                type: 'custom',
                data: { label: c.name, component: c },
                position: { x: 0, y: 0 },
                style: {
                    backgroundColor: backgroundColor,
                    color: getTextColorForBackground(backgroundColor),
                    border: '1px solid #555',
                    borderRadius: 4,
                }
            }
        });
    
    const edgesMap = new Map<string, { source: string; target: string; connections: PortConnection[] }>();

    connections.forEach((targetPortUuid, sourcePortUuid) => {
        const sourceComponentUuid = portToComponentMap.get(sourcePortUuid);
        const targetComponentUuid = portToComponentMap.get(targetPortUuid);

        if (sourceComponentUuid && targetComponentUuid &&
            selectedComponentUuids.has(sourceComponentUuid) &&
            selectedComponentUuids.has(targetComponentUuid) &&
            sourceComponentUuid !== targetComponentUuid) {
            
            const edgeId = `${sourceComponentUuid}->${targetComponentUuid}`;
            
            if (!edgesMap.has(edgeId)) {
                edgesMap.set(edgeId, { source: sourceComponentUuid, target: targetComponentUuid, connections: [] });
            }

            const sourcePort = allPorts.find(p => p.uuid === sourcePortUuid);
            const targetPort = allPorts.find(p => p.uuid === targetPortUuid);

            if (sourcePort && targetPort) {
                edgesMap.get(edgeId)!.connections.push({ sourcePort, targetPort });
            }
        }
    });

    const newEdges: Edge[] = [];
    edgesMap.forEach((edgeData, edgeId) => {
        newEdges.push({
            id: edgeId,
            source: edgeData.source,
            target: edgeData.target,
            sourceHandle: 'providers',
            targetHandle: 'receivers',
            animated: true,
            data: {
                connections: edgeData.connections
            }
        });
    });


    elkLayout(newNodes, newEdges).then(({nodes: layoutedNodes, edges: layoutedEdges}) => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    })

  }, [allComponents, allPorts, connections, portToComponentMap, setNodes, setEdges]);

  const handleSelectAll = () => {
      const allComponentUuids = allComponents.map(c => c.uuid);
      handleSelectionChange(allComponentUuids);
  }

  const handleDeselectAll = () => {
      handleSelectionChange([]);
  }

  const handleShowPartners = useCallback(() => {
    if (!contextMenu) return;

    const { id: componentId } = contextMenu;

    const partnerUuids = new Set<string>();
    connections.forEach((targetPortUuid, sourcePortUuid) => {
        const sourceComponentUuid = portToComponentMap.get(sourcePortUuid);
        const targetComponentUuid = portToComponentMap.get(targetPortUuid);

        if (sourceComponentUuid === componentId && targetComponentUuid) {
            partnerUuids.add(targetComponentUuid);
        } else if (targetComponentUuid === componentId && sourceComponentUuid) {
            partnerUuids.add(sourceComponentUuid);
        }
    });
    
    const newSelectedValues = Array.from(new Set([...selectedValues, ...Array.from(partnerUuids)]));
    
    handleSelectionChange(newSelectedValues);

    setContextMenu(null);
  }, [contextMenu, connections, portToComponentMap, selectedValues, handleSelectionChange]);

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
                style: { opacity: isConnected ? 1 : 0.3, transition: 'opacity 0.2s' },
                animated: isConnected
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
      if (edge.data?.connections) {
        setModalConnections(edge.data.connections);
        setModalSourceComponent(allComponents.find(c => c.uuid === edge.source));
        setModalTargetComponent(allComponents.find(c => c.uuid === edge.target));
        setIsModalVisible(true);
      }
  }, [allComponents]);

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
        style: { opacity: 1, transition: 'opacity 0.2s' },
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
                <Title level={4}>Component and Port Selector</Title>
                <Space style={{ marginBottom: 8 }}>
                    <Button onClick={handleSelectAll} size="small" icon={<CheckSquareOutlined />}>Select All</Button>
                    <Button onClick={handleDeselectAll} size="small" icon={<ClearOutlined />}>Deselect All</Button>
                </Space>
                <TreeSelect
                    style={{ width: '100%' }}
                    value={selectedValues}
                    dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                    treeData={treeData}
                    multiple
                    allowClear
                    showSearch
                    placeholder="Search and select components or ports"
                    onChange={handleSelectionChange}
                    treeNodeFilterProp="title"
                    treeCheckable
                    showCheckedStrategy={TreeSelect.SHOW_ALL}
                />
                <div style={{marginTop: '20px'}}>
                    <DetailView item={selectedItem} portToComponentMap={portToComponentMap} allComponents={allComponents} />
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
                    fitView
                    minZoom={0.1}
                    nodeTypes={nodeTypes}
                >
                    <Controls />
                    <Background />
                </ReactFlow>
            </ReactFlowProvider>
        </Col>
        <ConnectionDetailsModal
            isVisible={isModalVisible}
            onClose={() => setIsModalVisible(false)}
            connections={modalConnections}
            sourceComponent={modalSourceComponent}
            targetComponent={modalTargetComponent}
        />
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