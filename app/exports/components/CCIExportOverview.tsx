/**
 * CCIExportOverview Component
 * 
 * This component displays CCI (Code Compliance Inspection) analysis results and allows
 * for exporting analyses to Sphinx Needs format.
 * 
 * Data Flow:
 * 1. Data Input:
 *    - CCI results are retrieved from the global cciStore using useCCIStore hook
 *    - Raw results contain timestamp information and individual analysis data
 * 
 * 2. Data Processing:
 *    - Upon receiving cciResults (useEffect), the component:
 *      a. Extracts all requirement names from the results
 *      b. Prepares a list of unique requirement names for display
 * 
 * 3. Data Export:
 *    - When export is triggered:
 *      a. All CCI results are passed to exportSafetyStatusFile service
 *      b. Export status and results are displayed to the user
 * 
 * State Management:
 * - requirementNames: List of unique requirement names for display
 * - isExporting: Tracks export operation status
 * - exportResult: Stores the result of the export operation
 */


import { useCCIStore } from "@/app/find-shared-signals/store/cciStore";
import { useEffect, useState } from "react";
import { exportSafetyStatusFile } from "../services/SphinxNeedsExport";
import Link from "next/link";

export default function CCIExportOverview() {
    const { cciResults } = useCCIStore();
    const [requirementNames, setRequirementNames] = useState<string[]>([]);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [exportResult, setExportResult] = useState<{
        success?: boolean;
        message?: string;
    } | null>(null);

    useEffect(() => {
        if (cciResults.length > 0) {
            // Extract unique requirement names from results
            const uniqueRequirements = new Set<string>();

            cciResults.forEach(result => {
                if (result.requirementName) {
                    uniqueRequirements.add(result.requirementName);
                }
            });

            setRequirementNames(Array.from(uniqueRequirements));
        } else {
            setRequirementNames([]);
        }
    }, [cciResults]);

    const handleExport = async () => {
        if (cciResults.length === 0) return;

        setIsExporting(true);
        setExportResult(null);

        try {
            const fileName = `safety_analysis_${new Date().toISOString().slice(0, 10)}.rst`;
            const result = await exportSafetyStatusFile(cciResults, fileName);

            setExportResult({
                success: result.success,
                message: result.success
                    ? `Successfully exported: ${result.filePath}`
                    : `Export failed: ${result.error || "Unknown error"}`
            });
        } catch (error) {
            setExportResult({
                success: false,
                message: `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`
            });
        } finally {
            setIsExporting(false);
        }
    };

    if (cciResults.length === 0) {
        return (
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5 mb-4">
                <p className="text-gray-500 dark:text-gray-400">
                    No analysis data available, perform the{" "}
                    <Link href="/find-shared-signals" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline">
                        find-shared-signals
                    </Link>{" "}
                    analysis first.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5 mb-4">
            <div className="mb-4">
                <h6 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Requirements in CCI Analysis
                </h6>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Analysis conducted: {new Date(cciResults[0]?.timestamp || Date.now()).toLocaleString()}
                </p>
            </div>

            <div className="mb-4">
                <h6 className="text-md mb-2 font-medium text-gray-900 dark:text-white">
                    Requirements ({requirementNames.length})
                </h6>

                {requirementNames.length > 0 ? (
                    <ul className="mb-4 list-inside list-disc space-y-1 text-gray-700 dark:text-gray-200">
                        {requirementNames.map((name, index) => (
                            <li key={index}>{name}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400">No requirement names found in the analysis.</p>
                )}

                <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleExport}
                    className={`inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 ${
                        isExporting ? 'opacity-75 cursor-not-allowed' : ''
                    } mt-2`}
                >
                    {isExporting && (
                        <svg className="w-4 h-4 mr-2 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    )}
                    Export to Sphinx Needs
                </button>
            </div>

            {exportResult && (
                <div className={`mt-4 rounded p-3 text-sm ${exportResult.success
                    ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                    : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                    }`}>
                    {exportResult.message}
                </div>
            )}
        </div>
    );
}
