import { NextRequest, NextResponse } from 'next/server';
import { deleteCausationNode } from '@/app/services/neo4j/queries/safety/causation';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const result = await deleteCausationNode(uuid);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error deleting causation: ${errorMessage}` }, { status: 500 });
  }
} 