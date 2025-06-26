/**
 * @file Custom hook to manage fetching, processing, and layouting of safety data for the graph.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNodesState, useEdgesState, Node, Edge } from 'reactflow';
import { message } from 'antd';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import { buildFlowDiagram } from '../utils/flow-builder';
import { getLayoutedElements } from '../services/diagramLayoutService';

/**
 * Manages the state and loading of safety graph nodes and edges.
 * - Fetches raw data from the API.
 * - Processes data into nodes and edges using `buildFlowDiagram`.
 * - Calculates the initial layout using `getLayoutedElements`.
 * - Provides state and callbacks for React Flow.
 */
export const useSafetyData = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);

    const loadDataAndLayout = useCallback(async () => {
        setLoading(true);
        try {
            const safetyData = await getSafetyGraph();
            if (safetyData.success && safetyData.data) {
                const { nodes: initialNodes, edges: initialEdges } = buildFlowDiagram(safetyData.data);
                if (initialNodes.length > 0) {
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges) as { nodes: Node[], edges: Edge[] };
                    setNodes(layoutedNodes);
                    setEdges(layoutedEdges);
                } else {
                    setNodes([]);
                    setEdges([]);
                }
            } else {
                message.error("Failed to load safety graph data.");
            }
        } catch (error) {
            message.error("An error occurred while fetching safety data.");
            console.error("Failed to fetch and layout safety data:", error);
        } finally {
            setLoading(false);
        }
    }, [setNodes, setEdges]);

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
        setNodes
    };
}; 