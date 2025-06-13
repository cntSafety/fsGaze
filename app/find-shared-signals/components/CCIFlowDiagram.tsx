import React, { forwardRef } from 'react';
import FlowDiagram from './FlowDiagram';
import GraphLegend from './GraphLegend';

interface FlowNode {
    id: string;
    type: 'custom';
    position: { x: number; y: number };
    data: {
        label: string;
        type: 'action' | 'requirement';
        borderColor?: string;
        borderWidth?: number;
    };
}

interface FlowEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: string;
    animated?: boolean;
    style?: React.CSSProperties;
}

interface CCIFlowDiagramProps {
    nodes: FlowNode[];
    edges: FlowEdge[];
    layouting: boolean;
    hasCCIResults: boolean;
    onExport: () => void;
}

export interface CCIFlowDiagramHandle {
    getDiagramRef: () => any;
    toImage: (options?: any) => Promise<string>;
}

const CCIFlowDiagram = forwardRef<CCIFlowDiagramHandle, CCIFlowDiagramProps>(
    ({ nodes, edges, layouting, hasCCIResults, onExport }, ref) => {
        const flowDiagramRef = React.useRef<{ toImage: (options?: any) => Promise<string> } | null>(null);

        // Expose the diagram ref through the forwarded ref
        React.useImperativeHandle(ref, () => ({
            getDiagramRef: () => flowDiagramRef.current,
            toImage: (options?: any) => {
                if (flowDiagramRef.current) {
                    return flowDiagramRef.current.toImage(options);
                }
                return Promise.reject(new Error('Diagram not available'));
            }
        }));

        if (layouting) {
            return (
                <div className="flex h-[600px] items-center justify-center rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
                    <div className="size-12 animate-spin rounded-full border-b-2 border-blue-500 dark:border-blue-400"></div>
                    <p className="ml-4 text-gray-700 dark:text-gray-300">Applying layout...</p>
                </div>
            );
        }

        if (nodes.length === 0 || edges.length === 0) {
            return (
                <div className="flex h-[600px] items-center justify-center rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
                    <p className="text-gray-500 dark:text-gray-400">No data to display</p>
                </div>
            );
        }

        return (
            <>
                <GraphLegend hasCCIResults={hasCCIResults} />

                <div className="relative w-full" style={{ width: "100%", height: "80vh", maxWidth: "100%" }}>
                    <FlowDiagram
                        ref={flowDiagramRef}
                        nodes={nodes}
                        edges={edges}
                        height="100%"
                        width="100%"
                        key="flow-diagram"
                    />
                </div>

                {/* Export Button */}
{/*                 <div className="mt-4 flex justify-end">
                    <button
                        onClick={onExport}
                        disabled={layouting || nodes.length === 0}
                        className="flex items-center rounded bg-green-600 px-4 py-2 font-bold text-white shadow transition duration-200 hover:bg-green-700 disabled:bg-gray-400"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export as PNG
                    </button>
                </div> */}
            </>
        );
    }
);

CCIFlowDiagram.displayName = 'CCIFlowDiagram';

export default CCIFlowDiagram;
