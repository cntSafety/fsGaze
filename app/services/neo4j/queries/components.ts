/**
 * @file This file contains all Neo4j queries related to software components.
 * It includes functions for fetching component details, their relationships,
 * and data for building dependency graphs and connection visualizations.
 * These queries are essential for understanding the architecture and
 * interactions of software components within the system.
 */
import { driver } from '../config';
import { ComponentVisualizationNode, ComponentVisualizationRelationship, ComponentVisualizationResult } from '../types';

/**
 * Retrieves all Application, Composition, and Service software component types from the database.
 * This is used to populate selection lists for safety analysis and other viewers.
 * @returns A promise that resolves to an object containing the success status and the list of components.
 */
export const getApplicationSwComponents = async () => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n:APPLICATION_SW_COMPONENT_TYPE) 
       RETURN n.name AS name, n.uuid AS uuid, n.arxmlPath AS arxmlPath, labels(n)[0] AS componentType
       UNION
       MATCH (n:COMPOSITION_SW_COMPONENT_TYPE) 
       RETURN n.name AS name, n.uuid AS uuid, n.arxmlPath AS arxmlPath, labels(n)[0] AS componentType
       UNION
       MATCH (n:SERVICE_SW_COMPONENT_TYPE) 
       RETURN n.name AS name, n.uuid AS uuid, n.arxmlPath AS arxmlPath, labels(n)[0] AS componentType
       ORDER BY name`
    );
    return {
      success: true,
      data: result.records.map(record => ({
        name: record.get('name'),
        uuid: record.get('uuid'),
        arxmlPath: record.get('arxmlPath'),
        componentType: record.get('componentType'),
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: "Error fetching APPLICATION_SW_COMPONENT_TYPE and SERVICE_SW_COMPONENT_TYPE nodes.",
      error: errorMessage,
      data: [],
    };
  } finally {
    await session.close();
  }
};

/**
 * Fetches all incoming and outgoing relationships for a specific node by its UUID.
 * This is useful for detailed inspection of a single element's connections.
 * @param uuid The UUID of the node to query.
 * @returns A promise that resolves to an object containing the success status and the list of relationships.
 */
export const getComponentRelations = async (uuid: string) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n)
       WHERE n.uuid = $uuid
       CALL {
         WITH n
         // Outgoing relationships
         MATCH (n)-[r]->(m)
         RETURN r, m
         UNION
         WITH n
         // Incoming relationships  
         MATCH (m)-[r]->(n)
         RETURN r, m
       }
       RETURN
         type(r) AS relationshipType,
         startNode(r).name AS sourceName,
         startNode(r).uuid AS sourceUuid,
         labels(startNode(r))[0] AS sourceType,
         endNode(r).name AS targetName,
         endNode(r).uuid AS targetUuid,
         labels(endNode(r))[0] AS targetType`,
      { uuid }
    );
    return {
      success: true,
      data: result.records.map(record => ({
        relationshipType: record.get('relationshipType'),
        sourceName: record.get('sourceName'),
        sourceUuid: record.get('sourceUuid'),
        sourceType: record.get('sourceType'),
        targetName: record.get('targetName'),
        targetUuid: record.get('targetUuid'),
        targetType: record.get('targetType'),
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Error fetching component relations for UUID ${uuid}.`,
      error: errorMessage,
      data: [],
    };
  } finally {
    await session.close();
  }
};

/**
 * Gathers all nodes and relationships connected to a specific software component prototype
 * to build a comprehensive dependency graph for visualization.
 * This complex query traverses various relationship types like context components,
 * connectors, ports, and interfaces to assemble a complete picture.
 * @param swcProtoUuid The UUID of the central SW_COMPONENT_PROTOTYPE to build the graph around.
 * @returns A promise that resolves to an object containing the success status and the graph data,
 *          or an error message if the component is not found or an issue occurs.
 */
export const getComponentDependencyGraph = async (swcProtoUuid: string): Promise<{
  success: boolean;
  data?: ComponentVisualizationResult;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // console.log(`🔍 Fetching component dependency graph for UUID: ${swcProtoUuid}`);
    
    const result = await session.run(
      `// Find the SW Component in Scope
       MATCH (swcProtoInScope:SW_COMPONENT_PROTOTYPE)
       WHERE swcProtoInScope.uuid = $swcProtoUuid

       // Find the Application SW component of the SW Component in Scope
      OPTIONAL MATCH (swcProtoInScope)-[rel_type_tref1:\`TYPE-TREF\`]->(swcAppInScope)

       // Find all ASSEMBLY_SW_CONNECTORS
      OPTIONAL MATCH (swcProtoInScope)<-[rel_context_comp_ref1:\`CONTEXT-COMPONENT-REF\`]-(swConnector:ASSEMBLY_SW_CONNECTOR)

       // Find all SW_COMPONENT_PROTOTYPE with a CONTEXT-COMPONENT-REF relation (these are the partners)
      OPTIONAL MATCH (swConnector)-[rel_context_comp_ref2:\`CONTEXT-COMPONENT-REF\`]->(PartnerSwcProto:SW_COMPONENT_PROTOTYPE)

       // Find the Application SW component or COMPOSITION_SW_COMPONENT of the Provider SWC Prototype
      OPTIONAL MATCH (PartnerSwcProto)-[rel_type_tref2:\`TYPE-TREF\`]->(ProviderAppSWC)

       // Find the Target Provider Port
      OPTIONAL MATCH (swConnector)-[rel_target_p_port:\`TARGET-P-PORT-REF\`]->(TargetPPort)

       // Find the Target Receiver Port
      OPTIONAL MATCH (swConnector)-[rel_target_r_port:\`TARGET-R-PORT-REF\`]->(TargetRPort)

       // Find the provided interface of the Provider P Port (optional to get the interfaces for the connection)
      OPTIONAL MATCH (TargetPPort)-[rel_provided_interface:\`PROVIDED-INTERFACE-TREF\`]->(ProvideInterface)
      
       // extract all the CONTAINS relations of the ProviderAppSWC and swcAppInScope
        OPTIONAL MATCH (TargetPPort)<-[rel_TargetPPortContainedBy:\`CONTAINS\`]-(containerNode)
        WHERE containerNode IN [ProviderAppSWC, swcAppInScope]
        OPTIONAL MATCH (TargetRPort)-[rel_TargetRPortContainedBy:\`CONTAINS\`]-(containerNodeB)
        WHERE containerNodeB IN [ProviderAppSWC, swcAppInScope]

       // Some R-Ports do not have a connection to Assembly SW connectors so find them
       // They are R-PORTs which DO NOT have a TARGET-R-PORT-REF to an ASSEMBLY_SW_CONNECTOR
       OPTIONAL MATCH (swcAppInScope)-[rel_contains_rport_no_swconn:\`CONTAINS\`]->(RPortsWithoutSWConnector:R_PORT_PROTOTYPE)
       WHERE NOT EXISTS {
           MATCH (swConnector)-[:\`TARGET-R-PORT-REF\`]->(RPortsWithoutSWConnector)
       }

       // For RPorts without SW connector find the Required Interface
      OPTIONAL MATCH (RPortsWithoutSWConnector)-[rel_required_interface:\`REQUIRED-INTERFACE-TREF\`]->(RPortsWithoutSWConnectorReqiredInterface)

       // For the additional R port interface find the source (this is for example a certain interface type)
       // RPortsWithoutSWConnectorReqiredInterface short is RPortsWOswConReqInter
      OPTIONAL MATCH (RPortsWithoutSWConnectorReqiredInterface)<-[rel_contains_interface_group:\`CONTAINS\`]-(RPortsWOswConReqInterGroup)

       // Finally get the partner for these RPorts
       OPTIONAL MATCH (RPortsWOswConReqInterGroup)<-[rel_contains_partner_for_rport:\`CONTAINS\`]-(PartnerForRPortsWOswCon)

      // Find all P-Ports of the swcAppInScope component (these are the ones that are not connected)
      OPTIONAL MATCH (swcAppInScope)-[rel_contains_pport:\`CONTAINS\`]->(PPortsInScope:P_PORT_PROTOTYPE)
      WHERE NOT EXISTS {
          MATCH (swConnector)-[:\`TARGET-P-PORT-REF\`]->(PPortsInScope)
      }

       RETURN DISTINCT
         swcProtoInScope,
         swcAppInScope,
         swConnector,
         PartnerSwcProto,
         ProviderAppSWC,
         TargetPPort,
         TargetRPort,
         ProvideInterface,
         RPortsWithoutSWConnector,
         RPortsWithoutSWConnectorReqiredInterface,
         RPortsWOswConReqInterGroup,
         PartnerForRPortsWOswCon,
         PPortsInScope,
         // Now the relationships
         rel_type_tref1,
         rel_context_comp_ref1,
         rel_context_comp_ref2,
         rel_type_tref2,
         rel_target_p_port,
         rel_target_r_port,
         rel_provided_interface,
         rel_contains_rport_no_swconn,
         rel_required_interface,
         rel_contains_interface_group,
         rel_contains_partner_for_rport,
         rel_TargetPPortContainedBy,
         rel_TargetRPortContainedBy,
         rel_contains_pport`,
      { swcProtoUuid }
    );

    if (result.records.length === 0) {
      // console.log(`❌ No component found for UUID: ${swcProtoUuid}`);
      return {
        success: false,
        message: `Defined query for SW_COMPONENT_PROTOTYPE with UUID: ${swcProtoUuid} did not return any results.`,
      };
    }

    // Process nodes and relationships from the query result
    const nodesMap = new Map<string, ComponentVisualizationNode>();
    const relationshipsMap = new Map<string, ComponentVisualizationRelationship>();
    const neo4jIdToUuidMap = new Map<string, string>(); // Map Neo4j internal ID to UUID
    let centerComponentName = '';
    let centerComponentId = '';
    // console.log(`🔍 RESULTS ----------:`, result);
    result.records.forEach(record => {
      // Extract nodes
      const nodeFields = [
        'swcProtoInScope',
        'swcAppInScope', 
        'swConnector',
        'PartnerSwcProto',
        'ProviderAppSWC',
        'TargetPPort',
        'TargetRPort',
        'ProvideInterface',
        'RPortsWithoutSWConnector',
        'RPortsWithoutSWConnectorReqiredInterface',
        'RPortsWOswConReqInterGroup',
        'PartnerForRPortsWOswCon',
        'PPortsInScope'
      ];

      nodeFields.forEach(field => {
        const node = record.get(field);
        if (node && node.properties) {
          const nodeUuid = node.properties.uuid;
          const neo4jInternalId = node.identity.low?.toString() || node.identity.toString();
          
          if (nodeUuid && !nodesMap.has(nodeUuid)) {
            const nodeLabels = node.labels || [];
            nodesMap.set(nodeUuid, {
              id: nodeUuid,
              name: node.properties.name || node.properties.shortName || 'Unnamed',
              type: nodeLabels[0] || 'Unknown',
              label: nodeLabels.join(':'),
              properties: node.properties
            });

            // Map Neo4j internal ID to UUID for relationship processing
            neo4jIdToUuidMap.set(neo4jInternalId, nodeUuid);

            // Set center component info
            if (field === 'swcAppInScope') {
              centerComponentName = node.properties.name || node.properties.shortName || 'Unnamed';
              centerComponentId = nodeUuid;
            }
          }
        }
      });

      // Extract relationships
      const relFields = [
        'rel_type_tref1',
        'rel_context_comp_ref1',
        'rel_context_comp_ref2',
        'rel_type_tref2',
        'rel_target_p_port',
        'rel_target_r_port',
        'rel_provided_interface',
        'rel_contains_rport_no_swconn',
        'rel_required_interface',
        'rel_contains_interface_group',
        'rel_contains_partner_for_rport',
        'rel_TargetPPortContainedBy',
        'rel_TargetRPortContainedBy',
        'rel_contains_pport'
      ];

      relFields.forEach(field => {
        const relationship = record.get(field);
        if (relationship && relationship.start && relationship.end) {
          const startNeo4jId = relationship.start.low?.toString() || relationship.start.toString();
          const endNeo4jId = relationship.end.low?.toString() || relationship.end.toString();
          const relationshipNeo4jId = relationship.identity?.low?.toString() || relationship.identity?.toString() || 'unknown';
          
          // Map Neo4j internal IDs to UUIDs
          const sourceUuid = neo4jIdToUuidMap.get(startNeo4jId);
          const targetUuid = neo4jIdToUuidMap.get(endNeo4jId);
          
          if (sourceUuid && targetUuid) {
            const relId = `${relationshipNeo4jId}_${relationship.type}_${sourceUuid}_${targetUuid}`;
            if (!relationshipsMap.has(relId)) {
              relationshipsMap.set(relId, {
                id: relId,
                source: sourceUuid,
                target: targetUuid,
                type: relationship.type,
                properties: relationship.properties || {}
              });
            }
          }
        }
      });
    });

    const nodes = Array.from(nodesMap.values());
    const relationships = Array.from(relationshipsMap.values());

    const resultData = {
      nodes,
      relationships,
      metadata: {
        totalNodes: nodes.length,
        totalRelationships: relationships.length,
        componentName: centerComponentName,
        centerComponentId: centerComponentId
      }
    };

    // console.log(`✅ Component dependency graph retrieved:`, {
    //   componentName: centerComponentName,
    //   totalNodes: nodes.length,
    //   resultData: resultData,
    //   totalRelationships: relationships.length,
    //   nodeTypes: [...new Set(nodes.map(n => n.type))],
    //   relationshipTypes: [...new Set(relationships.map(r => r.type))]
    // });

    return {
      success: true,
      data: resultData,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching component dependency graph for UUID ${swcProtoUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error fetching component dependency graph for UUID ${swcProtoUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get all SW Component Prototypes from the database
 */
export const getAllSwComponentPrototypes = async (): Promise<{
  success: boolean;
  data?: Array<{
    uuid: string;
    name: string;
    shortName: string;
    arxmlPath: string;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (swcPrototypes:SW_COMPONENT_PROTOTYPE)
       RETURN swcPrototypes.uuid AS uuid,
              swcPrototypes.name AS name,
              swcPrototypes.shortName AS shortName,
              swcPrototypes.arxmlPath AS arxmlPath
       ORDER BY swcPrototypes.name`
    );

    const swcPrototypes = result.records.map(record => ({
      uuid: record.get('uuid'),
      name: record.get('name'),
      shortName: record.get('shortName'),
      arxmlPath: record.get('arxmlPath'),
    }));

    return {
      success: true,
      data: swcPrototypes,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: "Error fetching SW_COMPONENT_PROTOTYPE nodes.",
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get scoped component connections and partners for a specific component
 */
export const getScopedComponentConnectionsAndPartners = async (swcProtoUuid: string): Promise<{
  success: boolean;
  data?: any; // Using any for complex nested structure
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // console.log(`🔍 Fetching scoped component connections and partners for UUID: ${swcProtoUuid}`);
    
    const result = await session.run(
      `// Query Name: getScopedComponentConnectionsAndPartners

       // (0) Find the SW Component in Scope
       MATCH (swcProtoInScope:SW_COMPONENT_PROTOTYPE)
       WHERE swcProtoInScope.uuid = $swcProtoUuid

       // (1) ScopeElement: Find the Application SW component and its ports
       OPTIONAL MATCH (swcProtoInScope)-[:\`TYPE-TREF\`]->(swcAppInScope)
       OPTIONAL MATCH (swcAppInScope)-[:CONTAINS]->(scopePort:R_PORT_PROTOTYPE|P_PORT_PROTOTYPE)
       WITH swcProtoInScope, swcAppInScope,
            COLLECT(DISTINCT CASE WHEN scopePort IS NOT NULL THEN {
                name: scopePort.name,
                uuid: scopePort.uuid,
                type: labels(scopePort)[0]
            } ELSE null END) AS scopePortsList

       WITH swcProtoInScope,
            CASE WHEN swcAppInScope IS NOT NULL THEN {
                name: swcAppInScope.name,
                uuid: swcAppInScope.uuid,
                type: labels(swcAppInScope)[0],
                ports: [p IN scopePortsList WHERE p IS NOT NULL]
            } ELSE null END AS scopeElementResult

       // (A) Collect all Connections related to swcProtoInScope
       WITH scopeElementResult, swcProtoInScope
       OPTIONAL MATCH (swcProtoInScope)<-[rel_context_comp_ref1:\`CONTEXT-COMPONENT-REF\`]-(swConnector:ASSEMBLY_SW_CONNECTOR)
       OPTIONAL MATCH (swConnector)-[rel_target_p_port:\`TARGET-P-PORT-REF\`]->(connTargetPPort)
       OPTIONAL MATCH (swConnector)-[rel_target_r_port:\`TARGET-R-PORT-REF\`]->(connTargetRPort)

       WITH scopeElementResult, swcProtoInScope,
            CASE WHEN swConnector IS NOT NULL THEN {
                name: swConnector.name,
                uuid: swConnector.uuid,
                TargetPPort: CASE WHEN connTargetPPort IS NOT NULL THEN {name: connTargetPPort.name, uuid: connTargetPPort.uuid, type: labels(connTargetPPort)[0]} ELSE null END,
                TargetRPort: CASE WHEN connTargetRPort IS NOT NULL THEN {name: connTargetRPort.name, uuid: connTargetRPort.uuid, type: labels(connTargetRPort)[0]} ELSE null END
            } ELSE null END AS connectionItem

       WITH scopeElementResult, swcProtoInScope,
            COLLECT(DISTINCT connectionItem) AS allConnectionItemsPossibleNulls
       WITH scopeElementResult, swcProtoInScope,
            [item IN allConnectionItemsPossibleNulls WHERE item IS NOT NULL] AS connectionsResultList

       // (B) Collect all Partners and their relevant ports
       WITH scopeElementResult, connectionsResultList, swcProtoInScope
       OPTIONAL MATCH (swcProtoInScope)<-[:\`CONTEXT-COMPONENT-REF\`]-(connectorToPartner:ASSEMBLY_SW_CONNECTOR)
       OPTIONAL MATCH (connectorToPartner)-[:\`CONTEXT-COMPONENT-REF\`]->(partnerProto:SW_COMPONENT_PROTOTYPE)
       OPTIONAL MATCH (partnerProto)-[:\`TYPE-TREF\`]->(resolvedPartnerType)

       // Determine the "ActualPartnerNode" for this path
       // Pass swcProtoInScope and scopeElementResult through for filtering ActualPartnerNode later
       WITH scopeElementResult, connectionsResultList, swcProtoInScope,
            connectorToPartner, partnerProto, resolvedPartnerType,
            CASE
                WHEN resolvedPartnerType IS NOT NULL THEN resolvedPartnerType
                WHEN partnerProto IS NOT NULL AND
                     (partnerProto:APPLICATION_SW_COMPONENT_TYPE OR partnerProto:COMPOSITION_SW_COMPONENT_TYPE OR partnerProto:SERVICE_SW_COMPONENT_TYPE)
                     THEN partnerProto
                ELSE null
            END AS ActualPartnerNode

       // Filter out if ActualPartnerNode is the scope itself (either proto or its app/comp type)
       // AND also ensure connectorToPartner is not null, as it's needed for port finding.
       WHERE ActualPartnerNode IS NOT NULL AND connectorToPartner IS NOT NULL
         AND ActualPartnerNode.uuid <> swcProtoInScope.uuid
         AND (
               scopeElementResult IS NULL OR
               scopeElementResult.uuid IS NULL OR
               ActualPartnerNode.uuid <> scopeElementResult.uuid
             )

       // For this ActualPartnerNode, find the ports it contains that were targeted by the 'connectorToPartner'
       OPTIONAL MATCH (connectorToPartner)-[:\`TARGET-P-PORT-REF\`]->(targetedPPortByConnector)
       OPTIONAL MATCH (connectorToPartner)-[:\`TARGET-R-PORT-REF\`]->(targetedRPortByConnector)

       // Group by ActualPartnerNode to collect its ports
       WITH scopeElementResult, connectionsResultList, ActualPartnerNode,
            COLLECT(DISTINCT CASE
               WHEN targetedPPortByConnector IS NOT NULL AND (targetedPPortByConnector)<-[:CONTAINS]-(ActualPartnerNode)
               THEN {name: targetedPPortByConnector.name, uuid: targetedPPortByConnector.uuid, type: labels(targetedPPortByConnector)[0]}
               ELSE null
            END) AS partnerPPorts,
            COLLECT(DISTINCT CASE
               WHEN targetedRPortByConnector IS NOT NULL AND (targetedRPortByConnector)<-[:CONTAINS]-(ActualPartnerNode)
               THEN {name: targetedRPortByConnector.name, uuid: targetedRPortByConnector.uuid, type: labels(targetedRPortByConnector)[0]}
               ELSE null
            END) AS partnerRPorts

       // Create the partner item map
       WITH scopeElementResult, connectionsResultList, ActualPartnerNode,
            {
                name: ActualPartnerNode.name,
                uuid: ActualPartnerNode.uuid,
                type: labels(ActualPartnerNode)[0],
                ports: [p IN partnerPPorts WHERE p IS NOT NULL] + [r IN partnerRPorts WHERE r IS NOT NULL]
            } AS partnerItem

       // Collect all unique partner items
       WITH scopeElementResult, connectionsResultList,
            COLLECT(DISTINCT partnerItem) AS partnersResultList

       // (C) Calculate counts for the summary
       WITH scopeElementResult,
            partnersResultList,
            connectionsResultList,
            size(partnersResultList) AS partnerCount,
            size(connectionsResultList) AS connectionCount

       // Final RETURN statement
       RETURN
           scopeElementResult AS ScopeElement,
           partnersResultList AS Partners,
           connectionsResultList AS Connections,
           partnerCount,
           connectionCount`,
      { swcProtoUuid }
    );

    if (result.records.length === 0) {
      // console.log(`❌ No component found for UUID: ${swcProtoUuid}`);
      return {
        success: false,
        message: `No SW_COMPONENT_PROTOTYPE found with UUID: ${swcProtoUuid}`,
      };
    }

    // Process the result - should be a single record
    const record = result.records[0];
    const scopeElement = record.get('ScopeElement');
    const partners = record.get('Partners') || [];
    const connections = record.get('Connections') || [];

    const resultData = {
      ScopeElement: scopeElement,
      Partners: partners,
      Connections: connections
    };

    // console.log(`✅ Scoped component connections and partners retrieved:`, {
    //   scopeElement: scopeElement?.name || 'None',
    //   partnersCount: partners.length,
    //   connectionsCount: connections.length,
    //   resultData: resultData
    // });

    return {
      success: true,
      data: resultData,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching scoped component connections and partners for UUID ${swcProtoUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error fetching scoped component connections and partners for UUID ${swcProtoUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get information for a specific application software component by UUID
 */
export const getInfoForAppSWComp = async (uuid: string) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n)
       WHERE n.uuid = $uuid AND (n:APPLICATION_SW_COMPONENT_TYPE OR n:COMPOSITION_SW_COMPONENT_TYPE OR n:SERVICE_SW_COMPONENT_TYPE)
       RETURN n.name AS name, n.uuid AS uuid, n.arxmlPath AS arxmlPath, labels(n)[0] AS componentType, n.description AS description`,
      { uuid }
    );
    
    if (result.records.length === 0) {
      return {
        success: false,
        message: "SW Component not found",
        data: null,
      };
    }

    const record = result.records[0];
    return {
      success: true,
      data: {
        name: record.get('name'),
        uuid: record.get('uuid'),
        arxmlPath: record.get('arxmlPath'),
        componentType: record.get('componentType'),
        description: record.get('description'),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: "Error fetching SW component information.",
      error: errorMessage,
      data: null,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get software component information by name
 */
export const getComponentByName = async (componentName: string) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (swc {name: $componentName})
       WHERE swc:APPLICATION_SW_COMPONENT_TYPE OR swc:COMPOSITION_SW_COMPONENT_TYPE OR swc:SERVICE_SW_COMPONENT_TYPE
       RETURN swc.uuid as swcUuid, swc.name as swcName, swc.arxmlPath as swcArxmlPath, labels(swc)[0] AS swcType`,
      { componentName }
    );
    
    if (result.records.length === 0) {
      return {
        success: false,
        message: `SW Component with name "${componentName}" not found`,
        data: null,
      };
    }

    const components = result.records.map(record => ({
      uuid: record.get('swcUuid'),
      name: record.get('swcName'),
      arxmlPath: record.get('swcArxmlPath'),
      componentType: record.get('swcType'),
    }));

    return {
      success: true,
      data: components.length === 1 ? components[0] : components,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Error fetching SW component with name "${componentName}".`,
      error: errorMessage,
      data: null,
    };
  } finally {
    await session.close();
  }
};
