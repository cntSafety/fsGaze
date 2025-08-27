MATCH (n)
WHERE n.shortName = 'App1'
MATCH (m)
WHERE m.shortName = 'App2'
MATCH p = (n)-[*1..4]-(m)
RETURN n, m, p

MATCH ()-[r]->()
RETURN DISTINCT type(r) AS RelationshipType
ORDER BY RelationshipType

╒══════════════════════════════╕
│RelationshipType              │
╞══════════════════════════════╡
│"BEHAVIOR_REF"                │
├──────────────────────────────┤
│"COMPU_METHOD_REF"            │
├──────────────────────────────┤
│"CONTAINS"                    │
├──────────────────────────────┤
│"DATA_CONSTR_REF"             │
├──────────────────────────────┤
│"DATA_TYPE_MAPPING_REF"       │
├──────────────────────────────┤
│"DATA_TYPE_REF"               │
├──────────────────────────────┤
│"IMPLEMENTATION_DATA_TYPE_REF"│
├──────────────────────────────┤
│"INITIAL_MODE_REF"            │
├──────────────────────────────┤
│"LOCAL_VARIABLE_REF"          │
├──────────────────────────────┤
│"MODE_GROUP_REF"              │
├──────────────────────────────┤
│"OUTER_PORT_REF"              │
├──────────────────────────────┤
│"PORT_REF"                    │
├──────────────────────────────┤
│"PROVIDED_INTERFACE_TREF"     │
├──────────────────────────────┤
│"REFERENCES_DATA_ELEMENT"     │
├──────────────────────────────┤
│"REQUIRED_INTERFACE_TREF"     │
├──────────────────────────────┤
│"START_ON_EVENT_REF"          │
├──────────────────────────────┤
│"TYPE_TREF" 


MATCH (n:ArxmlElement {shortName: 'XYZ'})
CALL {
  // Outgoing relationships
  MATCH (n)-[r]->(related)
  RETURN r, related
  UNION
  // Incoming relationships
  MATCH (related)-[r]->(n)
  RETURN r, related
}
RETURN n.uuid AS MainNodeUUID,
       n.shortName AS MainNodeShortName,
       n.arxmlPath AS MainNodeArxmlPath,
       labels(n) AS MainNodeLabels,
       type(r) AS RelationshipType,
       CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END AS Direction,
       related.uuid AS RelatedNodeUUID,
       related.shortName AS RelatedNodeShortName,
       related.arxmlPath AS RelatedNodeArxmlPath,
       labels(related) AS RelatedNodeLabels
ORDER BY Direction, RelationshipType, RelatedNodeShortName

// find all relations for a certain element with a given name

MATCH (n:ArxmlElement {shortName: 'xyz'})
CALL {
  MATCH (n)-[r:CONTAINS]->(related)
  RETURN r, related
  UNION
  MATCH (related)-[r:CONTAINS]->(n)
  RETURN r, related
}
RETURN n.uuid AS MainNodeUUID,
       n.shortName AS MainNodeShortName,
       n.arxmlPath AS MainNodeArxmlPath,
       labels(n) AS MainNodeLabels,
       type(r) AS RelationshipType,
       r.destinationType AS RefDestinationType,
       CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END AS Direction,
       related.uuid AS RelatedNodeUUID,
       related.shortName AS RelatedNodeShortName,
       related.arxmlPath AS RelatedNodeArxmlPath,
       labels(related) AS RelatedNodeLabels
ORDER BY Direction, RelationshipType, RelatedNodeShortName

MATCH (n)
WHERE n.shortName = 'xxx'
MATCH (m)
WHERE m.shortName = 'yyy'
MATCH p = (n)-[*1..4]-(m)
RETURN n, m, p

//find the SW_COMPONENT_PROTOTYPE
match (swcProto:SW_COMPONENT_PROTOTYPE) where swcProto.uuid="4B1C3AE1-911D-4A6D-874B-A8DC647536C5"
//find all ASSEMBLY_SW_CONNECTORs
MATCH (swcProto)<-[:`CONTEXT-COMPONENT-REF`]-(swConnector:ASSEMBLY_SW_CONNECTOR)
//find all SW_COMPONENT_PROTOTYPE with a CONTEXT-COMPONENT-REF relation
MATCH (swConnector)-[:`CONTEXT-COMPONENT-REF`]->(ProviderSwcProto:SW_COMPONENT_PROTOTYPE)
RETURN swcProto, swConnector, ProviderSwcProto

//find the SW Component in Scope
MATCH (swcProtoInScope:SW_COMPONENT_PROTOTYPE) where swcProtoInScope.uuid="4B1C3AE1-911D-4A6D-874B-A8DC647536C5"
//find the Application SW component of the SW Component in Scope
MATCH (swcProtoInScope)-[:`TYPE-TREF`]->(swcAppInScope)
//find all ASSEMBLY_SW_CONNECTORs
MATCH (swcProtoInScope)<-[:`CONTEXT-COMPONENT-REF`]-(swConnector:ASSEMBLY_SW_CONNECTOR)
//find all SW_COMPONENT_PROTOTYPE with a CONTEXT-COMPONENT-REF relation (this are the partners)
MATCH (swConnector)-[:`CONTEXT-COMPONENT-REF`]->(PartnerSwcProto:SW_COMPONENT_PROTOTYPE)
//find the Application SW component or COMPOSITION_SW_COMPONENT of the Provider SWC Prototype 
MATCH (PartnerSwcProto)-[:`TYPE-TREF`]->(ProviderAppSWC)
//find the Target Provider Port
MATCH (swConnector)-[:`TARGET-P-PORT-REF`]->(TargetPPort)
//find the Target Receiver Port
MATCH (swConnector)-[:`TARGET-R-PORT-REF`]->(TargetRPort)
//find the provided interface of the Provider P Port (optional to get the interfaces for the connection)
MATCH (TargetPPort)-[:`PROVIDED-INTERFACE-TREF`]->(ProvideInterface)
//some R-Ports do not have a connection to Assembly SW connectors so find them
//they are R-PORTs which DO nat have a TARGET-R-PORT-REF to a ASSEMBLY_SW_CONNECTOR
MATCH (swcAppInScope)-[:CONTAINS]->(RPortsWithoutSWConnector:R_PORT_PROTOTYPE)
WHERE NOT EXISTS {
    MATCH (swConnector)-[:`TARGET-R-PORT-REF`]->(RPortsWithoutSWConnector)
}
//for RPorts without SW connector find the Required Interface
MATCH (RPortsWithoutSWConnector)-[:`REQUIRED-INTERFACE-TREF`]->(RPortsWithoutSWConnectorReqiredInterface)
//for the additional R port interface find the souce (this is for example a certain interface type)
//RPortsWithoutSWConnectorReqiredInterface short is RPortsWOswConReqInter
MATCH (RPortsWithoutSWConnectorReqiredInterface)<-[:CONTAINS]-(RPortsWOswConReqInterGroup)
//finaly get the partner
MATCH (RPortsWOswConReqInterGroup)<-[:CONTAINS]-(PartnerForRPortsWOswCon) 
//RETURN TargetRPort
RETURN  swcProtoInScope, swConnector, PartnerSwcProto, TargetPPort, TargetRPort, swcAppInScope, ProviderAppSWC, ProvideInterface, RPortsWithoutSWConnector, RPortsWithoutSWConnectorReqiredInterface, RPortsWOswConReqInterGroup, PartnerForRPortsWOswCon


//find the SW Component in Scope and all related partners and interfaces
MATCH (swcProtoInScope:SW_COMPONENT_PROTOTYPE) where swcProtoInScope.uuid="4B1C3AE1-911D-4A6D-874B-A8DC647536C5"
//find the Application SW component of the SW Component in Scope
MATCH (swcProtoInScope)-[:`TYPE-TREF`]->(swcAppInScope)
MATCH (swcAppInScope)-[:CONTAINS]->(swcAppInScopePPorts:P_PORT_PROTOTYPE)
MATCH (swcAppInScope)-[:CONTAINS]->(swcAppInScopeRPorts:R_PORT_PROTOTYPE)
OPTIONAL MATCH (swcAppInScopePPorts)<-[:`TARGET-P-PORT-REF`]-(swConnectorPPorts)
OPTIONAL MATCH (swcAppInScopeRPorts)<-[:`TARGET-R-PORT-REF`]-(swConnectorRPorts)
//find the partner ports
OPTIONAL MATCH (swConnectorPPorts)-[:`TARGET-R-PORT-REF`]->(partnerRPort)
OPTIONAL MATCH (swConnectorRPorts)-[:`TARGET-P-PORT-REF`]->(partnerPPort)
//find the partner SWC 
OPTIONAL MATCH (partnerRPort)<-[:CONTAINS]-(RPartner)
OPTIONAL MATCH (partnerPPort)<-[:CONTAINS]-(PPartner)
//find the swc protos of component in context and the partner
//OPTIONAL MATCH (partnerPPort)-[:`CONTEXT-COMPONENT-REF`]->(swcProtos)
RETURN swcProtoInScope, swcAppInScope, swcAppInScopePPorts, swcAppInScopeRPorts, swConnectorRPorts, swConnectorPPorts, partnerPPort, partnerRPort, RPartner, PPartner

MATCH path = (startNode)<-[*1..2]->(endNode)
WHERE startNode.uuid = '1234...' AND endNode.uuid = '456'
RETURN path

//search
MATCH (n)
UNWIND keys(n) as prop
WITH n, prop, n[prop] as value
WHERE value IS NOT NULL AND
  CASE
    WHEN value IS :: STRING THEN toLower(value) CONTAINS toLower("MysearchString")
    WHEN value IS :: INTEGER THEN toString(value) CONTAINS "MysearchString"
    WHEN value IS :: FLOAT THEN toString(value) CONTAINS "MysearchString"
    WHEN value IS :: BOOLEAN THEN toString(value) CONTAINS toLower("MysearchString")
    WHEN value IS :: LIST<STRING> THEN ANY(item IN value WHERE toLower(toString(item)) CONTAINS toLower("MysearchString"))
    WHEN value IS :: LIST<INTEGER> THEN ANY(item IN value WHERE toString(item) CONTAINS "MysearchString")
    WHEN value IS :: LIST<FLOAT> THEN ANY(item IN value WHERE toString(item) CONTAINS "MysearchString")
    ELSE false
  END
WITH n, collect(DISTINCT prop) as matchingProps
WHERE size(matchingProps) > 0
RETURN n.name, n.uuid, n.arxmlPath, labels(n) as nodeLabels, matchingProps
LIMIT 100


//transform dates
MATCH (n)
WITH n,
  CASE WHEN n.created IS NOT NULL
        AND toInteger(n.created) IS NOT NULL
        AND size(toString(n.created)) >= 13
        AND NOT toString(n.created) CONTAINS 'T'
       THEN toInteger(n.created) END AS createdEpoch,
  CASE WHEN n.lastModified IS NOT NULL
        AND toInteger(n.lastModified) IS NOT NULL
        AND size(toString(n.lastModified)) >= 13
        AND NOT toString(n.lastModified) CONTAINS 'T'
       THEN toInteger(n.lastModified) END AS lastModifiedEpoch
FOREACH (_ IN CASE WHEN createdEpoch IS NOT NULL THEN [1] ELSE [] END |
  SET n.created = datetime({ epochMillis: createdEpoch })
)
FOREACH (_ IN CASE WHEN lastModifiedEpoch IS NOT NULL THEN [1] ELSE [] END |
  SET n.lastModified = datetime({ epochMillis: lastModifiedEpoch })
)
RETURN count(*) AS nodesTouched;

getSafetyGraphForComponent 
MATCH (f:FAILUREMODE) -[:OCCURRENCE]->(cmp) WHERE cmp.uuid="ED71DD49-44AA-4D0C-B0AD-45699A225ED5" 
MATCH (c:CAUSATION)-[]-(f) 
MATCH (f)-[o:OCCURRENCE]->(src)
MATCH (cause:FAILUREMODE)<-[:FIRST]-(c)-[:THEN]->(effect:FAILUREMODE)
RETURN c.uuid AS cuuid, f.uuid AS failureUuid, f.name AS failureName, cause.uuid AS causeFailureUuid, cause.name AS causeFailureName, 
                   effect.uuid AS effectFailureUuid, effect.name AS effectFailureName