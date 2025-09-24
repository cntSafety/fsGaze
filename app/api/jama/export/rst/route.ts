import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { ServerJamaService, ServerJamaConfig } from './serverJamaService';
import { addProgressMessage } from './progress/route';

// Progress Logger that works with both SSE and console
class ProgressLogger {
    private exportId?: string;

    constructor(exportId?: string) {
        this.exportId = exportId;
    }

    log(message: string) {
        console.log(message);
        if (this.exportId) {
            addProgressMessage(this.exportId, message);
        }
    }
}

// Batch processing functions for performance optimization

// Batch load multiple items in parallel
async function batchLoadItems(itemIds: number[], jamaService: ServerJamaService, logger: ProgressLogger, batchSize: number = 10): Promise<Map<number, any>> {
    logger.log(`[BATCH] Loading ${itemIds.length} items in batches of ${batchSize}...`);
    const itemMap = new Map<number, any>();
    
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        logger.log(`[BATCH] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(itemIds.length/batchSize)} (${batch.length} items)`);
        
        // Load all items in this batch in parallel
        const batchPromises = batch.map(async (itemId) => {
            try {
                const item = await jamaService.getItem(itemId);
                return { itemId, item };
            } catch (error) {
                logger.log(`[BATCH] Failed to load item ${itemId}: ${error}`);
                return { itemId, item: null };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(({ itemId, item }) => {
            if (item) itemMap.set(itemId, item);
        });
    }
    
    logger.log(`[BATCH] Successfully loaded ${itemMap.size}/${itemIds.length} items`);
    return itemMap;
}

// Batch load children for multiple items
async function batchLoadChildren(itemIds: number[], jamaService: ServerJamaService, logger: ProgressLogger, batchSize: number = 10): Promise<Map<number, number[]>> {
    logger.log(`[BATCH] Loading children for ${itemIds.length} items...`);
    const childrenMap = new Map<number, number[]>();
    
    for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (itemId) => {
            try {
                const children = await jamaService.getChildren(itemId);
                return { itemId, children };
            } catch (error) {
                logger.log(`[BATCH] Failed to load children for ${itemId}: ${error}`);
                return { itemId, children: [] };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(({ itemId, children }) => {
            childrenMap.set(itemId, children);
        });
    }
    
    return childrenMap;
}

// Batch load relationships for multiple items
async function batchLoadRelationships(itemIds: number[], jamaService: ServerJamaService, logger: ProgressLogger, batchSize: number = 10): Promise<Map<number, { upstream: number[], downstream: number[] }>> {
    logger.log(`[BATCH] Loading relationships for ${itemIds.length} items...`);
    const relationshipsMap = new Map<number, { upstream: number[], downstream: number[] }>();
    
    for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (itemId) => {
            try {
                const [upstream, downstream] = await Promise.all([
                    jamaService.getUpstreamRelated(itemId).catch(() => []),
                    jamaService.getDownstreamRelated(itemId).catch(() => [])
                ]);
                return { itemId, upstream, downstream };
            } catch (error) {
                logger.log(`[BATCH] Failed to load relationships for ${itemId}: ${error}`);
                return { itemId, upstream: [], downstream: [] };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(({ itemId, upstream, downstream }) => {
            relationshipsMap.set(itemId, { upstream, downstream });
        });
    }
    
    return relationshipsMap;
}

// Utility function to strip HTML tags and convert to plain text
const stripHtmlTags = (html: string): string => {
    if (!html) return '';
    
    // Remove HTML tags
    const stripped = html.replace(/<[^>]*>/g, '');
    
    // Decode common HTML entities
    const decoded = stripped
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    
    // Clean up extra whitespace
    return decoded.replace(/\s+/g, ' ').trim();
};

// Extract ASIL information from item fields
const extractAsilFromFields = (fields: any, itemType: number) => {
    // Look for asil field with the format asil$itemType
    const asilFieldName = `asil$${itemType}`;
    
    if (fields[asilFieldName]) {
        return {
            field: asilFieldName,
            value: fields[asilFieldName]
        };
    }
    
    return null;
};

// Optimized version of generateRstContent that uses pre-loaded data
async function generateRstContentOptimized(
    itemId: number,
    itemData: {
        item: any,
        children: number[],
        relationships: { upstream: number[], downstream: number[] },
        childItems?: Map<number, any>,
        childrenMap?: Map<number, number[]>
    },
    indent: string,
    caches: {
        itemTypeCache: Map<number, any>,
        picklistCache: Map<number, any>
    },
    jamaService: ServerJamaService,
    logger?: ProgressLogger
): Promise<string> {
    try {
        console.log(`[RST CONTENT] Generating optimized content for item ${itemId}...`);
        
        const { item, children, relationships } = itemData;
        const { itemTypeCache, picklistCache } = caches;
        
        // Get item type (with caching)
        let itemTypeInfo;
        if (itemTypeCache.has(item.itemType)) {
            itemTypeInfo = itemTypeCache.get(item.itemType);
        } else {
            try {
                itemTypeInfo = await jamaService.getItemType(item.itemType);
                itemTypeCache.set(item.itemType, itemTypeInfo);
            } catch (error) {
                itemTypeInfo = { id: item.itemType, display: `Type ${item.itemType}` };
            }
        }
        
        // Extract ASIL information with caching
        const asilData = extractAsilFromFields(item.fields, item.itemType);
        let asilInfo = null;
        if (asilData?.value) {
            if (picklistCache.has(asilData.value)) {
                const cachedOption = picklistCache.get(asilData.value);
                asilInfo = { optionName: cachedOption.name };
            } else {
                try {
                    const picklistOption = await jamaService.getPicklistOption(asilData.value);
                    picklistCache.set(asilData.value, picklistOption);
                    asilInfo = { optionName: picklistOption.name };
                } catch (error) {
                    asilInfo = { optionName: 'Unknown' };
                }
            }
        }
        
        const hasChildren = children.length > 0;
        const exportTitle = item.fields.name || 'Unnamed item';
        let content = `${exportTitle}\n${'='.repeat(exportTitle.length)}\n\n`;
        
        if (hasChildren) {
            // Generate folder block
            content += `.. sub:: ${item.fields.name || 'Unnamed Folder'}\n`;
            content += `   :id: ${item.id}\n`;
            content += `   :itemtype: ${itemTypeInfo?.display}\n`;
            content += `   :collapse: false\n\n`;
            
            // Add folder description
            if (item.fields.description) {
                content += `   ${stripHtmlTags(item.fields.description)}\n\n`;
            } else {
                content += `   This item contains the following child items:\n\n`;
            }
            
            // Process child items (use pre-loaded data if available)
            if (itemData.childItems) {
                console.log(`[RST CONTENT] Processing ${children.length} pre-loaded child items...`);
                
                for (const childId of children) {
                    const childItem = itemData.childItems.get(childId);
                    if (!childItem) {
                        console.warn(`[RST CONTENT] Child item ${childId} not found in pre-loaded data`);
                        continue;
                    }
                    
                    // Get child item type (with caching)
                    let childItemType;
                    if (itemTypeCache.has(childItem.itemType)) {
                        childItemType = itemTypeCache.get(childItem.itemType);
                    } else {
                        try {
                            childItemType = await jamaService.getItemType(childItem.itemType);
                            itemTypeCache.set(childItem.itemType, childItemType);
                        } catch (error) {
                            childItemType = { id: childItem.itemType, display: `Type ${childItem.itemType}` };
                        }
                    }
                    
                    // Check if child has children (use pre-loaded data if available)
                    const childHasChildren = itemData.childrenMap ? 
                        (itemData.childrenMap.get(childId)?.length || 0) > 0 : false;
                    
                    // Get child ASIL info with caching
                    const childAsilData = extractAsilFromFields(childItem.fields, childItem.itemType);
                    let childAsilInfo = null;
                    if (childAsilData?.value) {
                        if (picklistCache.has(childAsilData.value)) {
                            const cachedOption = picklistCache.get(childAsilData.value);
                            childAsilInfo = { optionName: cachedOption.name };
                        } else {
                            try {
                                const picklistOption = await jamaService.getPicklistOption(childAsilData.value);
                                picklistCache.set(childAsilData.value, picklistOption);
                                childAsilInfo = { optionName: picklistOption.name };
                            } catch {
                                childAsilInfo = { optionName: 'Unknown' };
                            }
                        }
                    }
                    
                    // Use appropriate directive
                    if (childHasChildren) {
                        content += `   .. sub:: ${childItem.fields.name || 'Unnamed Folder'}\n`;
                    } else {
                        content += `   .. item:: ${childItem.fields.name || 'Unnamed Requirement'}\n`;
                    }
                    content += `      :id: ${childItem.id}\n`;
                    
                    if (childItem.fields.statuscrnd) {
                        content += `      :status: ${childItem.fields.statuscrnd}\n`;
                    }
                    
                    if (childAsilInfo) {
                        content += `      :asil: ${childAsilInfo.optionName}\n`;
                    }
                    
                    if (childItemType) {
                        content += `      :itemtype: ${childItemType.display}\n`;
                    }
                    
                    content += `      :collapse: false\n\n`;
                    
                    if (childItem.fields.description) {
                        content += `      ${stripHtmlTags(childItem.fields.description)}\n\n`;
                    } else {
                        content += `      No description available.\n\n`;
                    }
                }
            }
        } else {
            // Generate regular requirement block
            content += `.. item:: ${item.fields.name || 'Unnamed Requirement'}\n`;
            content += `   :id: ${item.id}\n`;
            
            if (item.fields.statuscrnd) {
                content += `   :status: ${item.fields.statuscrnd}\n`;
            }
            
            if (asilInfo) {
                content += `   :asil: ${asilInfo.optionName}\n`;
            }
            
            if (itemTypeInfo) {
                content += `   :itemtype: ${itemTypeInfo.display}\n`;
            }
            
            const allLinks = [...relationships.upstream, ...relationships.downstream];
            if (allLinks.length > 0) {
                content += `   :related: ${allLinks.join(', ')}\n`;
            }
            
            content += `   :collapse: true\n\n`;
            
            if (item.fields.description) {
                content += `   ${stripHtmlTags(item.fields.description)}\n\n`;
            } else {
                content += `   No description available.\n\n`;
            }
        }
        
        // Add needflow diagram
        content += `.. needflow::\n`;
        content += `   :filter: id == "${item.id}" or parent_need == "${item.id}"\n`;
        content += `   :link_types: links, related\n`;
        content += `   :show_link_names:\n`;
        content += `   :config: lefttoright\n`;
        
        console.log(`[RST CONTENT] Optimized content generation completed for item ${itemId}`);
        return content;
    } catch (error) {
        console.error(`[RST CONTENT] Error generating optimized content for item ${itemId}:`, error);
        return `Error generating RST content for item ${itemId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

// Generate single layer RST content
async function generateRstContent(
    itemId: number,
    itemType: string,
    indent: string,
    jamaService: ServerJamaService
): Promise<string> {
    try {
        console.log(`[RST CONTENT] Generating content for item ${itemId}...`);
        // Fetch the main item
        const item = await jamaService.getItem(itemId);
        const children = await jamaService.getChildren(itemId);
        const itemTypeInfo = await jamaService.getItemType(item.itemType);
        
        console.log(`[RST CONTENT] Item ${itemId} has ${children.length} direct children`);
        
        // Get upstream and downstream relationships
        let upstreamRelated: any[] = [];
        let downstreamRelated: any[] = [];
        try {
            upstreamRelated = await jamaService.getUpstreamRelated(itemId);
            downstreamRelated = await jamaService.getDownstreamRelated(itemId);
        } catch (error) {
            console.error(`Error loading relationships for item ${itemId}:`, error);
        }
        
        // Extract ASIL information
        const asilData = extractAsilFromFields(item.fields, item.itemType);
        let asilInfo = null;
        if (asilData?.value) {
            try {
                asilInfo = await jamaService.getPicklistOption(asilData.value);
            } catch (error) {
                console.error(`Error loading picklist option for ASIL:`, error);
            }
        }
        
        const hasChildren = children.length > 0;
        const exportTitle = item.fields.name || 'Unnamed item';
        let content = `${exportTitle}\n${'='.repeat(exportTitle.length)}\n\n`;
        
        if (hasChildren) {
            // Generate folder block
            content += `.. sub:: ${item.fields.name || 'Unnamed Folder'}\n`;
            content += `   :id: ${item.id}\n`;
            content += `   :itemtype: ${itemTypeInfo?.display}\n`;
            content += `   :collapse: false\n\n`;
            
            // Add folder description
            if (item.fields.description) {
                content += `   ${stripHtmlTags(item.fields.description)}\n\n`;
            } else {
                content += `   This item contains the following child items:\n\n`;
            }
            
            // Add children as nested requirements
            if (children.length > 0) {
                try {
                    console.log(`[RST CONTENT] Loading ${children.length} child items for item ${itemId}...`);
                    // Load all child items individually
                    const childItems = [];
                    for (let i = 0; i < children.length; i++) {
                        const childId = children[i];
                        try {
                            console.log(`[RST CONTENT] Loading child ${i + 1}/${children.length}: ${childId}`);
                            const childItem = await jamaService.getItem(childId);
                            childItems.push(childItem);
                        } catch (error) {
                            console.error(`[RST CONTENT] Failed to load child item ${childId}:`, error);
                            // Add error placeholder
                            childItems.push({
                                id: childId,
                                fields: { name: 'Failed to load' },
                                itemType: 0,
                                error: true
                            });
                        }
                    }
                    
                    console.log(`[RST CONTENT] Processing ${childItems.length} child items...`);
                    // Cache for item types and picklist options to avoid repeated API calls
                    const itemTypeCache = new Map<number, any>();
                    const picklistCache = new Map<number, any>();
                
                // Process each child item
                for (let i = 0; i < childItems.length; i++) {
                    const childItem = childItems[i];
                    console.log(`[RST CONTENT] Processing child ${i + 1}/${childItems.length}: ${childItem.id}`);
                    
                    if (childItem.error) {
                        content += `   .. item:: Failed to load requirement\n`;
                        content += `      :id: ${childItem.id}\n`;
                        content += `      :collapse: false\n\n`;
                        content += `      Error loading requirement data.\n\n`;
                        continue;
                    }
                    
                    try {
                        // Get child item type (with caching)
                        let childItemType;
                        if (itemTypeCache.has(childItem.itemType)) {
                            childItemType = itemTypeCache.get(childItem.itemType);
                        } else {
                            try {
                                childItemType = await jamaService.getItemType(childItem.itemType);
                                itemTypeCache.set(childItem.itemType, childItemType);
                            } catch (error) {
                                console.error(`Failed to load item type ${childItem.itemType}:`, error);
                                childItemType = { id: childItem.itemType, display: `Type ${childItem.itemType}` };
                            }
                        }
                        
                        // Check if this child has children by querying for them
                        let childHasChildren = false;
                        try {
                            const childChildren = await jamaService.getChildren(childItem.id);
                            childHasChildren = childChildren.length > 0;
                        } catch (error) {
                            console.error(`Failed to get children for ${childItem.id}:`, error);
                        }
                        
                        // Get child's upstream/downstream relations
                        let childUpstream: number[] = [];
                        let childDownstream: number[] = [];
                        try {
                            childUpstream = await jamaService.getUpstreamRelated(childItem.id);
                            childDownstream = await jamaService.getDownstreamRelated(childItem.id);
                        } catch (error) {
                            console.error(`Failed to get relationships for ${childItem.id}:`, error);
                        }
                        
                        // Get child's ASIL info (with caching)
                        const childAsilData = extractAsilFromFields(childItem.fields, childItem.itemType);
                        let childAsilInfo = null;
                        if (childAsilData) {
                            if (picklistCache.has(childAsilData.value)) {
                                const cachedOption = picklistCache.get(childAsilData.value);
                                childAsilInfo = { optionName: cachedOption.name };
                            } else {
                                try {
                                    const picklistOption = await jamaService.getPicklistOption(childAsilData.value);
                                    picklistCache.set(childAsilData.value, picklistOption);
                                    childAsilInfo = { optionName: picklistOption.name };
                                } catch {
                                    childAsilInfo = { optionName: 'Unknown' };
                                }
                            }
                        }
                        
                        // Use appropriate directive based on whether child has children
                        if (childHasChildren) {
                            content += `   .. sub:: ${childItem.fields.name || 'Unnamed Folder'}\n`;
                        } else {
                            content += `   .. item:: ${childItem.fields.name || 'Unnamed Requirement'}\n`;
                        }
                        content += `      :id: ${childItem.id}\n`;
                        
                        if (childItem.fields.statuscrnd) {
                            content += `      :status: ${childItem.fields.statuscrnd}\n`;
                        }
                        
                        if (childAsilInfo) {
                            content += `      :asil: ${childAsilInfo.optionName}\n`;
                        }
                        
                        if (childItemType) {
                            content += `      :itemtype: ${childItemType.display}\n`;
                        }
                        
                        const childAllLinks = [...childUpstream, ...childDownstream];
                        if (childAllLinks.length > 0) {
                            content += `      :related: ${childAllLinks.join(', ')}\n`;
                        }
                        
                        content += `      :collapse: false\n\n`;
                        
                        if (childItem.fields.description) {
                            content += `      ${stripHtmlTags(childItem.fields.description)}\n\n`;
                        } else {
                            content += `      No description available.\n\n`;
                        }
                    } catch (error) {
                        console.error(`Failed to load child item ${childItem.id}:`, error);
                        content += `   .. item:: Failed to load requirement\n`;
                        content += `      :id: ${childItem.id}\n`;
                        content += `      :collapse: false\n\n`;
                        content += `      Error loading requirement data.\n\n`;
                    }
                }
            } catch (error) {
                console.error('Failed to load child items:', error);
                content += `   Error loading child items.\n\n`;
            }
        }
    } else {
        // Generate regular requirement block
        content += `.. item:: ${item.fields.name || 'Unnamed Requirement'}\n`;
        content += `   :id: ${item.id}\n`;
        
        if (item.fields.statuscrnd) {
            content += `   :status: ${item.fields.statuscrnd}\n`;
        }
        
        if (asilInfo) {
            content += `   :asil: ${asilInfo.optionName}\n`;
        }
        
        if (itemTypeInfo) {
            content += `   :itemtype: ${itemTypeInfo.display}\n`;
        }
        
        const allLinks = [...upstreamRelated, ...downstreamRelated];
        if (allLinks.length > 0) {
            content += `   :related: ${allLinks.join(', ')}\n`;
        }
        
        content += `   :collapse: true\n\n`;
        
        if (item.fields.description) {
            content += `   ${stripHtmlTags(item.fields.description)}\n\n`;
        } else {
            content += `   No description available.\n\n`;
        }
    }
    
    // Add needflow diagram at the end
    content += `.. needflow::\n`;
    content += `   :filter: id == "${item.id}" or parent_need == "${item.id}"\n`;
    content += `   :link_types: links, related\n`;
    content += `   :show_link_names:\n`;
    content += `   :config: lefttoright\n`;
    
    console.log(`[RST CONTENT] Content generation completed for item ${itemId}`);
    return content;
    } catch (error) {
        console.error(`Error generating RST content for item ${itemId}:`, error);
        return `Error generating RST content for item ${itemId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        const useSSE = url.searchParams.get('sse') === 'true';
        
        const body = await request.json();
        const { 
            item,
            itemTypeInfo,
            asilInfo,
            upstreamRelated,
            downstreamRelated,
            children,
            exportType = 'single',
            connectionConfig // Add connection config to request
        } = body;

        if (!item) {
            return NextResponse.json(
                { success: false, message: 'Item data is required' },
                { status: 400 }
            );
        }

        if (!connectionConfig) {
            return NextResponse.json(
                { success: false, message: 'Connection configuration is required' },
                { status: 400 }
            );
        }

        console.log(`[RST EXPORT] Starting ${exportType} export for item ${item.id}...`);
        console.log(`[RST EXPORT] Connection config:`, {
            baseUrl: connectionConfig.baseUrl,
            authType: connectionConfig.authType,
            hasAccessToken: !!connectionConfig.accessToken,
            hasUsername: !!connectionConfig.username,
            hasPassword: !!connectionConfig.password
        });
        const startTime = Date.now();

        // Initialize logger for progress updates
        const exportId = url.searchParams.get('exportId');
        const logger = new ProgressLogger(exportId || undefined);

        // Create ServerJamaService instance with the provided connection config
        const jamaService = new ServerJamaService(connectionConfig);

        if (exportType === 'single') {
            // Optimized single file export
            console.log(`[RST EXPORT] Starting optimized single export for item ${item.id}...`);
            
            // Create global caches
            const itemTypeCache = new Map<number, any>();
            const picklistCache = new Map<number, any>();
            
            // Pre-load child items if there are any
            let childItemsMap = new Map<number, any>();
            if (children.length > 0) {
                console.log(`[RST EXPORT] Pre-loading ${children.length} child items...`);
                childItemsMap = await batchLoadItems(children, jamaService, logger, 15);
            }
            
            // Pre-load children hierarchy for child items
            let childrenMap = new Map<number, number[]>();
            if (children.length > 0) {
                childrenMap = await batchLoadChildren(children, jamaService, logger, 15);
            }
            
            // Generate RST content using optimized function
            const relationships = { upstream: upstreamRelated, downstream: downstreamRelated };
            const rstContent = await generateRstContentOptimized(
                item.id,
                {
                    item: item,
                    children: children,
                    relationships: relationships,
                    childItems: childItemsMap,
                    childrenMap: childrenMap
                },
                '',
                { itemTypeCache, picklistCache },
                jamaService
            );

            const filename = `${item.id}.rst`;
            
            const totalTime = Date.now() - startTime;
            console.log(`[RST EXPORT] Optimized single export completed in ${totalTime}ms`);

            // Return the RST file
            const response = new Response(rstContent, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'Content-Length': String(Buffer.byteLength(rstContent, 'utf8')),
                },
            });

            return response;
        } else if (exportType === 'recursive') {
            // Optimized recursive ZIP export
            const hasChildren = children.length > 0;

            if (!hasChildren) {
                // If no children, fall back to single file in ZIP
                const rstContent = await generateRstContent(
                    item.id, item.itemType, '', jamaService
                );
                
                // Create archive for single file
                const archive = archiver('zip', {
                    zlib: { level: 9 }, // Best compression
                });

                // Collect archive data
                const chunks: Buffer[] = [];
                archive.on('data', (chunk) => chunks.push(chunk));
                
                // Promise to wait for archive completion
                const archivePromise = new Promise<Buffer>((resolve, reject) => {
                    archive.on('end', () => {
                        resolve(Buffer.concat(chunks));
                    });
                    archive.on('error', reject);
                });

                archive.append(rstContent, { name: `${item.id}.rst` });
                await archive.finalize();
                const zipBuffer = await archivePromise;
                
                const totalTime = Date.now() - startTime;
                console.log(`[RST EXPORT] Single-item recursive export completed in ${totalTime}ms`);

                const response = new Response(new Uint8Array(zipBuffer), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/zip',
                        'Content-Disposition': `attachment; filename="${item.id}_export.zip"`,
                        'Content-Length': String(zipBuffer.length),
                    },
                });

                return response;
            }

            console.log(`[RST EXPORT] Starting optimized recursive export...`);
            
            // Global caches for the entire export
            const itemTypeCache = new Map<number, any>();
            const picklistCache = new Map<number, any>();

            // Step 1: Batch load all child items
            console.log(`[RST EXPORT] Step 1: Batch loading ${children.length} child items...`);
            const childItemsMap = await batchLoadItems(children, jamaService, logger, 15);
            
            // Step 2: Batch load children for all items to determine hierarchy
            console.log(`[RST EXPORT] Step 2: Batch loading children for hierarchy analysis...`);
            const allItemIds = [item.id, ...children];
            const childrenMap = await batchLoadChildren(allItemIds, jamaService, logger, 15);
            
            // Step 3: Batch load relationships for all items
            console.log(`[RST EXPORT] Step 3: Batch loading relationships...`);
            const relationshipsMap = await batchLoadRelationships(allItemIds, jamaService, logger, 15);

            // Create archive
            const archive = archiver('zip', {
                zlib: { level: 9 },
            });

            const chunks: Buffer[] = [];
            archive.on('data', (chunk) => chunks.push(chunk));
            
            const archivePromise = new Promise<Buffer>((resolve, reject) => {
                archive.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
                archive.on('error', reject);
            });

            // Create index.rst
            const indexContent = `${item.fields.name || 'Unnamed item'}\n${'='.repeat((item.fields.name || 'Unnamed item').length)}\n\n.. toctree::\n   :maxdepth: 3\n   :caption: Contents:\n   :titlesonly:\n\n   ${item.id}\n`;
            archive.append(indexContent, { name: 'index.rst' });

            // Categorize children based on pre-loaded hierarchy data
            console.log(`[RST EXPORT] Step 4: Categorizing child items...`);
            const childrenWithoutChildren: any[] = [];
            const childrenWithChildren: any[] = [];
            
            for (const childId of children) {
                const childItem = childItemsMap.get(childId);
                const childChildren = childrenMap.get(childId) || [];
                
                if (childItem) {
                    if (childChildren.length > 0) {
                        childrenWithChildren.push({ item: childItem, children: childChildren });
                    } else {
                        childrenWithoutChildren.push(childItem);
                    }
                }
            }
            
            console.log(`[RST EXPORT] Categorization complete - ${childrenWithoutChildren.length} leaf items, ${childrenWithChildren.length} parent items`);

            // Generate root RST content using optimized function
            console.log(`[RST EXPORT] Step 5: Generating root RST content...`);
            const rootRelationships = relationshipsMap.get(item.id) || { upstream: [], downstream: [] };
            const rootRstContent = await generateRstContentOptimized(
                item.id,
                {
                    item: item,
                    children: childrenWithoutChildren.map(c => c.id), // Only include leaf children in root
                    relationships: rootRelationships,
                    childItems: childItemsMap,
                    childrenMap: childrenMap
                },
                '',
                { itemTypeCache, picklistCache },
                jamaService
            );

            // Add toctree for parent items
            let finalRootContent = rootRstContent;
            if (childrenWithChildren.length > 0) {
                finalRootContent += `\n.. toctree::\n   :maxdepth: 2\n   :caption: sub-structure:\n\n`;
                for (const childWithChildren of childrenWithChildren) {
                    finalRootContent += `   ${childWithChildren.item.id}/${childWithChildren.item.id}\n`;
                }
            }

            archive.append(finalRootContent, { name: `${item.id}.rst` });

            // Process children with children
            console.log(`[RST EXPORT] Step 6: Processing ${childrenWithChildren.length} parent items...`);
            for (let i = 0; i < childrenWithChildren.length; i++) {
                const childWithChildren = childrenWithChildren[i];
                const childItem = childWithChildren.item;
                const childChildren = childWithChildren.children;

                console.log(`[RST EXPORT] Processing parent item ${i + 1}/${childrenWithChildren.length}: ${childItem.id}`);

                try {
                    // Pre-load all child items for this parent
                    const childChildItemsMap = await batchLoadItems(childChildren, jamaService, logger, 10);
                    
                    const childRelationships = relationshipsMap.get(childItem.id) || { upstream: [], downstream: [] };
                    
                    const childRstContent = await generateRstContentOptimized(
                        childItem.id,
                        {
                            item: childItem,
                            children: childChildren,
                            relationships: childRelationships,
                            childItems: childChildItemsMap,
                            childrenMap: childrenMap
                        },
                        '',
                        { itemTypeCache, picklistCache },
                        jamaService
                    );

                    archive.append(childRstContent, { name: `${childItem.id}/${childItem.id}.rst` });
                    
                } catch (error) {
                    console.error(`[RST EXPORT] Failed to process child with children ${childItem.id}:`, error);
                    const errorContent = `${childItem.fields.name || 'Failed to load'}\n${'='.repeat((childItem.fields.name || 'Failed to load').length)}\n\nError loading content for item ${childItem.id}.\n`;
                    archive.append(errorContent, { name: `${childItem.id}/${childItem.id}.rst` });
                }
            }

            // Finalize
            console.log(`[RST EXPORT] Step 7: Finalizing ZIP archive...`);
            await archive.finalize();
            const zipBuffer = await archivePromise;
            
            const totalTime = Date.now() - startTime;
            console.log(`[RST EXPORT] Optimized recursive export completed in ${totalTime}ms`);

            return new Response(new Uint8Array(zipBuffer), {
                status: 200,
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': `attachment; filename="${item.id}_recursive_export.zip"`,
                    'Content-Length': String(zipBuffer.length),
                },
            });
        }

        return NextResponse.json(
            { success: false, message: 'Invalid export type' },
            { status: 400 }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[RST EXPORT] Error:', errorMessage);
        
        return NextResponse.json(
            { 
                success: false, 
                message: `Export failed: ${errorMessage}` 
            },
            { status: 500 }
        );
    }
}