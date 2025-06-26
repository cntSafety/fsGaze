import { NextRequest, NextResponse } from 'next/server';
import { previewCascadeDelete, executeCascadeDelete } from '@/app/services/neo4j/queries/safety/cascadeDelete';

export async function POST(req: NextRequest) {
  const { action, nodeUuid, nodeType } = await req.json();

  if (!action || !nodeUuid || !nodeType) {
    return NextResponse.json({ success: false, message: 'Missing required parameters: action, nodeUuid, nodeType' }, { status: 400 });
  }

  if (action === 'preview') {
    const result = await previewCascadeDelete(nodeUuid, nodeType);
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } else if (action === 'execute') {
    const result = await executeCascadeDelete(nodeUuid, nodeType);
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } else {
    return NextResponse.json({ success: false, message: 'Invalid action. Must be "preview" or "execute"' }, { status: 400 });
  }
} 