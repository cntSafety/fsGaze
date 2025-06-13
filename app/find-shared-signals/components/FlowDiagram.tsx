'use client';

import React, { useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    Background,
    Controls,
    Handle,
    Position,
    NodeProps,
    useNodesState,
    useEdgesState,
    addEdge,
    useReactFlow,
    getNodesBounds,
    getViewportForBounds,
    Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Custom node component for action nodes
const CustomActionNode = ({ data }: NodeProps) => (
    <div className={`relative rounded-lg px-4 py-2 shadow ${data.borderColor ? `border- border-2${data.borderColor}` : 'border border-gray-200 dark:border-gray-700'}`}
        style={{
            backgroundColor: data.type === 'action' ? '#4299E1' : '#9F7AEA',
            borderColor: data.borderColor,
            borderWidth: data.borderWidth,
            minWidth: '150px',
            maxWidth: '250px',
        }}>
        <div className="truncate text-center text-sm font-semibold text-white">{data.label}</div>
        {data.requirements && (
            <div className={`absolute inset-x-0 z-10 rounded bg-white bg-opacity-10 p-1 text-xs text-white transition-opacity duration-200 ${data.showRequirements ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                style={{
                    top: '100%',
                    marginTop: '4px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    fontSize: '0.7rem',
                    lineHeight: '1.2',
                    maxWidth: '240px',
                }}>
                <div className="font-medium text-opacity-90">Requirements:</div>
                <div className="text-opacity-80">{data.requirements}</div>
            </div>
        )}
        <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
        <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
    </div>
);

// Node types definition
const nodeTypes = {
    custom: CustomActionNode,
};

interface FlowDiagramProps {
    nodes: any[];
    edges: any[];
    height?: string;
    width?: string;
    requirements?: Record<string, string>;
}

// Define the public API that will be exposed via the ref
export interface FlowDiagramHandle {
    toImage: (options?: {
        width?: number;
        height?: number;
        quality?: number;
        type?: string;
        backgroundColor?: string;
    }) => Promise<string>;
}

// Wrap the internal component that uses useReactFlow hook
const FlowDiagramInner = forwardRef<FlowDiagramHandle, FlowDiagramProps>(
    ({ nodes: initialNodes, edges: initialEdges, height = '600px', requirements = {} }, ref) => {
        const reactFlowInstance = useReactFlow();

        // Expose the toImage method via ref
        useImperativeHandle(ref, () => ({
            toImage: (options = {}) => {
                // Create a simple image export function
                const imageWidth = options.width || 1920;
                const imageHeight = options.height || 1080;
                
                // Get the React Flow wrapper element
                const rfInstance = reactFlowInstance;
                const nodesBounds = getNodesBounds(nodes);
                const viewport = getViewportForBounds(nodesBounds, imageWidth, imageHeight, 0.5, 2);
                
                // Use HTML2Canvas or similar approach
                return new Promise((resolve) => {
                    // For now, return a simple data URL - you might want to implement proper image export
                    const canvas = document.createElement('canvas');
                    canvas.width = imageWidth;
                    canvas.height = imageHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, imageWidth, imageHeight);
                        ctx.fillStyle = '#000000';
                        ctx.font = '16px Arial';
                        ctx.fillText('Flow Diagram Export', 50, 50);
                    }
                    resolve(canvas.toDataURL());
                });
            }
        }));

        // State for requirements visibility - separate from node state
        const [showRequirements, setShowRequirements] = useState(false);

        // Prepare the enhanced nodes with requirements once
        const enhancedInitialNodes = useMemo(() => {
            return initialNodes.map(node => ({
                ...node,
                data: {
                    ...node.data,
                    // Don't include showRequirements here - we'll use our separate state
                    requirements: requirements[node.id] || "No requirements specified"
                }
            }));
        }, [initialNodes, requirements]);

        // Use ReactFlow's state management hooks
        const [nodes, setNodes, onNodesChange] = useNodesState(enhancedInitialNodes);
        const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

        // Simple toggle function - doesn't modify nodes directly
        const toggleRequirements = useCallback(() => {
            setShowRequirements(prev => !prev);
        }, []);

        // Handle connections
        const onConnect = useCallback((params: Connection) => {
            setEdges((eds) => addEdge(params, eds));
        }, [setEdges]);

        // Apply the current showRequirements value to nodes before rendering
        const displayNodes = useMemo(() => {
            // Filter nodes based on type - only show requirement nodes when showRequirements is true
            return nodes.filter(node => {
                // Keep all nodes that are not requirements
                if (node.data.type !== 'requirement') {
                    return true;
                }
                // Only include requirement nodes when showRequirements is true
                return showRequirements;
            });
        }, [nodes, showRequirements]);

        return (
            <div style={{ height }} className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <ReactFlow
                    nodes={displayNodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodesDraggable={true}
                    edgesFocusable={true}
                    elementsSelectable={true}
                    fitView
                    attributionPosition="bottom-right"
                    minZoom={0.2}
                    maxZoom={4}
                >
                    <Controls />
                    <Background color="#aaa" gap={16} />
                    <div className="absolute right-16 top-2 z-10">
                        <button
                            onClick={toggleRequirements}
                            className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white shadow-md transition-colors hover:bg-blue-600"
                        >
                            {showRequirements ? 'Hide Requirements' : 'Show Requirements'}
                        </button>
                    </div>
                </ReactFlow>
            </div>
        );
    }
);

// Add display name for the inner component
FlowDiagramInner.displayName = 'FlowDiagramInner';

// Export the wrapped component with ReactFlowProvider
const FlowDiagram = forwardRef<FlowDiagramHandle, FlowDiagramProps>((props, ref) => (
    <ReactFlowProvider>
        <FlowDiagramInner {...props} ref={ref} />
    </ReactFlowProvider>
));

FlowDiagram.displayName = 'FlowDiagram';

export default FlowDiagram;
