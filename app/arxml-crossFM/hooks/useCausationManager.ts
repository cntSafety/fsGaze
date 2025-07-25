/**
 * @file Custom hook for managing causation-related user interactions.
 */
'use client';

import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { Connection, Edge, addEdge, MarkerType, Node } from 'reactflow';
import { message } from 'antd';
import { createCausationBetweenFailureModes, deleteCausationNode } from '@/app/services/neo4j/queries/safety/causation';

/**
 * Manages all user interactions for creating and deleting causation links.
 * - Handles the `onConnect` logic to create a new causation.
 * - Manages the state and visibility of the right-click context menu.
 * - Handles the logic for deleting a causation link.
 * 
 * @param nodes The current array of nodes from React Flow state.
 * @param setEdges The state setter function for edges from React Flow state.
 */
export const useCausationManager = (nodes: Node[], setEdges: Dispatch<SetStateAction<Edge[]>>) => {
    const [isCreatingCausation, setIsCreatingCausation] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        visible: boolean;
        x: number;
        y: number;
        edgeId: string;
        causationUuid: string;
        causationName: string;
    } | null>(null);

    const onConnect = useCallback(async (params: Connection) => {
        if (isCreatingCausation) return;

        const sourceNode = nodes.find(node => node.id === params.source);
        const targetNode = nodes.find(node => node.id === params.target);

        if (!sourceNode || !targetNode) {
            message.error('Could not find source or target component node.');
            return;
        }

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
                
                const newEdge: Edge = {
                    id: `causation-${result.causationUuid}`,
                    source: params.source!,
                    target: params.target!,
                    sourceHandle: params.sourceHandle,
                    targetHandle: params.targetHandle,
                    type: 'smoothstep',
                    animated: false,
                    style: {
                        strokeWidth: 1.5,
                        stroke: '#94a3b8',
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },
                    data: {
                        causationUuid: result.causationUuid,
                        causationName: result.message,
                        type: 'causation'
                    }
                };
                setEdges((eds: Edge[]) => addEdge(newEdge, eds));
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
                setEdges((eds: Edge[]) => eds.filter((edge) => edge.id !== contextMenu.edgeId));
            } else {
                message.error({ content: `Failed to delete causation: ${result.message}`, key: 'delete-causation', duration: 4 });
            }
        } catch (error) {
            message.error({ content: 'An error occurred while deleting causation.', key: 'create-causation', duration: 4 });
        } finally {
            hideContextMenu();
        }
    }, [contextMenu, hideContextMenu, setEdges]);

    return {
        contextMenu,
        onConnect,
        onEdgeContextMenu,
        handleDeleteCausation,
        hideContextMenu
    };
}; 