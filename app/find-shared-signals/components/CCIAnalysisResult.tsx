import React from 'react';
import { CCIResultItem } from '../types';

interface CCIAnalysisResultProps {
    cciResults: CCIResultItem[];
}

const CCIAnalysisResult: React.FC<CCIAnalysisResultProps> = ({ cciResults }) => {
    if (cciResults.length === 0) {
        return (
            <div className="mb-8 rounded-lg bg-blue-50 p-6 text-center text-gray-700 shadow-md dark:bg-blue-900 dark:text-gray-200">
                No common cause initiators were found for the current system model.
            </div>
        );
    }

    return (
        <div className="mb-8">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
                Common Cause Initiator Analysis Results
            </h2>
            <div className="rounded-lg border border-red-200 bg-red-50 p-1 dark:border-red-700 dark:bg-red-900">
                <div className="rounded-md bg-white p-4 shadow-sm dark:bg-gray-800">
                    <p className="mb-4 text-base text-red-700 dark:text-red-400">
                        <span className="font-bold">Warning:</span> The following independence requirements may be violated due to shared input sources.
                    </p>
                    <div className="space-y-6">
                        {cciResults.map((result, index) => (
                            <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700">
                                <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                                    {result.requirementName}
                                </h3>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    ID: {result.requirementId}
                                </p>
                                {result.sphinxneedsID && (
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Sphinx Needs ID: {result.sphinxneedsID}
                                    </p>
                                )}
                                <p className="mb-1 mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    The following actions share common input source(s):
                                </p>
                                <ul className="mb-3 list-inside list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                                    {result.actions.map((action, actionIndex) => (
                                        <li key={actionIndex} className="py-1">
                                            <span className="font-medium">{action.name}</span>
                                            <div className="ml-5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                ID: {action.id}
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-4">
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Common source(s) of input:
                                    </p>
                                    <div className="mt-2 overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                            <thead className="bg-gray-100 dark:bg-gray-700">
                                                <tr>
                                                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                                        Source Name
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                                        Source ID
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                                        Output Pin
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-600">
                                                {result.commonSources.map((source, sourceIndex) => (
                                                    <tr key={sourceIndex}>
                                                        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900 dark:text-gray-200">
                                                            {source.name}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                            {source.id}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900 dark:text-gray-200">
                                                            {source.pin || "N/A"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="mt-2 text-right text-xs text-gray-500 dark:text-gray-400">
                                    Analysis timestamp: {new Date(result.timestamp).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CCIAnalysisResult;
