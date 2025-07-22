/**
 * @file Custom hook to manage fetching, processing, and layouting of safety data for the graph.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNodesState, useEdgesState, Node, Edge, MarkerType } from 'reactflow';
import { message } from 'antd';
import { getSafetyGraphForDiagram } from '@/app/services/neo4j/queries/safety/exportGraph';
import { getPartnerPortsForComponentsOptimized } from '@/app/services/neo4j/queries/ports';
import { buildFlowDiagram } from '../utils/flow-builder';
import { getLayoutedElements } from '../services/diagramLayoutService';
import { FullPortConnectionInfo } from '@/app/services/neo4j/types';

/**
 * Custom hook to manage the data and layout of the cross-component flow diagram.
 * This hook handles fetching the initial safety graph, and optionally fetching
 * and merging all port connections for a complete system view.
 * @param showPortConnections - A boolean to control whether to fetch and display port-to-port connections.
 */
export const useSafetyData = (showPortConnections: boolean) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);

    const baseEdgesRef = useRef<Edge[]>([]);
    const portConnectionEdgesRef = useRef<Edge[]>([]);
    
    const loadDataAndLayout = useCallback(async () => {
        setLoading(true);
        try {
            const safetyGraphResult = await getSafetyGraphForDiagram();
            if (!safetyGraphResult.success || !safetyGraphResult.data) {
                message.error("Failed to load safety graph data.");
                setLoading(false);
                return;
            }

            let initialNodes: Node[] = [];
            
            const { nodes: safetyNodes, edges: safetyEdges } = buildFlowDiagram(safetyGraphResult.data);
            initialNodes = safetyNodes;
            baseEdgesRef.current = safetyEdges;

            const componentUuids = initialNodes.map(node => node.id);
            const portConnectionsResult = await getPartnerPortsForComponentsOptimized(componentUuids);

            if (portConnectionsResult && portConnectionsResult.records) {
                const allConnections: FullPortConnectionInfo[] = portConnectionsResult.records.map(record => ({
                    sourcePortUuid: record.get('sourcePortUUID'),
                    sourcePortName: record.get('sourcePortName'),
                    sourceComponentUuid: record.get('sourceComponentUUID'),
                    sourceComponentName: record.get('sourceComponentName'),
                    targetPortUuid: record.get('partnerPortUUID'),
                    targetPortName: record.get('partnerPortName'),
                    targetComponentUuid: record.get('partnerPortOwnerUUID'),
                    targetComponentName: record.get('partnerPortOwner'),
                }));
                
                const finalNodeIds = new Set(initialNodes.map(n => n.id));
                portConnectionEdgesRef.current = allConnections
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
            }
            
            if (initialNodes.length > 0) {
                const initialEdges = showPortConnections ? [...baseEdgesRef.current, ...portConnectionEdgesRef.current] : [...baseEdgesRef.current];
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
    }, [showPortConnections, setNodes, setEdges]);

    useEffect(() => {
        loadDataAndLayout();
    }, []);

    useEffect(() => {
        if (showPortConnections) {
            setEdges(currentEdges => {
                const newEdges = [...baseEdgesRef.current, ...portConnectionEdgesRef.current];
                const currentEdgeIds = new Set(currentEdges.map(e => e.id));
                const edgesToAdd = newEdges.filter(e => !currentEdgeIds.has(e.id));
                return [...currentEdges, ...edgesToAdd];
            });
        } else {
            setEdges(baseEdgesRef.current);
        }
    }, [showPortConnections, setEdges]);

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