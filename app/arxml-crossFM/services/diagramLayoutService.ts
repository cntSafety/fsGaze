import { Node, Edge, Position } from 'reactflow';
import dagre from 'dagre';

const nodeWidth = 350; // Match the minWidth of the SwComponentNode
const nodeHeight = 200; // A baseline height, actual height is dynamic

export const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: 300, // Increased horizontal separation
    nodesep: 150,  // Increased vertical separation
    align: 'UL',
    acyclicer: 'greedy',
    ranker: 'network-simplex'
  });

  // 1. Add component nodes to the graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.width || nodeWidth,
      height: node.height || nodeHeight,
    });
  });

  // 2. Create edges between component nodes based on causation relationships
  // This will help Dagre understand the flow direction and create proper ranks
  const componentConnections = new Set<string>();
  
  edges.forEach((edge) => {
    const connectionKey = `${edge.source}-${edge.target}`;
    if (!componentConnections.has(connectionKey) && edge.source !== edge.target) {
      dagreGraph.setEdge(edge.source, edge.target);
      componentConnections.add(connectionKey);
    }
  });

  // 3. Run the layout algorithm
  dagre.layout(dagreGraph);

  // 4. Apply the calculated layout back to the React Flow nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // For better failure mode ordering, we can use a simple heuristic
    // based on the node's position and connections
    const sortFailuresByConnections = (failureModes: any[], isProvider: boolean) => {
      return [...failureModes].sort((a, b) => {
        // Count connections for each failure mode
        const aConnections = edges.filter(edge => 
          (isProvider && edge.sourceHandle?.includes(a.uuid)) ||
          (!isProvider && edge.targetHandle?.includes(a.uuid))
        ).length;
        
        const bConnections = edges.filter(edge => 
          (isProvider && edge.sourceHandle?.includes(b.uuid)) ||
          (!isProvider && edge.targetHandle?.includes(b.uuid))
        ).length;
        
        // Sort by connection count (more connections first) then by name
        if (aConnections !== bConnections) {
          return bConnections - aConnections;
        }
        return a.name.localeCompare(b.name);
      });
    };
    
    const newProviderPorts = node.data.providerPorts.map((port: any) => ({
      ...port,
      failureModes: sortFailuresByConnections(port.failureModes, true),
    }));

    const newReceiverPorts = node.data.receiverPorts.map((port: any) => ({
      ...port,
      failureModes: sortFailuresByConnections(port.failureModes, false),
    }));
    
    return {
      ...node,
      draggable: true,
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

  // 5. Calculate horizontal offsets for parallel edges
  const edgeGroups = new Map<string, Edge[]>();
  edges.forEach((edge) => {
    const groupKey = `${edge.source}->${edge.target}`;
    if (!edgeGroups.has(groupKey)) {
      edgeGroups.set(groupKey, []);
    }
    edgeGroups.get(groupKey)!.push(edge);
  });
  
  const spacing = 20; // Increased spacing for better visibility
  edgeGroups.forEach((group) => {
    group.forEach((edge, i) => {
      const offsetX = (i - (group.length - 1) / 2) * spacing;
      edge.data = { ...edge.data, offsetX };
    });
  });

  // 6. Apply colors for visibility with better contrast
  const colors = ['#dc2626', '#ea580c', '#16a34a', '#2563eb', '#9333ea', '#c026d3', '#0891b2', '#65a30d'];
  edges.forEach((edge, i) => {
    const color = colors[i % colors.length];
    edge.style = { 
      stroke: color, 
      strokeWidth: 2.5,
      strokeDasharray: edge.data?.type === 'causation' ? undefined : '5,5'
    };
    if(edge.markerEnd) {
        (edge.markerEnd as any).color = color;
    }
  });

  return { nodes: layoutedNodes, edges: edges };
}; 