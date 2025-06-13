import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import * as d3 from 'd3';
import GraphLegend from './GraphLegend';
import NodeDetailPanel from './NodeDetailPanel';

// Dynamically import ForceGraph with loading indicator
const ForceGraph2D = dynamic(() => import('react-force-graph-2d').then(mod => mod.default), {
    ssr: false,
    loading: () => <div className="flex h-[500px] items-center justify-center rounded-lg bg-gray-100">Loading graph visualization...</div>
});

interface Node {
    id: string;
    label: string;
    type: string;
    [key: string]: unknown;
}

interface Link {
    source: string | Node;
    target: string | Node;
    type: string;
    [key: string]: unknown;
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
    }, [showParts, completeGraphData, highlightNodes, highlightLinks, updateHighlight]);

    // Zoom to fit on initial load
    useEffect(() => {
        if (graphRef.current && graphData.nodes.length > 0) {
            setTimeout(() => {
                graphRef.current.zoomToFit(400, 50);
            }, 100);
        }
    }, [graphData]);

    const handleNodeClick = (node: any) => {
        highlightNodes.clear();
        highlightLinks.clear();

        if (selectedNode === node) {
            setSelectedNode(null);
        } else {
            setSelectedNode(node);

            if (node) {
                highlightNodes.add(node);
                if (node.neighbors) {
                    node.neighbors.forEach((neighbor: any) => highlightNodes.add(neighbor));
                }
                if (node.links) {
                    node.links.forEach((link: any) => highlightLinks.add(link));
                }

                if (node.type === 'failureMode' && node.partInfo) {
                    const partNode = completeGraphData.nodes.find(n => n.id === node.partInfo.id);
                    if (partNode) {
                        highlightNodes.add(partNode);
                    }
                }
            }
        }

        updateHighlight();
    };

    const paintRing = (node: any, ctx: any) => {
        const nodeSize = node.type === 'part' ? 10 : 3; // Size for nodes
        const isHighlighted = highlightNodes.has(node);
        const isSelected = node === selectedNode;

        // Only create custom visualization for failure mode nodes
        // Part nodes will use the default visualization from ForceGraph
        if (node.type === 'failureMode') {
            // Highlight ring for failure mode nodes
            if (isHighlighted) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize * 2, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
                ctx.fill();
            }

            // Selected ring for failure mode nodes
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize * 1.8, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(75, 192, 192, 0.3)';
                ctx.fill();
            }

            // Draw the circle for failure mode nodes
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
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
                        if (node.type === 'part') {
                            return 'rgba(75, 94, 170, 0.7)'; // Blue with transparency for part nodes
                        } else {
                            return node.color ? node.color.replace(')', ', 0.7)').replace('rgb', 'rgba') : 'rgba(200, 200, 200, 0.7)';
                        }
                    }}
                    linkWidth={link => highlightLinks.has(link) ? 4 : 1}
                    linkColor={link => {
                        if (highlightLinks.has(link)) {
                            return link.type === 'has' ? '#1E88E5' : '#FF9800';
                        }
                        return link.type === 'has' ? '#90CAF9' : '#FFB74D';
                    }}
                    linkDirectionalParticles={link => highlightLinks.has(link) ? 4 : 0}
                    linkDirectionalParticleWidth={link => highlightLinks.has(link) ? 4 : 0}
                    linkDirectionalParticleColor={link => link.type === 'has' ? '#64B5F6' : '#FFA726'}
                    backgroundColor="#ffffff"
                    nodeCanvasObjectMode={node => node.type === 'failureMode' ? 'before' : undefined}
                    nodeCanvasObject={paintRing}
                    nodeLabel={node => node.name} // Use the built-in label functionality instead
                    onNodeClick={handleNodeClick}
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
                            forceGraph.d3Force('charge', d3.forceManyBody().strength(node => {
                                const hasLinks = graphData.links.some(link =>
                                    (link.source.id || link.source) === node.id ||
                                    (link.target.id || link.target) === node.id
                                );
                                // Weaker repulsion for FailureMode nodes, stronger for Part nodes
                                if (node.type === 'failureMode') {
                                    return -50; // Reduced repulsion between FailureMode nodes
                                }
                                return hasLinks ? -300 : -20; // Stronger repulsion for Part nodes
                            }));

                            // Link force (attraction between connected nodes)
                            forceGraph.d3Force('link', d3.forceLink(graphData.links).id(d => d.id).strength(link => {
                                // Stronger attraction between Parts and FailureModes
                                if (link.type === 'has') {
                                    return 1.5; // Strong attraction between Part and FailureMode
                                }
                                return 0.2; // Weaker attraction for other links (e.g., between FailureModes)
                            }).distance(30)); // Shorter distance for tighter clustering

                            // Collision force to prevent overlap
                            forceGraph.d3Force('collide', d3.forceCollide().radius(node => node.type === 'part' ? 20 : 10));

                            // Centering forces
                            forceGraph.d3Force('center', d3.forceCenter().strength(0.5));
                            forceGraph.d3Force('x', d3.forceX().strength(0.3));
                            forceGraph.d3Force('y', d3.forceY().strength(0.3));

                            // Custom force for unconnected nodes
                            forceGraph.d3Force('unconnected', alpha => {
                                graphData.nodes.forEach(node => {
                                    const hasLinks = graphData.links.some(link =>
                                        (link.source.id || link.source) === node.id ||
                                        (link.target.id || link.target) === node.id
                                    );

                                    if (!hasLinks) {
                                        const k = 1.0 * alpha;
                                        node.vx -= node.x * k;
                                        node.vy -= node.y * k;
                                    }
                                });
                            });

                            forceGraph.zoomToFit(400, 50);
                        }
                    }}
                    onNodeDragEnd={node => {
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
