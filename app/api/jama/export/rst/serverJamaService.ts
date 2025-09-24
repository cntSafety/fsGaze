/**
 * Server-side Jama API helper for use in API routes
 * Makes direct calls to Jama Connect API without going through proxy
 */

export interface ServerJamaConfig {
    baseUrl: string;
    accessToken?: string;
    username?: string;
    password?: string;
    authType: 'oauth' | 'basic';
}

export class ServerJamaService {
    private config: ServerJamaConfig;

    constructor(config: ServerJamaConfig) {
        this.config = config;
    }

    /**
     * Make direct API call to Jama Connect
     */
    private async makeApiCall(endpoint: string): Promise<Response> {
        const url = `${this.config.baseUrl.replace(/\/$/, '')}/rest/v1${endpoint}`;
        
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };

        // Add authentication
        if (this.config.authType === 'oauth' && this.config.accessToken) {
            headers['Authorization'] = `Bearer ${this.config.accessToken}`;
        } else if (this.config.authType === 'basic' && this.config.username && this.config.password) {
            headers['Authorization'] = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Jama API error for ${endpoint}:`, response.status, errorText);
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        return response;
    }

    /**
     * Get item by ID
     */
    async getItem(itemId: number): Promise<any> {
        const response = await this.makeApiCall(`/items/${itemId}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get item type by ID
     */
    async getItemType(itemTypeId: number): Promise<any> {
        const response = await this.makeApiCall(`/itemtypes/${itemTypeId}`);
        const data = await response.json();
        return data.data;
    }

    /**
     * Get children of an item
     */
    async getChildren(itemId: number): Promise<number[]> {
        const response = await this.makeApiCall(`/items/${itemId}/children`);
        const data = await response.json();
        return data.data?.map((item: any) => item.id) || [];
    }

    /**
     * Get upstream related items
     */
    async getUpstreamRelated(itemId: number): Promise<number[]> {
        const response = await this.makeApiCall(`/items/${itemId}/upstreamrelated`);
        const data = await response.json();
        return data.data?.map((item: any) => item.id) || [];
    }

    /**
     * Get downstream related items
     */
    async getDownstreamRelated(itemId: number): Promise<number[]> {
        const response = await this.makeApiCall(`/items/${itemId}/downstreamrelated`);
        const data = await response.json();
        return data.data?.map((item: any) => item.id) || [];
    }

    /**
     * Get picklist option
     */
    async getPicklistOption(picklistOptionId: number): Promise<any> {
        const response = await this.makeApiCall(`/picklistoptions/${picklistOptionId}`);
        const data = await response.json();
        return data.data;
    }
}