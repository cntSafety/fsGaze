import { NextRequest, NextResponse } from 'next/server';
import { createFailureModeNode } from '@/app/services/neo4j/queries/safety/failureModes';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { existingElementUuid, failureModeName, failureModeDescription, asil } = body;

    if (!existingElementUuid || !failureModeName || !failureModeDescription || !asil) {
      return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
    }

    const result = await createFailureModeNode(existingElementUuid, failureModeName, failureModeDescription, asil);

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error creating failure mode: ${errorMessage}` }, { status: 500 });
  }
} 