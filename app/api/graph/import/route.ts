import { NextRequest, NextResponse } from 'next/server';
import { importFullGraph } from '@/app/services/neo4j/queries/general';

// Type definitions for the API
interface ImportNodeData {
  uuid: string;
  labels: string[];
  properties: Record<string, any>;
}

interface ImportRelationshipData {
  type: string;
  properties: Record<string, any>;
  start: string;
  end: string;
}

interface GraphImportRequest {
  nodes: ImportNodeData[];
  relationships: ImportRelationshipData[];
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json() as GraphImportRequest;
    
    // Basic validation of incoming data structure
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.relationships)) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid request body. Expected format: { nodes: ImportNodeData[], relationships: ImportRelationshipData[] }',
          error: 'Validation failed: Missing or invalid nodes/relationships arrays'
        }, 
        { status: 400 }
      );
    }

    // Validate nodes structure
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i];
      if (!node.uuid || !node.labels || !Array.isArray(node.labels) || !node.properties || typeof node.properties !== 'object') {
        return NextResponse.json(
          { 
            success: false, 
            message: `Invalid node structure at index ${i}. Expected: { uuid: string, labels: string[], properties: object }`,
            error: 'Node validation failed'
          }, 
          { status: 400 }
        );
      }
    }

    // Validate relationships structure
    for (let i = 0; i < data.relationships.length; i++) {
      const rel = data.relationships[i];
      if (!rel.type || !rel.start || !rel.end || !rel.properties || typeof rel.properties !== 'object') {
        return NextResponse.json(
          { 
            success: false, 
            message: `Invalid relationship structure at index ${i}. Expected: { type: string, start: string, end: string, properties: object }`,
            error: 'Relationship validation failed'
          }, 
          { status: 400 }
        );
      }
    }

    console.log(`[API graph/import] Starting import of ${data.nodes.length} nodes and ${data.relationships.length} relationships`);

    const result = await importFullGraph(data.nodes, data.relationships);

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: result.message || 'Graph imported successfully.',
        stats: result.stats
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        message: result.message || 'Failed to import graph.', 
        error: result.error 
      }, { status: 500 });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error processing request';
    console.error('[API graph/import] Error:', error);
    return NextResponse.json({ 
      success: false, 
      message: `Internal server error: ${errorMessage}`,
      error: 'Server error during import'
    }, { status: 500 });
  }
}
