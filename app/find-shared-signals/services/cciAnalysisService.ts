import { ActionsFlowsReqData, CCIResultItem } from "../types";

export const checkCommonCauseInitiators = (
  mergedData: ActionsFlowsReqData[],
) => {
  // Results will be collected here
  const results: CCIResultItem[] = [];

  // Will collect all action names impacted by CCI
  const affectedActionNames: string[] = [];

  // Will collect IDs of common cause sources (input actions)
  const sourceActionIds: string[] = [];

  // 1. Group actions by requirements
  const actionsByRequirement: Record<
    string,
    {
      actionId: string;
      actionName: string;
      incomingFlows: Array<{
        sourceId: string;
        sourceName: string;
        sourcePin: string | null;
      }>;
    }[]
  > = {};

  // Populate the actionsByRequirement data structure - only for Type=DFA requirements
  mergedData.forEach((action) => {
    action.requirements.forEach((req) => {
      // Check if the requirement has the Type=DFA attribute
      const isDFA = req.attributes.some(
        (attr) => attr.name === "Type" && attr.value === "DFA",
      );

      // Only include DFA requirements
      if (isDFA) {
        if (!actionsByRequirement[req.id]) {
          actionsByRequirement[req.id] = [];
        }
        actionsByRequirement[req.id].push({
          actionId: action.elementId,
          actionName: action.name,
          incomingFlows: action.incomingFlows.map((flow) => ({
            sourceId: flow.sourceId,
            sourceName: flow.sourceName,
            sourcePin: flow.sourcePin,
          })),
        });
      }
    });
  });

  // 2. For each group of actions sharing the same requirement
  Object.entries(actionsByRequirement).forEach(([reqId, actions]) => {
    // Skip if there's only one action for this requirement
    if (actions.length <= 1) return;

    // Find the requirement name and sphinxneedsID
    let reqName = "Unknown Requirement";
    let sphinxneedsID = null;

    for (const action of mergedData) {
      for (const req of action.requirements) {
        if (req.id === reqId) {
          reqName = req.name;
          sphinxneedsID = req.sphinxneedsID || null;
          break;
        }
      }
      if (reqName !== "Unknown Requirement") break;
    }

    // 3. Find common incoming flows
    const commonSources: Record<
      string,
      {
        count: number;
        name: string;
        pin: string | null;
        actions: string[];
        id: string; // Added id to track source IDs
      }
    > = {};

    // Collect all sources across actions
    actions.forEach((action) => {
      action.incomingFlows.forEach((flow) => {
        const sourceKey = `${flow.sourceId}:${flow.sourcePin || "nopin"}`;
        if (!commonSources[sourceKey]) {
          commonSources[sourceKey] = {
            count: 0,
            name: flow.sourceName,
            pin: flow.sourcePin,
            actions: [],
            id: flow.sourceId, // Store the source ID
          };
        }
        commonSources[sourceKey].count++;
        if (!commonSources[sourceKey].actions.includes(action.actionName)) {
          commonSources[sourceKey].actions.push(action.actionName);
        }
      });
    });

    // Filter sources that affect multiple actions
    const actualCommonSources = Object.values(commonSources).filter(
      (src) => src.actions.length > 1,
    );

    if (actualCommonSources.length > 0) {
      // Get the affected action names with IDs
      const actionsWithIds = actions.map((a) => ({
        name: a.actionName,
        id: a.actionId,
      }));

      // Add to affected actions list (still need the flat list of names for other components)
      affectedActionNames.push(...actionsWithIds.map((a) => a.name));

      // Add source IDs to the list
      actualCommonSources.forEach((src) => {
        if (src.id && !sourceActionIds.includes(src.id)) {
          sourceActionIds.push(src.id);
        }
      });

      // Add to results
      results.push({
        requirementName: reqName,
        requirementId: reqId,
        sphinxneedsID: sphinxneedsID, // Include the sphinxneedsID
        actions: actionsWithIds,
        commonSources: actualCommonSources.map((src) => ({
          name: src.name,
          pin: src.pin,
          id: src.id,
        })),
        timestamp: new Date().toISOString(), // Add current timestamp in ISO format
      });
    }
  });

  // Return all collected results
  return {
    cciResults: results,
    affectedActionNames: Array.from(new Set(affectedActionNames)),
    sourceActionIds,
  };
};
