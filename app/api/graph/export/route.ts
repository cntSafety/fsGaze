import { NextResponse } from 'next/server';
import { exportFullGraphOptimized } from '@/app/services/neo4j/queries/general';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { format } = body;

    if (format !== 'graph-as-code') {
      return NextResponse.json(
        { success: false, message: 'Only graph-as-code format is currently supported' },
        { status: 400 }
      );
    }

    // Perform the export
    const result = await exportFullGraphOptimized();

    if (result.success && result.data) {
      // Create export summary
      const nodesByLabel: Record<string, number> = {};
      result.data.nodes.forEach(node => {
        const primaryLabel = node.labels[0] || 'UNKNOWN';
        nodesByLabel[primaryLabel] = (nodesByLabel[primaryLabel] || 0) + 1;
      });

      return NextResponse.json({
        success: true,
        message: result.message,
        summary: {
          nodesExported: result.data.nodes.length,
          relationshipsExported: result.data.relationships.length,
          nodesByLabel
        },
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          message: result.message,
          error: result.error
        },
        { status: 500 }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false, 
        message: `Export failed: ${errorMessage}` 
      },
      { status: 500 }
    );
  }
}
