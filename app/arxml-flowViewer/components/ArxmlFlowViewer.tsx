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
    ReactFlowProvider,
    ConnectionLineType,
    Position,
    Handle
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Select, Alert, Spin, Card, Divider, Button, Modal, Typography, Switch } from 'antd';
import { InfoCircleOutlined, NodeCollapseOutlined } from '@ant-design/icons';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
    getAllSwComponentPrototypes,
    getScopedComponentConnectionsAndPartners,
    ScopedComponentConnectionsAndPartnersResult,
} from '@/app/services/ArxmlToNeoService';
import PortInterfaceInfo from '../../components/PortInterfaceInfo';

const { Option } = Select;
const { Title, Text } = Typography;

interface SwcPrototype {
    uuid: string;
    name: string;
    shortName: string;
    arxmlPath: string;
}

// Custom node component for the scope element (center node)

interface SwcPrototype {
    uuid: string;
    name: string;
    shortName: string;
    arxmlPath: string;
}

// Custom node component for the scope element (center node)
function ScopeElementNode({ data }: { data: any }) {
    return (
        <div style={{
            padding: '20px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: '3px solid #4C51BF',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
            minWidth: '200px',
            color: 'white',
            textAlign: 'center',
            position: 'relative'
        }}>
            {/* Left handle for partners with P-Ports (providers) */}
            <Handle
                type="target"
                position={Position.Left}
                id="left"
                style={{ background: '#FFA726', width: '12px', height: '12px', left: '-6px' }}
            />
            
            {/* Right handle for partners with R-Ports only (consumers) */}
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                style={{ background: '#FFA726', width: '12px', height: '12px', right: '-6px' }}
            />
            
            {/* Bottom handle for mixed partners (both P-Ports and R-Ports) */}
            <Handle
                type="target"
                position={Position.Bottom}
                id="bottom"
                style={{ background: '#FFA726', width: '12px', height: '12px', bottom: '-6px' }}
            />

            {/*             <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
                🎯 SCOPE ELEMENT
            </div> */}
            <div style={{ fontSize: '14px', fontWeight: '600' }}>
                {data.label}
            </div>
{/*             <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>
                {data.type}
            </div> */}
        </div>
    );
}

// Custom node component for partner components
function PartnerNode({ data }: { data: any }) {
    const { partnerType } = data;
    
    // Determine which handle to show based on partner type
    const getHandleConfig = () => {
        switch (partnerType) {
            case 'provider': // Partners with P-Ports only
                return {
                    type: "source" as const,
                    position: Position.Right,
                    id: "right",
                    style: { background: '#22C55E', width: '10px', height: '10px', right: '-5px' }
                };
            case 'consumer': // Partners with R-Ports only
                return {
                    type: "target" as const,
                    position: Position.Left,
                    id: "left",
                    style: { background: '#22C55E', width: '10px', height: '10px', left: '-5px' }
                };
            case 'mixed': // Partners with both P-Ports and R-Ports
                return {
                    type: "source" as const,
                    position: Position.Right,
                    id: "right",
                    style: { background: '#3B82F6', width: '10px', height: '10px', right: '-5px' }
                };
            default:
                return {
                    type: "target" as const,
                    position: Position.Left,
                    id: "left",
                    style: { background: '#22C55E', width: '10px', height: '10px', left: '-5px' }
                };
        }
    };

    const handleConfig = getHandleConfig();

    return (
        <div style={{
            padding: '15px',
            borderRadius: '8px',
            background: partnerType === 'mixed' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            border: partnerType === 'mixed' ? '2px solid #3B82F6' : '2px solid #22C55E',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
            minWidth: '160px',
            position: 'relative'
        }}>
            <Handle
                type={handleConfig.type}
                position={handleConfig.position}
                id={handleConfig.id}
                style={handleConfig.style}
            />

            {/*             <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#166534', marginBottom: '4px' }}>
                🔗 PARTNER
            </div> */}
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                {data.label}
            </div>
            {/*             <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                {data.type}
            </div> */}
        </div>
    );
}

function ArxmlFlowViewer() {
    const [prototypes, setPrototypes] = useState<SwcPrototype[]>([]);
    const [selectedPrototype, setSelectedPrototype] = useState<string | null>(null);
    const [selectedPrototypeName, setSelectedPrototypeName] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [loadingPrototypes, setLoadingPrototypes] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scopedData, setScopedData] = useState<ScopedComponentConnectionsAndPartnersResult | null>(null);

    // React Flow state
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Modal state for connection details
    const [selectedConnection, setSelectedConnection] = useState<any>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [showDetails, setShowDetails] = useState(false); // New state for details toggle

    // Define custom node types
    const nodeTypes: NodeTypes = useMemo(() => ({
        scopeElement: ScopeElementNode,
        partner: PartnerNode
    }), []);

    // ELK layout configuration
    const elk = useMemo(() => new ELK(), []);

    // Load all SW Component Prototypes on component mount
    useEffect(() => {
        const loadPrototypes = async () => {
            try {
                setLoadingPrototypes(true);
                const result = await getAllSwComponentPrototypes();

                if (result.success && result.data) {
                    setPrototypes(result.data);
                } else {
                    setError(result.error || 'Failed to load SW Component Prototypes');
                }
            } catch (err) {
                setError('Error loading SW Component Prototypes');
                console.error('Error:', err);
            } finally {
                setLoadingPrototypes(false);
            }
        };

        loadPrototypes();
    }, []);

    // ELK layout function
    const applyLayout = useCallback(async (nodes: Node[], edges: Edge[]) => {
        if (nodes.length === 0) return nodes;

        try {
            const elkGraph = {
                id: "root",
                layoutOptions: {
                    "elk.algorithm": "layered",
                    "elk.direction": "RIGHT",
                    "elk.spacing.nodeNode": "80",
                    "elk.layered.spacing.nodeNodeBetweenLayers": "120",
                    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
                    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP"
                },
                children: nodes.map(node => ({
                    id: node.id,
                    width: node.type === 'scopeElement' ? 200 : 160,
                    height: node.type === 'scopeElement' ? 100 : 80
                })),
                edges: edges.map(edge => ({
                    id: edge.id,
                    sources: [edge.source],
                    targets: [edge.target]
                }))
            };

            const layoutedGraph = await elk.layout(elkGraph);

            return nodes.map(node => {
                const layoutedNode = layoutedGraph.children?.find(n => n.id === node.id);
                return {
                    ...node,
                    position: {
                        x: layoutedNode?.x ?? node.position.x,
                        y: layoutedNode?.y ?? node.position.y
                    }
                };
            });
        } catch (error) {
            console.error('Layout error:', error);
            return nodes;
        }
    }, [elk]);

    // Handle prototype selection and load scoped data
    const handlePrototypeSelect = async (prototypeUuid: string) => {
        const selectedProto = prototypes.find(p => p.uuid === prototypeUuid);
        if (!selectedProto) return;

        setSelectedPrototype(prototypeUuid);
        setSelectedPrototypeName(selectedProto.name);
        setLoading(true);
        setError(null);
        setScopedData(null);

        try {
            // console.log(`🔍 Loading scoped data for prototype: ${selectedProto.name} (${prototypeUuid})`);

            const result = await getScopedComponentConnectionsAndPartners(prototypeUuid);

            if (result.success && result.data) {
                setScopedData(result.data);
                await buildFlowGraph(result.data);
            } else {
                setError(result.error || 'Failed to load scoped data');
            }
        } catch (err: any) {
            console.error('Error loading scoped data:', err);
            setError('Error loading scoped component data');
        } finally {
            setLoading(false);
        }
    };

    // Build the React Flow graph from scoped data
    const buildFlowGraph = async (data: ScopedComponentConnectionsAndPartnersResult) => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Analyze partners to determine their connection types
        const analyzePartnerPorts = (partner: any) => {
            const hasPPorts = data.Connections.some(connection => 
                connection.TargetPPort && partner.ports.some(port => port.uuid === connection.TargetPPort.uuid)
            );
            const hasRPorts = data.Connections.some(connection => 
                connection.TargetRPort && partner.ports.some(port => port.uuid === connection.TargetRPort.uuid)
            );

            if (hasPPorts && hasRPorts) return 'mixed';
            if (hasPPorts) return 'provider';
            if (hasRPorts) return 'consumer';
            return 'unknown';
        };

        // Create scope element node (center)
        if (data.ScopeElement) {
            newNodes.push({
                id: data.ScopeElement.uuid,
                type: 'scopeElement',
                position: { x: 0, y: 0 }, // Will be set by layout
                data: {
                    label: data.ScopeElement.name,
                    type: data.ScopeElement.type,
                    element: data.ScopeElement
                }
            });
        }

        // Create partner nodes with connection type information
        data.Partners.forEach((partner, index) => {
            const partnerType = analyzePartnerPorts(partner);
            
            newNodes.push({
                id: partner.uuid,
                type: 'partner',
                position: { x: 0, y: 0 }, // Will be set by layout
                data: {
                    label: partner.name,
                    type: partner.type,
                    element: partner,
                    partnerType: partnerType
                }
            });
        });

        // Count connections per partner to determine line thickness
        const connectionCountByPartner = new Map<string, number>();

        data.Connections.forEach((connection) => {
            const connectedPartners = data.Partners.filter(partner => {
                return partner.ports.some(port => {
                    return (connection.TargetPPort && port.uuid === connection.TargetPPort.uuid) ||
                        (connection.TargetRPort && port.uuid === connection.TargetRPort.uuid);
                });
            });

            connectedPartners.forEach(partner => {
                const currentCount = connectionCountByPartner.get(partner.uuid) || 0;
                connectionCountByPartner.set(partner.uuid, currentCount + 1);
            });
        });

        // Create edges based on connections
        data.Connections.forEach((connection, index) => {
            // Find which partners are connected by this connection
            const connectedPartners = data.Partners.filter(partner => {
                // Check if any of the partner's ports match the connection's target ports
                return partner.ports.some(port => {
                    return (connection.TargetPPort && port.uuid === connection.TargetPPort.uuid) ||
                        (connection.TargetRPort && port.uuid === connection.TargetRPort.uuid);
                });
            });

            // Create edges from scope element to connected partners
            connectedPartners.forEach((partner, partnerIndex) => {
                if (data.ScopeElement) {
                    const edgeId = `${data.ScopeElement.uuid}-${partner.uuid}-${connection.uuid}`;
                    const partnerType = analyzePartnerPorts(partner);

                    // Determine handle connections based on partner type
                    let sourceHandle: string;
                    let targetHandle: string;
                    let edgeSource: string;
                    let edgeTarget: string;

                    switch (partnerType) {
                        case 'provider': // Partner has P-Ports -> connects to left side of ScopeElement
                            edgeSource = partner.uuid;      // Partner is source
                            edgeTarget = data.ScopeElement.uuid;  // ScopeElement is target
                            sourceHandle = 'right';         // Partner's right handle
                            targetHandle = 'left';          // ScopeElement's left handle
                            break;
                        case 'consumer': // Partner has R-Ports only -> connects to right side of ScopeElement
                            edgeSource = data.ScopeElement.uuid;  // ScopeElement is source
                            edgeTarget = partner.uuid;      // Partner is target
                            sourceHandle = 'right';         // ScopeElement's right handle
                            targetHandle = 'left';          // Partner's left handle
                            break;
                        case 'mixed': // Partner has both -> connects to left of ScopeElement
                            edgeSource = partner.uuid;      // Partner is source
                            edgeTarget = data.ScopeElement.uuid;  // ScopeElement is target
                            sourceHandle = 'right';         // Partner's right handle
                            targetHandle = 'left';          // ScopeElement's left handle
                            break;
                        default:
                            edgeSource = data.ScopeElement.uuid;
                            edgeTarget = partner.uuid;
                            sourceHandle = 'right';
                            targetHandle = 'left';
                    }

                    // Calculate stroke width based on number of connections to this partner
                    const connectionCount = connectionCountByPartner.get(partner.uuid) || 1;
                    const strokeWidth = Math.min(2 + (connectionCount - 1), 6); // Base width 2px, max 6px
                    
                    // Determine edge color based on partner type
                    const edgeColor = partnerType === 'mixed' ? '#3B82F6' : '#8B5CF6';

                    newEdges.push({
                        id: edgeId,
                        source: edgeSource,
                        target: edgeTarget,
                        sourceHandle: sourceHandle,
                        targetHandle: targetHandle,
                        style: {
                            stroke: edgeColor,
                            strokeWidth: strokeWidth,
                            strokeDasharray: '5,5'
                        },
                        markerStart: {
                            type: MarkerType.ArrowClosed,
                            color: edgeColor
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: edgeColor
                        },
                        type: 'smoothstep',
                        data: {
                            connection: connection,
                            partner: partner
                        }
                    });
                }
            });
        });

        // console.log(`📊 Created ${newNodes.length} nodes and ${newEdges.length} edges`);

        // Apply layout and set nodes/edges
        const layoutedNodes = await applyLayout(newNodes, newEdges);
        setNodes(layoutedNodes);
        setEdges(newEdges);
    };

    // Handle edge click to show connection details - Enhanced to show ALL connections for the partner
    const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        if (edge.data && edge.data.connection && edge.data.partner && scopedData) {
            const clickedPartner = edge.data.partner;

            // Find all connections that involve this partner
            const allConnectionsForPartner = scopedData.Connections.filter(connection => {
                // Check if any of the partner's ports match the connection's target ports
                return clickedPartner.ports.some(port => {
                    return (connection.TargetPPort && port.uuid === connection.TargetPPort.uuid) ||
                        (connection.TargetRPort && port.uuid === connection.TargetRPort.uuid);
                });
            });

            setSelectedConnection({
                clickedConnection: edge.data.connection, // The specific connection that was clicked
                partner: clickedPartner,
                allConnections: allConnectionsForPartner // All connections involving this partner
            });
            setIsModalVisible(true);
        }
    }, [scopedData]);

    // Render connection details modal
    const renderConnectionModal = () => {
        // Debug logging for selectedConnection data
        if (selectedConnection) {
            // console.log('🔍 Modal opened with selectedConnection:', selectedConnection);
        }
        
        return (
            <Modal
                title="Partner Component Details"
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
            footer={[
                <div key="footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Text style={{ marginRight: '8px' }}>Show Details:</Text>
                        <Switch
                            checked={showDetails}
                            onChange={setShowDetails}
                            size="small"
                        />
                    </div>
                    <Button onClick={() => setIsModalVisible(false)}>
                        Close
                    </Button>
                </div>
            ]}
            width={800}
        >
            {selectedConnection && (
                <div>
                    {/* Partner Component Info */}
                    <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                        <Title level={4} style={{ marginBottom: '12px', color: '#1890ff' }}>
                            {selectedConnection.partner.name}
                        </Title>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div>
                                <Text strong>Type:</Text> <Text style={{ marginLeft: '8px' }}>{selectedConnection.partner.type}</Text>
                            </div>
                            {showDetails && (
                                <div>
                                    <Text strong style={{ fontSize: '12px' }}>UUID:</Text> <Text code style={{ fontSize: '11px', marginLeft: '8px' }}>{selectedConnection.partner.uuid}</Text>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* All Partner Ports */}
                    <div style={{ marginBottom: '24px' }}>
                        <Title level={5} style={{ marginBottom: '12px' }}>All Ports of ({selectedConnection.partner.ports.length})</Title>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: '6px' }}>
                            {selectedConnection.partner.ports.map((port: any, index: number) => (
                                <div key={index} style={{
                                    padding: '12px',
                                    borderBottom: index < selectedConnection.partner.ports.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    backgroundColor: index % 2 === 0 ? '#fafafa' : '#ffffff'
                                }}>
                                    <div style={{ marginBottom: '4px' }}>
                                        <Text strong style={{ fontSize: '16px' }}>{port.name}</Text>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div>
                                            <PortInterfaceInfo portUuid={port.uuid} />
                                        </div>
                                        {showDetails && (
                                            <div>
                                                <Text strong style={{ fontSize: '12px' }}>UUID:</Text> <Text code style={{ fontSize: '11px', marginLeft: '8px' }}>{port.uuid}</Text>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* All Connections to this Partner */}
                    <div>
                        <Title level={5} style={{ marginBottom: '12px' }}>All Connections to this Partner ({selectedConnection.allConnections.length})</Title>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: '6px' }}>
                            {selectedConnection.allConnections.map((connection: any, index: number) => {
                                return (
                                    <div key={index} style={{
                                        padding: '16px',
                                        borderBottom: index < selectedConnection.allConnections.length - 1 ? '1px solid #f0f0f0' : 'none',
                                        backgroundColor: index % 2 === 0 ? '#fafafa' : '#ffffff'
                                    }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <Text strong style={{ fontSize: '16px' }}>{connection.name}</Text>
                                        </div>
                                        {showDetails && (
                                            <div style={{ marginBottom: '8px' }}>
                                                <Text strong style={{ fontSize: '12px' }}>UUID:</Text> <Text code style={{ fontSize: '11px', marginLeft: '8px' }}>{connection.uuid}</Text>
                                            </div>
                                        )}

                                        {connection.TargetPPort && (
                                            <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#f0f8ff', borderRadius: '4px' }}>
                                                <Text strong style={{ fontSize: '14px', color: '#0050b3' }}>Provider Port:</Text>
                                                <div style={{ marginTop: '4px', marginLeft: '12px' }}>
                                                    <div><Text strong style={{ fontSize: '16px' }}>{connection.TargetPPort.name}</Text></div>
                                                    {showDetails && (
                                                        <div><Text strong style={{ fontSize: '12px' }}>UUID:</Text> <Text code style={{ fontSize: '11px', marginLeft: '8px' }}>{connection.TargetPPort.uuid}</Text></div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {connection.TargetRPort && (
                                            <div style={{ padding: '8px', backgroundColor: '#f6ffed', borderRadius: '4px' }}>
                                                <Text strong style={{ fontSize: '14px', color: '#389e0d' }}>Receiver Port:</Text>
                                                <div style={{ marginTop: '4px', marginLeft: '12px' }}>
                                                    <div><Text strong style={{ fontSize: '16px' }}>{connection.TargetRPort.name}</Text></div>
                                                    {showDetails && (
                                                        <div><Text strong style={{ fontSize: '12px' }}>UUID:</Text> <Text code style={{ fontSize: '11px', marginLeft: '8px' }}>{connection.TargetRPort.uuid}</Text></div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
        );
    };

    if (loadingPrototypes) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <Spin size="large" />
                <div style={{ marginTop: '16px' }}>Loading SW Component Prototypes...</div>
            </div>
        );
    }

    return (
        <Card style={{ margin: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
                <Title level={2}>
                    <NodeCollapseOutlined style={{ marginRight: '8px' }} />
                    ARXML Component Flow Viewer
                </Title>
                <Text type="secondary">
                    Visualize scoped component connections and partners using React Flow with ELK.js layout
                </Text>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <Text strong>Select SW Component Prototype:</Text>
                <Select
                    style={{ width: '100%', marginTop: '8px' }}
                    placeholder="Choose a SW Component Prototype to visualize"
                    value={selectedPrototype}
                    onChange={handlePrototypeSelect}
                    showSearch
                    filterOption={(input, option) => {
                        const proto = prototypes.find(p => p.uuid === option?.value);
                        return proto ? proto.name.toLowerCase().includes(input.toLowerCase()) : false;
                    }}
                    loading={loadingPrototypes}
                >
                    {prototypes.map(prototype => (
                        <Option key={prototype.uuid} value={prototype.uuid}>
                            {prototype.name} ({prototype.shortName})
                        </Option>
                    ))}
                </Select>
            </div>

            {error && (
                <Alert
                    message="Error"
                    description={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: '20px' }}
                />
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: '16px' }}>Loading component flow data...</div>
                </div>
            )}

            {scopedData && !loading && (
                <>
                    <Divider orientation="left">
                        <InfoCircleOutlined /> Flow for: {selectedPrototypeName}
                    </Divider>

                    <div style={{ marginBottom: '16px', fontSize: '14px', color: '#666' }}>
                        <div style={{ display: 'flex', gap: '20px' }}>
                            <span><strong>Scope Element:</strong> {scopedData.ScopeElement?.name || 'None'}</span>
                            <span><strong>Partners:</strong> {scopedData.Partners.length}</span>
                            <span><strong>Connections:</strong> {scopedData.Connections.length}</span>
                        </div>
                    </div>

                    <div
                        style={{
                            width: '100%',
                            height: '600px',
                            border: '1px solid #d9d9d9',
                            borderRadius: '6px',
                            backgroundColor: '#fafafa'
                        }}
                    >
                        <ReactFlowProvider>
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onEdgeClick={handleEdgeClick}
                                nodeTypes={nodeTypes}
                                fitView
                                fitViewOptions={{ padding: 0.2 }}
                                minZoom={0.1}
                                maxZoom={2}
                                connectionLineType={ConnectionLineType.SmoothStep}
                                elementsSelectable={true}
                                edgesFocusable={true}
                            >
                                <Background />
                                <Controls />
                                <Panel position="top-left">
                                    <div style={{ background: 'rgba(255, 255, 255, 0.9)', padding: '8px', borderRadius: '4px', fontSize: '12px' }}>
                                        <div><strong>Legend:</strong></div>
                                        <div>🎯 Scope Element (Center)</div>
                                        <div>🔗 Partner Components</div>
                                        <div style={{ color: '#22C55E', fontWeight: 'bold' }}>■ Green: Standard Partners (P-Port OR R-Port)</div>
                                        <div style={{ color: '#3B82F6', fontWeight: 'bold' }}>■ Blue: Mixed Partners (P-Port AND R-Port)</div>
                                        <div>📡 Click edges for connection details</div>
                                    </div>
                                </Panel>
                            </ReactFlow>
                        </ReactFlowProvider>
                    </div>

                    <div style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
                        <div><strong>Instructions:</strong></div>
                        <div>• Click on connection lines to view detailed port information</div>
                        <div>• Drag nodes to reposition them</div>
                        <div>• Use mouse wheel to zoom in/out</div>
                        <div>• Drag background to pan the view</div>
                    </div>
                </>
            )}

            {!selectedPrototype && !loading && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <InfoCircleOutlined style={{ fontSize: '24px', marginBottom: '16px' }} />
                    <div>Please select a SW Component Prototype to view its flow visualization</div>
                </div>
            )}

            {renderConnectionModal()}
        </Card>
    );
}

export default ArxmlFlowViewer;