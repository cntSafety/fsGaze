import React, { FC } from 'react';

interface GraphLegendProps {
    hasCCIResults: boolean;
}

const GraphLegend: FC<GraphLegendProps> = ({ hasCCIResults }) => {
    return (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-md dark:bg-gray-800">
            <div className="mb-2 flex flex-wrap gap-4">
                <div className="flex items-center">
                    <span className="mr-2 inline-block size-4 rounded-full bg-blue-500"></span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Actions</span>
                </div>
                <div className="flex items-center">
                    <span className="mr-2 inline-block size-4 rounded-full bg-purple-500"></span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Requirements</span>
                </div>
                {/* Add legend items for CCI-related nodes */}
                {hasCCIResults && (
                    <>
                        <div className="flex items-center">
                            <span className="mr-2 inline-block size-4 rounded-full bg-red-500"></span>
                            <span className="text-sm text-gray-700 dark:text-gray-300">Impacted by Sh. In.</span>
                        </div>
                        <div className="flex items-center">
                            <span className="mr-2 inline-block size-4 rounded-full bg-orange-500"></span>
                            <span className="text-sm text-gray-700 dark:text-gray-300">Shared Input</span>
                        </div>
                    </>
                )}
                <div className="flex items-center">
                    <span className="mr-2 inline-block size-4 bg-blue-300"></span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Action → Action Flow</span>
                </div>
                <div className="flex items-center">
                    <span className="mr-2 inline-block size-4 bg-purple-300"></span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Action → Requirement</span>
                </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Hover over nodes to see details. Pan and zoom to navigate the graph.
            </p>
        </div>
    );
};

export default GraphLegend;
