import neo4j, { Session } from "neo4j-driver";
import { URI, USER, PASSWORD } from "./neo4j/config";

// Create a single driver instance to reuse across the application
const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

// Ensure the driver is closed when the application exits
process.on("SIGINT", async () => {
  await driver.close();
  process.exit(0);
});

export const uploadKerMLToNeo4j = async (kermlContent: string, fileName: string = 'unknown') => {
  try {
    // Attempt to parse the KerML content as JSON
    const jsonObjects = JSON.parse(kermlContent);
    const session = driver.session();

    try {
      // Create indexes to speed up MATCH operations
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:PartUsage) ON (n.elementId)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:OccurrenceUsage) ON (n.elementId)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MetadataUsage) ON (n.elementId)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MetadataDefinition) ON (n.elementId)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:PartUsage) ON (n.id)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:OccurrenceUsage) ON (n.id)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MetadataUsage) ON (n.id)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MetadataDefinition) ON (n.id)
      `);

      const result = await createNodesAndRelationships(jsonObjects, session);

      // Create ImportInfo node with timestamp and filename
      const timestamp = new Date().toISOString();
      await session.run(
        `
        CREATE (i:ImportInfo {timestampUploadDB: $timestamp, fileName: $fileName})
      `,
        { timestamp, fileName },
      );

      return {
        success: true,
        message: "KerML content uploaded to Neo4j successfully",
        nodeCount: result.nodeCount,
        relationshipCount: result.relationshipCount,
        importTimestamp: timestamp,
        fileName: fileName,
        error: null,
      };
    } catch (error: any) {
      console.error("Failed to create nodes and relationships:", error);
      
      // Check if this is a connection error
      if (isNeo4jConnectionError(error)) {
        return {
          success: false,
          message: "Connection to the database not possible. Please make sure the Neo4j database is active before uploading the SysML-v2 model.",
          nodeCount: 0,
          relationshipCount: 0,
          error: "Database connection error",
        };
      }
      
      return {
        success: false,
        message: "Failed to create nodes and relationships",
        nodeCount: 0,
        relationshipCount: 0,
        error: error.message,
      };
    } finally {
      await session.close();
    }
  } catch (error: any) {
    console.error("Failed to parse KerML content as JSON:", error);
    return {
      success: false,
      message: "Failed to parse KerML content as JSON",
      nodeCount: 0,
      relationshipCount: 0,
      error: error.message,
    };
  }
};

export const executeNeo4jQuery = async (query: string, params = {}) => {
  const session = driver.session();

  try {
    const result = await session.run(query, params);

    // Transform Neo4j results into a more usable format
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
    console.error("Failed to execute Neo4j query:", error);
    
    // Check if this is a connection error
    if (isNeo4jConnectionError(error)) {
      return {
        success: false,
        results: [],
        error: "Connection to the database not possible. Please make sure the Neo4j database is active and try uploading the SysML-v2 model again."
      };
    }
    
    return {
      success: false,
      results: [],
      error: error.message,
    };
  } finally {
    await session.close();
  }
};

// Helper function to determine if the error is a connection error
function isNeo4jConnectionError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || '';
  
  // Check for common Neo4j connection error patterns
  return (
    errorMessage.includes('Could not perform discovery') ||
    errorMessage.includes('No routing servers available') ||
    errorMessage.includes('Connection refused') ||
    errorMessage.includes('Failed to establish connection') ||
    errorMessage.includes('Connection terminated') ||
    errorMessage.includes('Cannot acquire a session') ||
    errorMessage.includes('Connection timed out')
  );
}

const countNodes = (obj: any): number => {
  let count = 0;
  if (typeof obj === "object" && obj !== null) {
    count++;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        count += countNodes(obj[key]);
      }
    }
  }
  return count;
};

async function createNodesAndRelationships(
  jsonObjects: any[],
  session: Session,
) {
  const nodeCountResult = await session.run(
    "MATCH (n) RETURN count(n) AS count",
  );
  const existingNodeCount = nodeCountResult.records[0].get("count").toNumber();
  if (existingNodeCount > 0) {
    console.log("Clearing the database...");
    await session.run("MATCH (n) DETACH DELETE n");
  } else {
    console.log("Database is already empty, skipping clear...");
  }

  const nodeMap = new Map<
    string,
    Array<{ id: string; props: Record<string, any> }>
  >();
  const relationshipMap = new Map<
    string,
    Array<{ sourceId: string; targetId: string; props?: Record<string, any> }>
  >();
  const excludedRelationshipTypes = new Set<string>([]);
  const skippedRelationships: Record<string, number> = {};

  let nodeCounter = 0;

  const allNodeIds = new Set<string>();
  console.log("Processing JSON objects to collect nodes and relationships...");
  for (const obj of jsonObjects) {
    const nodeId = obj.identity["@id"];
    const nodeType = obj.payload["@type"];
    const payload = obj.payload;

    allNodeIds.add(nodeId);

    const props: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (key === "@type") continue;
      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value) || (value as any)["@id"]) {
          continue;
        }
        props[key] = JSON.stringify(value);
      } else if (value !== null) {
        props[key] = value;
      }
    }

    if (!nodeMap.has(nodeType)) {
      nodeMap.set(nodeType, []);
    }
    nodeMap.get(nodeType)!.push({ id: nodeId, props });
    nodeCounter++;

    for (const [key, value] of Object.entries(payload)) {
      if (excludedRelationshipTypes.has(key)) {
        if (!skippedRelationships[key]) {
          skippedRelationships[key] = 0;
        }
        if (Array.isArray(value)) {
          skippedRelationships[key] += value.filter(
            (item) => item["@id"],
          ).length;
        } else if (value && typeof value === "object" && (value as any)["@id"]) {
          skippedRelationships[key] += 1;
        }
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item["@id"]) {
            const targetId = item["@id"];
            if (!relationshipMap.has("links")) {
              relationshipMap.set("links", []);
            }
            const props = Object.entries(item).reduce(
              (acc: any, [propKey, propValue]) => {
                if (propKey !== "@id" && propValue !== null) {
                  acc[propKey] = propValue;
                }
                return acc;
              },
              {},
            );
            props.relationType = key;
            relationshipMap
              .get("links")!
              .push({ sourceId: nodeId, targetId, props });
          }
        }
      } else if (value && typeof value === "object" && (value as any)["@id"]) {
        const targetId = (value as any)["@id"];
        if (!relationshipMap.has("links")) {
          relationshipMap.set("links", []);
        }
        const props = Object.entries(value).reduce(
          (acc: any, [propKey, propValue]) => {
            if (propKey !== "@id" && propValue !== null) {
              acc[propKey] = propValue;
            }
            return acc;
          },
          {},
        );
        props.relationType = key;
        relationshipMap
          .get("links")!
          .push({ sourceId: nodeId, targetId, props });
      }
    }

    if (nodeCounter % 10000 === 0) {
      for (const [nodeType, batch] of nodeMap.entries()) {
        await createNodeBatch(session, nodeType, batch);
        nodeMap.set(nodeType, []);
      }
      console.log(`Created ${nodeCounter} nodes so far...`);
    }
  }

  for (const [nodeType, batch] of nodeMap.entries()) {
    if (batch.length > 0) {
      await createNodeBatch(session, nodeType, batch);
    }
  }

  const nodeResult = await session.run(
    `MATCH (n) RETURN count(n) AS nodeCount`,
  );
  const nodeCount = nodeResult.records[0].get("nodeCount").toNumber();
  console.log(`---Number of nodes created: ${nodeCount}`);

  console.log("Precomputing node identities for relationship creation...");
  const nodeIdToNeoId = new Map<string, number>();
  const nodesResult = await session.run(
    "MATCH (n) RETURN n.id AS id, id(n) AS neoId",
  );
  for (const record of nodesResult.records) {
    const id = record.get("id");
    const neoId = record.get("neoId").toNumber();
    nodeIdToNeoId.set(id, neoId);
  }

  console.log("Checking for missing nodes in relationships...");
  const missingSourceIds = new Set<string>();
  const missingTargetIds = new Set<string>();
  for (const [relType, rels] of relationshipMap.entries()) {
    for (const rel of rels) {
      if (!nodeIdToNeoId.has(rel.sourceId)) {
        missingSourceIds.add(rel.sourceId);
      }
      if (!nodeIdToNeoId.has(rel.targetId)) {
        missingTargetIds.add(rel.targetId);
      }
    }
  }

  if (missingSourceIds.size > 0) {
    console.warn(
      "Missing source IDs:",
      Array.from(missingSourceIds).slice(0, 10),
    );
    console.warn(`Total missing source IDs: ${missingSourceIds.size}`);
  }
  if (missingTargetIds.size > 0) {
    console.warn(
      "Missing target IDs:",
      Array.from(missingTargetIds).slice(0, 10),
    );
    console.warn(`Total missing target IDs: ${missingTargetIds.size}`);
  }

  const missingSourceNotInJson = Array.from(missingSourceIds).filter(
    (id) => !allNodeIds.has(id),
  );
  const missingTargetNotInJson = Array.from(missingTargetIds).filter(
    (id) => !allNodeIds.has(id),
  );
  if (missingSourceNotInJson.length > 0) {
    console.warn(
      "Source IDs not present in JSON data:",
      missingSourceNotInJson.slice(0, 10),
    );
    console.warn(
      `Total source IDs not in JSON: ${missingSourceNotInJson.length}`,
    );
  }
  if (missingTargetNotInJson.length > 0) {
    console.warn(
      "Target IDs not present in JSON data:",
      missingTargetNotInJson.slice(0, 10),
    );
    console.warn(
      `Total target IDs not in JSON: ${missingTargetNotInJson.length}`,
    );
  }

  const relationshipMessages: string[] = [];
  Object.entries(skippedRelationships).forEach(([type, count]) => {
    const message = `Skipped ${count} relationships of excluded type '${type}'`;
    relationshipMessages.push(message);
    console.log(message);
  });

  let relationshipCounter = 0;
  const batchSize = 20000;

  console.log("Merging relationships between the same node pairs...");
  const mergedRelationships = new Map<string, any>();
  for (const [relType, rels] of relationshipMap.entries()) {
    for (const rel of rels) {
      const sourceNeoId = nodeIdToNeoId.get(rel.sourceId);
      const targetNeoId = nodeIdToNeoId.get(rel.targetId);

      if (sourceNeoId === undefined || targetNeoId === undefined) {
        continue;
      }

      const pairKey = `${sourceNeoId}-${targetNeoId}`;

      if (!mergedRelationships.has(pairKey)) {
        mergedRelationships.set(pairKey, {
          sourceNeoId,
          targetNeoId,
          types: [],
          props: {},
        });
      }

      const merged = mergedRelationships.get(pairKey);
      if (rel.props) {
        merged.types.push(rel.props.relationType);

        for (const [key, value] of Object.entries(rel.props)) {
        if (key !== "relationType") {
          if (merged.props[key]) {
            if (!Array.isArray(merged.props[key])) {
              merged.props[key] = [merged.props[key]];
            }
            merged.props[key].push(value);
          } else {
            merged.props[key] = value;
          }
        }
      }
    }
  }
  }

  console.log(
    `Merged relationships between ${mergedRelationships.size} unique node pairs`,
  );

  const mergedRelsArray = Array.from(mergedRelationships.values()).map(
    (rel) => {
      const props = { ...rel.props };
      rel.types.forEach((type: string) => {
        props[type] = true;
      });

      return {
        sourceNeoId: rel.sourceNeoId,
        targetNeoId: rel.targetNeoId,
        props: props,
      };
    },
  );

  for (let i = 0; i < mergedRelsArray.length; i += batchSize) {
    const batch = mergedRelsArray.slice(i, i + batchSize);
    const tx = session.beginTransaction();
    try {
      const createRelQuery = `
        UNWIND $rels AS rel
        MATCH (a) WHERE id(a) = rel.sourceNeoId
        MATCH (b) WHERE id(b) = rel.targetNeoId
        CREATE (a)-[r:links]->(b)
        SET r += rel.props
      `;
      await tx.run(createRelQuery, { rels: batch });
      await tx.commit();
      relationshipCounter += batch.length;
      console.log(
        `Created ${relationshipCounter} links relationships so far...`,
      );
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  const relResult = await session.run(
    `MATCH ()-[r]->() RETURN count(r) AS relCount`,
  );
  const relationshipCount = relResult.records[0].get("relCount").toNumber();
  console.log(`---Number of relationships created: ${relationshipCount}`);
  return { nodeCount, relationshipCount, relationshipMessages };
}

async function createNodeBatch(
  session: Session,
  nodeType: string,
  batch: Array<{ id: string; props: Record<string, any> }>,
) {
  const tx = session.beginTransaction();
  try {
    const query = `
      UNWIND $batch AS node
      CREATE (n:\`${nodeType}\` {id: node.id})
      SET n += node.props
    `;
    await tx.run(query, { batch });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}