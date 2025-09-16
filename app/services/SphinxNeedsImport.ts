import neo4j, { Session } from "neo4j-driver";
import { URI, USER, PASSWORD } from "./neo4j/config";

/**
 * Imports Sphinx Needs data from a JSON file into Neo4j database
 */
export const importSphinxNeedsToNeo4j = async (jsonString: string) => {
  try {
    const jsonData = JSON.parse(jsonString);
    const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
    const session = driver.session();

    try {
      // Extract current version from JSON data
      const currentVersion = jsonData.current_version;
      const projectName = jsonData.project;

      // Get needs from the current version
      const needsVersion = currentVersion || ""; // Use empty string if current_version is not set
      const needs = jsonData.versions[needsVersion]?.needs || {};

      // Clear existing Sphinx Needs data - we need to get all type labels first
      await session.run(
        'MATCH (n) WHERE n.source = "sphinx_needs" DETACH DELETE n',
      );

      // Create nodes for each need
      const nodeCreationResults = await createNeedNodes(needs, session);

      // Create relationships between nodes
      const relationshipResults = await createNeedRelationships(needs, session);

      // Create relationships between RequirementUsage nodes and Sphinx needs nodes
      const reqUsageRelationshipResults =
        await createRequirementUsageRelationships(session);

      return {
        success: true,
        message: "Sphinx Needs data imported successfully",
        project: projectName,
        nodeCount: nodeCreationResults.nodeCount,
        relationshipCount: relationshipResults.relationshipCount,
        reqUsageRelationshipCount:
          reqUsageRelationshipResults.relationshipCount,
        error: null,
      };
    } catch (error: any) {
      console.error("Failed to import Sphinx Needs data:", error);
      return {
        success: false,
        message: "Failed to import Sphinx Needs data",
        project: null,
        nodeCount: 0,
        relationshipCount: 0,
        reqUsageRelationshipCount: 0,
        error: error.message,
      };
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error("Failed to parse Sphinx Needs JSON:", error);
    return {
      success: false,
      message: "Failed to parse Sphinx Needs JSON",
      project: null,
      nodeCount: 0,
      relationshipCount: 0,
      reqUsageRelationshipCount: 0,
      error: error.message,
    };
  }
};

/**
 * Creates Neo4j nodes for each need in the JSON data
 */
async function createNeedNodes(needs: any, session: Session) {
  let nodeCounter = 0;
  // Track all used types for later queries
  const needTypes = new Set<string>();

  for (const [needId, needData] of Object.entries(needs)) {
    const properties: any = {
      id: needId,
      title: (needData as any).title || "",
      type: (needData as any).type || "",
      type_name: (needData as any).type_name || "",
      content: (needData as any).content || "",
      status: (needData as any).status || "",
      asil: (needData as any).asil || "",
      sreqtype: (needData as any).sreqtype || "",
      source: "sphinx_needs", // Mark the source of the data
    };

    // Add section info if available
    if ((needData as any).sections && (needData as any).sections.length > 0) {
      properties.section = (needData as any).sections[0];
    }

    // Add tags if available
    if ((needData as any).tags && (needData as any).tags.length > 0) {
      properties.tags = (needData as any).tags.join(",");
    }

    // Create a label based on the need type, without the SphinxNeed prefix
    const needType = capitalizeFirstLetter((needData as any).type || "Generic");
    needTypes.add(needType);

    const createNodeQuery = `
      CREATE (n:${needType} $properties)
      RETURN n
    `;

    await session.run(createNodeQuery, { properties });
    nodeCounter++;
  }

  // Get the total count of nodes created - we need to use all tracked types
  const typeLabels = Array.from(needTypes).join("|");
  const nodeQuery = typeLabels
    ? `MATCH (n) WHERE n.source = 'sphinx_needs' RETURN count(n) AS nodeCount`
    : `MATCH (n) WHERE n.source = 'sphinx_needs' RETURN count(n) AS nodeCount`;

  const nodeResult = await session.run(nodeQuery);
  const nodeCount = nodeResult.records[0].get("nodeCount").toNumber();
  console.log(`Created ${nodeCount} nodes from Sphinx Needs data`);

  return { nodeCount, needTypes: Array.from(needTypes) };
}

/**
 * Creates relationships between need nodes based on links and links_back
 */
async function createNeedRelationships(needs: any, session: Session) {
  let relationshipCounter = 0;

  // Process regular links
  for (const [sourceId, needData] of Object.entries(needs)) {
    const links = (needData as any).links || [];

    if (links.length > 0) {
      const createLinksQuery = `
        MATCH (source) 
        WHERE source.id = $sourceId AND source.source = 'sphinx_needs'
        UNWIND $targetIds AS targetId
        MATCH (target)
        WHERE target.id = targetId AND target.source = 'sphinx_needs'
        CREATE (source)-[r:LINKS]->(target)
        RETURN count(r) as relCount
      `;

      const result = await session.run(createLinksQuery, {
        sourceId,
        targetIds: links,
      });

      relationshipCounter += result.records[0].get("relCount").toNumber();
    }
  }

  // Process links_back
  for (const [sourceId, needData] of Object.entries(needs)) {
    const linksBack = (needData as any).links_back || [];

    if (linksBack.length > 0) {
      const createLinksBackQuery = `
        MATCH (source)
        WHERE source.id = $sourceId AND source.source = 'sphinx_needs'
        UNWIND $targetIds AS targetId
        MATCH (target)
        WHERE target.id = targetId AND target.source = 'sphinx_needs'
        CREATE (source)-[r:LINKS_BACK]->(target)
        RETURN count(r) as relCount
      `;

      const result = await session.run(createLinksBackQuery, {
        sourceId,
        targetIds: linksBack,
      });

      relationshipCounter += result.records[0].get("relCount").toNumber();
    }
  }

  // Get total relationship count
  const relResult = await session.run(`
    MATCH (source)-[r]->(target)
    WHERE source.source = 'sphinx_needs' AND target.source = 'sphinx_needs'
    RETURN count(r) AS relCount
  `);

  const relationshipCount = relResult.records[0].get("relCount").toNumber();
  console.log(
    `Created ${relationshipCount} relationships between Sphinx Needs nodes`,
  );

  return { relationshipCount };
}

/**
 * Creates relationships between RequirementUsage nodes and Sphinx needs nodes
 */
async function createRequirementUsageRelationships(session: Session) {
  const createRequirementUsageRelationshipsQuery = `
    MATCH (req:RequirementUsage)
    MATCH (req)-[:links{member:true}]->(refU:ReferenceUsage{name:'sphinx_needs_id'})
    MATCH (refU)-[:links{ownedMember:true}]->(litStringSNID:LiteralString)
    WITH req, litStringSNID.value AS snID
    MATCH (snReq:Req)
    WHERE snReq.id = snID
    MERGE (req)<-[:SNLINK]-(snReq)
    MERGE (req)-[:SNLINKBACK]->(snReq)
    RETURN count(req) as relCount
  `;

  const result = await session.run(createRequirementUsageRelationshipsQuery);
  const relationshipCount = result.records[0].get("relCount").toNumber();
  console.log(
    `Created ${relationshipCount} relationships between RequirementUsage and Sphinx Needs Req nodes`,
  );

  return { relationshipCount };
}

/**
 * Helper function to capitalize the first letter of a string
 */
function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Execute a Neo4j query against the Sphinx Needs data
 */
export const executeSphinxNeedsQuery = async (query: string, params = {}) => {
  try {
    const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
    const session = driver.session();

    try {
      const result = await session.run(query, params);

      const formattedResults = result.records.map((record) => {
        const resultObj: Record<string, any> = {};
        record.keys.forEach((key) => {
          if (typeof key === 'string') {
            const node = record.get(key);
            if (node && node.properties) {
              resultObj[key] = {
                id: node.identity.toString(),
                labels: node.labels,
                properties: node.properties,
              };
            } else {
              resultObj[key] = node;
            }
          }
        });
        return resultObj;
      });

      return {
        success: true,
        results: formattedResults,
        error: null,
      };
    } catch (error: any) {
      console.error("Failed to execute Sphinx Needs query:", error);
      return {
        success: false,
        results: [],
        error: error.message,
      };
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error("Failed to connect to Neo4j:", error);
    return {
      success: false,
      results: [],
      error: error.message,
    };
  }
};
