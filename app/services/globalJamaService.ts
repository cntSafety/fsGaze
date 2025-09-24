import { useJamaStore } from '../stores/jamaStore';
import { JamaService as BaseJamaService } from '../jama-data/services/jamaService';
import { 
    JamaConnectionConfig, 
    JamaProject, 
    JamaItem, 
    JamaItemType,
    RequirementSearchFilters,
    PaginatedRequestOptions
} from '../jama-data/types/jama';

/**
 * Enhanced Jama Service that integrates with the global store
 * and handles automatic token management
 */
export class GlobalJamaService {
    private static instance: GlobalJamaService;
    private cachedJamaService: BaseJamaService | null = null;
    private lastConnectionCheck: number = 0;
    private CONNECTION_CACHE_DURATION = 30000; // 30 seconds
    
    private constructor() {}
    
    public static getInstance(): GlobalJamaService {
        if (!GlobalJamaService.instance) {
            GlobalJamaService.instance = new GlobalJamaService();
        }
        return GlobalJamaService.instance;
    }

    /**
     * Get the current Jama service instance from the store
     */
    private getJamaService(): BaseJamaService {
        const jamaService = useJamaStore.getState().getJamaService();
        if (!jamaService) {
            throw new Error('No active Jama connection. Please connect first.');
        }
        return jamaService;
    }

    /**
     * Ensure we have a valid token before making API calls with caching
     */
    private async ensureValidConnection(): Promise<BaseJamaService> {
        const now = Date.now();
        
        // If we have a cached service and it's within the cache duration, use it
        if (this.cachedJamaService && (now - this.lastConnectionCheck) < this.CONNECTION_CACHE_DURATION) {
            // Quick check if connection is still valid
            if (useJamaStore.getState().isConnected) {
                return this.cachedJamaService;
            }
        }
        
        // Need to ensure valid connection
        await useJamaStore.getState().ensureValidToken();
        this.cachedJamaService = this.getJamaService();
        this.lastConnectionCheck = now;
        
        return this.cachedJamaService;
    }

    /**
     * Clear the cached connection (useful when disconnecting)
     */
    private clearConnectionCache(): void {
        this.cachedJamaService = null;
        this.lastConnectionCheck = 0;
    }

    /**
     * Check if we're currently connected
     */
    isConnected(): boolean {
        return useJamaStore.getState().isConnected;
    }

    /**
     * Get current connection configuration
     */
    getConnectionConfig(): JamaConnectionConfig | null {
        return useJamaStore.getState().connectionConfig;
    }

    /**
     * Test connection using store
     */
    async testConnection(): Promise<boolean> {
        return useJamaStore.getState().testConnection();
    }

    /**
     * Get current user information
     */
    async getCurrentUser(): Promise<any> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getCurrentUser();
    }

    /**
     * Get all projects
     */
    async getProjects(): Promise<JamaProject[]> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getProjects();
    }

    /**
     * Get items from a project with optional filtering
     */
    async getItems(projectId: number, filters?: RequirementSearchFilters, options?: PaginatedRequestOptions): Promise<JamaItem[]> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getItems(projectId, filters, options);
    }

    /**
     * Get item types for a project
     */
    async getItemTypes(projectId: number): Promise<JamaItemType[]> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getItemTypes(projectId);
    }

    /**
     * Get specific item by ID
     */
    async getItem(itemId: number): Promise<JamaItem> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getItem(itemId);
    }

    /**
     * Get picklist option by ID
     */
    async getPicklistOption(optionId: number): Promise<any> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getPicklistOption(optionId);
    }

    /**
     * Get item type by ID
     */
    async getItemType(itemTypeId: number): Promise<any> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getItemType(itemTypeId);
    }

    /**
     * Search items using abstract items endpoint
     */
    async searchItems(filters: RequirementSearchFilters): Promise<JamaItem[]> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.searchItems(filters);
    }

    /**
     * Get upstream related items for a given item ID
     */
    async getUpstreamRelated(itemId: number, options?: PaginatedRequestOptions): Promise<number[]> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getUpstreamRelated(itemId, options);
    }

    /**
     * Get downstream related items for a given item ID
     */
    async getDownstreamRelated(itemId: number, options?: PaginatedRequestOptions): Promise<number[]> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getDownstreamRelated(itemId, options);
    }

    /**
     * Get children items for a given item ID
     */
    async getChildren(itemId: number, options?: PaginatedRequestOptions): Promise<number[]> {
        const jamaService = await this.ensureValidConnection();
        return jamaService.getChildren(itemId, options);
    }

    /**
     * Get multiple items efficiently with a single connection check
     */
    async getMultipleItems(itemIds: number[]): Promise<JamaItem[]> {
        if (itemIds.length === 0) return [];
        
        const jamaService = await this.ensureValidConnection();
        const results: JamaItem[] = [];
        
        // Process items in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < itemIds.length; i += batchSize) {
            const batch = itemIds.slice(i, i + batchSize);
            const batchPromises = batch.map(id => jamaService.getItem(id));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        
        return results;
    }

    /**
     * Disconnect from Jama
     */
    disconnect(): void {
        this.clearConnectionCache();
        useJamaStore.getState().disconnect();
    }

    /**
     * Get connection status information
     */
    getConnectionStatus(): {
        isConnected: boolean;
        isConnecting: boolean;
        connectionError: string | null;
        isTokenValid: boolean;
        isTokenExpiringSoon: boolean;
        lastConnectionTest: number | null;
    } {
        const state = useJamaStore.getState();
        return {
            isConnected: state.isConnected,
            isConnecting: state.isConnecting,
            connectionError: state.connectionError,
            isTokenValid: state.isTokenValid(),
            isTokenExpiringSoon: state.isTokenExpiringSoon(),
            lastConnectionTest: state.lastConnectionTest,
        };
    }
}

// Export singleton instance
export const globalJamaService = GlobalJamaService.getInstance();
