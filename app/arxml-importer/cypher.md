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