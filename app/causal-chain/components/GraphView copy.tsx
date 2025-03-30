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

interface GraphViewProps {
    completeGraphData: { nodes: any[], links: any[] };
    partsWithFailureModes: any[];
    dataLimit: number;
    onLoadMore: () => void;
}

const GraphView: React.FC<GraphViewProps> = ({
    completeGraphData,
    partsWithFailureModes,
    dataLimit,
    onLoadMore
}) => {
    const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());
    const [selectedNode, setSelectedNode] = useState(null);
    const [showParts, setShowParts] = useState<boolean>(false);

    // Ref for ForceGraph2D
    const graphRef = useRef(null);

    // Function to store the graph instance
    const setGraphInstance = (instance) => {
        graphRef.current = instance;
    };

    useEffect(() => {
        if (completeGraphData.nodes.length > 0) {
            if (showParts) {
                setGraphData(completeGraphData);
            } else {
                const failureModeNodes = completeGraphData.nodes.filter(node => node.type === 'failureMode');
                const failureModeLinks = completeGraphData.links.filter(link => {
                    const source = typeof link.source === 'object' ? link.source.id : link.source;
                    const target = typeof link.target === 'object' ? link.target.id : link.target;
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
    }, [showParts, completeGraphData]);

    // Zoom to fit on initial load
    useEffect(() => {
        if (graphRef.current && graphData.nodes.length > 0) {
            setTimeout(() => {
                graphRef.current.zoomToFit(400, 50);
            }, 100);
        }
    }, [graphData]);

    const updateHighlight = () => {
        setHighlightNodes(new Set(highlightNodes));
        setHighlightLinks(new Set(highlightLinks));
    };

    const handleNodeClick = (node) => {
        highlightNodes.clear();
        highlightLinks.clear();

        if (selectedNode === node) {
            setSelectedNode(null);
        } else {
            setSelectedNode(node);

            if (node) {
                highlightNodes.add(node);
                if (node.neighbors) {
                    node.neighbors.forEach(neighbor => highlightNodes.add(neighbor));
                }
                if (node.links) {
                    node.links.forEach(link => highlightLinks.add(link));
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

    const paintRing = (node, ctx, globalScale) => {
        // Set a base font size that scales down with zoom
        const baseFontSize = 8;
        const fontSize = Math.max(baseFontSize / globalScale, 2);
        ctx.font = `${fontSize}px Sans-Serif`;

        // Cache text measurements and wrap text
        if (!node._cachedLines) {
            const maxWidth = 200;
            const words = node.name.split(' ');
            const lines = [];
            let currentLine = words[0];

            for (let i = 1; i < words.length; i++) {
                const testLine = currentLine + ' ' + words[i];
                const testWidth = ctx.measureText(testLine).width;
                if (testWidth > maxWidth) {
                    lines.push(currentLine);
                    currentLine = words[i];
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);

            node._cachedLines = lines;
            node._cachedFontSize = fontSize;
            const lineHeight = fontSize * 1.2;
            node._cachedLineHeight = lineHeight;
            const textWidth = Math.min(maxWidth, Math.max(...lines.map(line => ctx.measureText(line).width)));
            const textHeight = lines.length * lineHeight;
            node._cachedBckgDimensions = [textWidth, textHeight];
        }

        const nodeSize = node.type === 'part' ? 10 : 3; // Larger size for rectangles
        const isHighlighted = highlightNodes.has(node);
        const isSelected = node === selectedNode;

        // Highlight ring (for both types of nodes)
        if (isHighlighted) {
            ctx.beginPath();
            if (node.type === 'part') {
                ctx.rect(node.x - nodeSize * 1.5, node.y - nodeSize, nodeSize * 3, nodeSize * 2);
            } else {
                ctx.arc(node.x, node.y, nodeSize * 2, 0, 2 * Math.PI, false);
            }
            ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
            ctx.fill();
        }

        // Selected ring
        if (isSelected) {
            ctx.beginPath();
            if (node.type === 'part') {
                ctx.rect(node.x - nodeSize * 1.4, node.y - nodeSize * 0.9, nodeSize * 2.8, nodeSize * 1.8);
            } else {
                ctx.arc(node.x, node.y, nodeSize * 1.8, 0, 2 * Math.PI, false);
            }
            ctx.fillStyle = 'rgba(75, 192, 192, 0.3)';
            ctx.fill();
        }

        // Draw the node itself
        ctx.beginPath();
        if (node.type === 'part') {
            // Draw a rectangle for Part nodes
            ctx.rect(node.x - nodeSize * 1.2, node.y - nodeSize * 0.8, nodeSize * 2.4, nodeSize * 1.6);
            ctx.fillStyle = '#4B5EAA'; // Standard color for Part nodes
        } else {
            // Draw a circle for FailureMode nodes
            ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
            ctx.fillStyle = node.color; // Use the node's color for FailureMode nodes
        }
        ctx.fill();

        // Node border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        const textHeight = node._cachedBckgDimensions[1];
        const textWidth = node._cachedBckgDimensions[0];

        const textY = node.type === 'part'
            ? node.y - nodeSize - textHeight / 2 - 2
            : node.y + nodeSize + textHeight / 2 + 2;

        // Remove or make the background fully transparent by setting alpha to 0
        ctx.fillStyle = 'rgba(255, 255, 255, 0)';  // Set alpha to 0 for full transparency
        
        ctx.fillRect(
            node.x - textWidth / 2 - 2,
            textY - textHeight / 2 - 2,
            textWidth + 4,
            textHeight + 4
        );

        ctx.fillStyle = '#000';
        node._cachedLines.forEach((line, index) => {
            const lineY = textY - textHeight / 2 + (index + 0.5) * node._cachedLineHeight;
            ctx.fillText(line, node.x, lineY);
        });
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

            {/* <div className="relative h-[900px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"> */}
            <div className="relative h-[1000px] overflow-hidden bg-gradient-to-br from-white to-gray-50">
                <ForceGraph2D
                    graphData={graphData}
                    nodeRelSize={3}
                    autoPauseRedraw={false}
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
                    nodeCanvasObjectMode={() => 'before'}
                    nodeCanvasObject={paintRing}
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
