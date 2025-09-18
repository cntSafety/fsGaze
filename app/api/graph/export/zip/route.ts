import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { exportFullGraphOptimized } from '@/app/services/neo4j/queries/general';

// Helper function to sanitize filenames
function sanitizeFileName(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { format } = body;

    if (format !== 'graph-as-code') {
      return NextResponse.json(
        { success: false, message: 'Only graph-as-code format is currently supported' },
        { status: 400 }
      );
    }

    console.log('[ZIP EXPORT] Starting full graph export...');
    const startTime = Date.now();

    // Get the data from Neo4j
    const result = await exportFullGraphOptimized();
    const fetchTime = Date.now() - startTime;
    console.log(`[ZIP EXPORT] Neo4j data fetch completed in ${fetchTime}ms`);

    if (!result.success || !result.data) {
      return NextResponse.json(
        { 
          success: false, 
          message: `Failed to export data: ${result.message}`,
          error: result.error
        },
        { status: 500 }
      );
    }

    const { nodes, relationships } = result.data;
    console.log(`[ZIP EXPORT] Retrieved ${nodes.length} nodes and ${relationships.length} relationships`);

    // Create ZIP archive and collect data in memory
    const zipStartTime = Date.now();
    
    // Group nodes by label for organized file structure
    const nodesByLabel: Record<string, number> = {};
    const nodesByLabelGroups: Record<string, any[]> = {};
    
    for (const node of nodes) {
      // Choose a deterministic primary label (alphabetical first), then sanitize
      const primaryLabel = sanitizeFileName(([...node.labels].sort()[0]) || 'UNKNOWN');
      nodesByLabel[primaryLabel] = (nodesByLabel[primaryLabel] || 0) + 1;
      if (!nodesByLabelGroups[primaryLabel]) {
        nodesByLabelGroups[primaryLabel] = [];
      }
      nodesByLabelGroups[primaryLabel].push(node);
    }

    console.log(`[ZIP EXPORT] Grouped into ${Object.keys(nodesByLabel).length} label groups`);

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Best compression
    });

    // Collect archive data
    const chunks: Buffer[] = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    
    // Promise to wait for archive completion
    const archivePromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      archive.on('error', reject);
    });

    // Add nodes to ZIP by label groups (sorted for deterministic output)
    const sortedGroupNames = Object.keys(nodesByLabelGroups).sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
    );
    for (const labelName of sortedGroupNames) {
      const labelNodes = nodesByLabelGroups[labelName];
      console.log(`[ZIP EXPORT] Adding ${labelNodes.length} nodes for label: ${labelName}`);
      
      const filename = `nodes/${labelName}.json`;
      
      // Prepare nodes with stable ordering (by name/shortName/uuid) and sorted properties
      const nodesForFile = [...labelNodes]
        .sort((a, b) => {
          const an = String(a?.properties?.name ?? a?.properties?.shortName ?? a?.uuid ?? '');
          const bn = String(b?.properties?.name ?? b?.properties?.shortName ?? b?.uuid ?? '');
          const byName = an.localeCompare(bn, 'en', { numeric: true, sensitivity: 'base' });
          if (byName !== 0) return byName;
          return String(a?.uuid ?? '').localeCompare(String(b?.uuid ?? ''));
        })
        .map(node => ({
          uuid: node.uuid,
          labels: [...node.labels].sort(),
          properties: Object.keys(node.properties)
            .sort()
            .reduce((sorted: Record<string, any>, key) => {
              sorted[key] = node.properties[key];
              return sorted;
            }, {})
        }));
      
      archive.append(JSON.stringify(nodesForFile, null, 2), { name: filename });
    }

    // Add relationships to ZIP
    console.log(`[ZIP EXPORT] Adding ${relationships.length} relationships`);
    // Ensure deterministic ordering for relationships as well
    const relationshipsData = [...relationships]
      .sort((a: any, b: any) => {
        const t = String(a?.type ?? '').localeCompare(String(b?.type ?? ''), 'en', { sensitivity: 'base' });
        if (t !== 0) return t;
        const s = String(a?.startNodeUuid ?? '').localeCompare(String(b?.startNodeUuid ?? ''));
        if (s !== 0) return s;
        return String(a?.endNodeUuid ?? '').localeCompare(String(b?.endNodeUuid ?? ''));
      })
      .map((rel: any) => ({
      endNodeUuid: rel.endNodeUuid,
      properties: Object.keys(rel.properties)
        .sort()
        .reduce((sorted: Record<string, any>, key) => {
          sorted[key] = rel.properties[key];
          return sorted;
        }, {}),
      startNodeUuid: rel.startNodeUuid,
      type: rel.type
    }));

    archive.append(JSON.stringify(relationshipsData, null, 2), { 
      name: 'relationships.json' 
    });

    // Add metadata
    const zipCreationTime = Date.now() - zipStartTime;
    const metadata = {
      exportDate: new Date().toISOString(),
      exportSummary: {
        nodesExported: nodes.length,
        relationshipsExported: relationships.length,
        nodesByLabel
      },
      performance: {
        dataFetchTime: fetchTime,
        zipCreationTime,
        totalExportTime: Date.now() - startTime
      }
    };

    archive.append(JSON.stringify(metadata, null, 2), { 
      name: 'export-info.json' 
    });

    console.log(`[ZIP EXPORT] Archive prepared, finalizing...`);

    // Finalize the archive
    await archive.finalize();

    // Wait for archive to complete
    const zipBuffer = await archivePromise;

    const totalTime = Date.now() - startTime;
    console.log(`[ZIP EXPORT] Export completed! Total time: ${totalTime}ms (Neo4j: ${fetchTime}ms, ZIP: ${zipCreationTime}ms)`);

    // Return the ZIP file
    const response = new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="graph-export-${new Date().toISOString().split('T')[0]}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    });

    return response;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ZIP EXPORT] Error:', errorMessage);
    
    return NextResponse.json(
      { 
        success: false, 
        message: `Export failed: ${errorMessage}` 
      },
      { status: 500 }
    );
  }
}