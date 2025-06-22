import dagre from 'dagre';
import { Node, Edge, Position } from 'reactflow';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 300; // Match the minWidth of the SwComponentNode
const nodeHeight = 150; // A baseline height, actual height is dynamic

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 70,  // Increase vertical separation between nodes
    ranksep: 150, // Increase horizontal separation between columns (ranks)
  });

  nodes.forEach((node) => {
    // Use the actual node dimensions from the DOM if possible, otherwise use defaults
    const nodeHeightActual = node.height || nodeHeight;
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeightActual });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;

    // We are shifting the Dagre node position (anchor=center) to the top-left
    // so it matches the React Flow node anchor point (top-left).
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - (node.height || nodeHeight) / 2,
    };

    return node;
  });

  return { nodes, edges };
}; 