import { NextRequest, NextResponse } from 'next/server';
import { createSafetyNote, getSafetyNotesForNode } from '@/app/services/neo4j/queries/safety/safetyNotes';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const body = await request.json();
    const { note } = body;

    if (!note) {
      return NextResponse.json({ success: false, message: 'Missing required parameter: note' }, { status: 400 });
    }

    const result = await createSafetyNote(uuid, note);

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error creating safety note: ${errorMessage}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const result = await getSafetyNotesForNode(uuid);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error getting safety notes: ${errorMessage}` }, { status: 500 });
  }
} 