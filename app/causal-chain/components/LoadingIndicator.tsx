import React from 'react';

interface LoadingIndicatorProps {
    loadingPhase: string;
    loadProgress: number;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ loadingPhase, loadProgress }) => {
    return (
        <div className="flex flex-col justify-center items-center p-8 min-h-[300px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 dark:border-blue-400 mb-4"></div>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
                {loadingPhase === 'initial' && 'Initializing...'}
                {loadingPhase === 'parts' && 'Loading parts and failure modes...'}
                {loadingPhase === 'effects' && 'Analyzing failure effects...'}
                {loadingPhase === 'processing' && 'Processing relationships...'}
            </p>
            {loadProgress > 0 && (
                <div className="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-2">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${loadProgress}%` }}></div>
                </div>
            )}
        </div>
    );
};

export default LoadingIndicator;
