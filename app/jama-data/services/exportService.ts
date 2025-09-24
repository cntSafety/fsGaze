import { JamaItem } from '../types/jama';
import { useJamaStore } from '../../stores/jamaStore';

export interface ExportProgressCallback {
    (current: number, total: number, message: string): void;
}

export interface ExportRstOptions {
    onProgress?: ExportProgressCallback;
}

export interface ExportRstResult {
    content: string;
    filename: string;
}

export interface RecursiveExportOptions {
    onProgress?: ExportProgressCallback;
}

export interface RecursiveExportResult {
    zipBlob: Blob;
    filename: string;
}

/**
 * Export a single layer (item with its direct children) to RST format
 */
export async function exportOneLayerToRst(
    item: JamaItem,
    itemTypeInfo: { id: number; display: string } | null,
    asilInfo: { field: string; value: string; optionName: string } | null,
    upstreamRelated: number[],
    downstreamRelated: number[],
    children: number[],
    options: ExportRstOptions = {}
): Promise<ExportRstResult> {
    
    const { onProgress } = options;
    
    if (onProgress) {
        onProgress(0, 5, 'Preparing export request...');
    }

    try {
        if (onProgress) {
            onProgress(1, 5, 'Sending request to server...');
        }

        // Get connection config from store
        const jamaStore = useJamaStore.getState();
        const connectionConfig = jamaStore.connectionConfig;

        if (!connectionConfig) {
            throw new Error('No Jama connection configuration found. Please connect to Jama first.');
        }

        const response = await fetch('/api/jama/export/rst', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                item,
                itemTypeInfo,
                asilInfo,
                upstreamRelated,
                downstreamRelated,
                children,
                exportType: 'single',
                connectionConfig
            }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        if (onProgress) {
            onProgress(3, 5, 'Processing server response...');
        }

        const content = await response.text();
        
        if (onProgress) {
            onProgress(5, 5, 'Export completed successfully!');
        }

        return {
            content,
            filename: `${item.id}.rst`
        };

    } catch (error) {
        console.error('Failed to export RST:', error);
        throw new Error(`Failed to export RST: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Export a hierarchical structure to multiple RST files organized in folders and packaged as ZIP
 */
export async function exportRecursiveToRst(
    item: JamaItem,
    itemTypeInfo: { id: number; display: string } | null,
    asilInfo: { field: string; value: string; optionName: string } | null,
    upstreamRelated: number[],
    downstreamRelated: number[],
    children: number[],
    options: RecursiveExportOptions = {}
): Promise<RecursiveExportResult> {
    
    const { onProgress } = options;
    
    if (onProgress) {
        onProgress(0, 10, 'Preparing recursive export request...');
    }

    try {
        if (onProgress) {
            onProgress(2, 10, 'Sending request to server...');
        }

        // Get connection config from store
        const jamaStore = useJamaStore.getState();
        const connectionConfig = jamaStore.connectionConfig;

        if (!connectionConfig) {
            throw new Error('No Jama connection configuration found. Please connect to Jama first.');
        }

        const response = await fetch('/api/jama/export/rst', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                item,
                itemTypeInfo,
                asilInfo,
                upstreamRelated,
                downstreamRelated,
                children,
                exportType: 'recursive',
                connectionConfig
            }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        if (onProgress) {
            onProgress(8, 10, 'Processing server response...');
        }

        const zipBlob = await response.blob();
        
        if (onProgress) {
            onProgress(10, 10, 'Recursive export completed successfully!');
        }

        return {
            zipBlob,
            filename: `${item.id}_recursive_export.zip`
        };

    } catch (error) {
        console.error('Failed to export recursive RST:', error);
        throw new Error(`Failed to export recursive RST: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}