import React from 'react';
import { ActionUsage } from '../types'; // Use the imported type instead of redefining

interface ActionsListProps {
    actions: ActionUsage[];
    cciAffectedActions: string[];
}

const ActionsList: React.FC<ActionsListProps> = ({ actions, cciAffectedActions }) => {
    if (actions.length === 0) {
        return (
            <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow-md dark:bg-gray-800 dark:text-gray-400">
                No actions found in the system
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-6">
            {actions.map((action, index) => (
                <div
                    key={index}
                    className={`overflow-hidden rounded-lg bg-white shadow-md dark:bg-gray-800 
              ${cciAffectedActions.includes(action.name) ? 'border-2 border-red-500' : ''}`}
                >
                    <div className="dark:bg-gray-750 border-b border-gray-200 bg-blue-50 p-4 dark:border-gray-700">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-800">
                            {action.name}
                            {cciAffectedActions.includes(action.name) && (
                                <span className="ml-3 rounded bg-red-100 px-2 py-0.5 text-sm text-red-600 dark:bg-red-900 dark:text-red-400">
                                    Shared Input Affected
                                </span>
                            )}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-800">
                            ID: {action.elementId}
                        </p>
                    </div>

                    <div className="p-4">
                        <ul className="list-disc space-y-3 pl-5">
                            {action.incomingFlows.length > 0 && (
                                <li className="text-gray-700 dark:text-gray-300">
                                    <span className="font-semibold">Receives input from: </span>
                                    {action.incomingFlows.map((flow, i) => (
                                        <span key={i} className="ml-4 mt-1 block">
                                            • <span className="font-medium text-blue-600 dark:text-blue-400">{flow.sourceName}</span>
                                            {flow.sourcePin && <span className="text-gray-600 dark:text-gray-400"> parameter </span>}
                                            {flow.sourcePin && <span className="font-medium italic">{flow.sourcePin}</span>}
                                        </span>
                                    ))}
                                </li>
                            )}

                            {action.outgoingFlows.length > 0 && (
                                <li className="text-gray-700 dark:text-gray-300">
                                    <span className="font-semibold">Provides output to: </span>
                                    {action.outgoingFlows.map((flow, i) => (
                                        <span key={i} className="ml-4 mt-1 block">
                                            • <span className="font-medium text-green-600 dark:text-green-400">{flow.targetName}</span>
                                            {flow.targetPin && <span className="text-gray-600 dark:text-gray-400"> via parameter </span>}
                                            {flow.targetPin && <span className="font-medium italic">{flow.targetPin}</span>}
                                        </span>
                                    ))}
                                </li>
                            )}

                            {action.incomingFlows.length === 0 && action.outgoingFlows.length === 0 && (
                                <li className="italic text-gray-500 dark:text-gray-400">
                                    This action has no connected flows
                                </li>
                            )}

                            {action.requirements.length > 0 && (
                                <li className="text-gray-700 dark:text-gray-300">
                                    <span className="font-semibold">Satisfies Requirements: </span>
                                    {action.requirements.map((req, i) => (
                                        <div key={i} className="ml-4 mt-2 rounded-md bg-gray-50 p-3 dark:bg-gray-700">
                                            <div className="font-medium text-purple-600 dark:text-purple-400">
                                                {req.name}
                                            </div>
                                            {/* Display Sphinx Needs ID if available */}
                                            {req.sphinxneedsID && (
                                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    Sphinx Needs ID: {req.sphinxneedsID}
                                                </div>
                                            )}
                                            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                                {req.description}
                                            </div>
                                            {req.attributes && req.attributes.length > 0 && (
                                                <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-600">
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Attributes:</span>
                                                    <div className="mt-1 grid grid-cols-2 gap-2">
                                                        {req.attributes
                                                            .slice() // Create a copy to avoid mutating the original array
                                                            .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by attribute name
                                                            .map((attr, attrIndex) => (
                                                                <div key={attrIndex} className="flex items-center">
                                                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{attr.name}:</span>
                                                                    <span className="ml-1 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-800 dark:text-blue-200">{attr.value}</span>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ActionsList;
