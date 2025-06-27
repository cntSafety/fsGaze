/**
 * @file Contains the core logic for transforming raw safety graph data from the API
 * into a format that React Flow can render (nodes and edges).
 */

import { Node, Edge, MarkerType } from 'reactflow';
import { SafetyGraphData } from '@/app/services/neo4j/queries/safety/types';

/**
 * Processes raw safety graph data to build nodes and edges for the React Flow diagram.
 * 
 * This function performs several key steps:
 * 1. Aggregates SW Components from occurrence data.
 * 2. Maps ports and their associated failure modes to each component.
 * 3. Creates a `handleToFailureMap` for each node to allow for robust edge connections
 *    without relying on fragile string parsing.
 * 4. Constructs the node objects for each SW Component.
 * 5. Constructs the edge objects for each CAUSATION link between failure modes.
 * 
 * @param safetyGraph The raw data object fetched from the safety graph API.
 * @returns An object containing arrays of nodes and edges ready for React Flow.
 */
export const buildFlowDiagram = (safetyGraph: SafetyGraphData): { nodes: Node[], edges: Edge[] } => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const swComponents = new Map<string, any>();

    // Step 1 & 2: Aggregate components, ports, and failure modes from occurrences
    safetyGraph.occurrences.forEach(occ => {
        if (!occ.componentUuid || !occ.occuranceSourceArxmlPath) {
            return; // Skip if we don't have the essential data
        }

        const portType = occ.occuranceSourceLabels && occ.occuranceSourceLabels.includes('P_PORT_PROTOTYPE') ? 'provider' : 'receiver';

        // Use the new, reliable component data
        if (!swComponents.has(occ.componentUuid)) {
            swComponents.set(occ.componentUuid, {
                uuid: occ.componentUuid,
                name: occ.componentName,
                providerPorts: [],
                receiverPorts: [],
            });
        }

        const component = swComponents.get(occ.componentUuid);
        
        // Check if the occurrence is on a port
        if (occ.occuranceSourceLabels && (occ.occuranceSourceLabels.includes('P_PORT_PROTOTYPE') || occ.occuranceSourceLabels.includes('R_PORT_PROTOTYPE'))) {
            const portArray = portType === 'provider' ? component.providerPorts : component.receiverPorts;
            
            let port = portArray.find((p: any) => p.uuid === occ.occuranceSourceUuid);
            if (!port) {
                port = {
                    uuid: occ.occuranceSourceUuid,
                    name: occ.occuranceSourceName,
                    failureModes: [],
                };
                portArray.push(port);
            }

            const failure = safetyGraph.failures.find(f => f.uuid === occ.failureUuid);
            if (failure && failure.properties) {
                // Avoid adding duplicate failure modes to the same port
                if (!port.failureModes.some((fm: any) => fm.uuid === failure.uuid)) {
                    port.failureModes.push({
                        uuid: failure.uuid,
                        name: failure.properties.name,
                        asil: failure.properties.asil,
                        description: failure.properties.description,
                    });
                }
            }
        }
    });

    // Step 3 & 4: Create nodes with handle-to-failure mappings
    Array.from(swComponents.values()).forEach(comp => {
        const handleToFailureMap = new Map<string, string>();
        
        comp.providerPorts.forEach((port: any) => {
            port.failureModes.forEach((failure: any) => {
                const handleId = `failure-${port.uuid}-${failure.uuid}`;
                handleToFailureMap.set(handleId, failure.uuid);
            });
        });
        
        comp.receiverPorts.forEach((port: any) => {
            port.failureModes.forEach((failure: any) => {
                const handleId = `failure-${port.uuid}-${failure.uuid}`;
                handleToFailureMap.set(handleId, failure.uuid);
            });
        });

        nodes.push({
            id: comp.uuid,
            type: 'swComponent',
            position: { x: 0, y: 0 }, // Initial position, layouting will adjust this
            data: {
                component: comp,
                providerPorts: comp.providerPorts,
                receiverPorts: comp.receiverPorts,
                handleToFailureMap,
            },
        });
    });

    // Step 5: Create edges for causation links
    if (safetyGraph.causationLinks) {
        safetyGraph.causationLinks.forEach((causation) => {
            const causeOccurrences = safetyGraph.occurrences.filter(o => o.failureUuid === causation.causeFailureUuid);
            const effectOccurrences = safetyGraph.occurrences.filter(o => o.failureUuid === causation.effectFailureUuid);

            causeOccurrences.forEach((causeOcc) => {
                effectOccurrences.forEach((effectOcc) => {
                    // Ensure both occurrences have a component UUID
                    if (causeOcc.componentUuid && effectOcc.componentUuid) {
                        
                        const sourceHandle = `failure-${causeOcc.occuranceSourceUuid}-${causeOcc.failureUuid}`;
                        const targetHandle = `failure-${effectOcc.occuranceSourceUuid}-${effectOcc.failureUuid}`;
                        
                        edges.push({
                            id: `causation-${causation.causationUuid}-${causeOcc.occuranceSourceUuid}-${effectOcc.occuranceSourceUuid}`,
                            source: causeOcc.componentUuid,
                            target: effectOcc.componentUuid,
                            sourceHandle,
                            targetHandle,
                            type: 'interactive',
                            animated: false,
                            style: {
                                strokeWidth: 1.5,
                                stroke: '#94a3b8',
                            },
                            markerEnd: {
                                type: MarkerType.ArrowClosed,
                            },
                            data: {
                                causationUuid: causation.causationUuid,
                                causationName: causation.causationName,
                                type: 'causation'
                            }
                        });
                    }
                });
            });
        });
    }
    return { nodes, edges };
  }; 