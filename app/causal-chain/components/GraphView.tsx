import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import * as d3 from 'd3';
import GraphLegend from './GraphLegend';
import NodeDetailPanel from './NodeDetailPanel';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d').then(mod => mod.default), {
    ssr: false,
    loading: () => <div className="flex h-[500px] items-center justify-center rounded-lg bg-gray-100">Loading graph visualization...</div>
});

interface Node {
    id: string;
    label: string;
    type: string;
    [key: string]: unknown;
    // D3 simulation properties
    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number; // Changed from number | null | undefined to number | undefined
    fy?: number; // Changed from number | null | undefined to number | undefined
    // custom properties used in code
    name?: string;
    color?: string;
    neighbors?: Node[];
    links?: Link[];
    partInfo?: { id: string };
}

interface Link {
    source: string | Node;
    target: string | Node;
    type: string;
    [key: string]: unknown;
    // D3 simulation properties
    index?: number;
}

interface GraphViewProps {
    completeGraphData: { nodes: Node[], links: Link[] };
    partsWithFailureModes: Node[];
    dataLimit: number;
    onLoadMore: () => void;
}

const GraphView: React.FC<GraphViewProps> = ({
    completeGraphData,
    partsWithFailureModes,
    dataLimit,
    onLoadMore
}) => {
    const [graphData, setGraphData] = useState<{ nodes: Node[], links: Link[] }>({ nodes: [], links: [] });
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [showParts, setShowParts] = useState<boolean>(false);

    // Ref for ForceGraph2D
    const graphRef = useRef<any>(null);

    // Function to store the graph instance
    const setGraphInstance = (instance: any) => {
        graphRef.current = instance;
    };

    const updateHighlight = () => {
        setHighlightNodes(new Set(highlightNodes));
        setHighlightLinks(new Set(highlightLinks));
    };

    useEffect(() => {
        if (completeGraphData.nodes.length > 0) {
            if (showParts) {
                setGraphData(completeGraphData);
            } else {
                const failureModeNodes = completeGraphData.nodes.filter(node => node.type === 'failureMode');
                const failureModeLinks = completeGraphData.links.filter(link => {
                    return link.type === 'causes';
                });

                setGraphData({
                    nodes: failureModeNodes,
                    links: failureModeLinks
                });
            }

            highlightNodes.clear();
            highlightLinks.clear();
            updateHighlight();
            setSelectedNode(null);
        }
    }, [showParts, completeGraphData, highlightNodes, highlightLinks]); // Removed updateHighlight from dependencies

    // Zoom to fit on initial load
    useEffect(() => {
        if (graphRef.current && graphData.nodes.length > 0) {
            setTimeout(() => {
                graphRef.current.zoomToFit(400, 50);
            }, 100);
        }
    }, [graphData]);

    const handleNodeClick = (genericNode: any, event?: MouseEvent) => { // Changed node to genericNode: any, added event?: MouseEvent 
        const node = genericNode as Node; // Cast to our Node type
        highlightNodes.clear();
        highlightLinks.clear();

        if (selectedNode === node) {
            setSelectedNode(null);
        } else {
            setSelectedNode(node);

            if (node) {
                highlightNodes.add(node);
                if (node.neighbors) {
                    node.neighbors.forEach((neighbor: Node) => highlightNodes.add(neighbor)); // Typed neighbor
                }
                if (node.links) {
                    node.links.forEach((link: Link) => highlightLinks.add(link)); // Typed link
                }

                if (node.type === 'failureMode' && node.partInfo) {
                    const partNode = completeGraphData.nodes.find(n => n.id === (node.partInfo as { id: string }).id); // Added assertion for partInfo.id
                    if (partNode) {
                        highlightNodes.add(partNode);
                    }
                }
            }
        }

        updateHighlight();
    };

    const paintRing = (genericNode: any, ctx: CanvasRenderingContext2D) => { // Changed node to genericNode: any
        const node = genericNode as Node; // Cast to our Node type
        const nodeSize = node.type === 'part' ? 10 : 3; // Size for nodes
        const isHighlighted = highlightNodes.has(node);
        const isSelected = node === selectedNode;

        // Only create custom visualization for failure mode nodes
        // Part nodes will use the default visualization from ForceGraph
        if ((node as Node).type === 'failureMode') {
            // Highlight ring for failure mode nodes
            if (isHighlighted) {
                ctx.beginPath();
                ctx.arc(node.x!, node.y!, nodeSize * 2, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
                ctx.fill();
            }

            // Selected ring for failure mode nodes
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(node.x!, node.y!, nodeSize * 1.8, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(75, 192, 192, 0.3)';
                ctx.fill();
            }

            // Draw the circle for failure mode nodes
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, nodeSize, 0, 2 * Math.PI);
            ctx.fillStyle = node.color ? node.color.replace(')', ', 0.7)').replace('rgb', 'rgba') : 'rgba(200, 200, 200, 0.7)';
            ctx.fill();
            
            // Circle border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.stroke();
        }
    };

    return (
        <div className="mb-10" id="GraphIntro">
            <GraphLegend
                showParts={showParts}
                onToggleParts={() => setShowParts(!showParts)}
                partsWithFailureModes={partsWithFailureModes}
                dataLimit={dataLimit}
                onLoadMore={onLoadMore}
            />

            <div className="relative h-[1000px] overflow-hidden bg-gradient-to-br from-white to-gray-50">
                <ForceGraph2D
                    graphData={graphData}
                    nodeRelSize={3}
                    autoPauseRedraw={false}
                    nodeColor={node => {
                        // Add transparency to all nodes
                        if ((node as Node).type === 'part') { // Cast node to Node
                            return 'rgba(75, 94, 170, 0.7)'; // Blue with transparency for part nodes
                        } else {
                            return (node as Node).color ? (node as Node).color!.replace(')', ', 0.7)').replace('rgb', 'rgba') : 'rgba(200, 200, 200, 0.7)'; // Cast node to Node
                        }
                    }}
                    linkWidth={link => highlightLinks.has(link) ? 4 : 1}
                    linkColor={link => {
                        if (highlightLinks.has(link)) {
                            return (link as Link).type === 'has' ? '#1E88E5' : '#FF9800'; // Cast link to Link
                        }
                        return (link as Link).type === 'has' ? '#90CAF9' : '#FFB74D'; // Cast link to Link
                    }}
                    linkDirectionalParticles={link => highlightLinks.has(link) ? 4 : 0}
                    linkDirectionalParticleWidth={link => highlightLinks.has(link) ? 4 : 0}
                    linkDirectionalParticleColor={link => (link as Link).type === 'has' ? '#64B5F6' : '#FFA726'} // Cast link to Link
                    backgroundColor="#ffffff"
                    nodeCanvasObjectMode={genericNode => (genericNode as Node).type === 'failureMode' ? 'before' : undefined} // Changed node to genericNode and cast
                    nodeCanvasObject={paintRing}
                    nodeLabel={genericNode => (genericNode as Node).name || ''} // Changed node to genericNode, cast, and added || '' to ensure string return
                    onNodeClick={handleNodeClick}
                    // @ts-expect-error TODO: Library type issue for linkDistance
                    linkDistance={50}
                    cooldownTime={2000}
                    d3AlphaDecay={0.02}
                    d3VelocityDecay={0.2}
                    warmupTicks={50}
                    cooldownTicks={50}
                    onRender={setGraphInstance}
                    onEngineStop={() => {
                        const forceGraph = graphRef.current;
                        if (forceGraph) {
                            // Charge force (repulsion between nodes)
                            forceGraph.d3Force('charge', d3.forceManyBody().strength(n => { // n is SimulationNodeDatum
                                const node = n as Node; // Cast to our Node type
                                const hasLinks = graphData.links.some(link =>
                                    (typeof link.source === 'string' ? link.source : (link.source as Node).id) === node.id ||
                                    (typeof link.target === 'string' ? link.target : (link.target as Node).id) === node.id
                                );
                                // Weaker repulsion for FailureMode nodes, stronger for Part nodes
                                if (node.type === 'failureMode') {
                                    return -50; // Reduced repulsion between FailureMode nodes
                                }
                                return hasLinks ? -300 : -20; // Stronger repulsion for Part nodes
                            }));

                            // Link force (attraction between connected nodes)
                            forceGraph.d3Force('link', d3.forceLink<Node, Link>(graphData.links as any).id(d => (d as Node).id).strength(l => { // l is SimulationLinkDatum
                                const link = l as Link; // Cast to our Link type
                                // Stronger attraction between Parts and FailureModes
                                if (link.type === 'has') {
                                    return 1.5; // Strong attraction between Part and FailureMode
                                }
                                return 0.2; // Weaker attraction for other links (e.g., between FailureModes)
                            }).distance(30)); // Shorter distance for tighter clustering

                            // Collision force to prevent overlap
                            forceGraph.d3Force('collide', d3.forceCollide().radius(n => (n as Node).type === 'part' ? 20 : 10));

                            // Centering forces
                            forceGraph.d3Force('center', d3.forceCenter().strength(0.5));
                            forceGraph.d3Force('x', d3.forceX().strength(0.3));
                            forceGraph.d3Force('y', d3.forceY().strength(0.3));

                            // Custom force for unconnected nodes
                            forceGraph.d3Force('unconnected', (alpha: number) => { // Typed alpha
                                graphData.nodes.forEach(node => { // node is our Node type
                                    const hasLinks = graphData.links.some(link =>
                                        (typeof link.source === 'string' ? link.source : (link.source as Node).id) === node.id ||
                                        (typeof link.target === 'string' ? link.target : (link.target as Node).id) === node.id
                                    );

                                    if (!hasLinks) {
                                        const k = 1.0 * alpha;
                                        node.vx = (node.vx ?? 0) - (node.x ?? 0) * k;
                                        node.vy = (node.vy ?? 0) - (node.y ?? 0) * k;
                                    }
                                });
                            });

                            forceGraph.zoomToFit(400, 50);
                        }
                    }}
                    onNodeDragEnd={genericNode => { // Changed node to genericNode
                        const node = genericNode as Node; // Cast to our Node type
                        node.fx = node.x;
                        node.fy = node.y;
                    }}
                    onBackgroundClick={() => {
                        const nodes = graphData.nodes.map(node => {
                            delete node.fx;
                            delete node.fy;
                            return node;
                        });
                        setGraphData({ ...graphData, nodes });

                        highlightNodes.clear();
                        highlightLinks.clear();
                        updateHighlight();
                        setSelectedNode(null);
                    }}
                />
                {selectedNode && <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
            </div>
        </div>
    );
};

export default GraphView;
