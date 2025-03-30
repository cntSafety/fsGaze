import React from 'react';

interface GraphLegendProps {
    showParts: boolean;
    onToggleParts: () => void;
    partsWithFailureModes: any[];
    dataLimit: number;
    onLoadMore: () => void;
}

const GraphLegend: React.FC<GraphLegendProps> = ({
    showParts,
    onToggleParts,
    partsWithFailureModes,
    dataLimit,
    onLoadMore
}) => {
    return (
        <div className="mb-4 bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg shadow-md">
            <div className="flex flex-wrap justify-between items-center">
                <div className="flex flex-wrap gap-4 mb-2">
                    <div className="flex items-center">
                        <span className="w-4 h-4 inline-block mr-2 rounded-full bg-blue-500"></span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Parts</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 inline-block mr-2 rounded-full bg-red-500"></span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Failure Modes</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 inline-block mr-2 bg-blue-300"></span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Part → Failure Mode</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-4 h-4 inline-block mr-2 bg-orange-400"></span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">Failure Mode → Effect</span>
                    </div>
                </div>

                <button
                    onClick={onToggleParts}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 text-sm font-medium"
                >
                    {showParts ? 'Hide Parts' : 'Show Parts'}
                </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Click on nodes to see details. Drag nodes to rearrange the graph.
            </p>

            {partsWithFailureModes.length >= dataLimit && (
                <div className="mt-2 text-right">
                    <button
                        onClick={onLoadMore}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 text-sm font-medium"
                    >
                        Load more data
                    </button>
                </div>
            )}
        </div>
    );
};

export default GraphLegend;
