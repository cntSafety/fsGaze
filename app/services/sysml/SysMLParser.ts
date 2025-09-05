// Temporary parser wrapper.
// Phase 1: provide a stub IR extractor; Phase 2: integrate sysml-2ls parser here.

export type SysMLElementKind = 'Package' | 'PartDefinition' | 'PartUsage' | 'ActionUsage' | 'Import' | 'Unknown';

export interface SysMLNodeIR {
  id: string; // local synthetic id for ingestion session
  kind: SysMLElementKind;
  name?: string;
  owner?: string; // owner id for contained elements
  typeFqn?: string; // for typed usages (e.g., :> PictureTaking::takePicture)
  multiplicity?: string; // raw multiplicity text
  props?: Record<string, any>;
}

export interface SysMLRelIR {
  type: 'MEMBER_OF' | 'TYPED_BY' | 'IMPORTS' | 'PERFORM';
  startId: string;
  endId: string;
  props?: Record<string, any>;
}

export interface SysMLIR {
  nodes: SysMLNodeIR[];
  relationships: SysMLRelIR[];
}

let nextId = 1;
const genId = () => `ir_${nextId++}`;

export async function parseSysMLToIR(content: string, fileName: string): Promise<SysMLIR> {
  // Very naive regex-based extractor for PoC.
  // Recognizes a subset: part def <Name> { ... }, part <name> { ... }, perform action <name>[*]? :> <Type>, perform <target>.<role>;
  // Replace with sysml-2ls AST parsing in Phase 2.

  nextId = 1;
  const nodes: SysMLNodeIR[] = [];
  const relationships: SysMLRelIR[] = [];

  const fileNodeId = genId();
  nodes.push({ id: fileNodeId, kind: 'Package', name: fileName, props: { source: 'sysml' } });

  // part def blocks
  const partDefRegex = /part\s+def\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = partDefRegex.exec(content)) !== null) {
    const defName = match[1];
    const body = match[2];
    const defId = genId();
    nodes.push({ id: defId, kind: 'PartDefinition', name: defName });
    relationships.push({ type: 'MEMBER_OF', startId: defId, endId: fileNodeId });

    // imports
    const importRegex = /(public|private)?\s*import\s+([^;]+);/g;
    let im: RegExpExecArray | null;
    while ((im = importRegex.exec(body)) !== null) {
      const impId = genId();
      nodes.push({ id: impId, kind: 'Import', name: im[2].trim(), props: { visibility: (im[1] || 'public').trim() } });
      relationships.push({ type: 'IMPORTS', startId: defId, endId: impId });
    }

    // perform action definition line: perform action takePicture[*] :> X::Y;
    const performActionRegex = /perform\s+action\s+(\w+)(\[[^\]]*\])?\s*:?\s*>\s*([\w:]+)\s*;/g;
    let pa: RegExpExecArray | null;
    while ((pa = performActionRegex.exec(body)) !== null) {
      const actionName = pa[1];
      const mult = pa[2]?.replace(/[\[\]]/g, '') || undefined;
      const typeFqn = pa[3];
      const actionId = genId();
      nodes.push({ id: actionId, kind: 'ActionUsage', name: actionName, multiplicity: mult, typeFqn });
      relationships.push({ type: 'MEMBER_OF', startId: actionId, endId: defId });
      relationships.push({ type: 'TYPED_BY', startId: actionId, endId: fileNodeId, props: { typeFqn } });
    }

    // part usages inside the def
    const partUsageRegex = /part\s+(\w+)\s*\{([\s\S]*?)\}/g;
    let pu: RegExpExecArray | null;
    while ((pu = partUsageRegex.exec(body)) !== null) {
      const usageName = pu[1];
      const uBody = pu[2];
      const usageId = genId();
      nodes.push({ id: usageId, kind: 'PartUsage', name: usageName });
      relationships.push({ type: 'MEMBER_OF', startId: usageId, endId: defId });

      // perform statements: perform takePicture.focus;
      const performStmtRegex = /perform\s+([\w]+)\.([\w]+)\s*;/g;
      let ps: RegExpExecArray | null;
      while ((ps = performStmtRegex.exec(uBody)) !== null) {
        const target = ps[1];
        const role = ps[2];
        const perfId = genId();
        nodes.push({ id: perfId, kind: 'Unknown', name: `${target}.${role}` });
        relationships.push({ type: 'PERFORM', startId: usageId, endId: perfId, props: { target, role } });
      }
    }
  }

  return { nodes, relationships };
}


