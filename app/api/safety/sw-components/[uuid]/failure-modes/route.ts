import { NextRequest, NextResponse } from 'next/server';
import { getFailuresForSwComponents } from '@/app/services/neo4j/queries/safety/failureModes';

export async function GET(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const result = await getFailuresForSwComponents(uuid);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error getting failure modes for SW component: ${errorMessage}` }, { status: 500 });
  }
} 