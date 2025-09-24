import { 
    JamaConnectionConfig, 
    JamaTokenResponse, 
    JamaProject, 
    JamaItem, 
    JamaItemType, 
    JamaApiResponse,
    JamaConnectionError,
    RequirementSearchFilters,
    PaginatedRequestOptions,
    PaginationProgressCallback
} from '../types/jama';

export class JamaService {
    private config: JamaConnectionConfig;

    constructor(config: JamaConnectionConfig) {
        this.config = config;
    }

    /**
     * Exchange client credentials for OAuth access token
     */
    async getOAuthToken(clientId: string, clientSecret: string, baseUrl: string): Promise<JamaTokenResponse> {
        try {
            const response = await fetch('/api/jama/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    baseUrl: baseUrl.replace(/\/$/, ''),
                    clientId,
                    clientSecret,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const tokenData = await response.json() as JamaTokenResponse;
            
            // Store token in config
            this.config.accessToken = tokenData.access_token;
            this.config.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
            
            return tokenData;
        } catch (error) {
            console.error('OAuth token request failed:', error);
            throw error;
        }
    }

    /**
     * Test connection to Jama instance
     */
    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeApiCall('/users/current');
            return response.ok;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Get current user information
     */
    async getCurrentUser(): Promise<any> {
        const response = await this.makeApiCall('/users/current');
        const data = await response.json();
        return data.data;
    }

    /**
     * Get all projects
     */
    async getProjects(): Promise<JamaProject[]> {
        const response = await this.makeApiCall('/projects');
        const data = await response.json() as JamaApiResponse<JamaProject[]>;
        console.log('Fetched projects:', data.data);
        return data.data;
    }

    /**
     * Get items from a project with optional filtering
     */
    async getItems(projectId: number, filters?: RequirementSearchFilters, options?: PaginatedRequestOptions): Promise<JamaItem[]> {
        let url = `/abstractitems?project=${projectId}`;
        
        if (filters) {
            if (filters.itemTypeId) url += `&itemType=${filters.itemTypeId}`;
            if (filters.contains) url += `&contains=${encodeURIComponent(filters.contains)}`;
            if (filters.createdDate) {
                url += `&createdDate=${filters.createdDate[0]}`;
                if (filters.createdDate[1]) url += `&createdDate=${filters.createdDate[1]}`;
            }
            if (filters.modifiedDate) {
                url += `&modifiedDate=${filters.modifiedDate[0]}`;
                if (filters.modifiedDate[1]) url += `&modifiedDate=${filters.modifiedDate[1]}`;
            }
            if (filters.lastActivityDate) {
                url += `&lastActivityDate=${filters.lastActivityDate[0]}`;
                if (filters.lastActivityDate[1]) url += `&lastActivityDate=${filters.lastActivityDate[1]}`;
            }
        }

        return this.makePaginatedApiCall<JamaItem>(url, options);
    }

    /**
     * Get item types for a project
     */
    async getItemTypes(projectId: number): Promise<JamaItemType[]> {
        const url = `/projects/${projectId}/itemtypes`;
        
        const response = await this.makeApiCall(url);
        const data = await response.json() as JamaApiResponse<JamaItemType[]>;
        return data.data;
    }

    /**
     * Get specific item by ID
     */
    async getItem(itemId: number): Promise<JamaItem> {
        const response = await this.makeApiCall(`/items/${itemId}`);
        const data = await response.json() as JamaApiResponse<JamaItem>;
        return data.data;
    }

    /**
     * Get picklist option by ID
     */
    async getPicklistOption(optionId: number): Promise<any> {
        const response = await this.makeApiCall(`/picklistoptions/${optionId}`);
        const data = await response.json() as JamaApiResponse<any>;
        return data.data;
    }

    /**
     * Get item type by ID
     */
    async getItemType(itemTypeId: number): Promise<any> {
        const response = await this.makeApiCall(`/itemtypes/${itemTypeId}`);
        const data = await response.json() as JamaApiResponse<any>;
        return data.data;
    }

    /**
     * Search items using abstract items endpoint
     */
    async searchItems(filters: RequirementSearchFilters): Promise<JamaItem[]> {
        let url = '/abstractitems?';
        const params: string[] = [];

        if (filters.projectId) params.push(`project=${filters.projectId}`);
        if (filters.itemTypeId) params.push(`itemType=${filters.itemTypeId}`);
        if (filters.contains) params.push(`contains=${encodeURIComponent(filters.contains)}`);
        
        url += params.join('&');

        const response = await this.makeApiCall(url);
        const data = await response.json() as JamaApiResponse<JamaItem[]>;
        return data.data;
    }

    /**
     * Get upstream related items for a given item ID
     */
    async getUpstreamRelated(itemId: number, options?: PaginatedRequestOptions): Promise<number[]> {
        const items = await this.makePaginatedApiCall<JamaItem>(`/items/${itemId}/upstreamrelated`, options);
        return items.map(item => item.id);
    }

    /**
     * Get downstream related items for a given item ID
     */
    async getDownstreamRelated(itemId: number, options?: PaginatedRequestOptions): Promise<number[]> {
        const items = await this.makePaginatedApiCall<JamaItem>(`/items/${itemId}/downstreamrelated`, options);
        return items.map(item => item.id);
    }

    /**
     * Get children items for a given item ID
     */
    async getChildren(itemId: number, options?: PaginatedRequestOptions): Promise<number[]> {
        const items = await this.makePaginatedApiCall<JamaItem>(`/items/${itemId}/children`, options);
        return items.map(item => item.id);
    }

    /**
     * Make paginated API call to handle large result sets
     */
    private async makePaginatedApiCall<T>(
        endpoint: string,
        options: PaginatedRequestOptions = {}
    ): Promise<T[]> {
        const { maxResults = 20, onProgress } = options;
        const results: T[] = [];
        let startIndex = 0;
        let totalResults = 0;

        do {
            // Add pagination parameters to endpoint
            const separator = endpoint.includes('?') ? '&' : '?';
            const paginatedEndpoint = `${endpoint}${separator}startAt=${startIndex}&maxResults=${maxResults}`;
            
            if (onProgress && totalResults > 0) {
                onProgress(
                    Math.min(results.length, totalResults),
                    totalResults,
                    `Loading items ${startIndex + 1}-${Math.min(startIndex + maxResults, totalResults)}...`
                );
            }

            const response = await this.makeApiCall(paginatedEndpoint);
            const data = await response.json() as JamaApiResponse<T[]>;

            // Update total results from first response
            if (startIndex === 0 && data.meta.pageInfo) {
                totalResults = data.meta.pageInfo.totalResults;
                if (onProgress) {
                    onProgress(0, totalResults, `Found ${totalResults} total items. Loading...`);
                }
            }

            results.push(...data.data);

            // Check if we have more pages
            if (!data.meta.pageInfo || 
                data.meta.pageInfo.resultCount < maxResults || 
                results.length >= totalResults) {
                break;
            }

            startIndex += maxResults;
        } while (true);

        if (onProgress && totalResults > 0) {
            onProgress(results.length, totalResults, `Completed loading ${results.length} items`);
        }

        return results;
    }

    /**
     * Make authenticated API call to Jama
     */
    private async makeApiCall(endpoint: string): Promise<Response> {
        try {
            const response = await fetch('/api/jama/proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    baseUrl: this.config.baseUrl.replace(/\/$/, ''),
                    endpoint: `/rest/v1${endpoint}`,
                    method: 'GET',
                    authToken: this.config.authType === 'oauth' ? this.config.accessToken : undefined,
                    headers: this.config.authType === 'basic' && this.config.username && this.config.password 
                        ? { 'Authorization': `Basic ${btoa(`${this.config.username}:${this.config.password}`)}` }
                        : {}
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                
                // Check for token expiry
                if (response.status === 401 && this.config.authType === 'oauth') {
                    throw new Error('OAuth token has expired. Please re-authenticate.');
                }
                
                const error: JamaConnectionError = {
                    message: errorData.error || `API call failed: ${response.status} ${response.statusText}`,
                    statusCode: response.status,
                    details: errorData.details || 'Unknown error'
                };
                throw error;
            }

            // Create a new Response object that wraps the proxy response data
            // This allows the existing response.json() calls to work correctly
            const responseData = await response.json();
            return new Response(JSON.stringify(responseData), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    /**
     * Update connection config
     */
    updateConfig(config: JamaConnectionConfig) {
        this.config = config;
    }

    /**
     * Get current config
     */
    getConfig(): JamaConnectionConfig {
        return this.config;
    }

    /**
     * Check if token needs refresh (within 5 minutes of expiry)
     */
    needsTokenRefresh(): boolean {
        if (this.config.authType !== 'oauth' || !this.config.tokenExpiry) {
            return false;
        }
        
        const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
        return fiveMinutesFromNow >= this.config.tokenExpiry;
    }
}
