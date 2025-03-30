interface ExportPathProps {
    fileName: string;
    onFileNameChange: (fileName: string) => void;
}

export default function ExportPath({ fileName, onFileNameChange }: ExportPathProps) {
    return (
        <div className="mb-4">
            <div className="mb-2 block">
                <label htmlFor="exportFileName" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                    Export filename
                </label>
            </div>
            <input
                type="text"
                id="exportFileName"
                placeholder="safetystatus.rst"
                value={fileName}
                onChange={(e) => onFileNameChange(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                You will be prompted to choose where to save the file.
            </p>
        </div>
    );
}
