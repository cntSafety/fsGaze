import React from 'react';

interface LoadingIndicatorProps {
    message?: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ message = "Loading actions and connections..." }) => {
    return (
        <div className="flex min-h-[300px] items-center justify-center p-8">
            <div className="size-12 animate-spin rounded-full border-b-2 border-blue-500 dark:border-blue-400"></div>
            <p className="ml-4 text-gray-700 dark:text-gray-300">{message}</p>
        </div>
    );
};

export default LoadingIndicator;
