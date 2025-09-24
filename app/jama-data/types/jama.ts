// Type definitions for Jama Connect integration

export interface JamaConnectionConfig {
    baseUrl: string;
    authType: 'oauth' | 'basic';
    // OAuth fields
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    tokenExpiry?: number;
    // Basic auth fields  
    username?: string;
    password?: string;
}

export interface JamaTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    application_data?: {
        JAMA_CORE?: string;
    };
    tenant?: string;
    jti?: string;
}

export interface JamaProject {
    id: number;
    name: string;
    projectKey: string;
    description?: string;
    isFolder: boolean;
    createdDate: string;
    modifiedDate: string;
    fields?: Record<string, any>;
}

export interface JamaItem {
    id: number;
    documentKey: string;
    globalId: string;
    itemType: number;
    project: number;
    createdDate: string;
    modifiedDate: string;
    lastActivityDate: string;
    createdBy: number;
    modifiedBy: number;
    fields: {
        name: string;
        description?: string;
        [key: string]: any;
    };
    location?: {
        sortOrder: number;
        globalSortOrder: number;
        sequence: string;
        parent?: {
            item: number;
        };
    };
    lock?: {
        locked: boolean;
        lastLockedDate?: string;
    };
    type: string;
}

export interface JamaItemType {
    id: number;
    name: string;
    display: string;
    image?: string;
    color?: string;
    category: string;
    typeKey: string;
}

export interface JamaUser {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    active: boolean;
    licenseType: string;
}

export interface JamaApiResponse<T> {
    meta: {
        status: string;
        timestamp: string;
        pageInfo?: {
            startIndex: number;
            resultCount: number;
            totalResults: number;
        };
        location?: string;
        id?: number;
    };
    links?: Record<string, any>;
    data: T;
}

export interface RequirementSearchFilters {
    projectId?: number;
    itemTypeId?: number;
    contains?: string;
    createdDate?: [string, string?];
    modifiedDate?: [string, string?];
    lastActivityDate?: [string, string?];
    createdBy?: number;
    modifiedBy?: number;
}

export interface JamaConnectionError {
    message: string;
    statusCode?: number;
    details?: string;
}

export interface PaginationProgressCallback {
    (current: number, total: number, message: string): void;
}

export interface PaginatedRequestOptions {
    maxResults?: number;
    onProgress?: PaginationProgressCallback;
}
