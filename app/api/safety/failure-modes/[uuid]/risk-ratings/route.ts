import { NextRequest, NextResponse } from 'next/server';
import { createRiskRatingNode, getRiskRatingNodes } from '@/app/services/neo4j/queries/safety/riskRating';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const body = await request.json();
    const { severity, occurrence, detection, ratingComment } = body;

    if (severity === undefined || occurrence === undefined || detection === undefined) {
      return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
    }

    const result = await createRiskRatingNode(uuid, severity, occurrence, detection, ratingComment);

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error creating risk rating: ${errorMessage}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params;
    const result = await getRiskRatingNodes(uuid);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Error getting risk ratings: ${errorMessage}` }, { status: 500 });
  }
} 