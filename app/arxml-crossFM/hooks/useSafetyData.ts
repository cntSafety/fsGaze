/**
 * @file Custom hook to manage fetching, processing, and layouting of safety data for the graph.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNodesState, useEdgesState, Node, Edge, MarkerType } from 'reactflow';
import { message } from 'antd';
import { getSafetyGraphForDiagram } from '@/app/services/neo4j/queries/safety/exportGraph';
import { getAllPortConnections } from '@/app/services/neo4j/queries/ports';
import { buildFlowDiagram } from '../utils/flow-builder';
import { getLayoutedElements } from '../services/diagramLayoutService';
import { FullPortConnectionInfo } from '@/app/services/neo4j/types';

/**
 * Custom hook to manage the data and layout of the cross-component flow diagram.
 * This hook handles fetching the initial safety graph, and optionally fetching
 * and merging all port connections for a complete system view.
 * @param isBigPictureMode - A boolean to control whether to fetch all components or only those with safety causations.
 * @param showPortConnections - A boolean to control whether to fetch and display port-to-port connections.
 */
export const useSafetyData = (isBigPictureMode: boolean, showPortConnections: boolean) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);

    const loadDataAndLayout = useCallback(async () => {
        setLoading(true);
        try {
            // Always fetch the base safety graph
            const safetyGraphResult = await getSafetyGraphForDiagram();
            if (!safetyGraphResult.success || !safetyGraphResult.data) {
                message.error("Failed to load safety graph data.");
                setLoading(false);
                return;
            }

            let initialNodes: Node[] = [];
            let initialEdges: Edge[] = [];
            
            const { nodes: safetyNodes, edges: safetyEdges } = buildFlowDiagram(safetyGraphResult.data);
            initialNodes = safetyNodes;
            initialEdges = safetyEdges;

            // If either big picture mode is enabled OR the user wants to see port connections,
            // we need to fetch the connection data.
            if (isBigPictureMode || showPortConnections) {
                const portConnectionsResult = await getAllPortConnections();
                if (portConnectionsResult.success && portConnectionsResult.data) {
                    const allConnections = portConnectionsResult.data;
                    
                    if (isBigPictureMode) {
                        // Big Picture Mode: Add new nodes for components found only in port connections
                        const existingNodeIds = new Set(initialNodes.map(n => n.id));
                        const newComponentData = new Map<string, { name: string; providerPorts: any[]; receiverPorts: any[] }>();

                        allConnections.forEach(conn => {
                            // Process source component (P-Port)
                            if (!existingNodeIds.has(conn.sourceComponentUuid)) {
                                if (!newComponentData.has(conn.sourceComponentUuid)) {
                                    newComponentData.set(conn.sourceComponentUuid, { name: conn.sourceComponentName, providerPorts: [], receiverPorts: [] });
                                }
                                const component = newComponentData.get(conn.sourceComponentUuid)!;
                                if (!component.providerPorts.some(p => p.uuid === conn.sourcePortUuid)) {
                                    component.providerPorts.push({ uuid: conn.sourcePortUuid, name: conn.sourcePortName, failureModes: [] });
                                }
                            }

                            // Process target component (R-Port)
                            if (!existingNodeIds.has(conn.targetComponentUuid)) {
                                if (!newComponentData.has(conn.targetComponentUuid)) {
                                    newComponentData.set(conn.targetComponentUuid, { name: conn.targetComponentName, providerPorts: [], receiverPorts: [] });
                                }
                                const component = newComponentData.get(conn.targetComponentUuid)!;
                                if (!component.receiverPorts.some(p => p.uuid === conn.targetPortUuid)) {
                                    component.receiverPorts.push({ uuid: conn.targetPortUuid, name: conn.targetPortName, failureModes: [] });
                                }
                            }
                        });
                        
                        const newNodes: Node[] = Array.from(newComponentData.entries()).map(([uuid, data]) => ({
                            id: uuid, type: 'swComponent', position: { x: 0, y: 0 },
                            data: { component: { uuid, name: data.name }, providerPorts: data.providerPorts, receiverPorts: data.receiverPorts, handleToFailureMap: new Map() },
                        }));
                        initialNodes.push(...newNodes);
                    }

                    if (showPortConnections) {
                        // Add port connection edges, but only for nodes that are currently in the diagram
                        const finalNodeIds = new Set(initialNodes.map(n => n.id));
                        const portEdges = allConnections
                            .filter(conn => finalNodeIds.has(conn.sourceComponentUuid) && finalNodeIds.has(conn.targetComponentUuid))
                            .map((conn): Edge => ({
                                id: `pconn-${conn.sourcePortUuid}-${conn.targetPortUuid}`,
                                source: conn.sourceComponentUuid,
                                target: conn.targetComponentUuid,
                                sourceHandle: `port-${conn.sourcePortUuid}`,
                                targetHandle: `port-${conn.targetPortUuid}`,
                                type: 'smoothstep',
                                style: { stroke: '#0ea5e9', strokeWidth: 2, strokeDasharray: '5 5' },
                                markerEnd: { type: MarkerType.ArrowClosed, color: '#0ea5e9' },
                                zIndex: -1,
                            }));
                        initialEdges.push(...portEdges);
                    }
                }
            }
            
            // Re-run layout with the potentially expanded set of nodes and edges
            if (initialNodes.length > 0) {
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges) as { nodes: Node[], edges: Edge[] };
                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
            } else {
                setNodes([]);
                setEdges([]);
            }

        } catch (error) {
            message.error("An error occurred while fetching diagram data.");
            console.error("Failed to fetch and layout data:", error);
        } finally {
            setLoading(false);
        }
    }, [isBigPictureMode, showPortConnections, setNodes, setEdges]);

    useEffect(() => {
        loadDataAndLayout();
    }, [loadDataAndLayout]);

    return {
        nodes,
        edges,
        loading,
        onNodesChange,
        onEdgesChange,
        setEdges,
        loadDataAndLayout,
        setNodes,
    };
}; 