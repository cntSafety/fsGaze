import { useState, useEffect } from "react";
import { ActionsFlowsReqData, ActionUsage } from "../types";
import { fetchActionsData } from "@/app/services/actionsDataService";

/**
 * Custom hook for fetching and processing action data from the Neo4j database.
 *
 * @returns {Object} Object containing:
 *   - actions: Array of ActionUsage objects with their flows and requirements
 *   - mergedData: Processed data structure combining actions with their relationships
 *   - loading: Boolean indicating if data is currently being fetched
 *   - error: Error message if the data fetch fails
 */
export const useActionsFromNeo = () => {
  // State to store the detailed action data including all relationships
  const [actions, setActions] = useState<ActionUsage[]>([]);
  // State to store a simplified version of the data optimized for the UI
  const [mergedData, setMergedData] = useState<ActionsFlowsReqData[]>([]);
  // Loading state to track data fetching progress
  const [loading, setLoading] = useState<boolean>(true);
  // Error state to capture any issues during data fetching
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /**
     * Fetches action data using the shared service and processes the results.
     */
    const fetchActions = async () => {
      try {
        setLoading(true);
        
        // Use the shared service to fetch action data
        const response = await fetchActionsData();
        
        if (!response.success) {
          setError(response.error || "Failed to fetch action data");
          setLoading(false);
          return;
        }
        
        const actionsData = response.data;
        
        // Process the action data for UI consumption
        // Format for mergedData (simplified for UI)
        const combinedData: ActionsFlowsReqData[] = actionsData.map(action => ({
          elementId: action.elementId,
          name: action.name,
          incomingFlows: action.incomingFlows,
          outgoingFlows: action.outgoingFlows,
          requirements: action.requirements
        }));
        
        // Update state with processed data
        setActions(actionsData); // Detailed structure with complete relationship data
        setMergedData(combinedData); // Structure optimized for UI display
        setLoading(false); // Data loading complete
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch action usage data";
        setError(errorMessage);
        setLoading(false);
        console.error(err);
      }
    };

    // Trigger data fetching when the component mounts
    fetchActions();
  }, []); // Empty dependency array ensures this runs only once when component mounts

  // Return the data, loading state, and any errors to the consumer
  return { actions, mergedData, loading, error };
};
