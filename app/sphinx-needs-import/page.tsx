'use client';

import React, { useState, useEffect, useRef } from 'react';
import { executeNeo4jQuery } from '../services/KerMLToNeoService';
import { importSphinxNeedsToNeo4j } from '../services/SphinxNeedsImport';

export const Requirements: React.FC = () => {
    const [requirements, setRequirements] = useState<any[]>([]);
    const [requirementSphinxNeeds, setRequirementSphinxNeeds] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingSphinxIds, setLoadingSphinxIds] = useState<Record<string, boolean>>({});
    const [expandedRequirements, setExpandedRequirements] = useState<Record<string, boolean>>({});
    // Add new state for ASIL values
    const [requirementAsils, setRequirementAsils] = useState<Record<string, string>>({});
    // Add new state for Safety Requirements Types
    const [requirementSafetyTypes, setRequirementSafetyTypes] = useState<Record<string, string>>({});

    // New state variables for Sphinx Needs import
    const [importLoading, setImportLoading] = useState<boolean>(false);
    const [importResults, setImportResults] = useState<{
        success?: boolean;
        message?: string;
        project?: string;
        nodeCount?: number;
        relationshipCount?: number;
        error?: string | null;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Function to handle file selection
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setImportLoading(true);
        setImportResults(null);

        try {
            // Read file content
            const fileContent = await readFileContent(file);

            // Import data to Neo4j
            const results = await importSphinxNeedsToNeo4j(fileContent);
            setImportResults(results);

            // If import was successful, refresh requirements list
            if (results.success) {
                fetchRequirements();
            }
        } catch (err: any) {
            setImportResults({
                success: false,
                error: err.message || 'An error occurred during file import',
                message: 'Import failed'
            });
        } finally {
            setImportLoading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Function to read file content
    const readFileContent = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(e.target?.result as string);
            };
            reader.onerror = (e) => {
                reject(new Error('Failed to read file'));
            };
            reader.readAsText(file);
        });
    };

    // Function to trigger file input click
    const triggerFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const toggleRequirementExpand = (elementId: string) => {
        setExpandedRequirements(prev => ({
            ...prev,
            [elementId]: !prev[elementId]
        }));
    };

    // Function to fetch ASIL and Safety Requirements Type for a requirement with Sphinx Needs ID
    const fetchAsilForRequirement = async (requirementId: string, sphinxNeedsId: string) => {
        try {
            const query = `
                MATCH (SNNodes)
                WHERE SNNodes.source = 'sphinx_needs' AND SNNodes.id = '${sphinxNeedsId}'
                RETURN SNNodes.asil, SNNodes.sreqtype
            `;

            const response = await executeNeo4jQuery(query);

            if (response.success && response.results.length > 0) {
                setRequirementAsils(prev => ({
                    ...prev,
                    [requirementId]: response.results[0]["SNNodes.asil"] || 'N/A'
                }));

                // Store the Safety Requirements Type
                setRequirementSafetyTypes(prev => ({
                    ...prev,
                    [requirementId]: response.results[0]["SNNodes.sreqtype"] || 'N/A'
                }));
            }
        } catch (err) {
            console.error(`Error fetching ASIL and Safety Requirements Type for requirement ${requirementId}:`, err);
        }
    };

    const fetchSphinxNeedsId = async (requirementId: string) => {
        setLoadingSphinxIds(prev => ({ ...prev, [requirementId]: true }));

        try {
            const query = `
                MATCH (req:RequirementUsage{elementId: '${requirementId}'})
                MATCH (req)-[:links{usage:true}]->(refU:ReferenceUsage{name:'sphinx_needs_id'})
                MATCH (refU)-[:links{ownedMember:true}]->(sphinx_needs_id:LiteralString)
                RETURN DISTINCT sphinx_needs_id.value
            `;

            const response = await executeNeo4jQuery(query);

            if (response.success && response.results.length > 0) {
                const sphinx_needs_id = response.results[0]["sphinx_needs_id.value"];
                setRequirementSphinxNeeds(prev => ({
                    ...prev,
                    [requirementId]: sphinx_needs_id
                }));

                // Fetch ASIL for this requirement using its Sphinx Needs ID
                if (sphinx_needs_id) {
                    fetchAsilForRequirement(requirementId, sphinx_needs_id);
                }
            }
        } catch (err) {
            console.error(`Error fetching sphinx_needs_id for requirement ${requirementId}:`, err);
        } finally {
            setLoadingSphinxIds(prev => ({ ...prev, [requirementId]: false }));
        }
    };

    const fetchRequirements = async () => {
        setLoading(true);
        setError(null);
        setRequirementSphinxNeeds({});

        try {
            const query = `MATCH(req:RequirementUsage) RETURN req`;
            const response = await executeNeo4jQuery(query);

            if (response.success) {
                setRequirements(response.results);
                // Fetch sphinx_needs_id for each requirement
                for (const result of response.results) {
                    if (result.req?.properties?.elementId) {
                        fetchSphinxNeedsId(result.req.properties.elementId);
                    }
                }
            } else {
                setError(response.error || 'An error occurred while fetching requirements');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred while fetching requirements');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Fetch requirements when component mounts
        fetchRequirements();
    }, []);

    return (
        <div className="w-full rounded bg-white p-4 shadow-md dark:bg-gray-800 dark:shadow-gray-700">
            <h2 className="mb-4 text-xl font-bold dark:text-white">SysML-v2 Requirements</h2>

            {error && (
                <div className="mb-4 rounded border border-red-400 bg-red-100 p-2 text-red-700 dark:border-red-700 dark:bg-red-900 dark:text-red-200">
                    Error: {error}
                </div>
            )}

            {loading ? (
                <div className="py-4 text-center dark:text-gray-300">Loading requirements...</div>
            ) : requirements.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-800">
                                <th className="border-b border-gray-300 px-4 py-2 text-left dark:border-gray-600 dark:text-white">Req. Name SysML</th>
                                <th className="border-b border-gray-300 px-4 py-2 text-left dark:border-gray-600 dark:text-white">Sphinx Needs ID</th>
                                <th className="border-b border-gray-300 px-4 py-2 text-left dark:border-gray-600 dark:text-white">ASIL from SN</th>
                                <th className="border-b border-gray-300 px-4 py-2 text-left dark:border-gray-600 dark:text-white">Safety Req Type from SN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requirements.map((result, index) => {
                                const req = result.req;
                                const declaredName = req?.properties?.declaredName || 'Unnamed Requirement';
                                const elementId = req?.properties?.elementId || 'No ID';
                                const qualifiedName = req?.properties?.qualifiedName || 'No qualified name';
                                const isLoadingSphinxId = loadingSphinxIds[elementId] || false;
                                const sphinxNeedsId = requirementSphinxNeeds[elementId];
                                const isExpanded = expandedRequirements[elementId] || false;
                                // Get ASIL value for this requirement
                                const asilValue = requirementAsils[elementId];
                                // Get Safety Requirements Type for this requirement
                                const safetyReqType = requirementSafetyTypes[elementId];

                                return (
                                    <React.Fragment key={index}>
                                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-600">
                                            <td
                                                className="cursor-pointer border-b border-gray-300 px-4 py-2 dark:border-gray-600 dark:text-white"
                                                onClick={() => toggleRequirementExpand(elementId)}
                                            >
                                                <div className="flex items-center">
                                                    <span className="mr-2">
                                                        {isExpanded ? '▼' : '▶'}
                                                    </span>
                                                    {declaredName}
                                                </div>
                                            </td>
                                            <td className="border-b border-gray-300 px-4 py-2 dark:border-gray-600 dark:text-white">
                                                {isLoadingSphinxId ? (
                                                    <span className="text-gray-500 dark:text-gray-400">Loading...</span>
                                                ) : sphinxNeedsId ? (
                                                    sphinxNeedsId
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500">Not found</span>
                                                )}
                                            </td>
                                            <td className="border-b border-gray-300 px-4 py-2 dark:border-gray-600 dark:text-white">
                                                {sphinxNeedsId ? (
                                                    asilValue ? (
                                                        asilValue
                                                    ) : (
                                                        <span className="text-gray-500 dark:text-gray-400">Import needs.json...</span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500">N/A</span>
                                                )}
                                            </td>
                                            <td className="border-b border-gray-300 px-4 py-2 dark:border-gray-600 dark:text-white">
                                                {sphinxNeedsId ? (
                                                    safetyReqType ? (
                                                        safetyReqType
                                                    ) : (
                                                        <span className="text-gray-500 dark:text-gray-400">Import needs.json...</span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500">N/A</span>
                                                )}
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-gray-50 dark:bg-gray-600">
                                                <td colSpan={4} className="border-b border-gray-300 px-4 py-2 dark:border-gray-600">
                                                    <div className="px-4 py-2">
                                                        <div className="mb-2">
                                                            <span className="font-semibold dark:text-white">ID:</span>
                                                            <span className="ml-2 dark:text-gray-200">{elementId}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-semibold dark:text-white">Qualified Name:</span>
                                                            <span className="ml-2 dark:text-gray-200">{qualifiedName}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="py-4 text-center text-gray-500 dark:text-gray-400">
                    No requirements found.
                </div>
            )}

            {/* Sphinx Needs Import Section - Now appears after the table */}
            <div className="mt-8 rounded-md border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="mb-2 text-lg font-semibold dark:text-white">Import Sphinx Needs Data to the Graph DB to get the Req. Attributes</h3>

                <div className="mb-4 flex items-center">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept=".json"
                        className="hidden"
                    />
                    <button
                        onClick={triggerFileInput}
                        disabled={importLoading}
                        className={`rounded-md px-4 py-2 font-medium ${importLoading
                            ? 'cursor-not-allowed bg-gray-400 dark:bg-gray-600'
                            : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-800 dark:hover:bg-blue-900'
                            }`}
                    >
                        {importLoading ? 'Importing...' : 'Import Sphinx Needs JSON File'}
                    </button>
                </div>

                {/* Import Results */}
                {importResults && (
                    <div className={`rounded-md p-3 ${importResults.success
                        ? 'border border-green-400 bg-green-100 dark:border-green-700 dark:bg-green-900'
                        : 'border border-red-400 bg-red-100 dark:border-red-700 dark:bg-red-900'
                        }`}>
                        <p className={`font-semibold ${importResults.success
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                            }`}>
                            {importResults.message}
                        </p>

                        {importResults.success && (
                            <div className="mt-2 text-sm">
                                {importResults.project && (
                                    <p className="dark:text-gray-300">Project: <span className="font-medium">{importResults.project}</span></p>
                                )}
                                <p className="dark:text-gray-300">Imported nodes: <span className="font-medium">{importResults.nodeCount}</span></p>
                                <p className="dark:text-gray-300">Created relationships: <span className="font-medium">{importResults.relationshipCount}</span></p>
                            </div>
                        )}

                        {importResults.error && (
                            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                Error: {importResults.error}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Requirements;
