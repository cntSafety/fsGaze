import React from 'react';

interface Effect {
    // Assuming effect is a string, adjust if it's an object
    // For example: id: string; description: string;
    [key: string]: any; // Or more specific type if known
}

interface FailureMode {
    name: string;
    effects: Effect[]; // Or string[] if effects are just strings
}

interface Part {
    name: string;
    elementId: string;
    qualifiedName: string;
}

interface PartWithFailureModes {
    part: Part;
    failureModes: FailureMode[];
}

interface DetailViewProps {
    partsWithFailureModes: PartWithFailureModes[];
}

const DetailView: React.FC<DetailViewProps> = ({ partsWithFailureModes }) => {
    return (
        <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                More details on Parts and their Failure Modes
            </h2>

            {partsWithFailureModes.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-gray-500 dark:text-gray-400 text-center">
                    No parts found in the system
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                    {partsWithFailureModes.map((item: PartWithFailureModes, partIndex: number) => (
                        <div key={partIndex} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transition-all duration-200 hover:shadow-lg">
                            <div className="bg-blue-50 dark:bg-gray-700 p-4 border-b border-gray-200 dark:border-gray-700">
                                <h2 className="text-xl font-semibold text-blue-800 dark:text-blue-300">
                                    {item.part.name}
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    ID: {item.part.elementId}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
                                    {item.part.qualifiedName}
                                </p>
                            </div>

                            <div className="p-4">
                                <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
                                    Failure Modes
                                    <span className="ml-2 text-sm font-normal text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                                        {item.failureModes.length}
                                    </span>
                                </h3>

                                {item.failureModes.length === 0 ? (
                                    <div className="bg-gray-50 dark:bg-gray-700 rounded p-4 text-orange-700 dark:text-orange-500 text-center">
                                        No failure modes found for this part
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                            <thead className="bg-gray-100 dark:bg-gray-700">
                                                <tr>
                                                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                        Failure Mode Name
                                                    </th>
                                                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                        Effects
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                {item.failureModes.map((failureMode: FailureMode, index: number) => (
                                                    <tr
                                                        key={index}
                                                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
                                                    >
                                                        <td className="py-3 px-4 text-sm text-gray-800 dark:text-gray-200">
                                                            {failureMode.name}
                                                        </td>
                                                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                                                            {failureMode.effects.length === 0 ? (
                                                                <span className="italic text-orange-700 dark:text-orange-500">No effects</span>
                                                            ) : (
                                                                <ul className="list-disc list-inside">
                                                                    {failureMode.effects.map((effect: Effect, i: number) => (
                                                                        <li key={i} className="mb-1">
                                                                            {typeof effect === 'string' ? effect : JSON.stringify(effect)}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DetailView;
