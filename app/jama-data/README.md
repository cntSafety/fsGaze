# Jama Connect Integration

This module provides comprehensive integration with Jama Connect's REST API to retrieve and analyze requirements data. The integration features a global state management system with automatic token caching, refresh, and cross-application availability.

## Features

### Authentication
- **OAuth 2.0** (Recommended): Uses client credentials flow with automatic token refresh
- **Basic Authentication**: Username/password authentication (not recommended for SAML/SSO environments)
- **Token Caching**: Automatic token storage and reuse across application components
- **Auto-Refresh**: Proactive token refresh before expiry to maintain seamless connectivity

### Global Connection Management
- **Application-Wide Access**: Single connection available throughout the entire application
- **Persistent Storage**: Connection settings persisted across browser sessions (excluding sensitive data)
- **Real-Time Status**: Live connection status monitoring with visual indicators
- **Automatic Reconnection**: Attempts to restore connection on application startup
- **Cross-Component Access**: Any component can access Jama data without re-authentication

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

## Technical Implementation

### File Structure
```
app/
├── stores/
│   └── jamaStore.ts                 # Global Zustand store
├── services/
│   └── globalJamaService.ts        # Singleton service wrapper
├── components/
│   └── JamaConnectionProvider.tsx  # React context provider
├── jama-data/
│   ├── services/
│   │   └── jamaService.ts          # Core API service
│   ├── components/
│   │   ├── JamaConnection.tsx      # Unified connection & status component
│   │   └── RequirementsViewer.tsx  # Data display component
│   ├── types/
│   │   └── jama.ts                 # TypeScript definitions
│   └── README.md                   # This documentation
└── api/
    └── jama/
        ├── token/
        │   └── route.ts            # OAuth token endpoint
        └── proxy/
            └── route.ts            # API proxy endpoint
```

### State Flow
```
User Action → Provider → Store → Service → API → Response
     ↓           ↓        ↓        ↓       ↓        ↓
  Connect → useJamaConnection → JamaStore → GlobalJamaService → /api/jama/*
```

### Token Management Flow
```
1. User provides credentials
2. Provider validates and requests token
3. Store persists connection config (non-sensitive)
4. Background timer monitors token expiry
5. Auto-refresh triggered 5 minutes before expiry
6. All API calls ensure valid token before execution
7. Errors trigger appropriate user notifications
```

## API Endpoints Used

The integration uses the following Jama REST API endpoints:

- `POST /rest/oauth/token` - OAuth token exchange
- `GET /rest/v1/users/current` - Get current user info  
- `GET /rest/v1/projects` - Get available projects
- `GET /rest/v1/itemtypes` - Get item types for a project
- `GET /rest/v1/abstractitems` - Search and filter requirements
- `GET /rest/v1/items/{id}` - Get detailed item information

### CORS Handling
All API calls are proxied through Next.js API routes (`/api/jama/token` and `/api/jama/proxy`) to handle CORS restrictions and provide server-side request management.

## Requirements Management
- Enter item ID directly or browse projects
- Filter requirements by item type, dates, and content
- Search using Jama's Lucene-powered search engine
- View detailed requirement information with rich text support
- Export and integrate with other fsGaze features

## Architecture Overview

### State Management Architecture
The Jama integration uses a sophisticated state management architecture built on Zustand for global state management:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│  Any Component → useJamaConnection() → Global Jama Service  │
├─────────────────────────────────────────────────────────────┤
│                   Provider Layer                            │
│  JamaConnectionProvider (Context + Auto Token Management)   │
├─────────────────────────────────────────────────────────────┤
│                    Store Layer                              │
│     JamaStore (Zustand) - Global State + Persistence       │
├─────────────────────────────────────────────────────────────┤
│                   Service Layer                             │
│  GlobalJamaService (Singleton) ← JamaService (API Calls)   │
├─────────────────────────────────────────────────────────────┤
│                    API Layer                                │
│     Next.js API Routes (/api/jama/*) → Jama REST API       │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. JamaStore (`/stores/jamaStore.ts`)
- **Global State Management**: Centralized Zustand store for all Jama-related state
- **Token Lifecycle**: Handles token expiry detection, refresh scheduling, and validation
- **Persistence**: Automatically persists connection settings (excluding sensitive data) using localStorage
- **Auto-Recovery**: Attempts to restore connection on application restart

#### 2. GlobalJamaService (`/services/globalJamaService.ts`)
- **Singleton Pattern**: Single instance ensures consistent state across the application
- **Auto Token Management**: Automatically ensures valid tokens before API calls
- **Error Handling**: Centralized error handling with automatic retry logic
- **API Abstraction**: Simplified interface hiding complexity of token management

#### 3. JamaConnectionProvider (`/components/JamaConnectionProvider.tsx`)
- **React Context**: Provides connection state and methods to all child components
- **Auto Refresh**: Background token refresh 5 minutes before expiry
- **Notifications**: User-friendly notifications for connection events
- **Session Management**: Handles connection lifecycle and recovery

#### 4. Unified Connection Component
- **JamaConnection**: Single component handling connection, status display, and management
- **Multiple Variants**: 
  - `full`: Complete connection form and status (default)
  - `status`: Detailed status display only 
  - `compact`: Compact dropdown for navbar/header
- **Visual Indicators**: Color-coded status badges (Connected/Expired/Error)
- **Quick Actions**: Test connection, reconnect, and settings access

## Token Management

### OAuth Token Lifecycle
The system implements a comprehensive token management strategy:

1. **Initial Authentication**
   ```typescript
   // User provides credentials once
   const config = {
     baseUrl: 'https://company.jamacloud.com',
     authType: 'oauth',
     clientId: 'your-client-id',
     clientSecret: 'your-client-secret'
   };
   
   // System handles token exchange and storage
   await connect(config);
   ```

2. **Automatic Token Refresh**
   ```typescript
   // Background process monitors token expiry
   useEffect(() => {
     const interval = setInterval(async () => {
       if (isTokenExpiringSoon()) {
         await refreshToken(); // Automatic refresh
         showNotification('Token refreshed successfully');
       }
     }, 60000); // Check every minute
   }, []);
   ```

3. **Token Validation Before API Calls**
   ```typescript
   // Every API call ensures valid token
   async ensureValidToken(): Promise<void> {
     if (!isTokenValid() || isTokenExpiringSoon()) {
       await refreshToken();
     }
   }
   ```

### Security Considerations
- **No Sensitive Data Persistence**: Tokens and secrets are never persisted to localStorage
- **Memory-Only Storage**: Sensitive data stored only in memory during session
- **Auto-Expiry**: Tokens automatically invalidated on browser close
- **Secure Transmission**: All API calls proxied through Next.js server-side routes

### Connection State Persistence
```typescript
// Only non-sensitive data is persisted
const persistedData = {
  baseUrl: config.baseUrl,
  authType: config.authType,
  clientId: config.clientId, // Public identifier only
  // NO tokens, secrets, or passwords
};
```

## Integration Benefits

### For Developers
- **Zero Configuration**: Connect once, use everywhere in the application
- **Automatic Management**: No manual token refresh or expiry handling required
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Error Resilience**: Automatic error handling and recovery mechanisms
- **Development Experience**: Rich debugging information and clear error messages

### For Users
- **Single Sign-On Experience**: Connect once per session, access from any feature
- **Visual Feedback**: Clear status indicators showing connection health
- **Automatic Recovery**: Seamless reconnection after network issues
- **Secure by Default**: No sensitive data persisted to browser storage
- **Cross-Platform**: Works across all application features and pages

### For Organizations
- **Security Compliant**: Follows OAuth 2.0 best practices
- **Scalable Architecture**: Supports multiple concurrent users and sessions
- **Audit Trail**: Comprehensive logging of connection events and API usage
- **Performance Optimized**: Efficient token management reduces API calls
- **Enterprise Ready**: Supports both cloud and on-premises Jama deployments

## Migration Guide

### From Local Connection Management
If you have existing components using direct JamaService instances:

```typescript
// Before: Local connection management
function MyComponent() {
  const [jamaService, setJamaService] = useState<JamaService | null>(null);
  
  const connect = async (config) => {
    const service = new JamaService(config);
    await service.getOAuthToken(/* ... */);
    setJamaService(service);
  };
  
  return /* ... */;
}

// After: Global connection management
function MyComponent() {
  const { isConnected } = useJamaConnection();
  
  const loadData = async () => {
    // Service automatically handles connection and tokens
    const data = await globalJamaService.getProjects();
  };
  
  return /* ... */;
}
```

### Adding to Existing Components
1. Remove local JamaService instances
2. Replace with `useJamaConnection()` hook
3. Use `globalJamaService` for API calls
4. Remove manual token management code

## Error Handling

### Connection Errors
The system provides comprehensive error handling:

```typescript
// Automatic error categorization
interface ConnectionError {
  type: 'network' | 'auth' | 'token_expired' | 'server_error';
  message: string;
  canRetry: boolean;
  suggestedAction: string;
}
```

### Recovery Strategies
- **Network Issues**: Automatic retry with exponential backoff
- **Token Expiry**: Automatic refresh before expiry
- **Authentication Errors**: Clear user notification with reconnection steps
- **Server Errors**: Graceful degradation with fallback options

## Usage Examples

### 1. Application Setup
Add the provider to your application root:

```typescript
// app/layout.tsx
import { JamaConnectionProvider } from './components/JamaConnectionProvider';

export default function RootLayout({ children }) {
  return (
    <JamaConnectionProvider>
      {children}
    </JamaConnectionProvider>
  );
}
```

### 2. Using the Connection Hook
Access Jama connection from any component:

```typescript
import { useJamaConnection } from '@/app/components/JamaConnectionProvider';

function MyComponent() {
  const { 
    isConnected, 
    connectionConfig, 
    connect, 
    disconnect, 
    testConnection 
  } = useJamaConnection();

  const handleConnect = async () => {
    const config = {
      baseUrl: 'https://yourcompany.jamacloud.com',
      authType: 'oauth' as const,
      clientId: 'your-client-id',
      clientSecret: 'your-client-secret'
    };
    
    await connect(config);
  };

  return (
    <div>
      {isConnected ? (
        <p>Connected to: {connectionConfig?.baseUrl}</p>
      ) : (
        <button onClick={handleConnect}>Connect to Jama</button>
      )}
    </div>
  );
}
```

### 3. Using the Global Service
Access Jama APIs from anywhere in your application:

```typescript
import { globalJamaService } from '@/app/services/globalJamaService';

async function loadProjects() {
  try {
    // Service automatically handles token validation
    const projects = await globalJamaService.getProjects();
    console.log('Available projects:', projects);
    
    // Load requirements from a specific project
    const requirements = await globalJamaService.getItems(123, {
      contains: 'safety requirement',
      itemTypeId: 456
    });
    
    return requirements;
  } catch (error) {
    console.error('Failed to load data:', error);
    // Error handling with automatic retry/reconnect suggestions
  }
}
```

### 4. Connection Status Display
Show connection status in your UI:

```typescript
import JamaConnection from '@/app/jama-data/components/JamaConnection';

function NavigationBar() {
  return (
    <nav>
      <div>My App</div>
      {/* Compact status indicator with dropdown actions */}
      <JamaConnection variant="compact" />
    </nav>
  );
}

function SettingsPage() {
  return (
    <div>
      {/* Full status display with detailed information */}
      <JamaConnection 
        variant="status"
        onOpenConnectionModal={() => setModalOpen(true)}
      />
    </div>
  );
}
```

### 5. Monitoring Connection Health
```typescript
function useJamaHealth() {
  const { isConnected, isTokenValid, isTokenExpiringSoon } = useJamaConnection();
  
  const healthStatus = useMemo(() => {
    if (!isConnected) return 'disconnected';
    if (!isTokenValid) return 'token_expired';
    if (isTokenExpiringSoon) return 'token_expiring';
    return 'healthy';
  }, [isConnected, isTokenValid, isTokenExpiringSoon]);
  
  return { healthStatus };
}
```

## Troubleshooting

### Common Issues

#### "Connection Failed" Error
1. **Check Base URL**: Ensure the URL is correct and includes protocol (https://)
2. **Verify Credentials**: Confirm Client ID and Secret are correct
3. **Network Access**: Ensure your network allows access to the Jama instance
4. **CORS Issues**: Verify API routes are working (`/api/jama/token`, `/api/jama/proxy`)

#### "Token Expired" Messages
1. **Automatic Refresh**: Should happen automatically - check browser console for errors
2. **Clock Sync**: Ensure system clock is synchronized
3. **Manual Reconnect**: Use the "Test Connection" button or reconnect manually

#### "Connection Test Failed"
1. **API Permissions**: Ensure your API credentials have sufficient permissions
2. **Jama Instance**: Verify the Jama instance is accessible and running
3. **Firewall Rules**: Check if corporate firewall blocks API access

### Debug Information
Enable debug logging by opening browser console:

```javascript
// Enable detailed logging
localStorage.setItem('jama-debug', 'true');

// View current connection state
console.log(useJamaStore.getState());

// Test connection manually
globalJamaService.testConnection().then(console.log);
```

### Performance Tips
- **Connection Reuse**: Keep the same browser tab open to maintain connection
- **Batch Operations**: Group multiple API calls when possible
- **Error Recovery**: Allow automatic retry mechanisms to work
- **Regular Testing**: Use connection test feature periodically

## Best Practices

### Security
- **Never hardcode credentials** in source code
- **Use environment variables** for default configurations in development
- **Clear sensitive data** when users log out
- **Monitor token usage** and refresh patterns

### Development
- **Use TypeScript types** provided by the integration
- **Handle loading states** appropriately in UI components  
- **Implement error boundaries** for connection-related errors
- **Test offline scenarios** and connection recovery

### Production
- **Monitor connection health** with status indicators
- **Provide clear user feedback** for connection issues
- **Implement analytics** for connection success rates
- **Document API usage** for compliance and auditing

## API Documentation References
- [Jama REST API Documentation](https://dev.jamasoftware.com/api/)
- [Jama API Cookbook](https://dev.jamasoftware.com/cookbook/)
- [Jama REST Client Examples](https://github.com/jamasoftware-ps/RestClient)
- [OAuth 2.0 Specification](https://tools.ietf.org/html/rfc6749)
