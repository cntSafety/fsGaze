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
import { executeNeo4jQuery } from '../services/KerMLToNeoService';
// import ELK from 'elkjs/lib/elk.bundled.js';

// Interface definitions
interface FailureMode {
    name: string;
    elementId: string;
    qualifiedName: string;
    effects: string[];
}

interface PartUsage {
    name: string;
    elementId: string;
    qualifiedName: string;
}

interface PartWithFailureModes {
    part: PartUsage;
    failureModes: FailureMode[];
}

// Custom Part Container Node - moved inside the component
function PartNode({ data }: { data: any }) {
    return (
        <div className="part-container" style={{
            padding: '15px',
            borderRadius: '8px',
            background: 'rgba(66, 153, 225, 0.15)',
            border: '2px solid #4299E1',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
        }}>
            <div className="part-header" style={{
                fontWeight: 'bold',
                fontSize: '14px',
                marginBottom: '10px',
                color: '#2b6cb0',
                borderBottom: '1px solid #4299E1',
                padding: '0 0 8px 0'
            }}>
                {data.label}
            </div>
        </div>
    );
}

// Custom Failure Mode Node with right-side output handle
function FailureModeNode({ data }: { data: any }) {
    return (
        <div style={{
            background: '#F56565',
            color: 'white',
            border: '1px solid #c53030',
            padding: '10px',
            borderRadius: '6px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            width: '100%',
            height: '100%',
            position: 'relative',
            fontSize: '13px',
            fontWeight: 'medium',
        }}>
            {data.label}
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                style={{
                    background: '#FFA726',
                    width: '10px',
                    height: '10px',
                    right: '-5px'
                }}
            />
            <Handle
                type="target"
                position={Position.Left}
                id="left"
                style={{
                    background: '#FFA726',
                    width: '10px',
                    height: '10px',
                    left: '-5px'
                }}
            />
        </div>
    );
}

function FMPropagation() {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [partsWithFailureModes, setPartsWithFailureModes] = useState<PartWithFailureModes[]>([]);

    // Define custom node types
    const nodeTypes: NodeTypes = useMemo(() => ({
        partNode: PartNode,
        failureModeNode: FailureModeNode
    }), []);

    // ELK layout configuration could be used for future layout enhancements
    // const elk = useMemo(() => new ELK(), []);

    const determinePartRank = useCallback((partsWithFMs: PartWithFailureModes[]) => {
        // Filter out parts without failure modes
        const partsWithActualFMs = partsWithFMs.filter(
            part => part.failureModes && part.failureModes.length > 0
        );

        // Create a map to track parts that cause failures in other parts
        const causeRelationships: Record<string, string[]> = {};
        const effectRelationships: Record<string, string[]> = {};

        // Maps from failure mode names to their containing part IDs
        const fmNameToPartId: Record<string, string> = {};

        // Populate the mapping of failure mode names to their part IDs
        partsWithActualFMs.forEach(partWithFM => {
            partWithFM.failureModes.forEach(fm => {
                fmNameToPartId[fm.name] = partWithFM.part.elementId;
            });
        });

        // Build the cause-effect relationships between parts
        partsWithActualFMs.forEach(partWithFM => {
            const partId = partWithFM.part.elementId;

            // For each failure mode in this part
            partWithFM.failureModes.forEach(fm => {
                // Look at the effects of this failure mode
                fm.effects.forEach(effectName => {
                    // Find which part contains this effect
                    const affectedPartId = fmNameToPartId[effectName];

                    if (affectedPartId && affectedPartId !== partId) {
                        // This part causes a failure in another part
                        causeRelationships[partId] = [...(causeRelationships[partId] || []), affectedPartId];
                        // The other part is affected by this part
                        effectRelationships[affectedPartId] = [...(effectRelationships[affectedPartId] || []), partId];
                    }
                });
            });
        });

        // Rank parts based on cause-effect relationships (lower rank = more of a source)
        const partRanks: Record<string, number> = {};

        // Initial ranking - parts that cause failures but aren't affected have rank 0
        partsWithActualFMs.forEach(partWithFM => {
            const partId = partWithFM.part.elementId;
            if (causeRelationships[partId] && !effectRelationships[partId]) {
                partRanks[partId] = 0;
            }
        });

        // Second pass - parts are ranked based on what causes them
        let changed = true;
        while (changed) {
            changed = false;
            partsWithActualFMs.forEach(partWithFM => {
                const partId = partWithFM.part.elementId;

                // If this part is affected by other parts
                if (effectRelationships[partId]) {
                    const causeParts = effectRelationships[partId];
                    let maxCauseRank = -1;

                    // Find the highest rank among parts that cause failures in this part
                    causeParts.forEach(causePartId => {
                        if (partRanks[causePartId] !== undefined) {
                            maxCauseRank = Math.max(maxCauseRank, partRanks[causePartId]);
                        }
                    });

                    // Set this part's rank to be one more than its causes
                    if (maxCauseRank >= 0) {
                        const newRank = maxCauseRank + 1;
                        if (partRanks[partId] === undefined || partRanks[partId] < newRank) {
                            partRanks[partId] = newRank;
                            changed = true;
                        }
                    }
                }
            });
        }

        // Assign ranks to any parts not yet ranked (isolated parts)
        let maxRank = 0;
        Object.values(partRanks).forEach(rank => {
            maxRank = Math.max(maxRank, rank);
        });

        partsWithActualFMs.forEach(partWithFM => {
            const partId = partWithFM.part.elementId;
            if (partRanks[partId] === undefined) {
                partRanks[partId] = maxRank + 1; // Place isolated parts at the end
            }
        });

        return partRanks;
    }, []);

    const elkLayout = useCallback(async (nodes: Node[], edges: Edge[], partsWithFMs: PartWithFailureModes[]) => {
        // Get part rankings based on failure propagation
        const partRanks = determinePartRank(partsWithFMs);

        // Get only the parent nodes (parts)
        const parentNodes = nodes.filter(node => !node.parentNode);

        // If there are no parent nodes, just return the original nodes
        if (parentNodes.length === 0) {
            return nodes;
        }

        try {
            // Use a layered approach based on part ranks
            const newNodes = [...nodes];

            // Find the max rank to create our layout
            const maxRank = Math.max(...Object.values(partRanks), 0);

            // Group nodes by rank
            const nodesByRank: Record<number, Node[]> = {};
            parentNodes.forEach(node => {
                const rank = partRanks[node.id] !== undefined ? partRanks[node.id] : maxRank + 1;
                if (!nodesByRank[rank]) {
                    nodesByRank[rank] = [];
                }
                nodesByRank[rank].push(node);
            });

            // Calculate horizontal spacing based on the number of ranks
            // const rankCount = Object.keys(nodesByRank).length;
            const horizontalSpacing = 450; // Increased horizontal spacing between ranks
            const horizontalOffset = 100; // Start position

            // Iterate through each rank and position nodes vertically
            Object.entries(nodesByRank).forEach(([rankStr, rankNodes]) => {
                const rank = parseInt(rankStr);
                const rankNodeCount = rankNodes.length;

                // Calculate vertical spacing based on number of nodes in this rank
                const verticalSpacing = Math.max(300, 1000 / (rankNodeCount + 1));
                const verticalOffset = 100; // Start position

                // Position each node in this rank
                rankNodes.forEach((node, nodeIndex) => {
                    const nodeIdx = newNodes.findIndex(n => n.id === node.id);
                    if (nodeIdx !== -1) {
                        const children = nodes.filter(n => n.parentNode === node.id);
                        const height = Math.max(200, children.length * 60 + 80);

                        // Calculate vertical position with staggering to avoid overlaps
                        const verticalPosition = verticalOffset +
                            (nodeIndex * verticalSpacing) +
                            // Add slight random offset to break symmetry
                            ((rank % 2) * verticalSpacing / 4);

                        newNodes[nodeIdx] = {
                            ...newNodes[nodeIdx],
                            position: {
                                x: horizontalOffset + (rank * horizontalSpacing),
                                y: verticalPosition
                            },
                            style: {
                                ...newNodes[nodeIdx].style,
                                width: 320, // Slightly wider
                                height: height,
                            }
                        };
                    }
                });
            });

            // Position child nodes within parents
            parentNodes.forEach((parentNode) => {
                const children = newNodes.filter(n => n.parentNode === parentNode.id);

                children.forEach((child, childIndex) => {
                    const nodeIndex = newNodes.findIndex(n => n.id === child.id);
                    if (nodeIndex !== -1) {
                        newNodes[nodeIndex] = {
                            ...newNodes[nodeIndex],
                            position: {
                                x: 50,
                                y: 70 + (childIndex * 60), // A bit more spacing
                            },
                            style: {
                                ...newNodes[nodeIndex].style,
                                width: 220, // Wider child nodes
                            }
                        };
                    }
                });
            });

            return newNodes;
        } catch (error) {
            console.error('Layout error:', error);
            // Return original nodes if layout fails
            return nodes;
        }
    }, [determinePartRank]);

    // Fetch data from Neo4j
    useEffect(() => {
        const fetchPartsAndFailureModes = async () => {
            try {
                setLoading(true);

                // First, fetch all PartUsage nodes
                const partsQuery = `
                    MATCH (pu:PartUsage)
                    RETURN DISTINCT 
                        pu.declaredName as name, 
                        pu.elementId as elementId, 
                        pu.qualifiedName as qualifiedName
                `;
                const partsResponse = await executeNeo4jQuery(partsQuery);

                if (!partsResponse.success) {
                    setError(partsResponse.error || 'Failed to fetch parts');
                    setLoading(false);
                    return;
                }

                const parts = partsResponse.results.map((result: any) => ({
                    name: result.name || 'Unnamed Part',
                    elementId: result.elementId || 'No ID',
                    qualifiedName: result.qualifiedName || 'No qualified name'
                }));

                // For each part, fetch related failure modes
                const partsWithFailureModesData = await Promise.all(parts.map(async (part: PartUsage) => {
                    const failureModesQuery = `
                        MATCH (pu:PartUsage {elementId: '${part.elementId}'})-[:links{member:true}]-(ou:OccurrenceUsage)-[:links{member:true}]-(mu:MetadataUsage)-[:links{definition:true}]-(md:MetadataDefinition {name: 'FailureModeMetadata'})
                        RETURN DISTINCT 
                            ou.name as name, 
                            ou.elementId as elementId, 
                            ou.qualifiedName as qualifiedName
                    `;
                    const failureModesResponse = await executeNeo4jQuery(failureModesQuery);

                    const failureModes = failureModesResponse.success
                        ? await Promise.all(failureModesResponse.results.map(async (result: any) => {
                            // For each failure mode, get its effects using the provided query
                            const effectsQuery = `
                                MATCH (occurrence:OccurrenceUsage {elementId: '${result.elementId}'})<-[:links{chainingFeature:true}]-(feature:Feature)
                                MATCH (feature)<-[:links{relatedElement:true}]-(succession:SuccessionAsUsage)
                                MATCH (feature)-[:links{ownedElement:true}]-(refusage:ReferenceUsage)
                                MATCH (succession)-[:links{relatedElement:true}]->(feature2:Feature)
                                MATCH (feature2)-[:links{chainingFeature:true}]->(occurrence2:OccurrenceUsage)
                                MATCH (feature2)-[:links{ownedElement:true}]-(refusage2:ReferenceUsage)
                                WHERE occurrence2.elementId <> '${result.elementId}' AND refusage.name = 'earlierOccurrence'
                                RETURN DISTINCT occurrence2.name
                            `;
                            const effectsResponse = await executeNeo4jQuery(effectsQuery);
                            const effects = effectsResponse.success
                                ? effectsResponse.results.map((effect: any) => effect['occurrence2.name'])
                                : [];

                            return {
                                name: result.name || 'Unnamed Failure Mode',
                                elementId: result.elementId || 'No ID',
                                qualifiedName: result.qualifiedName || 'No qualified name',
                                effects: effects
                            };
                        }))
                        : [];

                    return {
                        part,
                        failureModes
                    };
                }));

                setPartsWithFailureModes(partsWithFailureModesData);
                setLoading(false);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch parts and failure modes');
                setLoading(false);
                console.error(err);
            }
        };

        fetchPartsAndFailureModes();
    }, []);

    // Generate graph data with nested structure
    useEffect(() => {
        if (partsWithFailureModes.length) {
            // Filter out parts without any failure modes
            const partsWithActualFailureModes = partsWithFailureModes.filter(
                item => item.failureModes && item.failureModes.length > 0
            );

            // Skip graph generation if there are no parts with failure modes
            if (partsWithActualFailureModes.length === 0) {
                setNodes([]);
                setEdges([]);
                return;
            }

            const flowNodes: Node[] = [];
            const flowEdges: Edge[] = [];
            const failureModesByName: Record<string, any> = {};

            // Create part nodes (containers) - only for parts WITH failure modes
            partsWithActualFailureModes.forEach((item) => {
                // Add part as parent node
                const partNode = {
                    id: item.part.elementId,
                    type: 'partNode',
                    position: { x: 0, y: 0 }, // Initial position, will be adjusted by layout
                    data: { label: item.part.name },
                    style: {
                        width: 320,
                        height: Math.max(200, item.failureModes.length * 60 + 100),
                    },
                };
                flowNodes.push(partNode);

                // Add failure modes as child nodes
                item.failureModes.forEach((failureMode, fmIndex) => {
                    const failureNode: Node = {
                        id: failureMode.elementId,
                        parentNode: item.part.elementId, // Set parent to create nesting
                        extent: 'parent', // Keep within parent boundaries
                        position: { x: 50, y: 70 + fmIndex * 60 }, // Position inside parent
                        data: { label: failureMode.name },
                        type: 'failureModeNode', // Use custom failure mode node
                        style: {
                            width: 220,
                        },
                        zIndex: 1, // Ensure failure modes are rendered above part containers
                    };
                    flowNodes.push(failureNode);
                    failureModesByName[failureMode.name] = failureNode;
                });
            });

            // Create a set of all valid node IDs for validation
            const validNodeIds = new Set(flowNodes.map(node => node.id));

            // Create links between failure modes based on effects
            partsWithActualFailureModes.forEach(item => {
                item.failureModes.forEach(failureMode => {
                    // For each effect, find if it matches any failure mode name
                    failureMode.effects.forEach(effect => {
                        const targetNode = failureModesByName[effect];

                        if (targetNode &&
                            validNodeIds.has(failureMode.elementId) &&
                            validNodeIds.has(targetNode.id)) {
                            flowEdges.push({
                                id: `e-${failureMode.elementId}-${targetNode.id}`,
                                source: failureMode.elementId,
                                target: targetNode.id,
                                sourceHandle: 'right', // Connect from right handle
                                targetHandle: 'left', // Connect to left handle
                                animated: true,
                                style: { stroke: '#E65100', strokeWidth: 2 }, // Darker orange and thicker
                                markerEnd: {
                                    type: MarkerType.ArrowClosed,
                                    color: '#E65100', // Matching darker orange
                                },
                                type: 'smoothstep',
                            });
                        }
                    });
                });
            });

            // Apply our custom layout
            elkLayout(flowNodes, flowEdges, partsWithActualFailureModes).then(layoutedNodes => {
                setNodes(layoutedNodes);
                setEdges(flowEdges);
            });
        }
    }, [partsWithFailureModes, setNodes, setEdges, elkLayout]);

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div>
                    <div className="size-12 animate-spin rounded-full border-b-2 border-blue-500 dark:border-blue-400"></div>
                    <p className="mt-4 text-gray-700 dark:text-gray-200">Loading causal chain graph...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700 shadow-sm" role="alert">
                    <strong className="font-bold">Error!</strong>
                    <span className="block sm:inline"> {error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full transition-colors duration-200">
            <h1 className="mb-4 border-b border-gray-200 pb-2 text-2xl font-bold text-gray-800 dark:border-gray-700 dark:text-gray-100">
                Failure Mode Causal Chain 
            </h1>
            
            <div style={{
                width: '100%',
                height: 'calc(100vh - 130px)', // Adjust height to leave space for header and respect layout
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}>
                <ReactFlowProvider>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.3 }}
                        minZoom={0.2}
                        maxZoom={1.5}
                        connectionLineType={ConnectionLineType.SmoothStep}
                        elevateEdgesOnSelect={true}
                    >
                        <Background />
                        <Controls />
                        <Panel position="top-left">
                            <div className="mt-2 flex flex-wrap gap-4">
                                <div className="flex items-center">
                                    <span className="mr-2 inline-block size-4 rounded-full bg-blue-500"></span>
                                    <span className="text-sm text-gray-800 dark:text-gray-200">Parts</span>
                                </div>
                                <div className="flex items-center">
                                    <span className="mr-2 inline-block size-4 rounded-full bg-red-500"></span>
                                    <span className="text-sm text-gray-800 dark:text-gray-200">Failure Modes</span>
                                </div>
                            </div>
                        </Panel>
                    </ReactFlow>
                </ReactFlowProvider>
            </div>
        </div>
    );
}

export default FMPropagation;
