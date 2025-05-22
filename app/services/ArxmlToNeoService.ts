/* two-pass system for handling references:

During the first pass (in recursiveExtractLogic), all nodes are created with their new semantic arxmlPath. References (like BEHAVIOR-REF) are collected into a pendingReferences list, storing the source node's UUID and the target path string.
After the first pass, extractArxmlNodesAndRelationships iterates through the pendingReferences. It uses a map of arxmlPath to UUID (created from all extracted nodes) to find the actual target node's UUID for each reference. If a target is found, the relationship is created.
This approach ensures that references are linked to the correct target nodes based on their semantic paths, as you requested. The SPECIFIC_NODE_LABELS.DATA_ELEMENT_REF_TARGET and the uniqueDataElementRefPaths set are no longer needed for this specific reference-linking mechanism and have been removed or commented out, as the system now resolves references directly to the target elements if they exist as nodes with a matching semantic arxmlPath.
 */
import neo4j from "neo4j-driver";
import { parseStringPromise } from "xml2js";

const URI = "neo4j://localhost";
const USER = "neo4j";
const PASSWORD = "testtest"; // Make sure to use environment variables for credentials in production

// Create a single driver instance to reuse across the application
const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

// Ensure the driver is closed when the application exits
process.on("SIGINT", async () => {
  console.log("Closing Neo4j driver...");
  await driver.close();
  process.exit(0);
});

// --- Interfaces (for clarity, TypeScript syntax used in comments) ---
// interface Neo4jNode {
//   uuid: string;         // ARXML UUID, used as the primary key in Neo4j
//   label: string;        // Neo4j Label derived from XML tag (e.g., P_PORT_PROTOTYPE)
//   props: {
//     shortName: string;  // Value from <SHORT-NAME>
//     arxmlPath: string;  // Conceptual path in the ARXML structure
//     // ... other relevant attributes and simple text children from the ARXML element
//   };
// }

// interface Neo4jRelationship {
//   from: string; // UUID of the source Neo4jNode
//   to: string;   // UUID of the target Neo4jNode
//   type: string; // Type of the relationship (e.g., CONTAINS)
//   props?: Record<string, any>; // Optional properties for the relationship
// }

// --- Constants for specific Node Labels and Relationship Types ---
const SPECIFIC_NODE_LABELS = {
  DATA_ELEMENT_REF_TARGET: "ArxmlDataElementRefTarget", // For target nodes of *-REF elements
  IMPORT_INFO: "ArxmlImportInfo", // For the import metadata node
  VIRTUAL_REF_NODE_LABEL: "VirtualArxmlRefTarget", // Label for virtually created nodes from unresolved refs
  // Add other specific, non-XML-tag-derived labels here if needed
};

const GENERIC_NODE_LABEL = "ArxmlElement"; // All created nodes will have this label

const RELATIONSHIP_TYPES = {
  CONTAINS: "CONTAINS", // Parent element contains child element
  REFERENCES_DATA_ELEMENT: "REFERENCES_DATA_ELEMENT", // Port/ComSpec refers to a DataElement
  // Add other relationship types as needed
};


// --- Helper Functions for Extraction ---

/**
 * Ensures the input is an array. If not, wraps it in an array.
 * If null or undefined, returns an empty array.
 */
const ensureArray = (item) => {
  if (item === undefined || item === null) return [];
  return Array.isArray(item) ? item : [item];
};

/**
 * Converts an XML tag name to a Neo4j-friendly label.
 * (e.g., "P-PORT-PROTOTYPE" becomes "P_PORT_PROTOTYPE")
 * @param {string} xmlTag The XML tag name.
 * @returns {string} A sanitized string suitable for a Neo4j label.
 */
function getLabelFromXmlTag(xmlTag) {
  if (!xmlTag || typeof xmlTag !== 'string') return "UnknownElementTag";
  return xmlTag.replace(/-/g, "_").replace(/:/g, "_").toUpperCase();
}

/**
 * Extracts the string value from a SHORT-NAME element,
 * handling cases where it might be a direct string or an object with text content.
 * @param {any} shortNameElement The SHORT-NAME element from xml2js.
 * @returns {string|null} The string value of SHORT-NAME or null.
 */
function extractShortNameValue(shortNameElement) {
    if (typeof shortNameElement === 'string') {
        return shortNameElement;
    } else if (shortNameElement && typeof shortNameElement === 'object') {
        // With explicitArray: false, text content is usually direct,
        // but if attributes exist on SHORT-NAME tag itself, it might be in '_' or 'CONTENT'
        return shortNameElement._ || shortNameElement.CONTENT || null;
    }
    return null;
}


/**
 * Recursively traverses the parsed ARXML structure to extract nodes and relationships.
 *
 * @param {object} xmlElement Current XML element (as a JS object from xml2js).
 * @param {string} xmlElementTag XML tag name of the current element.
 * @param {string|null} parentNeo4jNodeUuid UUID of the parent Neo4j node (if one was created).
 * @param {Array} nodes Array to accumulate node objects for Neo4j.
 * @param {Array} relationships Array to accumulate relationship objects for Neo4j.
 * @param {Array<string>} parentSemanticPathParts Array representing the semantic path to the current element.
 * @param {Array} pendingReferences Array to store references to be resolved later.
 */
function recursiveExtractLogic(
  xmlElement,
  xmlElementTag,
  parentNeo4jNodeUuid,
  nodes,
  relationships,
  parentSemanticPathParts, // Changed from currentArxmlPath
  pendingReferences // New parameter
) {
  // Base case: If the current element is not a valid object, stop recursion.
  if (typeof xmlElement !== 'object' || xmlElement === null) {
    return;
  }

  // Extract the SHORT-NAME value, which is a common identifier in ARXML.
  const shortNameValue = extractShortNameValue(xmlElement['SHORT-NAME']);
  // Extract the ARXML UUID.
  const arxmlUuid = xmlElement['UUID'] || (xmlElement.$ && xmlElement.$.UUID);

  let currentNeo4jNodeUuid = null;

  // Determine the semantic path for the current element and its children.
  // If the current element has a SHORT-NAME, it contributes to the semantic path.
  let currentElementSemanticPathParts = parentSemanticPathParts;
  if (shortNameValue) {
    currentElementSemanticPathParts = [...parentSemanticPathParts, shortNameValue];
  }

  // --- 1. Node Creation Condition: Must have SHORT-NAME and ARXML UUID ---
  // A distinct Neo4j node is created for an ARXML element only if it has both a SHORT-NAME and an ARXML UUID.
  // These serve as the primary identifiers for the node.
  if (shortNameValue && arxmlUuid) {
    currentNeo4jNodeUuid = arxmlUuid; // Use ARXML UUID as the Neo4j node's unique ID.
    const nodeLabel = getLabelFromXmlTag(xmlElementTag); // Convert XML tag to a Neo4j-compatible label.
    // Construct the semantic ARXML path for this element.
    const semanticArxmlPath = '/' + currentElementSemanticPathParts.join('/');

    if (!nodes.find(n => n.uuid === currentNeo4jNodeUuid)) {
      const props = {
        shortName: shortNameValue,
        name: shortNameValue, // Assign shortNameValue to name property
        arxmlPath: semanticArxmlPath, // Use the new semantic path
        originalXmlTag: xmlElementTag, // Store the original XML tag for reference.
      };

      // Add attributes from xmlElement.$ (if mergeAttrs in xml2js put them there due to collision).
      // These are attributes of the XML element itself.
      if (xmlElement.$) {
        for (const attrKey in xmlElement.$) {
          if (xmlElement.$.hasOwnProperty(attrKey) && attrKey.toUpperCase() !== 'UUID' && attrKey !== 'SHORT-NAME') {
            props[attrKey.replace(/-/g, "_")] = xmlElement.$[attrKey];
          }
        }
      }
      // Add other simple child text values or non-colliding attributes as properties.
      // These are typically child elements that contain simple text content.
      for (const key in xmlElement) {
        if (xmlElement.hasOwnProperty(key)) {
          const value = xmlElement[key];
          if (key !== 'SHORT-NAME' && key !== 'UUID' && key !== '$' && key !== '_' &&
              !Array.isArray(value) && typeof value !== 'object' && value !== null) {
            props[key.replace(/-/g, "_")] = String(value);
          }
        }
      }

      // Add the newly created node object to the nodes array.
      // It includes the UUID, a specific label derived from the XML tag, and its properties.
      nodes.push({
        uuid: currentNeo4jNodeUuid,
        label: nodeLabel,
        props: props,
      });
    }

    // --- 2. Relationship Creation: If parent node exists, link to current node ---
    // If a parent Neo4j node was created (i.e., parentNeo4jNodeUuid is not null),
    // create a 'CONTAINS' relationship from the parent to the current node.
    if (parentNeo4jNodeUuid) {
      // Check if this specific CONTAINS relationship already exists to avoid duplicates.
      const relExists = relationships.some(
          r => r.from === parentNeo4jNodeUuid && r.to === currentNeo4jNodeUuid && r.type === RELATIONSHIP_TYPES.CONTAINS
      );
      if (!relExists) {
          relationships.push({
            type: RELATIONSHIP_TYPES.CONTAINS, // Predefined relationship type.
            from: parentNeo4jNodeUuid,       // UUID of the source/parent node.
            to: currentNeo4jNodeUuid,         // UUID of the target/current node.
          });
      }
    }
  } else if (shortNameValue && !arxmlUuid) {
    // Minimal log for missing UUID, if necessary, or could be removed if too verbose
    // console.warn(`Element <${xmlElementTag}> '${shortNameValue}' missing UUID at /${parentSemanticPathParts.join('/')}`);
  }

  // --- 3. Recursion for Children & Special Handling (e.g., DATA-ELEMENT-REF) ---
  // Iterate over all properties (child elements and attributes) of the current XML element.
  for (const key in xmlElement) {
    // Process only own properties and skip special keys already handled or internal to xml2js.
    if (xmlElement.hasOwnProperty(key) && key !== '$' && key !== '_' && key !== 'SHORT-NAME' && key !== 'UUID') {
      const childValue = xmlElement[key]; // The value of the child element/property.

      // --- Special Handling for *-REF and *-TREF elements ---
      // These elements represent references to other elements, often defined elsewhere in the ARXML.
      // *-IREF elements are containers for other REF elements and should be recursed into normally.
      if (key.endsWith("-REF") || key.endsWith("-TREF")) { // MODIFIED: Removed key.endsWith("-IREF")
        const refs = ensureArray(childValue); // Ensure 'refs' is an array, even if there's only one ref.
        // The source of the reference relationship should be the most specific Neo4j node created so far.
        // This is either the current element's node (if created) or its parent's node.
        const effectiveSourceNodeUuid = currentNeo4jNodeUuid || parentNeo4jNodeUuid;

        if (effectiveSourceNodeUuid) { // Proceed only if a source node for the relationship exists.
            for (const refItem of refs) { // Iterate through each reference item.
                let refPath = null; // The path string within the REF tag (e.g., /Package/Path/To/TargetElement)
                let refDest = null; // The \'DEST\' attribute of the REF tag (e.g., "DATA-ELEMENT-PROTOTYPE")

                // Extract refPath and refDest based on how xml2js parsed the REF element.
                if (typeof refItem === 'string') {
                    // Case: <DATA-ELEMENT-REF>/path/to/it</DATA-ELEMENT-REF>
                    refPath = refItem;
                } else if (refItem && typeof refItem === 'object') {
                    // Case: <DATA-ELEMENT-REF DEST="TYPE">/path/to/it</DATA-ELEMENT-REF>
                    // Text content might be in \'_\' or \'CONTENT\' (xml2js specific, depends on charkey).
                    refPath = refItem._ || refItem.CONTENT;
                    // DEST attribute might be in \'$\' (if mergeAttrs caused collision) or directly.
                    refDest = (refItem.$ && refItem.$.DEST) || refItem.DEST;
                }

                if (refPath) { // If a reference path was successfully extracted.
                    const relationshipType = key; // MODIFIED: Use the original XML tag name directly
                    pendingReferences.push({
                        from: effectiveSourceNodeUuid,
                        toPath: refPath, // Store the target path for later resolution
                        type: relationshipType, // This will now be the original tag, e.g., "PROVIDED-INTERFACE-TREF"
                        props: { ...(refDest && { destinationType: refDest }) },
                    });
                } else {
                    // Optional: Log malformed ref if essential for debugging, otherwise keep silent
                    // const currentElementPathForLog = '/' + currentElementSemanticPathParts.join('/');
                    // console.warn(`Malformed reference <${key}> in '${currentElementPathForLog}':`, JSON.stringify(refItem).substring(0,100));
                }
            }
        } else {
            // Optional: Log missing source UUID for ref if essential
            // const currentElementPathForLog = '/' + currentElementSemanticPathParts.join('/');
            // console.warn(`Cannot create ref for <${key}> in '${currentElementPathForLog}', missing source UUID.`);
        }
      } else { // --- Standard Recursion for other child elements ---
        // For all other child elements that are not special REF types.
        const itemsToRecurse = ensureArray(childValue); // Ensure we iterate over an array.
        itemsToRecurse.forEach(item => {
          // Recurse only if the item is a non-null object (representing a child XML element).
          if (typeof item === 'object' && item !== null) {
            recursiveExtractLogic(
              item, // The child XML element object.
              key,  // The XML tag name of 'item' is the 'key' from the parent object.
              currentNeo4jNodeUuid || parentNeo4jNodeUuid, // Pass down the UUID of the current or parent node.
              nodes,               // Accumulator for nodes.
              relationships,       // Accumulator for relationships.
              currentElementSemanticPathParts, // Pass down the updated semantic path parts
              pendingReferences // Pass down pending references array
            );
          }
        });
      }
    }
  }
}

/**
 * Main function to initiate the extraction of nodes and relationships.
 * @param parsed Parsed ARXML object from xml2js
 * @returns {{ nodes: Array<Neo4jNode>, relationships: Array<Neo4jRelationship> }}
 */
export function extractArxmlNodesAndRelationships(parsed) {
  const nodes = []; // Array to store all Neo4j node objects.
  const relationships = []; // Array to store all Neo4j relationship objects.
  const pendingReferences = []; // New array to store references to be resolved later.
  const unresolvedReferences = []; // New array to store references that could not be resolved.

  if (!parsed || !parsed.AUTOSAR) {
    // console.error("AUTOSAR root element not found in parsed XML. Cannot proceed."); // Removed
    return { nodes, relationships, unresolvedReferences };
  }

  // The primary entry point for ARXML structures is typically within <AUTOSAR><AR-PACKAGES><AR-PACKAGE>...
  // Access the AR-PACKAGES container element.
  const arPackagesContainer = parsed.AUTOSAR["AR-PACKAGES"];
  if (arPackagesContainer) {
      // AR-PACKAGE elements might be one or many, so ensure it's an array.
      const arPackages = ensureArray(arPackagesContainer["AR-PACKAGE"]);
      // Iterate over each AR-PACKAGE and start the recursive extraction process.
      for (const pkg of arPackages) {
        recursiveExtractLogic(
            pkg,                                // The AR-PACKAGE XML element object.
            "AR-PACKAGE",                       // The XML tag name.
            null,                               // No parent Neo4j node for top-level packages.
            nodes,                              // Accumulator for nodes.
            relationships,                      // Accumulator for relationships.
            [], // Initial parentSemanticPathParts is an empty array
            pendingReferences // Pass the pendingReferences array
        );
      }
  } else {
      // console.warn("No AR-PACKAGES found directly under AUTOSAR."); // Removed
  }

  const arxmlPathToUuidMap = new Map();
  for (const node of nodes) {
    if (node.props && typeof node.props.arxmlPath === 'string') {
      arxmlPathToUuidMap.set(node.props.arxmlPath, node.uuid);
    }
  }

  let resolvedReferencesCount = 0;
  const encounteredReferenceTypes = new Set();

  for (const pendingRef of pendingReferences) {
    encounteredReferenceTypes.add(pendingRef.type);
    const targetUuid = arxmlPathToUuidMap.get(pendingRef.toPath);
    if (targetUuid) {
      const relExists = relationships.some(
        r => r.from === pendingRef.from && r.to === targetUuid && r.type === pendingRef.type
      );
      if (!relExists) {
        relationships.push({
          type: pendingRef.type,
          from: pendingRef.from,
          to: targetUuid,
          props: pendingRef.props,
        });
        resolvedReferencesCount++;
      }
    } else {
      unresolvedReferences.push({
        sourceUuid: pendingRef.from,
        targetPath: pendingRef.toPath,
        relationshipType: pendingRef.type,
        destinationAttribute: (pendingRef.props && pendingRef.props.destinationType) || 'N/A',
        reason: `Target path not found in arxmlPathToUuidMap.`
      });
    }
  }

  // console.log("\\n--- ARXML Import Summary (Extraction Phase) ---"); // Removed
  // console.log(`Total nodes extracted: ${nodes.length}`); // Removed
  // console.log(`Total 'CONTAINS' relationships created: ${relationships.length - resolvedReferencesCount}`); // Removed
  // console.log(`Total pending references processed: ${pendingReferences.length}`); // Removed
  // console.log(`Successfully resolved and created reference relationships during extraction: ${resolvedReferencesCount}`); // Removed
  
  // console.log("\\nEncountered Reference Types during extraction:"); // Removed
  // if (encounteredReferenceTypes.size > 0) { // Removed
  //   encounteredReferenceTypes.forEach(type => console.log(`- ${type}`)); // Removed
  // } else { // Removed
  //   console.log("No reference types were processed during extraction."); // Removed
  // } // Removed
  // console.log("--------------------------------------------------\\\\n"); // Removed

  // Group unresolved references by relationshipType for this specific log output
  const groupedUnresolvedReferencesForLog = unresolvedReferences.reduce((acc, ref) => {
    const type = ref.relationshipType || 'UnknownType';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(ref);
    return acc;
  }, {});
  // console.log("unresolvedReferences (grouped by type) !!!", groupedUnresolvedReferencesForLog); // Removed

  return { nodes, relationships, unresolvedReferences }; // also return unresolved for potential further use
}


function mergeParsedArxmlObjects(parsedObjects) {
  if (!parsedObjects || parsedObjects.length === 0) return null;
  if (parsedObjects.length === 1) return parsedObjects[0];

  const mergedAutosar = {
    AUTOSAR: {
      "$": parsedObjects[0]?.AUTOSAR?.["$"] || {}, // Take attributes from the first file, or empty
      "AR-PACKAGES": {
        "AR-PACKAGE": []
      }
    }
  };

  for (const parsed of parsedObjects) {
    if (parsed && parsed.AUTOSAR && parsed.AUTOSAR["AR-PACKAGES"]) {
      const arPackages = ensureArray(parsed.AUTOSAR["AR-PACKAGES"]["AR-PACKAGE"]);
      mergedAutosar.AUTOSAR["AR-PACKAGES"]["AR-PACKAGE"].push(...arPackages);
    }
  }
  // If after merging, there are no packages, reflect that for downstream processing
  if (mergedAutosar.AUTOSAR["AR-PACKAGES"]["AR-PACKAGE"].length === 0) {
    // This ensures that if all files were empty or malformed regarding AR-PACKAGES,
    // the extractArxmlNodesAndRelationships function will see an empty AR-PACKAGES container.
    // Depending on desired behavior, one might also choose to return null or throw an error.
    delete mergedAutosar.AUTOSAR["AR-PACKAGES"]; 
    // Or, to be more explicit for the existing logic in extractArxmlNodesAndRelationships:
    // mergedAutosar.AUTOSAR["AR-PACKAGES"] = null; 
  }


  return mergedAutosar;
}

/**
 * Upload ARXML content from multiple files to Neo4j
 * @param {Array<{name: string, content: string}>} arxmlFileContents Array of objects, each with file name and XML string content
 */
export const uploadArxmlToNeo4j = async (arxmlFileContents) => {
  if (!arxmlFileContents || arxmlFileContents.length === 0) {
    // console.error("No ARXML file contents provided for upload."); // Removed
    return {
      success: false,
      message: "No ARXML file contents provided.",
      nodeCount: 0,
      relationshipCount: 0,
      error: "No content",
    };
  }

  const parsedObjects = [];
  const fileNames = [];
  let extractionResult = { nodes: [], relationships: [], unresolvedReferences: [] }; // Initialize with empty extraction result

  try {
    for (const fileContent of arxmlFileContents) {
      fileNames.push(fileContent.name);
      const parsed = await parseStringPromise(fileContent.content, {
        explicitArray: false,
        mergeAttrs: true,
        charkey: 'CONTENT',
        emptyTag: null,
      });
      parsedObjects.push(parsed);
    }

    const mergedParsedData = mergeParsedArxmlObjects(parsedObjects);
    if (!mergedParsedData) {
      // console.error("Failed to merge parsed ARXML data or no valid data found."); // Removed
      return {
        success: false,
        message: "Failed to merge parsed ARXML data or no valid data found.",
        nodeCount: 0,
        relationshipCount: 0,
        error: "Merge failure or empty data",
      };
    }

    // console.log("Extracting nodes and relationships from merged ARXML data..."); // Removed
    extractionResult = extractArxmlNodesAndRelationships(mergedParsedData);
    const { nodes, relationships, unresolvedReferences } = extractionResult;
    // console.log(`Extracted ${nodes.length} nodes and ${relationships.length} relationships from ${fileNames.join(', ')}.`); // Removed

    if (nodes.length === 0 && relationships.length === 0 && unresolvedReferences.length === 0) {
      // console.warn("No significant nodes, relationships, or unresolved references extracted. Check ARXML structure or extraction logic."); // Removed
      // Return early if nothing to import
      return {
        success: true, // Technically successful as there was nothing to do.
        message: `No data to import from ${fileNames.join(', ')}.`,
        nodeCount: 0,
        relationshipCount: 0,
        unresolvedReferences: [],
      };
    }

    const session = driver.session();
    try {
      // Clear existing data BEFORE starting the transaction or creating indexes
      await session.run('MATCH (n) DETACH DELETE n');

      // Index creation can remain outside the main transaction as it's idempotent and typically fast.
      await session.run(`CREATE INDEX arxml_element_uuid IF NOT EXISTS FOR (n:${GENERIC_NODE_LABEL}) ON (n.uuid)`);
      await session.run(`CREATE INDEX arxml_element_shortname IF NOT EXISTS FOR (n:${GENERIC_NODE_LABEL}) ON (n.shortName)`);
      await session.run(`CREATE INDEX arxml_virtual_ref_uuid IF NOT EXISTS FOR (n:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL}) ON (n.uuid)`);

      const importTimestamp = new Date().toISOString();

      // Use a single write transaction for all data modifications
      await session.writeTransaction(async txc => {
        // Batch Node Creation
        // console.log("Creating/updating nodes in Neo4j..."); // Removed
        const nodesByLabel = nodes.reduce((acc, node) => {
          acc[node.label] = acc[node.label] || [];
          acc[node.label].push({ uuid: node.uuid, props: node.props });
          return acc;
        }, {});

        for (const specificLabel in nodesByLabel) {
          const batch = nodesByLabel[specificLabel];
          if (batch.length > 0) {
            // console.log(`Processing batch of ${batch.length} nodes for label ${specificLabel}...`); // Removed
            await txc.run(
              `UNWIND $batchData AS item
               MERGE (n:${GENERIC_NODE_LABEL}:${specificLabel} {uuid: item.uuid})
               ON CREATE SET n = item.props, n.uuid = item.uuid
               ON MATCH SET n += item.props`,
              { batchData: batch }
            );
          }
        }
        // console.log(`Nodes processing complete. Total nodes: ${nodes.length}`); // Removed

        // Batch Relationship Creation
        // console.log("Creating/updating relationships in Neo4j..."); // Removed
        const relsByType = relationships.reduce((acc, rel) => {
          const originalRelType = rel.type; // MODIFIED: Use rel.type directly
          acc[originalRelType] = acc[originalRelType] || [];
          acc[originalRelType].push({
            from: rel.from,
            to: rel.to,
            props: rel.props || {}
          });
          return acc;
        }, {});

        for (const originalRelType in relsByType) { // MODIFIED: Iterate using originalRelType
          const batch = relsByType[originalRelType];
          if (batch.length > 0) {
            // console.log(`Processing batch of ${batch.length} \'${originalRelType}\' relationships...`); // Removed
            await txc.run(
              `UNWIND $batchData AS item
               MATCH (a:${GENERIC_NODE_LABEL} {uuid: item.from})
               MATCH (b:${GENERIC_NODE_LABEL} {uuid: item.to})
               MERGE (a)-[r:\`${originalRelType}\`]->(b) // MODIFIED: Use originalRelType here
               ON CREATE SET r = item.props
               ON MATCH SET r += item.props`, // item.props is already defaulted to {}
              { batchData: batch }
            );
          }
        }
        // console.log(`Relationships processing complete. Total relationships: ${relationships.length}`); // Removed

        // Batch Virtual Node and Relationship Creation
        if (unresolvedReferences && unresolvedReferences.length > 0) {
          // console.log(`\\\\nProcessing ${unresolvedReferences.length} unresolved references to create virtual nodes/links...`); // Removed

          const virtualNodeDataMap = new Map(); // Stores { uuidValue, shortNameValue, nameValue, arxmlPathValue }
          const virtualContainsRels = []; // Stores { fromUuid, toUuid }
          const finalVirtualRelsByType = {}; // Stores { fromUuid, toUuid, props } grouped by type

          for (const unresolvedRef of unresolvedReferences) {
            const { sourceUuid, targetPath, relationshipType, props: originalRelProps } = unresolvedRef;
            if (!targetPath || !targetPath.startsWith('/')) {
              // console.warn(`Skipping unresolved reference from ${sourceUuid} with invalid targetPath: ${targetPath}`); // Removed
              continue;
            }

            const pathSegments = targetPath.substring(1).split('/');
            let previousSegmentVirtualNodeUuid = null;
            let currentCumulativePath = "";

            for (const segmentName of pathSegments) {
              if (!segmentName) continue;
              currentCumulativePath += "/" + segmentName;
              const virtualNodeUuid = currentCumulativePath;

              if (!virtualNodeDataMap.has(virtualNodeUuid)) {
                virtualNodeDataMap.set(virtualNodeUuid, {
                  uuidValue: virtualNodeUuid,
                  shortNameValue: segmentName,
                  nameValue: segmentName,
                  arxmlPathValue: virtualNodeUuid,
                });
              }
              if (previousSegmentVirtualNodeUuid) {
                virtualContainsRels.push({ fromUuid: previousSegmentVirtualNodeUuid, toUuid: virtualNodeUuid });
              }
              previousSegmentVirtualNodeUuid = virtualNodeUuid;
            }

            if (previousSegmentVirtualNodeUuid) {
              const originalUnresolvedRelType = relationshipType; // MODIFIED: Use relationshipType from unresolvedRef directly
              finalVirtualRelsByType[originalUnresolvedRelType] = finalVirtualRelsByType[originalUnresolvedRelType] || [];
              finalVirtualRelsByType[originalUnresolvedRelType].push({
                fromUuid: sourceUuid,
                toUuid: previousSegmentVirtualNodeUuid,
                props: originalRelProps || {}
              });
            }
          }

          const virtualNodesToCreate = Array.from(virtualNodeDataMap.values());
          if (virtualNodesToCreate.length > 0) {
            // console.log(`Processing batch of ${virtualNodesToCreate.length} virtual nodes...`); // Removed
            await txc.run(
              `UNWIND $batchData AS item
               MERGE (n:${GENERIC_NODE_LABEL}:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.uuidValue})
               ON CREATE SET n.shortName = item.shortNameValue, n.name = item.nameValue, n.arxmlPath = item.arxmlPathValue, n.isVirtual = true, n.originalXmlTag = 'VirtualSegment'
               ON MATCH SET n.isVirtual = true, n.originalXmlTag = 'VirtualSegment'`,
              { batchData: virtualNodesToCreate }
            );
            // console.log(`${virtualNodesToCreate.length} virtual nodes processed.`); // Removed
          }

          if (virtualContainsRels.length > 0) {
            // console.log(`Processing batch of ${virtualContainsRels.length} virtual CONTAINS relationships...`); // Removed
            await txc.run(
              `UNWIND $batchData AS item
               MATCH (a:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.fromUuid})
               MATCH (b:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.toUuid})
               MERGE (a)-[r:${RELATIONSHIP_TYPES.CONTAINS}]->(b)`,
              { batchData: virtualContainsRels }
            );
            // console.log(`${virtualContainsRels.length} virtual CONTAINS relationships processed.`); // Removed
          }

          for (const safeRelType in finalVirtualRelsByType) { // Name change here for clarity, was originalUnresolvedRelType
            const batch = finalVirtualRelsByType[safeRelType]; // safeRelType here is actually the original tag
            if (batch.length > 0) {
              // console.log(`Processing batch of ${batch.length} final virtual \'${safeRelType}\' relationships...`); // Removed
              await txc.run(
                `UNWIND $batchData AS item
                 MATCH (a:${GENERIC_NODE_LABEL} {uuid: item.fromUuid})
                 MATCH (b:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.toUuid})
                 MERGE (a)-[r:\`${safeRelType}\`]->(b) // MODIFIED: Use safeRelType (which is original tag)
                 ON CREATE SET r = item.props
                 ON MATCH SET r += item.props`,
                { batchData: batch }
              );
              // console.log(`${batch.length} final virtual \'${safeRelType}\' relationships processed.`); // Removed
            }
          }
          // console.log("Virtual nodes and relationships processing complete."); // Removed
        }

        // Create ImportInfo node
        const importInfoNodeUuid = `IMPORT_INFO_${importTimestamp}`;
        const importInfoNodeProps = {
          uuid: importInfoNodeUuid, // Add pre-generated UUID
          importFileNames: fileNames,
          importTimestamp: importTimestamp,
          nodeCountInImport: nodes.length,
          relationshipCountInImport: relationships.length,
          unresolvedReferenceCountInImport: unresolvedReferences.length,
        };
        // console.log("Processing ImportInfo node..."); // Removed
        await txc.run(
          `MERGE (i:${SPECIFIC_NODE_LABELS.IMPORT_INFO} {importTimestamp: $importTimestamp})
           ON CREATE SET i = $propsValue
           ON MATCH SET i += $propsValue`,
          {
            importTimestamp: importTimestamp,
            propsValue: importInfoNodeProps // This now includes the uuid
          }
        );
        // console.log("ImportInfo node processed."); // Removed

        // REMOVE THE FOLLOWING BLOCK TO KEEP VIRTUAL NODES
        // // Detach and delete virtual nodes
        // // console.log("Detaching and deleting virtual nodes from Neo4j..."); // Removed
        // const deleteVirtualResult = await txc.run(
        //   `MATCH (n:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL})
        //    DETACH DELETE n
        //    RETURN count(n) as deletedCount`
        // );
        // // console.log(`Detached and deleted ${deleteVirtualResult.records[0].get(\'deletedCount\')} virtual nodes.`); // Removed
        // console.log("Neo4j write transaction committed."); // Removed
      }); // End of writeTransaction

      return {
        success: true,
        message: `Successfully uploaded ARXML data from ${fileNames.join(', ')}.`,
        nodeCount: nodes.length,
        relationshipCount: relationships.length,
        unresolvedReferences: unresolvedReferences,
      };
    } catch (error) {
      // console.error("Error during Neo4j session transaction:", error); // Removed
      return {
        success: false,
        message: "Error during Neo4j session transaction.",
        nodeCount: 0,
        relationshipCount: 0,
        error: error.message,
      };
    } finally {
      await session.close();
    }
  } catch (error) {
    // console.error("Error parsing or processing ARXML files:", error); // Removed
    return {
      success: false,
      message: "Error parsing or processing ARXML files.",
      nodeCount: 0,
      relationshipCount: 0,
      error: error.message,
    };
  }

  return {
    success: false,
    message: "Unknown error occurred during upload.",
    nodeCount: 0,
    relationshipCount: 0,
    error: "Unknown",
  };
};

export const getApplicationSwComponents = async () => {
  const session = driver.session();
  try {
    const result = await session.run(
      'MATCH (n:APPLICATION_SW_COMPONENT_TYPE) RETURN n.name AS name, n.uuid AS uuid, n.arxmlPath AS arxmlPath ORDER BY n.name'
    );
    return {
      success: true,
      data: result.records.map(record => ({
        name: record.get('name'),
        uuid: record.get('uuid'),
        arxmlPath: record.get('arxmlPath'),
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: "Error fetching APPLICATION_SW_COMPONENT_TYPE nodes.",
      error: errorMessage,
      data: [],
    };
  } finally {
    await session.close();
  }
};

export const getComponentRelations = async (uuid: string) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n)
       WHERE n.uuid = $uuid
       MATCH (n)-[r]-(m)
       RETURN
         type(r) AS relationshipType,
         startNode(r).name AS sourceName,
         startNode(r).uuid AS sourceUuid,
         head([label IN labels(startNode(r)) WHERE label <> 'ArxmlElement']) AS sourceType,
         endNode(r).name AS targetName,
         endNode(r).uuid AS targetUuid,
         head([label IN labels(endNode(r)) WHERE label <> 'ArxmlElement']) AS targetType`,
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