import React from 'react';

interface ErrorMessageProps {
    error: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ error }) => {
    return (
        <div className="rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700 shadow-sm dark:border-red-700 dark:bg-red-900 dark:text-red-300" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {error}</span>
        </div>
    );
};

export default ErrorMessage;
