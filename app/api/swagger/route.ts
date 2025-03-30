import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * API route to serve the Swagger JSON specification.
 * This allows us to dynamically load the OpenAPI spec.
 */
export async function GET() {
  try {
    // Read the swagger.json file from the public directory
    const filePath = path.join(process.cwd(), 'public', 'swagger.json');
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Swagger specification not found' },
        { status: 404 }
      );
    }

    // Read the file content
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse to ensure it's valid JSON
    const swaggerSpec = JSON.parse(fileContent);
    
    // Return the swagger specification as JSON
    return NextResponse.json(swaggerSpec);
  } catch (error) {
    console.error('Error serving swagger.json:', error);
    return NextResponse.json(
      { error: 'Error loading Swagger specification' },
      { status: 500 }
    );
  }
}
