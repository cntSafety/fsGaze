"use client";

import { useState } from "react";
import CCIExportOverview from "./components/CCIExportOverview";

export default function Exports() {
    const [showDetails, setShowDetails] = useState<boolean>(false);

    return (
        <div className="flex justify-center p-4">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg max-w-1xl w-full p-6">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
                    Export Safety Data
                </h2>

                <CCIExportOverview />
            </div>
        </div>
    );
}
