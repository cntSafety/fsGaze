import { NextRequest, NextResponse } from 'next/server';
import { createSafetyTask, getSafetyTasksForNode } from '@/app/services/neo4j/queries/safety/safetyTasks';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const body = await request.json();
    
    const result = await createSafetyTask(uuid, body);

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error creating safety task: ${errorMessage}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const result = await getSafetyTasksForNode(uuid);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error getting safety tasks: ${errorMessage}` }, { status: 500 });
  }
} 