import { NextRequest, NextResponse } from 'next/server';
import { updateSafetyTaskStatus, SafetyTaskStatus } from '@/app/services/neo4j/queries/safety/safetyTasks';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ success: false, message: 'Missing required parameter: status' }, { status: 400 });
    }

    const result = await updateSafetyTaskStatus(uuid, status as SafetyTaskStatus);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error updating safety task status: ${errorMessage}` }, { status: 500 });
  }
} 