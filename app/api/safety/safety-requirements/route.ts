import { NextRequest, NextResponse } from 'next/server';
import { getAllSafetyReqs } from '@/app/services/neo4j/queries/safety/safetyReq';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      reqASIL: searchParams.get('reqASIL') || undefined,
      name: searchParams.get('name') || undefined,
      reqID: searchParams.get('reqID') || undefined,
    };
    const result = await getAllSafetyReqs(filters);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error getting all safety requirements: ${errorMessage}` }, { status: 500 });
  }
} 