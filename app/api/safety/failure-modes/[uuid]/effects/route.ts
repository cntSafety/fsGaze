import { NextRequest, NextResponse } from 'next/server';
import { getEffectFailureModes } from '@/app/services/neo4j/queries/safety/causation';

export async function GET(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const result = await getEffectFailureModes(uuid);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error getting effect failure modes: ${errorMessage}` }, { status: 500 });
  }
} 