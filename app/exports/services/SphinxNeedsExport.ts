/**
 * Service for exporting Sphinx Needs safety status files
 */

/**
 * Formats CCI results into Sphinx Needs compatible content
 * @param cciResults The CCI analysis results
 * @returns Formatted content string for RST file
 */
const formatCCIResultsForSphinx = (cciResults: any) => {
  // Check if cciResults is an array and has elements
  if (!cciResults || !Array.isArray(cciResults) || cciResults.length === 0) {
    return "No shared information input issues detected.";
  }

  let content = "";

  // Set to track requirements we've already processed
  const processedRequirementIds = new Set();

  /**
   * First export any SysML-v2 requirements that don't have sphinx needs IDs
   *
   * Component Purpose:
   * This section converts SysML-v2 requirements into Sphinx Needs format when they
   * don't already have a Sphinx ID. This allows for traceability between different
   * modeling notations and documentation systems.
   *
   * Data Flow:
   * 1. Iterates through CCI analysis results to find requirements without Sphinx IDs
   * 2. For each unique requirement found:
   *    - Accesses ASIL (Automotive Safety Integrity Level) directly from the result object
   *    - Formats a shortened UUID as the requirement ID
   *    - Generates RST format Sphinx Needs compatible content
   *
   * The generated Sphinx Needs blocks will be referenced later when creating
   * architecture elements for actions and sources, establishing traceability
   * links between requirements and their implementation elements.
   */
  cciResults.forEach((result) => {
    if (
      result.requirementId &&
      result.requirementName &&
      !result.sphinxneedsID
    ) {
      // Only process each requirement once
      if (!processedRequirementIds.has(result.requirementId)) {
        processedRequirementIds.add(result.requirementId);
        console.log("result in sn-export component ----", result);

        // Access the ASIL directly from the result object with fallback
        const asil = result.ASIL || "not_found";

        // Format the requirement ID for use in sphinx-needs
        const shortReqId = result.requirementId.substring(0, 36).toUpperCase();

        content += `.. req:: ${result.requirementName}\n`;
        content += `   :id: REQ_${shortReqId}\n`;
        content += `   :asil: ${asil}\n`;

        content += `   :collapse: false\n\n`;
        content += `   This is a SysML-v2 requirement exported to sphinx needs ... test\n\n`;
      }
    }
  });

  // Group by actions first
  const actionGroups: Record<string, any> = {};

  cciResults.forEach((result) => {
    if (result.actions && Array.isArray(result.actions)) {
      // Create a key for this group of actions - ensure we're using strings
      const actionNames = result.actions.map((action: any) => {
        // Handle if the action is an object with a name property
        if (typeof action === "object" && action !== null) {
          return action.name || action.id || JSON.stringify(action);
        }
        // If it's already a string, use it directly
        return String(action);
      });

      const actionKey = actionNames.sort().join(", ");

      if (!actionGroups[actionKey]) {
        actionGroups[actionKey] = {
          actions: result.actions, // Store the original action objects
          sources: [],
        };
      }

      // Add this result to the action group
      if (result.commonSources && Array.isArray(result.commonSources)) {
        actionGroups[actionKey].sources.push(...result.commonSources);
      }
    }
  });

  // Now format each action group
  Object.entries(actionGroups).forEach(([actionKey, groupData], groupIndex) => {
    const { actions, sources } = groupData;

    // Extract requirement information from the first result that has it
    const firstResult = cciResults.find(
      (result) =>
        result.actions &&
        result.actions.some((a) =>
          actions.some(
            (groupAction) =>
              (typeof a === "object" && a.id === groupAction.id) ||
              (typeof a === "string" && a === groupAction),
          ),
        ),
    );

    // Handle both cases: existing sphinx need ID or our newly created one
    let requirementRef = "";
    let requirementId = "";

    if (firstResult) {
      if (firstResult.sphinxneedsID) {
        // Use existing sphinx needs ID
        requirementRef = ` and should satisfy the :need:\`DFA requirement <${firstResult.sphinxneedsID}>\``;
        requirementId = firstResult.sphinxneedsID;
      } else if (firstResult.requirementId) {
        // Use our newly created ID
        const shortReqId = firstResult.requirementId
          .substring(0, 36)
          .toUpperCase();
        const newSphinxId = `REQ_${shortReqId}`;
        requirementRef = ` and should satisfy the :need:\`DFA requirement <${newSphinxId}>\``;
        requirementId = newSphinxId;
      }
    }

    // List the actions that share common input sources with requirement reference
    content += `The following actions share common input source(s)${requirementRef}:\n\n`;

    // Create architecture needs for the actions
    actions.forEach((action: any, actionIdx: number) => {
      // Extract action name
      let actionName = "";
      if (typeof action === "object" && action !== null) {
        actionName =
          action.name || (action.id ? `Action ${action.id}` : "Unknown Action");
      } else {
        actionName = String(action);
      }

      // Generate ID for this action
      const actionId = action.id
        ? action.id.substring(0, 36)
        : `ACT_${(groupIndex + 1).toString().padStart(3, "0")}_${(actionIdx + 1).toString().padStart(2, "0")}`;

      content += `.. arch:: ${actionName}\n`;
      content += `    :id: A_${actionId.toUpperCase()}\n`;
      content += `    :tags: action\n`;
      content += `    :layout: clean_l\n`;
      content += `    :collapse: true\n`;

      // Add links to requirement if we have a requirementId (either sphinx or our generated one)
      if (requirementId) {
        content += `    :links: ${requirementId}\n`;
      }

      content += `\n`;

      // Include any additional information about the action
      if (action.description) {
        content += `    ${action.description}\n\n`;
      }
    });

    // Add a separator between actions and sources
    content += `Common source(s) of input:\n\n`;

    // Create a Map to track unique sources by ID
    const uniqueSources = new Map();
    sources.forEach((source: any) => {
      const sourceId = source.id || source.name;
      if (!uniqueSources.has(sourceId)) {
        uniqueSources.set(sourceId, source);
      }
    });

    // Process unique sources
    Array.from(uniqueSources.values()).forEach(
      (source: any, sourceIdx: number) => {
        const sourceId = source.id
          ? source.id.substring(0, 36)
          : `SRC_${(groupIndex + 1).toString().padStart(3, "0")}_${(sourceIdx + 1).toString().padStart(2, "0")}`;

        const sourceName =
          typeof source.name === "string"
            ? source.name
            : source.id
              ? `Source ${source.id}`
              : "Unknown Source";

        content += `.. arch:: ${sourceName}\n`;
        content += `    :id: A_${sourceId.toUpperCase()}\n`;
        content += `    :tags: source\n`;
        content += `    :layout: clean_l\n`;
        content += `    :collapse: false\n\n`;

        // Include any additional information about the source
        if (source.pin) {
          content += `    Providing ${source.pin} parameter\n\n`;
        }
      },
    );
    content += `\n\n`;
  });

  return content;
};

/**
 * Gets the content for the safety status file
 * @param results The CCI analysis results to include
 * @returns Formatted content string
 */
export const getCCIResultsContent = (results?: any[]) => {
  const baseContent =
    "Safety Status\n==============\n\n" +
    "Shared information input for actions requiring independance\n" +
    "------------------------------------------------------------\n\n";

  // If we have results, format them
  if (results && Array.isArray(results) && results.length > 0) {
    return baseContent + formatCCIResultsForSphinx(results);
  }

  // Default content if no results are provided
  return baseContent + "No analysis results selected for export.";
};

/**
 * Generates a safety status .rst file and lets the user save it to their chosen location
 * @param results CCI results to include in the export
 * @param fileName custom filename for the exported file
 * @returns A promise that resolves with information about the save operation
 */
export const exportSafetyStatusFile = async (
  results?: any[],
  fileName?: string,
): Promise<{
  success: boolean;
  filePath?: string;
  error?: string;
}> => {
  try {
    // Define the content for the safety status file using CCI results
    const content = getCCIResultsContent(results);

    // Extract just the filename if a full path was provided
    const suggestedFileName = fileName
      ? fileName.split(/[\/\\]/).pop() || "safetystatus.rst"
      : "safetystatus.rst";

    // Try to use the File System Access API if available
    try {
      if ("showSaveFilePicker" in window) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: suggestedFileName,
          types: [
            {
              description: "RST files",
              accept: { "text/plain": [".rst"] },
            },
          ],
          // Only use valid startIn values (we'll let the user navigate to their desired location)
          startIn: "downloads",
        });

        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();

        // Get the actual file path that the user selected (note: this is partial and security-restricted)
        const filePathInfo = await fileHandle.getFile();

        return {
          success: true,
          filePath: filePathInfo.name, // This will only contain the filename, not the full path
        };
      }
    } catch (fsError) {
      console.error("Failed to use File System Access API:", fsError);
      // Fall back to the regular download if the File System Access API fails
    }

    // Create a blob with the content (fallback method)
    const blob = new Blob([content], { type: "text/plain" });

    // Create a URL for the blob
    const url = URL.createObjectURL(blob);

    // Create an invisible anchor element for download
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedFileName;

    // Append the anchor to the body, click it, and remove it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Release the URL
    URL.revokeObjectURL(url);

    return {
      success: true,
      filePath: `Downloaded as ${suggestedFileName}`,
    };
  } catch (error) {
    console.error("Error exporting safety status file:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};
