/**
 * KerML Analysis API Endpoint
 * 
 * Purpose:
 * This API endpoint provides KerML (Kernel Modeling Language) analysis capabilities.
 * It accepts KerML content either as direct JSON or as file uploads and uploads the file to neo4j
 * 
 * Data Flow:
 * 1. Client sends a POST request with either:
 *    - JSON payload with KerML content in the "content" field
 *    - Multipart form data with a file upload
 * 2. The API processes the request and extracts the KerML content
 * 3. The content is uploaded to a Neo4j database for analysis
 * 4. Status results are returned to the client
 * 
 * Response Format:
 * {
 *   "results": [
 *     { "type": "info|warning|error", "message": "Analysis message" }
 *   ],
 *   "neo4j": {
 *     "success": boolean,
 *     "nodeCount": number,
 *     "relationshipCount": number
 *   }
 * }
 * 
 * Error Handling:
 * - 400: Bad Request (missing content)
 * - 405: Method Not Allowed (non-POST requests)
 * - 415: Unsupported Media Type (incorrect Content-Type)
 * - 500: Internal Server Error (processing failures)
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'fs/promises';
import { uploadKerMLToNeo4j } from '@/app/services/KerMLToNeoService';

/**
 * Handles POST requests to analyze KerML content
 * 
 * @param request - The incoming HTTP request
 * @returns A JSON response with analysis results or error information
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let content = '';
    let fileName = 'unknown';
    
    // Handle multipart form data (file uploads from UI)
    if (contentType.includes('multipart/form-data')) {
      // Extract the file from the form data
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      
      fileName = file.name || 'uploaded-file';
      
      // Process the file content
      // Note: Next.js App Router doesn't directly support file reading,
      // so we need to save it to a temporary location first
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Create a temp file path in the system's temporary directory
      const tempFilePath = join(tmpdir(), fileName);
      
      // Write the file to disk
      await writeFile(tempFilePath, buffer);
      
      // Read the file content as text
      content = fs.readFileSync(tempFilePath, 'utf8');
      
      console.log(`Read file content of length: ${content.length}`);
      
      // Clean up the temporary file to avoid disk space issues
      fs.unlinkSync(tempFilePath);
    } 
    // Handle JSON request (direct API calls)
    else if (contentType.includes('application/json')) {
      // Parse the JSON body and extract the content field
      const body = await request.json();
      content = body.content;
      fileName = body.fileName || 'api-submission';
    }
    // Handle unsupported content types
    else {
      return NextResponse.json(
        { error: "Unsupported media type. Use multipart/form-data for file uploads or application/json for direct API calls." }, 
        { status: 415 }
      );
    }
    
    // Validate that we have content to analyze
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    
    // ---------------------------------------------------------
    // Content Analysis Logic
    // ---------------------------------------------------------
    // Basic analysis for providing initial feedback
    const contentLength = content.length;
    const results = [
      {
        type: "info",
        message: `Successfully analyzed content with length: ${contentLength} characters`
      }
    ];
    
    // Add insights based on content characteristics
    if (contentLength > 100000) {
      results.push({
        type: "warning",
        message: "Large file detected. Processing may take longer."
      });
    }
    
    // Look for potential error indicators in the content
    if (content.includes("error") || content.includes("ERROR")) {
      results.push({
        type: "error",
        message: "Potential error keywords found in content"
      });
    }
    
    // Detect KerML-specific keywords
    if (content.includes("package") || content.includes("feature")) {
      results.push({
        type: "info",
        message: "Keyword package or feature detected"
      });
    }
    
    // ---------------------------------------------------------
    // Upload to Neo4j
    // ---------------------------------------------------------
    console.log(`Uploading ${fileName} to Neo4j...`);
    const neo4jResult = await uploadKerMLToNeo4j(content, fileName);
    
    if (neo4jResult.success) {
      results.push({
        type: "info",
        message: `Successfully uploaded to Neo4j: Created ${neo4jResult.nodeCount} nodes and ${neo4jResult.relationshipCount} relationships`
      });
    } else {
      results.push({
        type: "error",
        message: `Failed to upload to Neo4j: ${neo4jResult.error}`
      });
    }
    
    console.log(`Analysis complete for ${fileName}. Found ${results.length} results.`);
    
    // Return the analysis results and Neo4j upload status
    return NextResponse.json({ 
      results,
      neo4j: {
        success: neo4jResult.success,
        nodeCount: neo4jResult.nodeCount,
        relationshipCount: neo4jResult.relationshipCount,
        importTimestamp: neo4jResult.importTimestamp,
        error: neo4jResult.error
      }
    });
  } catch (error) {
    // Log and return any errors that occur during processing
    console.error('Error analyzing KerML:', error);
    return NextResponse.json({ 
      error: "Internal server error: " + (error instanceof Error ? error.message : String(error)) 
    }, { status: 500 });
  }
}

/**
 * Handles GET requests to this endpoint
 * 
 * This is included to provide a helpful error message when users
 * try to access the endpoint with the wrong HTTP method.
 * 
 * @returns A 405 Method Not Allowed response
 */
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST instead." },
    { status: 405 }
  );
}
