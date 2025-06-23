import { Node, Edge, Position } from 'reactflow';
import dagre from 'dagre';

const nodeWidth = 350; // Match the minWidth of the SwComponentNode
const nodeHeight = 200; // A baseline height, actual height is dynamic

export const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: 200, // Horizontal separation
    nodesep: 70,  // Vertical separation
    align: 'UL',
  });

  // 1. Build the detailed graph model for Dagre
  nodes.forEach((node) => {
    // Add the main component node
    dagreGraph.setNode(node.id, {
      width: node.width || nodeWidth,
      height: node.height || nodeHeight,
    });

    // Add invisible "dummy" nodes for each failure mode handle and parent them
    const { providerPorts = [], receiverPorts = [] } = node.data;
    const allPorts = [...providerPorts, ...receiverPorts];

    allPorts.forEach(port => {
      port.failureModes.forEach((failureMode: any) => {
        const dummyId = `dummy-${failureMode.uuid}`;
        dagreGraph.setNode(dummyId, { width: 1, height: 1 });
        dagreGraph.setParent(dummyId, node.id);
      });
    });
  });

  // Add the causation edges between the dummy nodes
  edges.forEach((edge) => {
    if (edge.sourceHandle && edge.targetHandle) {
      const sourceDummyId = `dummy-${edge.sourceHandle.replace('failure-', '')}`;
      const targetDummyId = `dummy-${edge.targetHandle.replace('failure-', '')}`;
      dagreGraph.setEdge(sourceDummyId, targetDummyId);
    }
  });
  
  // 2. Run the layout algorithm
  dagre.layout(dagreGraph);

  // 3. Apply the calculated layout back to the React Flow nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // Get the sorted vertical order of all failure modes for this component
    const childDummies = dagreGraph.children(node.id);
    const sortedFailureUuids = (Array.isArray(childDummies) ? childDummies : [])
      .map((dummyId: string) => ({
        id: dummyId.replace('dummy-', ''),
        y: dagreGraph.node(dummyId).y,
      }))
      .sort((a: { y: number }, b: { y: number }) => a.y - b.y)
      .map((item: { id: string }) => item.id);

    // Re-order the failure modes in the original data structure based on the new layout
    const sortFailures = (failureModes: any[]) => {
      return [...failureModes].sort((a, b) =>
        sortedFailureUuids.indexOf(a.uuid) - sortedFailureUuids.indexOf(b.uuid)
      );
    };
    
    const newProviderPorts = node.data.providerPorts.map((port: any) => ({
      ...port,
      failureModes: sortFailures(port.failureModes),
    }));

    const newReceiverPorts = node.data.receiverPorts.map((port: any) => ({
      ...port,
      failureModes: sortFailures(port.failureModes),
    }));
    
    return {
      ...node,
      draggable: true, // Ensure nodes are draggable
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: nodeWithPosition.x - (node.width || nodeWidth) / 2,
        y: nodeWithPosition.y - (node.height || nodeHeight) / 2,
      },
      data: {
        ...node.data,
        providerPorts: newProviderPorts,
        receiverPorts: newReceiverPorts,
      },
    };
  });

  // 4. Calculate horizontal offsets for parallel edges
  const edgeGroups = new Map<string, Edge[]>();
  edges.forEach((edge) => {
    const groupKey = `${edge.source}->${edge.target}`;
    if (!edgeGroups.has(groupKey)) {
      edgeGroups.set(groupKey, []);
    }
    edgeGroups.get(groupKey)!.push(edge);
  });
  
  const spacing = 15;
  edgeGroups.forEach((group) => {
    group.forEach((edge, i) => {
      const offsetX = (i - (group.length - 1) / 2) * spacing;
      edge.data = { ...edge.data, offsetX };
    });
  });

  // 5. Apply colors for visibility
  const colors = ['#e11d48', '#ea580c', '#65a30d', '#2563eb', '#9333ea', '#c026d3'];
  const colorMap = new Map<string, string>();
  edges.forEach((edge, i) => {
    const color = colors[i % colors.length];
    edge.style = { stroke: color, strokeWidth: 2 };
    if(edge.markerEnd) {
        (edge.markerEnd as any).color = color;
    }
  });

  return { nodes: layoutedNodes, edges: edges };
}; 