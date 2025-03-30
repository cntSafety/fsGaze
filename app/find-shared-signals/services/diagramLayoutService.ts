import ELK from "elkjs/lib/elk.bundled.js";
import { ActionsFlowsReqData, FlowNode, FlowEdge } from "../types";

// Initialize ELK instance
const elk = new ELK();

export const transformToFlowFormat = async (
  data: ActionsFlowsReqData[],
  highlightedActions: string[] = [],
  sourceActions: string[] = [],
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> => {
  // Create temporary nodes and edges without positions
  const tempNodes: Array<{
    id: string;
    label: string;
    type: "action" | "requirement";
    width: number;
    height: number;
    borderColor?: string;
    borderWidth?: number;
  }> = [];

  const tempEdges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: string;
  }> = [];

  const nodeSet = new Set<string>();

  // Add action nodes
  data.forEach((action) => {
    if (!nodeSet.has(action.elementId)) {
      const nodeData = {
        id: action.elementId,
        label: action.name,
        type: "action",
        width: 180,
        height: 40,
      } as any;

      // Add border for CCI-affected actions (red)
      if (highlightedActions.includes(action.name)) {
        nodeData.borderColor = "#EF4444";
        nodeData.borderWidth = 2;
      }
      // Add border for common cause sources (orange)
      else if (sourceActions.includes(action.elementId)) {
        nodeData.borderColor = "#FF9800";
        nodeData.borderWidth = 2;
      }

      tempNodes.push(nodeData);
      nodeSet.add(action.elementId);
    }

    // Add requirement nodes
    action.requirements.forEach((req) => {
      if (!nodeSet.has(req.id)) {
        // Determine if this is a requirement affected by CCI
        const isAffectedReq = action.requirements.some(
          (r) => r.id === req.id && highlightedActions.includes(action.name),
        );

        tempNodes.push({
          id: req.id,
          label: req.name,
          type: "requirement",
          width: 160,
          height: 36,
          borderColor: isAffectedReq ? "#B794F4" : undefined,
        });
        nodeSet.add(req.id);
      }

      // Add edge from action to requirement
      tempEdges.push({
        id: `${action.elementId}-${req.id}`,
        source: action.elementId,
        target: req.id,
        type: "satisfies",
      });
    });

    // Add flow edges
    action.outgoingFlows.forEach((flow) => {
      tempEdges.push({
        id: `${action.elementId}-${flow.targetId}`,
        source: action.elementId,
        target: flow.targetId,
        label: flow.targetPin || undefined,
        type: "flow",
      });
    });
  });

  // Use ELK to layout the graph
  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    },
    children: tempNodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
    })),
    edges: tempEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layoutGraph = await elk.layout(elkGraph);

    // Convert to React Flow format with positions from ELK
    const nodes: FlowNode[] =
      layoutGraph.children?.map((child) => {
        const originalNode = tempNodes.find((n) => n.id === child.id);
        return {
          id: child.id!,
          type: "custom",
          position: { x: child.x! || 0, y: child.y! || 0 },
          data: {
            label: originalNode?.label || "Unknown",
            type: originalNode?.type || "action",
            borderColor: originalNode?.borderColor,
            borderWidth: originalNode?.borderWidth,
          },
        };
      }) || [];

    // Create edges for React Flow
    const edges: FlowEdge[] = tempEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.type === "flow",
      style: {
        stroke: edge.type === "satisfies" ? "#9F7AEA" : "#4299E1",
        strokeWidth: 2,
      },
    }));

    return { nodes, edges };
  } catch (error) {
    console.error("Error applying ELK layout:", error);
    return { nodes: [], edges: [] };
  }
};
