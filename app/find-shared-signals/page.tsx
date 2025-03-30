'use client';

import React, { useEffect, useCallback, useRef } from 'react';

// Import components
import CCIFlowDiagram, { CCIFlowDiagramHandle } from './components/CCIFlowDiagram';
import ActionsList from './components/ActionsList';
import CCIAnalysisResult from './components/CCIAnalysisResult';
import LoadingIndicator from './components/LoadingIndicator';
import ErrorMessage from './components/ErrorMessage';

// Import types
import {
    FlowNode,
    FlowEdge,
} from './types';

// Import custom hooks and services
import { getActionsFromNeo } from './services/getActionsFromNeo';
import { useCCIStore } from './store/cciStore';
import { checkCommonCauseInitiators } from './services/cciAnalysisService';
import { transformToFlowFormat } from './services/diagramLayoutService';
import { captureDiagramAsPng } from './services/diagramCaptureService';

export const CCIAnalysis: React.FC = () => {
    // Custom hook for data fetching
    // - actions: list of actions fetched from the backend
    // - mergedData: preprocessed action data with relationships
    // - loading: indicates if data is being fetched
    // - error: any error that occurred during data fetching
    const { actions, mergedData, loading, error } = getActionsFromNeo();

    // Use the CCI Zustand store for state management
    // - cciResults: analysis results containing common cause initiators
    // - affectedActionNames: actions affected by common causes
    // - sourceActionIds: actions that are sources of common causes
    // - showResults: controls visibility of results section
    // - layouting: indicates if diagram is being laid out
    // - updateResults: function to update store with new analysis results
    // - setLayouting: function to update layouting state
    const {
        cciResults,
        affectedActionNames,
        sourceActionIds,
        showResults,
        layouting,
        updateResults,
        setLayouting
    } = useCCIStore();

    // Debug effect - only runs when results change
    useEffect(() => {
        // These logs will only execute when the actual results change
        console.log('cciResults :', cciResults);
        console.log('affectedActionNames :', affectedActionNames);
        console.log('sourceActionIds:', sourceActionIds);
    }, [cciResults, affectedActionNames, sourceActionIds]);

    // Flow diagram related state
    // - flowNodes: nodes representing actions and information in the diagram
    // - flowEdges: connections between nodes showing data flow
    const [flowNodes, setFlowNodes] = React.useState<FlowNode[]>([]);
    const [flowEdges, setFlowEdges] = React.useState<FlowEdge[]>([]);

    // Ref for the diagram - used for exporting and direct manipulation
    const diagramRef = useRef<CCIFlowDiagramHandle>(null);

    // DATA FLOW: mergedData -> transformation service -> visual representation
    // This effect triggers when analysis results or data changes
    // Transforms the action data into a format suitable for the flow diagram
    useEffect(() => {
        if (mergedData.length > 0) {
            console.log('mergedData', mergedData);
            setLayouting(true);
            // transformToFlowFormat service converts action data to nodes and edges
            // highlighting affected actions and sources based on analysis results
            transformToFlowFormat(mergedData, affectedActionNames, sourceActionIds)
                .then(({ nodes, edges }) => {
                    // Update the diagram with new layout data
                    setFlowNodes(nodes);
                    setFlowEdges(edges);
                    setLayouting(false);
                });
        }
    }, [mergedData, affectedActionNames, sourceActionIds, setLayouting]);

    // DATA FLOW: mergedData -> analysis service -> store update
    // Function to run CCI analysis when user clicks the analysis button
    // Processes the merged action data to identify common cause initiators
    const runCCIAnalysis = useCallback(() => {
        if (mergedData.length === 0) return;

        // checkCommonCauseInitiators analyzes action dependencies
        // to identify shared information inputs that could cause failures
        const results = checkCommonCauseInitiators(mergedData);

        // Find requirement details in mergedData including ASIL levels
        const requirementDetails = new Map();
        mergedData.forEach(action => {
            (action.requirements || []).forEach(req => {
                if (req.id) {
                    // Find ASIL attribute if it exists
                    const asilAttribute = (req.attributes || []).find(attr =>
                        attr.name === 'ASIL' || attr.name === 'asil'
                    );

                    // Store requirement details with ASIL if found
                    requirementDetails.set(req.id, {
                        name: req.name,
                        description: req.description,
                        sphinxneedsID: req.sphinxneedsID,
                        ASIL: asilAttribute ? asilAttribute.value : ''
                    });
                }
            });
        });

        // Ensure all cciResults have a valid id and handle nullable fields
        const validatedResults = {
            ...results,
            cciResults: results.cciResults.map(item => {
                // Get requirement details for this CCI result
                const reqDetails = requirementDetails.get(item.requirementId) || {};
                return {
                    ...item,
                    id: item.id || `cci-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    sphinxneedsID: item.sphinxneedsID || reqDetails.sphinxneedsID || undefined,
                    requirementName: item.requirementName || reqDetails.name || '',
                    requirementId: item.requirementId || '',
                    // Use ASIL from requirement attributes if available
                    ASIL: reqDetails.ASIL || '',
                    timestamp: item.timestamp || new Date().toISOString()
                };
            })
        };

        console.log('CCI Results with ASIL levels:', validatedResults.cciResults);

        // Update the Zustand store with the results
        // This triggers UI updates in this and other components that use the store
        updateResults(
            validatedResults.cciResults,
            validatedResults.affectedActionNames,
            validatedResults.sourceActionIds
        );
    }, [mergedData, updateResults]);

    // DATA FLOW: diagram ref -> capture service -> PNG file download
    // Export diagram as PNG when user requests it
    const exportDiagramAsPng = useCallback(async () => {
        if (!diagramRef.current || layouting) return;

        try {
            setLayouting(true);
            // captureDiagramAsPng service uses the diagram ref to generate
            // and download a PNG image of the current diagram state
            await captureDiagramAsPng(diagramRef);
        } catch (err: any) {
            console.error('Error exporting diagram:', err);
        } finally {
            setLayouting(false);
        }
    }, [diagramRef, layouting, setLayouting]);

    // Show loading indicator while data is being fetched
    if (loading) {
        return <LoadingIndicator />;
    }

    // Show error message if data fetching failed
    if (error) {
        return <ErrorMessage error={error} />;
    }

    // DATA FLOW: Component rendering with processed data
    // The main UI renders different components with appropriate data:
    // - Button to trigger analysis
    // - Flow diagram showing relationships
    // - Analysis results when available
    // - List of actions with highlighting for affected ones
    return (
        <div className="container mx-auto p-4 transition-colors duration-200">
            <h1 className="mb-6 border-b border-gray-200 pb-2 text-2xl font-bold text-gray-800 dark:border-gray-700 dark:text-gray-100">
                Find shared information input for actions requiring independance
            </h1>

            {/* CCI Check button - Triggers the analysis process */}
            <div className="mb-6 flex space-x-4">
                <button
                    onClick={runCCIAnalysis}
                    className="rounded bg-blue-600 px-4 py-2 font-bold text-white shadow transition duration-200 hover:bg-blue-700"
                >
                    Check for shared inputs
                </button>
            </div>

            {/* Flow Diagram - Visualizes actions and their relationships */}
            <div className="mb-8">
                <CCIFlowDiagram
                    ref={diagramRef}
                    nodes={flowNodes}
                    edges={flowEdges}
                    layouting={layouting}
                    hasCCIResults={affectedActionNames.length > 0 || sourceActionIds.length > 0}
                    onExport={exportDiagramAsPng}
                />
            </div>

            {/* CCI Results - Shows detailed analysis results when available */}
            {showResults && (
                <CCIAnalysisResult
                    cciResults={cciResults.map(result => ({
                        ...result,
                        requirementName: result.requirementName || '', // Ensure required fields have default values
                        requirementId: result.requirementId || '',
                        sphinxneedsID: result.sphinxneedsID === null ? undefined : result.sphinxneedsID,
                        ASIL: result.ASIL || '', // Pass ASIL level to result component
                        timestamp: result.timestamp || new Date().toISOString()
                    }))}
                />
            )}

            {/* Actions List - Shows all actions with highlighting for affected ones */}
            <ActionsList
                actions={actions}
                cciAffectedActions={affectedActionNames}
            />
        </div>
    );
};

export default CCIAnalysis;
