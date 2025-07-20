import { NextRequest, NextResponse } from 'next/server';
import { createCausationBetweenFailureModes } from '@/app/services/neo4j/queries/safety/causation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceFailureModeUuid, targetFailureModeUuid } = body;

    if (!sourceFailureModeUuid || !targetFailureModeUuid) {
      return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
    }

    const result = await createCausationBetweenFailureModes(sourceFailureModeUuid, targetFailureModeUuid);

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error creating causation: ${errorMessage}` }, { status: 500 });
  }
} 