import { parseStringPromise } from "xml2js";
import { driver } from '../config';
import { 
  ArxmlFileContent, 
  Neo4jNode, 
  Neo4jRelationship, 
  PendingReference, 
  UnresolvedReference,
  SPECIFIC_NODE_LABELS,
  RELATIONSHIP_TYPES,
  ArxmlImportInfo,
  ArxmlFileInfo
} from '../types';
import { 
  generateUUID, 
  ensureArray, 
  getLabelFromXmlTag, 
  extractShortNameValue 
} from '../utils';

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
 * @param {Set<string>} seenNodeUuids Set to track UUIDs of nodes already added, for fast O(1) lookups.
 * @param {Set<string>} seenContainsRels Set to track 'from->to' of CONTAINS relationships for fast O(1) lookups.
 */
function recursiveExtractLogic(
  xmlElement: any,
  xmlElementTag: string,
  parentNeo4jNodeUuid: string | null,
  nodes: Neo4jNode[],
  relationships: Neo4jRelationship[],
  parentSemanticPathParts: string[],
  pendingReferences: PendingReference[],
  // --- OPTIMIZATION 1: Use Sets for O(1) existence checks ---
  seenNodeUuids: Set<string>,
  seenContainsRels: Set<string>
) {
  if (typeof xmlElement !== 'object' || xmlElement === null) {
    return;
  }

  const shortNameValue = extractShortNameValue(xmlElement['SHORT-NAME']);
  const arxmlUuid = xmlElement['UUID'] || (xmlElement.$ && xmlElement.$.UUID);

  let currentNeo4jNodeUuid: string | null = null;
  let currentElementSemanticPathParts = parentSemanticPathParts;
  if (shortNameValue) {
    currentElementSemanticPathParts = [...parentSemanticPathParts, shortNameValue];
  }

  if (shortNameValue && arxmlUuid) {
    currentNeo4jNodeUuid = arxmlUuid;
    const nodeLabel = getLabelFromXmlTag(xmlElementTag);
    const semanticArxmlPath = '/' + currentElementSemanticPathParts.join('/');    // --- OPTIMIZATION 1: Use Set.has() for a fast O(1) check instead of Array.find() ---
    if (currentNeo4jNodeUuid && !seenNodeUuids.has(currentNeo4jNodeUuid)) {
      const props: Record<string, any> = {
        shortName: shortNameValue,
        name: shortNameValue,
        arxmlPath: semanticArxmlPath,
        originalXmlTag: xmlElementTag,
      };

      if (xmlElement.$) {
        for (const attrKey in xmlElement.$) {
          if (xmlElement.$.hasOwnProperty(attrKey) && attrKey.toUpperCase() !== 'UUID' && attrKey !== 'SHORT-NAME') {
            props[attrKey.replace(/-/g, "_")] = xmlElement.$[attrKey];
          }
        }
      }
      for (const key in xmlElement) {
        if (xmlElement.hasOwnProperty(key)) {
          const value = xmlElement[key];
          if (key !== 'SHORT-NAME' && key !== 'UUID' && key !== '$' && key !== '_' &&
              !Array.isArray(value) && typeof value !== 'object' && value !== null) {
            props[key.replace(/-/g, "_")] = String(value);
          }
        }
      }

      nodes.push({
        uuid: currentNeo4jNodeUuid!,
        label: nodeLabel,
        props: props,
      });      // Add the UUID to the set to mark it as seen
      if (currentNeo4jNodeUuid) {
        seenNodeUuids.add(currentNeo4jNodeUuid);
      }
    }

    if (parentNeo4jNodeUuid) {
      // --- OPTIMIZATION 1: Use a unique key and a Set for a fast O(1) check instead of Array.some() ---
      const relKey = `${parentNeo4jNodeUuid}->${currentNeo4jNodeUuid}`;
      if (!seenContainsRels.has(relKey)) {
          relationships.push({
            type: RELATIONSHIP_TYPES.CONTAINS,
            from: parentNeo4jNodeUuid,
            to: currentNeo4jNodeUuid!,
          });
          // Add the key to the set to mark it as seen
          seenContainsRels.add(relKey);
      }
    }
  } else if (shortNameValue && !arxmlUuid) {
    // Minimal log for missing UUID, if necessary
  }

  for (const key in xmlElement) {
    if (xmlElement.hasOwnProperty(key) && key !== '$' && key !== '_' && key !== 'SHORT-NAME' && key !== 'UUID') {
      const childValue = xmlElement[key];

      if (key.endsWith("-IREF")) {
        // This block handles complex instance references (ending in -IREF).
        // It checks for two patterns:
        // 1. Direct ...-REF children (e.g., inside a PROVIDER-IREF).
        // 2. ...-REF children nested inside an ...-INSTANCE-REF (e.g., inside an INNER-PORT-IREF).
        // In both cases, it creates a direct relationship from the containing element
        // (like ASSEMBLY-SW-CONNECTOR) to the final target of the reference.
         const irefs = ensureArray(childValue);
         const effectiveSourceNodeUuid = currentNeo4jNodeUuid || parentNeo4jNodeUuid;
 
         if (effectiveSourceNodeUuid) {
           for (const iref of irefs) {
             if (typeof iref !== 'object' || iref === null) continue;
             
             for (const childKey in iref) {
                if (!iref.hasOwnProperty(childKey)) continue;
                const childContent = iref[childKey];

                const processRef = (refKey: string, refData: any) => {
                    const refsToProcess = ensureArray(refData);
                    for (const refItem of refsToProcess) {
                        let refPath = null, refDest = null;
                        if (typeof refItem === 'string') refPath = refItem;
                        else if (refItem && typeof refItem === 'object') {
                            refPath = refItem._ || refItem.CONTENT;
                            refDest = (refItem.$ && refItem.$.DEST) || refItem.DEST;
                        }
                        if (refPath) {
                            pendingReferences.push({
                                from: effectiveSourceNodeUuid, toPath: refPath, type: refKey,
                                props: { ...(refDest && { destinationType: refDest }) },
                            });
                        }
                    }
                };

                // Check for the more specific case first!
                if (childKey.endsWith('-INSTANCE-REF')) {
                    if (typeof childContent === 'object' && childContent !== null) {
                        for (const finalRefKey in childContent) {
                            if (childContent.hasOwnProperty(finalRefKey) && (finalRefKey.endsWith('-REF') || finalRefKey.endsWith('-TREF'))) {
                                processRef(finalRefKey, childContent[finalRefKey]);
                            }
                        }
                    }
                } else if (childKey.endsWith('-REF') || childKey.endsWith('-TREF')) {
                    processRef(childKey, childContent);
                }
             }
           }
         }
      } else if (key.endsWith("-REF") || key.endsWith("-TREF")) {
        const refs = ensureArray(childValue);
        const effectiveSourceNodeUuid = currentNeo4jNodeUuid || parentNeo4jNodeUuid;

        if (effectiveSourceNodeUuid) {
            for (const refItem of refs) {
                let refPath = null;
                let refDest = null;
                if (typeof refItem === 'string') {
                    refPath = refItem;
                } else if (refItem && typeof refItem === 'object') {
                    refPath = refItem._ || refItem.CONTENT;
                    refDest = (refItem.$ && refItem.$.DEST) || refItem.DEST;
                }

                if (refPath) {
                    const relationshipType = key;
                    pendingReferences.push({
                        from: effectiveSourceNodeUuid,
                        toPath: refPath,
                        type: relationshipType,
                        props: { ...(refDest && { destinationType: refDest }) },
                    });
                }
            }
        }
      } else {
        const itemsToRecurse = ensureArray(childValue);
        itemsToRecurse.forEach(item => {
          if (typeof item === 'object' && item !== null) {
            recursiveExtractLogic(
              item,
              key,
              currentNeo4jNodeUuid || parentNeo4jNodeUuid,
              nodes,
              relationships,
              currentElementSemanticPathParts,
              pendingReferences,
              // --- OPTIMIZATION 1: Pass the sets down in the recursion ---
              seenNodeUuids,
              seenContainsRels
            );
          }
        });
      }
    }
  }
}

export function extractArxmlNodesAndRelationships(parsed: any) {
  const nodes: Neo4jNode[] = [];
  const relationships: Neo4jRelationship[] = [];
  const pendingReferences: PendingReference[] = [];
  const unresolvedReferences: UnresolvedReference[] = [];

  // --- OPTIMIZATION 1: Initialize Sets for fast lookups ---
  const seenNodeUuids = new Set<string>();
  const seenContainsRels = new Set<string>(); // Stores a unique key like "fromUuid->toUuid"

  if (!parsed || !parsed.AUTOSAR) {
    return { nodes, relationships, unresolvedReferences };
  }

  const arPackagesContainer = parsed.AUTOSAR["AR-PACKAGES"];
  if (arPackagesContainer) {
      const arPackages = ensureArray(arPackagesContainer["AR-PACKAGE"]);
      for (const pkg of arPackages) {
        recursiveExtractLogic(
            pkg,
            "AR-PACKAGE",
            null,
            nodes,
            relationships,
            [],
            pendingReferences,
            // --- OPTIMIZATION 1: Pass the Sets to the recursive function ---
            seenNodeUuids,
            seenContainsRels
        );
      }
  }

  const arxmlPathToUuidMap = new Map();
  for (const node of nodes) {
    if (node.props && typeof node.props.arxmlPath === 'string') {
      arxmlPathToUuidMap.set(node.props.arxmlPath, node.uuid);
    }
  }

  for (const pendingRef of pendingReferences) {
    const targetUuid = arxmlPathToUuidMap.get(pendingRef.toPath);
    if (targetUuid) {
      // Here, we don't need a Set because pending references for the same path are less likely
      // and the `relationships` array isn't growing during this loop. A `some` check is acceptable.
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
  
  return { nodes, relationships, unresolvedReferences };
}

function mergeParsedArxmlObjects(parsedObjects: any[]) {
    // This function remains unchanged
    if (!parsedObjects || parsedObjects.length === 0) return null;
    if (parsedObjects.length === 1) return parsedObjects[0];
  
    const mergedAutosar: any = {
      AUTOSAR: {
        "$": parsedObjects[0]?.AUTOSAR?.["$"] || {},
        "AR-PACKAGES": { "AR-PACKAGE": [] as any[] }
      }
    };
  
    for (const parsed of parsedObjects) {
      if (parsed && parsed.AUTOSAR && parsed.AUTOSAR["AR-PACKAGES"]) {
        const arPackages = ensureArray(parsed.AUTOSAR["AR-PACKAGES"]["AR-PACKAGE"]);
        mergedAutosar.AUTOSAR["AR-PACKAGES"]["AR-PACKAGE"].push(...arPackages);
      }
    }
    if (mergedAutosar.AUTOSAR["AR-PACKAGES"]["AR-PACKAGE"].length === 0) {
      mergedAutosar.AUTOSAR["AR-PACKAGES"] = undefined; 
    }
  
    return mergedAutosar;
}

// Full implementation of uploadArxmlToNeo4j with optimizations
export const uploadArxmlToNeo4j = async (
  arxmlFileContents: ArxmlFileContent[], 
  progressCallback?: (progress: number, phase: string) => void
) => {
  if (!arxmlFileContents || arxmlFileContents.length === 0) {
    return { success: false, message: "No ARXML file contents provided.", nodeCount: 0, relationshipCount: 0, error: "No content" };
  }

  const importStartTime = Date.now();
  const importId = generateUUID();
  const importVersion = "1.0.0";
  
  const fileNames: string[] = [];
  const fileSizes: number[] = [];
  const fileInfoNodes: ArxmlFileInfo[] = [];
  let extractionResult: { nodes: Neo4jNode[], relationships: Neo4jRelationship[], unresolvedReferences: UnresolvedReference[] };

  try {
    if (progressCallback) progressCallback(35, 'Starting ARXML file parsing');
    
    // Using Promise.all to parallelize parsing for better performance
    const parsingPromises = arxmlFileContents.map(async (fileContent) => {
      fileNames.push(fileContent.name);
      fileSizes.push(fileContent.content.length);
      
      // Create file info node for each file
      const fileInfo: ArxmlFileInfo = {
        uuid: generateUUID(),
        fileName: fileContent.name,
        filePath: fileContent.path, // Use the actual file path from browser
        fileSize: fileContent.content.length,
        importTimestamp: new Date().toISOString(),
        nodeCount: 0, // Will be updated after extraction
        relationshipCount: 0, // Will be updated after extraction
        arxmlVersion: undefined, // Could be extracted from XML if needed
        checksum: undefined // Could be calculated if needed
      };
      fileInfoNodes.push(fileInfo);
      
      return parseStringPromise(fileContent.content, {
        explicitArray: false, mergeAttrs: true, charkey: 'CONTENT', emptyTag: undefined,
      });
    });
    const parsedObjects = await Promise.all(parsingPromises);

    if (progressCallback) progressCallback(50, 'Merging parsed ARXML data');
    const mergedParsedData = mergeParsedArxmlObjects(parsedObjects);
    if (!mergedParsedData) {
      return { success: false, message: "Failed to merge ARXML data.", nodeCount: 0, relationshipCount: 0, error: "Merge failure" };
    }

    if (progressCallback) progressCallback(55, 'Extracting nodes and relationships');
    extractionResult = extractArxmlNodesAndRelationships(mergedParsedData);
    const { nodes, relationships, unresolvedReferences } = extractionResult;
    
    if (progressCallback) progressCallback(60, `Extracted ${nodes.length} nodes and ${relationships.length} relationships`);

    if (nodes.length === 0 && relationships.length === 0 && unresolvedReferences.length === 0) {
      return { success: true, message: `No data to import from ${fileNames.join(', ')}.`, nodeCount: 0, relationshipCount: 0, unresolvedReferences: [] };
    }

    // --- OPTIMIZATION 2: Create a UUID-to-Label map for faster relationship matching ---
    const uuidToLabelMap = new Map<string, string>();
    nodes.forEach(node => {
      uuidToLabelMap.set(node.uuid, node.label);
    });

    const session = driver.session();
    try {
      if (progressCallback) progressCallback(65, 'Clearing existing data');
      await session.run('MATCH (n) DETACH DELETE n');

      if (progressCallback) progressCallback(70, 'Creating database indexes');
      const commonlyQueriedLabels = [ 'SW_COMPONENT_PROTOTYPE', 'APPLICATION_SW_COMPONENT_TYPE', 'P_PORT_PROTOTYPE', 'R_PORT_PROTOTYPE', 'AR_PACKAGE', 'ASSEMBLY_SW_CONNECTOR', 'DATA_ELEMENT' ];
      const uniqueLabels = [...new Set(nodes.map(node => node.label))];
      const labelsToIndex = commonlyQueriedLabels.filter(label => uniqueLabels.includes(label));
      
      for (const label of labelsToIndex) {
        await session.run(`CREATE INDEX ${label.toLowerCase()}_uuid_index IF NOT EXISTS FOR (n:${label}) ON (n.uuid)`);
        await session.run(`CREATE INDEX ${label.toLowerCase()}_shortname_index IF NOT EXISTS FOR (n:${label}) ON (n.shortName)`);
      }
      await session.run(`CREATE INDEX arxml_virtual_ref_uuid IF NOT EXISTS FOR (n:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL}) ON (n.uuid)`);
      await session.run(`CREATE INDEX arxml_import_info_uuid IF NOT EXISTS FOR (n:${SPECIFIC_NODE_LABELS.IMPORT_INFO}) ON (n.uuid)`);
      await session.run(`CREATE INDEX arxml_file_info_uuid IF NOT EXISTS FOR (n:${SPECIFIC_NODE_LABELS.FILE_INFO}) ON (n.uuid)`);

      await session.writeTransaction(async txc => {
        if (progressCallback) progressCallback(80, 'Uploading nodes to database');
        const nodesByLabel = nodes.reduce((acc, node) => {
          acc[node.label] = acc[node.label] || [];
          acc[node.label].push({ uuid: node.uuid, props: node.props });
          return acc;
        }, {} as Record<string, Array<{ uuid: string, props: Record<string, any> }>>);

        for (const specificLabel in nodesByLabel) {
          const batch = nodesByLabel[specificLabel];
          if (batch.length > 0) {
            await txc.run(`UNWIND $batchData AS item MERGE (n:${specificLabel} {uuid: item.uuid}) ON CREATE SET n = item.props, n.uuid = item.uuid ON MATCH SET n += item.props`, { batchData: batch });
          }
        }

        if (progressCallback) progressCallback(85, 'Creating relationships');
        // --- OPTIMIZATION 2: Group relationships by a composite key for more efficient Cypher queries ---
        const relsByGroupKey: Record<string, Array<{ from: string, to: string, props: Record<string, any> }>> = {};
        for (const rel of relationships) {
          const fromLabel = uuidToLabelMap.get(rel.from);
          const toLabel = uuidToLabelMap.get(rel.to);
          if (fromLabel && toLabel) {
            const groupKey = `${rel.type}|${fromLabel}|${toLabel}`;
            relsByGroupKey[groupKey] = relsByGroupKey[groupKey] || [];
            relsByGroupKey[groupKey].push({ from: rel.from, to: rel.to, props: rel.props || {} });
          }
        }
        
        for (const groupKey in relsByGroupKey) {
          const [relType, fromLabel, toLabel] = groupKey.split('|');
          const batch = relsByGroupKey[groupKey];
          if (batch.length > 0) {
            await txc.run(
              `UNWIND $batchData AS item
               MATCH (a:${fromLabel} {uuid: item.from})
               MATCH (b:${toLabel} {uuid: item.to})
               MERGE (a)-[r:\`${relType}\`]->(b)
               ON CREATE SET r = item.props
               ON MATCH SET r += item.props`,
              { batchData: batch }
            );
          }
        }

        if (unresolvedReferences && unresolvedReferences.length > 0) {
          if (progressCallback) progressCallback(88, `Processing ${unresolvedReferences.length} unresolved references`);
          
          const virtualNodeDataMap = new Map();
          const virtualContainsRels: Array<{ fromUuid: string, toUuid: string }> = [];
          
          // --- OPTIMIZATION 2: Group virtual relationships by a composite key as well ---
          const finalVirtualRelsByGroupKey: Record<string, Array<{ fromUuid: string, toUuid: string, props: Record<string, any> }>> = {};

          for (const unresolvedRef of unresolvedReferences) {
            const { sourceUuid, targetPath, relationshipType } = unresolvedRef;
            if (!targetPath || !targetPath.startsWith('/')) continue;

            const fromLabel = uuidToLabelMap.get(sourceUuid);
            if (!fromLabel) continue; // Skip if source node doesn't exist

            const pathSegments = targetPath.substring(1).split('/');
            let previousSegmentVirtualNodeUuid: string | null = null;
            let currentCumulativePath = "";

            for (const segmentName of pathSegments) {
              if (!segmentName) continue;
              currentCumulativePath += "/" + segmentName;
              const virtualNodeUuid = currentCumulativePath;

              if (!virtualNodeDataMap.has(virtualNodeUuid)) {
                virtualNodeDataMap.set(virtualNodeUuid, { uuidValue: virtualNodeUuid, shortNameValue: segmentName, nameValue: segmentName, arxmlPathValue: virtualNodeUuid });
              }
              if (previousSegmentVirtualNodeUuid) {
                virtualContainsRels.push({ fromUuid: previousSegmentVirtualNodeUuid, toUuid: virtualNodeUuid });
              }
              previousSegmentVirtualNodeUuid = virtualNodeUuid;
            }

            if (previousSegmentVirtualNodeUuid) {
              const groupKey = `${relationshipType}|${fromLabel}`;
              finalVirtualRelsByGroupKey[groupKey] = finalVirtualRelsByGroupKey[groupKey] || [];
              finalVirtualRelsByGroupKey[groupKey].push({ fromUuid: sourceUuid, toUuid: previousSegmentVirtualNodeUuid, props: {} });
            }
          }

          const virtualNodesToCreate = Array.from(virtualNodeDataMap.values());
          if (virtualNodesToCreate.length > 0) {
            await txc.run(`UNWIND $batchData AS item MERGE (n:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.uuidValue}) ON CREATE SET n.shortName = item.shortNameValue, n.name = item.nameValue, n.arxmlPath = item.arxmlPathValue, n.isVirtual = true, n.originalXmlTag = 'VirtualSegment' ON MATCH SET n.isVirtual = true, n.originalXmlTag = 'VirtualSegment'`, { batchData: virtualNodesToCreate });
          }
          if (virtualContainsRels.length > 0) {
            await txc.run(`UNWIND $batchData AS item MATCH (a:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.fromUuid}) MATCH (b:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.toUuid}) MERGE (a)-[r:${RELATIONSHIP_TYPES.CONTAINS}]->(b)`, { batchData: virtualContainsRels });
          }

          for (const groupKey in finalVirtualRelsByGroupKey) {
            const [relType, fromLabel] = groupKey.split('|');
            const batch = finalVirtualRelsByGroupKey[groupKey];
            if (batch.length > 0) {
              await txc.run(
                `UNWIND $batchData AS item
                 MATCH (a:${fromLabel} {uuid: item.fromUuid})
                 MATCH (b:${SPECIFIC_NODE_LABELS.VIRTUAL_REF_NODE_LABEL} {uuid: item.toUuid})
                 MERGE (a)-[r:\`${relType}\`]->(b)
                 ON CREATE SET r = item.props
                 ON MATCH SET r += item.props`,
                { batchData: batch }
              );
            }
          }
        }

        // Create import metadata nodes
        if (progressCallback) progressCallback(95, 'Creating import metadata');
        
        // Create the main import info node
        const importDuration = Date.now() - importStartTime;
        const importInfo: ArxmlImportInfo = {
          uuid: importId,
          importId: importId,
          importTimestamp: new Date().toISOString(),
          importDuration: importDuration,
          fileCount: fileNames.length,
          fileNames: fileNames,
          fileSizes: fileSizes,
          nodeCount: nodes.length,
          relationshipCount: relationships.length,
          unresolvedReferencesCount: unresolvedReferences.length,
          importStatus: 'success',
          importVersion: importVersion
        };

        await txc.run(
          `CREATE (n:${SPECIFIC_NODE_LABELS.IMPORT_INFO} $props)`,
          { props: importInfo }
        );

        // Create file info nodes and link them to import session
        for (const fileInfo of fileInfoNodes) {
          // Update file info with actual counts (simplified - in reality you'd track per-file)
          fileInfo.nodeCount = Math.floor(nodes.length / fileNames.length);
          fileInfo.relationshipCount = Math.floor(relationships.length / fileNames.length);
          
          await txc.run(
            `CREATE (n:${SPECIFIC_NODE_LABELS.FILE_INFO} $props)`,
            { props: fileInfo }
          );

          // Link file info to import session
          await txc.run(
            `MATCH (import:${SPECIFIC_NODE_LABELS.IMPORT_INFO} {uuid: $importId})
             MATCH (file:${SPECIFIC_NODE_LABELS.FILE_INFO} {uuid: $fileUuid})
             MERGE (import)-[r:${RELATIONSHIP_TYPES.IMPORT_SESSION}]->(file)`,
            { importId: importId, fileUuid: fileInfo.uuid }
          );
        }
      });

      if (progressCallback) progressCallback(98, 'Import completed successfully');
      
      return { success: true, message: `Successfully uploaded ARXML data from ${fileNames.join(', ')}.`, nodeCount: nodes.length, relationshipCount: relationships.length, unresolvedReferences };
    } catch (error: any) {
      return { success: false, message: "Error during Neo4j session transaction.", nodeCount: 0, relationshipCount: 0, error: error.message };
    } finally {
      await session.close();
    }
  } catch (error: any) {
    return { success: false, message: "Error parsing or processing ARXML files.", nodeCount: 0, relationshipCount: 0, error: error.message };
  }
};

/**
 * Retrieves the latest ARXML import metadata from Neo4j
 * @returns Promise with the latest import information
 */
export const getLatestArxmlImportInfo = async (): Promise<{
  success: boolean;
  data?: ArxmlImportInfo;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (import:${SPECIFIC_NODE_LABELS.IMPORT_INFO})
       RETURN import
       ORDER BY import.importTimestamp DESC
       LIMIT 1`
    );

    if (result.records.length === 0) {
      return {
        success: false,
        message: "No ARXML import metadata found in database"
      };
    }

    const record = result.records[0];
    const importData = record.get('import').properties as ArxmlImportInfo;

    return {
      success: true,
      data: importData
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: "Error retrieving ARXML import metadata",
      error: errorMessage
    };
  } finally {
    await session.close();
  }
};

/**
 * Retrieves file information for a specific import session
 * @param importId The import session ID
 * @returns Promise with file information for the import
 */
export const getArxmlFileInfoForImport = async (importId: string): Promise<{
  success: boolean;
  data?: ArxmlFileInfo[];
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (import:${SPECIFIC_NODE_LABELS.IMPORT_INFO} {uuid: $importId})
       -[:${RELATIONSHIP_TYPES.IMPORT_SESSION}]->
       (file:${SPECIFIC_NODE_LABELS.FILE_INFO})
       RETURN file
       ORDER BY file.fileName`,
      { importId }
    );

    if (result.records.length === 0) {
      return {
        success: false,
        message: `No file information found for import ID: ${importId}`
      };
    }

    const fileData = result.records.map(record => 
      record.get('file').properties as ArxmlFileInfo
    );

    return {
      success: true,
      data: fileData
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      success: false,
      message: "Error retrieving file information",
      error: errorMessage
    };
  } finally {
    await session.close();
  }
};