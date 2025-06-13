/**
 * Common Cause Initiator (CCI) Analysis API Endpoint
 * 
 * Purpose:
 * This API endpoint provides Common Cause Initiator analysis capabilities.
 * It analyzes shared information inputs between actions requiring independence.
 * 
 * Data Flow:
 * 1. Endpoint receives a GET request
 * 2. It retrieves action data from Neo4j database
 * 3. The CCI analysis service processes this data to identify common cause initiators
 * 4. Results are returned as a JSON response
 * 
 * Response Format:
 * {
 *   "success": boolean,
 *   "cciResults": [
 *     {
 *       "requirementName": string,
 *       "requirementId": string,
 *       "sphinxneedsID": string | null,
 *       "actions": [{ "name": string, "id": string }],
 *       "commonSources": [{ "name": string, "pin": string | null, "id": string }],
 *       "timestamp": string
 *     }
 *   ],
 *   "affectedActionNames": string[],
 *   "sourceActionIds": string[]
 * }
 * 
 * Error Handling:
 * - 405: Method Not Allowed (non-GET requests)
 * - 500: Internal Server Error (processing failures)
 */

import { NextResponse } from 'next/server';
import { checkCommonCauseInitiators } from '@/app/find-shared-signals/services/cciAnalysisService';
import { fetchActionsData } from '@/app/services/actionsDataService';

/**
 * Handles GET requests to analyze Common Cause Initiators
 * 
 * @returns A JSON response with CCI analysis results
 */
export async function GET() {
  try {
    // Fetch action data using the shared service
    const response = await fetchActionsData();
    
    if (!response.success) {
      return NextResponse.json({
        success: false,
        error: response.error || "Failed to fetch action data"
      }, { status: 500 });
    }
    
    const actionsData = response.data;
    
    if (!actionsData || actionsData.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No action data found in database"
      }, { status: 404 });
    }
    
    // Use the existing CCI analysis service
    const results = checkCommonCauseInitiators(actionsData);
    
    // Process requirement details to include ASIL levels
    const requirementDetails = new Map();
    actionsData.forEach(action => {
      (action.requirements || []).forEach(req => {
        if (req.id) {
          // Find ASIL attribute if it exists
          const asilAttribute = (req.attributes || []).find((attr: { name: string; value: string }) =>
            attr.name === 'ASIL' || attr.name === 'asil'
          );

          // Store requirement details with ASIL if found
          requirementDetails.set(req.id, {
            name: req.name,
            description: req.description,
            sphinxneedsID: req.sphinxneedsID,
            ASIL: asilAttribute ? asilAttribute.value : ''
          });
        }
      });
    });

    // Enhance results with additional data like ASIL levels
    const enhancedResults = {
      ...results,
      cciResults: results.cciResults.map(item => {
        // Get requirement details for this CCI result
        const reqDetails = requirementDetails.get(item.requirementId) || {};
        return {
          ...item,
          id: item.id || `cci-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sphinxneedsID: item.sphinxneedsID || reqDetails.sphinxneedsID || null,
          requirementName: item.requirementName || reqDetails.name || '',
          requirementId: item.requirementId || '',
          // Use ASIL from requirement attributes if available
          ASIL: reqDetails.ASIL || '',
          timestamp: item.timestamp || new Date().toISOString()
        };
      })
    };
    
    // Return the analysis results
    return NextResponse.json({ 
      success: true,
      ...enhancedResults
    });
  } catch (error) {
    console.error('Error analyzing Common Cause Initiators:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Internal server error: " + (error instanceof Error ? error.message : String(error)) 
    }, { status: 500 });
  }
}

/**
 * Handles other HTTP methods
 * 
 * @returns A 405 Method Not Allowed response
 */
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed. Use GET instead." },
    { status: 405 }
  );
}

// Define handlers for other HTTP methods as well
export { POST as PUT };
export { POST as DELETE };
export { POST as PATCH };
