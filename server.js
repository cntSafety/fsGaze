// Make sure path module is imported at the top of your file
const path = require('path');
// Make sure these are imported
const express = require('express');
const bodyParser = require('body-parser');

// Log startup information
console.log('Starting server...');
console.log('__dirname:', __dirname);
console.log('Node version:', process.version);

// If app isn't defined yet, define it
const app = express();

// Add middleware for JSON parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add request logging middleware to debug request issues
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname)));
console.log('Static files being served from:', path.join(__dirname));

// Add a specific route to serve the swagger.json file with proper content type
app.get('/swagger.json', (req, res) => {
  console.log('Serving swagger.json');
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'swagger.json'));
});

// Add a route to serve the Swagger UI
app.get('/api-docs', (req, res) => {
  console.log('Serving swagger-ui.html');
  res.sendFile(path.join(__dirname, 'swagger-ui.html'));
});

// Add a simple test endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint called');
  res.status(200).json({ message: "API is running" });
});

// Implement the API endpoint for KerML analysis
app.post('/api/kerml/analyze', (req, res) => {
  //console.log('KerML analyze endpoint called with body:', req.body);
  try {
    const { content } = req.body;
    
    if (!content) {
      console.log('Content missing in request');
      return res.status(400).json({ error: "Content is required" });
    }
    
    // Here you would process the content with your actual analysis logic
    // For now, we'll return a mock response
    const results = [
      {
        type: "info",
        message: "Analysis completed successfully"
      },
      {
        type: "warning",
        message: "Sample warning message"
      }
    ];
    
    console.log('Returning results:', results);
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Error analyzing KerML:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Handle the GET request to the API endpoint with an appropriate error message
app.get('/api/kerml/analyze', (req, res) => {
  console.log('GET request to /api/kerml/analyze');
  res.status(405).json({ error: "Method not allowed. Use POST instead." });
});

// Add a catch-all route for debugging
app.use('*', (req, res) => {
  console.log(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Not found", url: req.originalUrl, method: req.method });
});

// Check if the server is already running (this can help identify port conflicts)
const net = require('net');
const testServer = net.createServer();
testServer.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port 3000 is already in use. Another server might be running.');
  }
  testServer.close();
});

testServer.once('listening', () => {
  testServer.close();
  // Start the server
  app.listen(3000, () => {
    console.log('\n==== SERVER STARTED SUCCESSFULLY ====');
    console.log('Server is running on http://localhost:3000');
    console.log('API documentation available at http://localhost:3000/api-docs');
    console.log('Swagger JSON available at http://localhost:3000/swagger.json');
    console.log('KerML analysis endpoint: http://localhost:3000/api/kerml/analyze (POST)');
    console.log('Test endpoint: http://localhost:3000/api/test (GET)');
    console.log('======================================\n');
  });
});

testServer.listen(3000);
