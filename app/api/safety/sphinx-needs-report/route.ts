import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getAllComponentSafetyData, getAllPortSafetyData } from '@/app/services/neo4j/queries/safety/exportSWCSafety';
import { checkASIL } from '@/app/services/neo4j/queries/safety/causation';
import { generateSphinxNeedsRstFiles } from './sphinxNeedsGenerator';

export async function POST(request: NextRequest) {
  try {
    const componentsResult = await getApplicationSwComponents();

    if (!componentsResult.success || !componentsResult.data) {
      throw new Error(componentsResult.message ?? 'Unable to fetch application software components.');
    }

    const components = componentsResult.data;

    const [componentSafetyResult, portResult, causationResult] = await Promise.all([
      getAllComponentSafetyData(),
      getAllPortSafetyData(),
      checkASIL(),
    ]);

    if (!componentSafetyResult.success || !componentSafetyResult.data) {
      throw new Error(componentSafetyResult.message ?? 'Unable to fetch component safety data.');
    }

    if (!portResult.success || !portResult.data) {
      throw new Error(portResult.message ?? 'Unable to fetch port safety data.');
    }

    const causationData = causationResult.success && Array.isArray(causationResult.data)
      ? causationResult.data
      : [];

    if (!causationResult.success) {
      console.warn('[SphinxNeedsSafetyReport] Failed to fetch causation data for export:', causationResult.message ?? causationResult.error);
    }

    const rstFiles = generateSphinxNeedsRstFiles({
      components,
      componentSafety: componentSafetyResult.data,
      portSafety: portResult.data,
      causations: causationData,
    });

    console.log('[SphinxNeedsSafetyReport] Received component payload');
    console.log(`Total components: ${components.length}`);
    console.log(`Total component safety records: ${componentSafetyResult.data.length}`);
    console.log(`Total ports: ${portResult.data.length}`);
  console.log(`Generated RST files: ${rstFiles.length}`);
  console.log(`Causation records processed: ${causationData.length}`);
    rstFiles.slice(0, 3).forEach(file => {
      console.log(`[SphinxNeedsSafetyReport] Preview for ${file.fileName}:\n${file.content.slice(0, 400)}${file.content.length > 400 ? '…' : ''}`);
    });

    if (rstFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'No Sphinx-Needs data available to export.',
        },
        { status: 404 },
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const archivePromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      archive.on('error', reject);
    });

    const toctreeEntries = rstFiles
      .map(file => `   components/${file.fileName.replace(/\.rst$/i, '')}`)
      .join('\n');

    const indexContent = [
      'SW Safety Analysis Export',
      '=========================',
      '',
      'Introduction',
      '---------------------',
      '',
      'This is the export of the SW Safety Analysis.',
      '',
      '.. toctree::',
      '   :maxdepth: 3',
      '   :caption: Contents:',
      '   :titlesonly:',
      '',
      toctreeEntries,
      '',
    ].join('\n');

    archive.append(indexContent, { name: 'index.rst' });

    rstFiles.forEach(file => {
      archive.append(file.content, { name: `components/${file.fileName}` });
    });

    archive.append(JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalComponents: components.length,
      totalComponentSafetyRecords: componentSafetyResult.data.length,
      totalPortSafetyRecords: portResult.data.length,
      files: rstFiles.map(file => `components/${file.fileName}`),
    }, null, 2), { name: 'export-info.json' });

    await archive.finalize();

  const zipBuffer = await archivePromise;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="sphinx-needs-export-${timestamp}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SphinxNeedsSafetyReport] Error handling request:', errorMessage);
    return NextResponse.json(
      { success: false, message: `Failed to log Sphinx-Needs safety report: ${errorMessage}` },
      { status: 500 }
    );
  }
}
