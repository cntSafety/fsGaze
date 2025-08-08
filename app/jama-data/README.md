# Jama Connect Integration

This module provides integration with Jama Connect's REST API to retrieve and analyze requirements data.

## Features

### Authentication
- **OAuth 2.0** (Recommended): Uses client credentials flow for secure authentication
- **Basic Authentication**: Username/password authentication (not recommended for SAML/SSO environments)

### Connection Management
- Test connection to Jama instance
- Token management with automatic expiry detection
- Support for both cloud and on-premises Jama instances

### Requirements Management
- Enter project ID directly (found in Jama URL: projects/123/dashboard)
- Browse and filter requirements by item type
- Search requirements using Jama's Lucene-powered search
- Filter by item types, dates, and content
- View detailed requirement information

## Setup Instructions

### OAuth Setup (Recommended)
1. Log into your Jama instance
2. Go to your user profile
3. Click "Set API Credentials"
4. Enter a name for your application/integration
5. Click "Create API Credentials"
6. Copy the Client ID and Client Secret (secret is shown only once!)

### Basic Authentication
- Use your regular Jama username and password
- Note: This won't work in SAML/SSO environments

## API Endpoints Used

The integration uses the following Jama REST API endpoints:

- `POST /rest/oauth/token` - OAuth token exchange
- `GET /rest/v1/users/current` - Get current user info
- `GET /rest/v1/projects` - Get available projects
- `GET /rest/v1/itemtypes` - Get item types for a project
- `GET /rest/v1/abstractitems` - Search and filter requirements
- `GET /rest/v1/items/{id}` - Get detailed item information

## Implementation Details

### Architecture
- **JamaService**: Core service class handling API communication
- **JamaConnection**: React component for connection management
- **RequirementsViewer**: React component for browsing requirements
- **API Proxy Routes**: Next.js API routes that handle CORS and proxy requests to Jama
- **Type Definitions**: Complete TypeScript interfaces for all Jama API responses

### CORS Handling
The integration uses Next.js API routes (`/api/jama/token` and `/api/jama/proxy`) to proxy requests to the Jama API server-side, avoiding CORS restrictions that would occur with direct browser-to-Jama API calls.

### Error Handling
- Connection timeout handling
- Token expiry detection and alerts
- Detailed error messages with API response information
- Graceful degradation for network issues

### Performance Considerations
- Pagination support for large datasets
- Token caching and reuse
- Efficient filtering to minimize API calls
- Client-side data caching

## Usage Examples

### Connecting with OAuth
```typescript
const config: JamaConnectionConfig = {
    baseUrl: 'https://yourcompany.jamacloud.com',
    authType: 'oauth',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret'
};

const jamaService = new JamaService(config);
const tokenResponse = await jamaService.getOAuthToken(
    config.clientId, 
    config.clientSecret, 
    config.baseUrl
);
```

### Searching Requirements
```typescript
const filters: RequirementSearchFilters = {
    projectId: 123,
    contains: 'safety requirements',
    itemTypeId: 456,
    modifiedDate: ['2023-01-01T00:00:00.000Z', '2023-12-31T23:59:59.999Z']
};

const requirements = await jamaService.searchItems(filters);
```

## API Documentation References
- [Jama REST API Documentation](https://dev.jamasoftware.com/api/)
- [Jama API Cookbook](https://dev.jamasoftware.com/cookbook/)
- [Jama REST Client Examples](https://github.com/jamasoftware-ps/RestClient)
