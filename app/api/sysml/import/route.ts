import { NextRequest, NextResponse } from 'next/server';
import { parseSysMLToIR } from '../../../services/sysml/SysMLParser';
import { ingestIRToNeo4j } from '../../../services/sysml/SysMLIngestService';

export async function POST(request: NextRequest) {
  try {
    const { content, fileName } = await request.json();

    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ success: false, message: 'Missing or empty SysML content' }, { status: 400 });
    }

    const ir = await parseSysMLToIR(content, fileName || 'unknown.sysml');
    const ingest = await ingestIRToNeo4j(ir, fileName || 'unknown.sysml');

    if (!ingest.success) {
      return NextResponse.json({ success: false, message: ingest.message, error: ingest.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'SysML parsed and ingested successfully',
      stats: {
        nodesCreated: ingest.nodeCount,
        relationshipsCreated: ingest.relationshipCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'Failed to import SysML', error: error?.message || 'Unknown error' }, { status: 500 });
  }
}


