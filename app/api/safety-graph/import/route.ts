import { NextRequest, NextResponse } from 'next/server';
import { importSafetyGraphData, SafetyGraphData } from '@/app/services/neo4j/queries/safety';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json() as SafetyGraphData;
    
    // Basic validation of incoming data structure
    if (!data || !data.failures || !data.causations || !data.occurrences || !data.causationLinks) {
      return NextResponse.json(
        { message: 'Invalid request body. Missing required safety graph data fields.', logs: ['Validation failed: Missing fields'] }, 
        { status: 400 }
      );
    }

    const result = await importSafetyGraphData(data);

    if (result.success) {
      return NextResponse.json({ success: true, logs: result.logs, message: 'Data imported successfully.' });
    } else {
      return NextResponse.json({ success: false, logs: result.logs, message: result.message || 'Failed to import data.' }, { status: 500 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error processing request';
    console.error('[API safety-graph/import] Error:', error);
    return NextResponse.json({ success: false, message: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
