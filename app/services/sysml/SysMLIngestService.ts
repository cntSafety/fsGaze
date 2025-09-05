import { executeNeo4jQuery } from '../../services/KerMLToNeoService';
import type { SysMLIR } from './SysMLParser';

export async function ingestIRToNeo4j(ir: SysMLIR, fileName: string) {
  try {
    const nodesParam = ir.nodes.map(n => ({
      ...n,
      propsJson: n.props ? JSON.stringify(n.props) : null,
    }));
    // Create nodes
    const createNodesQuery = `
      UNWIND $nodes AS n
      CREATE (x:SysML {irId: n.id})
      SET x.kind = n.kind, x.name = n.name
      SET x.propsJson = n.propsJson
      RETURN count(x) AS c
    `;
    const nodeRes = await executeNeo4jQuery(createNodesQuery, { nodes: nodesParam });
    if (!nodeRes.success) {
      return { success: false, message: 'Failed to create nodes', error: nodeRes.error };
    }

    // Create relationships
    const createRelsQuery = `
      UNWIND $rels AS r
      MATCH (a:SysML {irId: r.startId})
      MATCH (b:SysML {irId: r.endId})
      FOREACH (_ IN CASE WHEN r.type = 'MEMBER_OF' THEN [1] ELSE [] END |
        CREATE (a)-[rel:MEMBER_OF]->(b)
        SET rel += coalesce(r.props, {})
      )
      FOREACH (_ IN CASE WHEN r.type = 'TYPED_BY' THEN [1] ELSE [] END |
        CREATE (a)-[rel:TYPED_BY]->(b)
        SET rel += coalesce(r.props, {})
      )
      FOREACH (_ IN CASE WHEN r.type = 'IMPORTS' THEN [1] ELSE [] END |
        CREATE (a)-[rel:IMPORTS]->(b)
        SET rel += coalesce(r.props, {})
      )
      FOREACH (_ IN CASE WHEN r.type = 'PERFORM' THEN [1] ELSE [] END |
        CREATE (a)-[rel:PERFORM]->(b)
        SET rel += coalesce(r.props, {})
      )
      RETURN 0
    `;
    const relRes = await executeNeo4jQuery(createRelsQuery, { rels: ir.relationships });
    if (!relRes.success) {
      return { success: false, message: 'Failed to create relationships', error: relRes.error };
    }

    // Import info
    await executeNeo4jQuery(
      `CREATE (i:ImportInfo {source:'sysml', file:$file, at:$at})`,
      { file: fileName, at: new Date().toISOString() }
    );

    return {
      success: true,
      message: 'Ingested SysML IR',
      nodeCount: ir.nodes.length,
      relationshipCount: ir.relationships.length,
    };
  } catch (e: any) {
    return { success: false, message: 'Ingest failed', error: e?.message || 'Unknown error' };
  }
}


