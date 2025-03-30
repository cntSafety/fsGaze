const http = require('http');
const path = require('path');
const fs = require('fs');

console.log('Starting simple test server...');

// Check if key files exist
const swaggerJsonPath = path.join(__dirname, 'swagger.json');
const swaggerUIPath = path.join(__dirname, 'swagger-ui.html');

console.log('Checking for Swagger files:');
console.log(`swagger.json exists: ${fs.existsSync(swaggerJsonPath)}`);
console.log(`swagger-ui.html exists: ${fs.existsSync(swaggerUIPath)}`);

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // Add CORS headers to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  
  // Handle OPTIONS method for CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>Test Server Running</h1><p><a href="/test">Test API</a></p><p><a href="/api-docs">Try API Docs</a></p></body></html>');
  } 
  else if (req.url === '/test') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Test server is working!' }));
  }
  else if (req.url === '/api-docs') {
    if (fs.existsSync(swaggerUIPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(swaggerUIPath));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Swagger UI file not found');
    }
  }
  else if (req.url === '/swagger.json') {
    if (fs.existsSync(swaggerJsonPath)) {
      // Update the swagger JSON to match the current server port
      const swaggerJson = JSON.parse(fs.readFileSync(swaggerJsonPath, 'utf8'));
      swaggerJson.servers = [
        {
          url: "http://localhost:3001",
          description: "Test server"
        }
      ];
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(swaggerJson, null, 2));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Swagger JSON file not found');
    }
  }
  // Add a test endpoint similar to the main server
  else if (req.url === '/api/test') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Test API endpoint is working!' }));
  }
  // Add a mock implementation of the analyze endpoint
  else if (req.url === '/api/kerml/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.content) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Content is required' }));
          return;
        }
        
        // Mock response
        const results = [
          {
            type: "info",
            message: "Test server analysis completed successfully"
          },
          {
            type: "warning",
            message: "Sample warning message from test server"
          }
        ];
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
      }
    });
  }
  else if (req.url === '/api/kerml/analyze' && req.method === 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST instead.' }));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(3001, () => {
  console.log('Test server running at http://localhost:3001/');
  console.log('Try accessing:');
  console.log('- http://localhost:3001/ (Home page)');
  console.log('- http://localhost:3001/test (Test endpoint)');
  console.log('- http://localhost:3001/api-docs (Swagger UI)');
  console.log('- http://localhost:3001/swagger.json (Swagger JSON)');
  console.log('- http://localhost:3001/api/test (Test API endpoint)');
  console.log('- http://localhost:3001/api/kerml/analyze (POST - KerML analyze endpoint)');
});
