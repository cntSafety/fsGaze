/**
 * Shared service for fetching action data from Neo4j database
 * This service can be used by both client-side components and server-side API routes
 */

import { executeNeo4jQuery } from "./KerMLToNeoService";

/**
 * Fetches all action data including incoming flows and requirements from Neo4j
 * 
 * @returns Promise containing processed action data
 */
export async function fetchActionsData() {
  try {
    // Step 1: Fetch all ActionUsage nodes
    const actionsQuery = `
      MATCH (a:ActionUsage)
      RETURN DISTINCT 
          a.declaredName as name, 
          a.elementId as elementId
    `;

    const actionsResponse = await executeNeo4jQuery(actionsQuery);

    if (!actionsResponse.success) {
      throw new Error(actionsResponse.error || "Failed to fetch action usage data");
    }

    // Initialize the combined data structure with basic action information
    const actionsData = await Promise.all(
      actionsResponse.results.map(async (result: any) => {
        const actionId = result.elementId;
        const actionName = result.name || "Unnamed Action";

        // Query for incoming flows - connections from other actions to this action
        const incomingFlowsQuery = `
        MATCH (action:ActionUsage{elementId:'${actionId}'})-[:links{target:true}]-(FCU:FlowConnectionUsage)
        MATCH (FCU)-[:links{itemFlowEnd:true}]->(ITEsrc:ItemFlowEnd{name: 'source'})
        MATCH (ITEsrc)-[:links{source:true}]-(refSub:ReferenceSubsetting)
        MATCH (refSub:ReferenceSubsetting)-[:links{target:true}]-(srcAction: ActionUsage)
        MATCH (ITEsrc)-[:links{member:true}]-(refUsa:ReferenceUsage)
        MATCH (refUsa:ReferenceUsage)-[:links{source:true}]-(redef:Redefinition)
        MATCH (redef)-[:links{target:true}]-(srcPin:ReferenceUsage)
        WHERE action <> srcAction
        RETURN DISTINCT 
            srcAction.elementId as sourceId,
            srcAction.declaredName as sourceName,
            srcPin.declaredName as sourcePin
        `;

        // Query for outgoing flows - connections from this action to other actions
        const outgoingFlowsQuery = `
        MATCH (action:ActionUsage{elementId:'${actionId}'})-[:links{source:true}]-(FCU:FlowConnectionUsage)
        MATCH (FCU)-[:links{itemFlowEnd:true}]->(ITEsrc:ItemFlowEnd{name: 'target'})
        MATCH (ITEsrc)-[:links{source:true}]-(refSub:ReferenceSubsetting)
        MATCH (refSub:ReferenceSubsetting)-[:links{target:true}]-(trgAction: ActionUsage)
        MATCH (ITEsrc)-[:links{member:true}]-(refUsa:ReferenceUsage)
        MATCH (refUsa:ReferenceUsage)-[:links{source:true}]-(redef:Redefinition)
        MATCH (redef)-[:links{target:true}]-(trgPin:ReferenceUsage)
        WHERE action <> trgAction
        RETURN DISTINCT
            trgAction.elementId as targetId,
            trgAction.declaredName as targetName,
            trgPin.declaredName as targetPin
        `;

        // Query for requirements - requirements that this action satisfies
        const requirementsQuery = `
        // Query for requirements related to this action 
        MATCH (action:ActionUsage{elementId:'${actionId}'})<-[:links{member:true}]-(fre:FeatureReferenceExpression)
        MATCH (fre)-[:links{featuringType:true}]->(SatReq:SatisfyRequirementUsage)
        MATCH (SatReq)<-[:links{source:true}]-(RefSub:ReferenceSubsetting)
        MATCH (RefSub)-[:links{target:true}]-(Req:RequirementUsage)
        OPTIONAL MATCH (Req)-[:links{documentation:true}]->(Doc:Documentation)

        // Check for Req nodes linked via SNLINKBACK --> Sphinx-Needs requirements
        OPTIONAL MATCH (Req)-[:SNLINKBACK]-(ReqNode:Req)

        WITH DISTINCT Req, Doc, ReqNode

        // Handle the two attribute cases separately
        WITH Req, Doc, ReqNode,
            CASE 
                WHEN ReqNode IS NOT NULL 
                THEN [{name: 'ASIL', value: ReqNode.asil}, {name: 'Type', value: ReqNode.sreqtype}]
                ELSE null
            END as reqAttributes

        // Original attribute collection path (only if reqAttributes is null)
        OPTIONAL MATCH (Req)-[:links{member:true}]-(RefUsage:ReferenceUsage)
        OPTIONAL MATCH (RefUsage)-[:links{type:true}]-(EnumDef:EnumerationDefinition)
        OPTIONAL MATCH (RefUsage)-[:links{member:true}]-(FRefExpr:FeatureReferenceExpression)
        OPTIONAL MATCH (FRefExpr)-[:links{member:true}]-(EnumUsage:EnumerationUsage)
        WHERE reqAttributes IS NULL

        WITH Req, Doc, ReqNode, reqAttributes,
            collect({name: EnumDef.name, value: EnumUsage.name}) as enumAttributes

        RETURN DISTINCT
            Req.elementId as id,
            Req.declaredName as name,
            CASE 
                WHEN ReqNode IS NOT NULL THEN ReqNode.content 
                ELSE Doc.body 
            END as description,
            CASE 
                WHEN ReqNode IS NOT NULL THEN ReqNode.id
                ELSE NULL
            END as sphinxneedsID,
            CASE 
                WHEN reqAttributes IS NOT NULL THEN reqAttributes
                ELSE enumAttributes
            END as attributes
        `;

        // Execute the queries in parallel
        const [incomingFlowsResponse, outgoingFlowsResponse, requirementsResponse] = await Promise.all([
          executeNeo4jQuery(incomingFlowsQuery),
          executeNeo4jQuery(outgoingFlowsQuery),
          executeNeo4jQuery(requirementsQuery)
        ]);

        // Process incoming flows
        const incomingFlows = incomingFlowsResponse.success
          ? incomingFlowsResponse.results.map((flow: any) => ({
              sourceId: flow.sourceId || "No Source ID",
              sourceName: flow.sourceName || "Unnamed Source",
              sourcePin: flow.sourcePin
            }))
          : [];

        // Process outgoing flows
        const outgoingFlows = outgoingFlowsResponse.success
          ? outgoingFlowsResponse.results.map((flow: any) => ({
              targetId: flow.targetId || "No Target ID",
              targetName: flow.targetName || "Unnamed Target",
              targetPin: flow.targetPin
            }))
          : [];

        // Process requirements
        const requirements = requirementsResponse.success
          ? requirementsResponse.results.map((req: any) => ({
              id: req.id || "No ID",
              name: req.name || "Unnamed Requirement",
              description: req.description || "No description available",
              sphinxneedsID: req.sphinxneedsID || null,
              attributes: req.attributes
                ? req.attributes
                    .filter((attr: any) => attr.name && attr.value)
                    .map((attr: any) => ({
                      name: attr.name,
                      value: attr.value,
                    }))
                : [],
            }))
          : [];

        // Return complete action data with its relationships
        return {
          elementId: actionId,
          name: actionName,
          incomingFlows,
          outgoingFlows,
          requirements
        };
      })
    );

    return {
      success: true,
      data: actionsData
    };
  } catch (error) {
    console.error('Error fetching actions data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: []
    };
  }
}
