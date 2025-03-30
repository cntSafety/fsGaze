import React from 'react';

interface NodeDetailPanelProps {
    node: any;
    onClose: () => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, onClose }) => {
    if (node.type !== 'failureMode' || !node.partInfo) {
        return null;
    }

    return (
        <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 max-w-md">
            <h3 className="text-lg font-medium text-gray-800 dark:text-white">{node.name}</h3>
            <div className="mt-2">
                <span className="text-sm font-bold text-gray-600 dark:text-gray-300">Part:</span>
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{node.partInfo.name || 'Unknown'}</span>
            </div>
            {node.effects && node.effects.length > 0 && (
                <div className="mt-2">
                    <span className="text-sm font-bold text-gray-600 dark:text-gray-300">Effects:</span>
                    <ul className="list-disc list-inside mt-1">
                        {node.effects.map((effect, index) => (
                            <li key={index} className="text-xs text-gray-600 dark:text-gray-400">{effect}</li>
                        ))}
                    </ul>
                </div>
            )}
            <button
                onClick={onClose}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
                Close
            </button>
        </div>
    );
};

export default NodeDetailPanel;
