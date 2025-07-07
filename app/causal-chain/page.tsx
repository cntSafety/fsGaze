'use client';

/**
 * FailureChain Component
 * 
 * This component visualizes the relationships between parts, their failure modes,
 * and the propagation of failures through a system (failure chains).
 * 
 * Key features:
 * - Fetches parts and their associated failure modes from a Neo4j database
 * - Displays data in both graph and tabular formats
 * - Visualizes failure propagation chains
 * - Implements caching for improved performance
 * - Provides loading states and error handling
 * 
 * The component uses a multi-phase loading approach to handle large datasets efficiently,
 * first loading part data, then failure modes, and finally processing the relationships.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { executeNeo4jQuery } from '../services/KerMLToNeoService';
import GraphView from './components/GraphView';
import DetailView from './components/DetailView';
import LoadingIndicator from './components/LoadingIndicator';
import ErrorMessage from './components/ErrorMessage';
import { useLoading } from '../components/LoadingProvider';

// Cache for API responses to avoid redundant queries and improve performance
const queryCache = new Map();

// Data structure interfaces
interface Effect {
    // Assuming effect is a string, adjust if it's an object
    // For example: id: string; description: string;
    [key: string]: any; // Or more specific type if known
}

interface FailureMode {
    name: string;
    elementId: string;
    qualifiedName: string;
    effects: Effect[]; // Changed from string[] to Effect[] to match DetailView
    created?: string;
    lastModified?: string;
}

interface PartUsage {
    name: string;
    elementId: string;
    qualifiedName: string;
}

interface PartWithFailureModes {
    part: PartUsage;
    failureModes: FailureMode[]; // Failure modes associated with this part
}

// Interfaces for graph data structure
interface GraphNode {
    id: string;
    name: string;
    type: 'part' | 'failureMode';
    val: number;
    color: string;
    neighbors: GraphNode[];
    links: GraphLink[];
    effects?: Effect[]; // Changed from string[] to Effect[]
    partInfo?: { // Only for failureMode nodes
        id: string;
        name: string;
    };
    created?: string;
    lastModified?: string;
    // Properties for D3 simulation if needed by GraphView's Node type
    fx?: number;
    fy?: number;
    vx?: number;
    vy?: number;
    x?: number;
    y?: number;
    label: string; // Ensure label is always string
    failureModes?: FailureMode[]; // Added to align with GraphView.Node, for part nodes
}

interface GraphLink {
    source: string | GraphNode; // Can be ID or node object
    target: string | GraphNode; // Can be ID or node object
    type: 'has' | 'causes';
}


const FailureChain: React.FC = () => {
    const { hideLoading } = useLoading();
    
    // Main state for parts and their associated failure modes
    const [partsWithFailureModes, setPartsWithFailureModes] = useState<PartWithFailureModes[]>([]);

    // UI state management
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [showDetails, setShowDetails] = useState<boolean>(false); // Controls tabular view visibility
    const [showGraph, setShowGraph] = useState<boolean>(true); // Controls graph view visibility

    // Graph data and loading state
    const [completeGraphData, setCompleteGraphData] = useState<{ nodes: GraphNode[], links: GraphLink[] }>({ nodes: [], links: [] });
    const [dataLimit, setDataLimit] = useState<number>(100); // Pagination limit for query results
    const [loadProgress, setLoadProgress] = useState<number>(0); // Progress indicator (0-100)
    const [loadingPhase, setLoadingPhase] = useState<string>('initial'); // Current loading phase description

    // Cache key for storing/retrieving processed data
    const cacheKey = 'parts-failure-modes-data';

    useEffect(() => {
        /**
         * Main data fetching function
         * 
         * This function follows these steps:
         * 1. Check cache for existing data
         * 2. If not cached, fetch parts and their failure modes
         * 3. For each failure mode, fetch its effects (what it can cause)
         * 4. Process and store the complete relationship data
         */
        const fetchPartsAndFailureModes = async () => {
            try {
                setLoading(true);
                setLoadingPhase('parts');

                // Check cache first to avoid redundant API calls
                if (queryCache.has(cacheKey)) {
                    setPartsWithFailureModes(queryCache.get(cacheKey));
                    setLoading(false);
                    return;
                }

                // Neo4j Cypher query to fetch parts and their failure modes in a single query
                const combinedQuery = `
                    MATCH (pu:PartUsage)
                    OPTIONAL MATCH (pu)-[:links{member:true}]-(ou:OccurrenceUsage)-[:links{member:true}]-(mu:MetadataUsage)-[:links{definition:true}]-(md:MetadataDefinition {name: 'FailureModeMetadata'})
                    WITH pu, 
                         collect({
                            name: ou.name, 
                            elementId: ou.elementId, 
                            qualifiedName: ou.qualifiedName,
                            created: ou.created,
                            lastModified: ou.lastModified
                         }) AS failureModes
                    RETURN 
                        pu.declaredName as partName, 
                        pu.elementId as partId, 
                        pu.qualifiedName as partQualifiedName,
                        failureModes
                    LIMIT ${dataLimit}
                `;

                // Execute the query
                const combinedResponse = await executeNeo4jQuery(combinedQuery);

                if (!combinedResponse.success) {
                    setError(combinedResponse.error || 'Failed to fetch data');
                    setLoading(false);
                    return;
                }

                setLoadProgress(25);
                setLoadingPhase('effects'); // Moving to the next loading phase

                // Process each part and fetch its failure modes' effects
                const partsWithFailureModesData = await Promise.all(
                    combinedResponse.results.map(async (result: any, index: number, array: any[]) => {
                        // Update progress based on how many parts have been processed
                        setLoadProgress(25 + Math.floor((index / array.length) * 50));

                        // Create part object from query results
                        const part = {
                            name: result.partName || 'Unnamed Part',
                            elementId: result.partId || 'No ID',
                            qualifiedName: result.partQualifiedName || 'No qualified name'
                        };

                        // Skip processing if no failure modes exist
                        if (!result.failureModes || result.failureModes.length === 0 || !result.failureModes[0].elementId) {
                            return { part, failureModes: [] };
                        }

                        // Prepare a comma-separated list of failure mode IDs for the next query
                        const failureModeIds = result.failureModes
                            .filter((fm: any) => fm.elementId)
                            .map((fm: any) => `'${fm.elementId}'`)
                            .join(',');

                        if (!failureModeIds) {
                            return {
                                part,
                                failureModes: result.failureModes.map((fm: any) => ({
                                    name: fm.name || 'Unnamed Failure Mode',
                                    elementId: fm.elementId || 'No ID',
                                    qualifiedName: fm.qualifiedName || 'No qualified name',
                                    effects: []
                                }))
                            };
                        }

                        // Query to find effects (what this failure mode can cause)
                        const batchEffectsQuery = `
                            MATCH (occurrence:OccurrenceUsage)
                            WHERE occurrence.elementId IN [${failureModeIds}]
                            MATCH (occurrence)<-[:links{chainingFeature:true}]-(feature:Feature)
                            MATCH (feature)<-[:links{relatedElement:true}]-(succession:SuccessionAsUsage)
                            MATCH (feature)-[:links{ownedElement:true}]-(refusage:ReferenceUsage)
                            MATCH (succession)-[:links{relatedElement:true}]->(feature2:Feature)
                            MATCH (feature2)-[:links{chainingFeature:true}]->(occurrence2:OccurrenceUsage)
                            MATCH (feature2)-[:links{ownedElement:true}]-(refusage2:ReferenceUsage)
                            WHERE occurrence2.elementId <> occurrence.elementId AND refusage.name = 'earlierOccurrence'
                            RETURN occurrence.elementId as sourceId, occurrence2.name as effectName
                        `;

                        // Check if effects are already cached
                        const effectsCacheKey = `effects-${failureModeIds}`;
                        let effectsResponse;

                        if (queryCache.has(effectsCacheKey)) {
                            effectsResponse = queryCache.get(effectsCacheKey);
                        } else {
                            effectsResponse = await executeNeo4jQuery(batchEffectsQuery);
                            if (effectsResponse.success) {
                                queryCache.set(effectsCacheKey, effectsResponse);
                            }
                        }

                        // Process the effects data into a map of failure mode ID -> effects array
                        const effectsMap: Record<string, Effect[]> = {}; // Changed to Effect[]
                        if (effectsResponse && effectsResponse.success) {
                            effectsResponse.results.forEach((effect: any) => {
                                if (!effectsMap[effect.sourceId]) {
                                    effectsMap[effect.sourceId] = [];
                                }
                                // Assuming effectName is the primary data for an Effect object
                                effectsMap[effect.sourceId].push({ name: effect.effectName }); 
                            });
                        }

                        // Combine failure modes with their effects
                        const failureModes = result.failureModes.map((fm: any) => ({
                            name: fm.name || 'Unnamed Failure Mode',
                            elementId: fm.elementId || 'No ID',
                            qualifiedName: fm.qualifiedName || 'No qualified name',
                            effects: effectsMap[fm.elementId] || [],
                            created: fm.created,
                            lastModified: fm.lastModified
                        }));

                        return { part, failureModes };
                    })
                );

                setLoadProgress(75);
                setLoadingPhase('processing'); // Final processing phase

                // Filter out parts with no failure modes
                const filteredData = partsWithFailureModesData.filter(
                    item => item.failureModes && item.failureModes.length > 0
                );

                // Cache the processed data for future use
                queryCache.set(cacheKey, filteredData);
                setPartsWithFailureModes(filteredData);
                setLoading(false);
                hideLoading();
                setLoadProgress(100);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch parts and failure modes');
                setLoading(false);
                hideLoading();
                console.error(err);
            }
        };

        fetchPartsAndFailureModes();
    }, [dataLimit]);

    /**
     * Transforms the part and failure mode data into a graph structure
     * with nodes (parts, failure modes) and links (relationships)
     * 
     * This function:
     * 1. Creates nodes for parts and failure modes
     * 2. Creates links between parts and their failure modes
     * 3. Creates links between failure modes and their effects
     * 4. Tracks neighbors and links for each node (used for interactivity)
     */
    const generateGraphData = useCallback(() => {
        if (partsWithFailureModes.length === 0) {
            return { nodes: [], links: [] };
        }

        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];
        const failureModesByName: Record<string, GraphNode> = {}; // Lookup table for failure modes by name

        // First pass: create nodes for parts and failure modes, and links between them
        partsWithFailureModes.forEach(item => {
            // Create part node
            const partNode: GraphNode = {
                id: item.part.elementId,
                name: item.part.name,
                label: item.part.name, // Added label
                type: 'part',
                val: 5, // Size indicator for visualization
                color: '#4299E1', // Blue color for parts
                neighbors: [], // Connected nodes
                links: [], // Connected links
                failureModes: item.failureModes, // Store failure modes for this part
            };
            nodes.push(partNode);

            // Create nodes for each failureMode and link to its part
            item.failureModes.forEach(failureMode => {
                const failureNode: GraphNode = {
                    id: failureMode.elementId,
                    name: failureMode.name,
                    label: failureMode.name, // Added label
                    type: 'failureMode',
                    val: 3, // Size indicator for visualization
                    color: '#F56565', // Red color for failure modes
                    neighbors: [],
                    links: [],
                    effects: failureMode.effects,
                    partInfo: {
                        id: item.part.elementId,
                        name: item.part.name
                    },
                    created: failureMode.created,
                    lastModified: failureMode.lastModified
                };

                nodes.push(failureNode);
                failureModesByName[failureMode.name] = failureNode;

                // Create link between part and failureMode
                const link: GraphLink = {
                    source: item.part.elementId,
                    target: failureMode.elementId,
                    type: 'has',
                };
                links.push(link);

                // Track neighbors and links for interactivity
                // Ensure nodes exist before pushing
                const pNode = nodes.find(n => n.id === partNode.id);
                const fNode = nodes.find(n => n.id === failureNode.id);

                if (pNode && fNode) {
                    pNode.neighbors.push(fNode);
                    fNode.neighbors.push(pNode);
                    pNode.links.push(link);
                    fNode.links.push(link);
                }
            });
        });

        // Second pass: create links between failure modes and their effects (failure chains)
        partsWithFailureModes.forEach(item => {
            item.failureModes.forEach(failureMode => {
                const sourceNode = nodes.find(n => n.id === failureMode.elementId);

                // For each effect, create a link to the target failureMode
                failureMode.effects.forEach(effect => { // effect is now an Effect object
                    const effectName = typeof effect === 'string' ? effect : (effect as any).name; // Adapt based on actual Effect structure
                    if (failureModesByName[effectName]) {
                        const targetNode = failureModesByName[effectName];
                        const link: GraphLink = {
                            source: failureMode.elementId,
                            target: targetNode.id,
                            type: 'causes',
                        };

                        links.push(link);

                        // Update neighbors and links for interactivity
                        if (sourceNode && targetNode && !sourceNode.neighbors.includes(targetNode)) {
                            sourceNode.neighbors.push(targetNode);
                            targetNode.neighbors.push(sourceNode);
                            sourceNode.links.push(link);
                            targetNode.links.push(link);
                        }
                    }
                });
            });
        });

        return { nodes, links };
    }, [partsWithFailureModes]);

    // Generate graph data when parts with failure modes change
    useEffect(() => {
        if (partsWithFailureModes.length) {
            // Use a small delay to avoid blocking the UI thread
            const timerId = setTimeout(() => {
                const data = generateGraphData();
                setCompleteGraphData(data);
            }, 100);
            return () => clearTimeout(timerId);
        }
    }, [partsWithFailureModes, generateGraphData]);

    // Handler to load more data when user reaches the end of the current dataset
    const handleLoadMore = useCallback(() => {
        setDataLimit(prev => prev + 100);
    }, []);

    // Render loading indicator while data is being fetched
    if (loading) {
        return <LoadingIndicator loadingPhase={loadingPhase} loadProgress={loadProgress} />;
    }

    // Render error message if data fetching failed
    if (error) {
        return <ErrorMessage error={error} />;
    }

    // Main component rendering with toggle buttons and visualization components
    return (
        <div className="w-full transition-colors duration-200">
            <h1 className="mb-4 border-b border-gray-200 pb-2 text-2xl font-bold text-gray-800 dark:border-gray-700 dark:text-gray-100">
                Parts, Failure Modes and Effects
            </h1>

            {/* View toggle buttons */}
            <div className="mb-4 flex justify-center space-x-4">
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 text-sm font-medium"
                >
                    {showDetails ? 'Hide tabular view' : 'Show tabular view'}
                    <svg className={`ml-2 size-5 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                <button
                    onClick={() => setShowGraph(!showGraph)}
                    className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 text-sm font-medium"
                >
                    {showGraph ? 'Hide Graph view' : 'Show Graph view'}
                    <svg className={`ml-2 size-5 transition-transform ${showGraph ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Graph visualization */}
            {showGraph && (                <GraphView
                    completeGraphData={completeGraphData as any}
                    partsWithFailureModes={completeGraphData.nodes.filter(node => node.type === 'part' && node.failureModes && node.failureModes.length > 0) as any}
                    dataLimit={dataLimit}
                    onLoadMore={handleLoadMore}
                />
            )}

            {/* Tabular visualization */}
            {showDetails && (
                <DetailView partsWithFailureModes={partsWithFailureModes} />
            )}
        </div>
    );
};

export default FailureChain;