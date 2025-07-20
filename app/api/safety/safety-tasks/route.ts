import { NextRequest, NextResponse } from 'next/server';
import { getAllSafetyTasks, SafetyTaskStatus } from '@/app/services/neo4j/queries/safety/safetyTasks';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as SafetyTaskStatus | null;

    const result = await getAllSafetyTasks(status || undefined);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error getting all safety tasks: ${errorMessage}` }, { status: 500 });
  }
} 