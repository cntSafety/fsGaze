import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { ServerJamaService, ServerJamaConfig } from './serverJamaService';

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

        // Create ServerJamaService instance with the provided connection config
        const jamaService = new ServerJamaService(connectionConfig);

        if (exportType === 'single') {
            // Single file export
            const rstContent = await generateRstContent(
                item.id, item.itemType, '', jamaService
            );

            const filename = `${item.id}.rst`;
            
            const totalTime = Date.now() - startTime;
            console.log(`[RST EXPORT] Single export completed in ${totalTime}ms`);

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
            // Recursive ZIP export
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

            // Create ZIP archive for recursive export
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

            // Create index.rst
            const indexContent = `${item.fields.name || 'Unnamed item'}\n${'='.repeat((item.fields.name || 'Unnamed item').length)}\n\n.. toctree::\n   :maxdepth: 3\n   :caption: Contents:\n   :titlesonly:\n\n   ${item.id}\n`;
            archive.append(indexContent, { name: 'index.rst' });

            // Load all child items
            console.log(`[RST EXPORT] Loading ${children.length} child items...`);
            const childItems = [];
            for (let i = 0; i < children.length; i++) {
                const childId = children[i];
                try {
                    console.log(`[RST EXPORT] Loading child item ${i + 1}/${children.length}: ${childId}`);
                    const childItem = await jamaService.getItem(childId);
                    childItems.push(childItem);
                } catch (error) {
                    console.error(`[RST EXPORT] Failed to load child item ${childId}:`, error);
                }
            }
            console.log(`[RST EXPORT] Successfully loaded ${childItems.length} child items`);
            
            // Cache for item types and picklist options
            const itemTypeCache = new Map<number, any>();
            const picklistCache = new Map<number, any>();
            
            // Separate children into those with/without children
            console.log(`[RST EXPORT] Categorizing child items...`);
            const childrenWithoutChildren: any[] = [];
            const childrenWithChildren: any[] = [];
            
            for (let i = 0; i < childItems.length; i++) {
                const childItem = childItems[i];
                try {
                    console.log(`[RST EXPORT] Checking children for item ${i + 1}/${childItems.length}: ${childItem.id}`);
                    const childChildren = await jamaService.getChildren(childItem.id);
                    if (childChildren.length > 0) {
                        console.log(`[RST EXPORT] Item ${childItem.id} has ${childChildren.length} children`);
                        childrenWithChildren.push({ item: childItem, children: childChildren });
                    } else {
                        console.log(`[RST EXPORT] Item ${childItem.id} is a leaf node`);
                        childrenWithoutChildren.push(childItem);
                    }
                } catch (error) {
                    console.error(`[RST EXPORT] Failed to get children for ${childItem.id}:`, error);
                    // Treat as leaf item if we can't get children
                    childrenWithoutChildren.push(childItem);
                }
            }
            
            console.log(`[RST EXPORT] Categorization complete - ${childrenWithoutChildren.length} leaf items, ${childrenWithChildren.length} parent items`);

            // Create root item RST file
            console.log(`[RST EXPORT] Creating root RST content for item ${item.id}...`);
            let rootContent = `${item.fields.name || 'Unnamed item'}\n${'='.repeat((item.fields.name || 'Unnamed item').length)}\n\n`;
            
            // Add root item as sub directive
            rootContent += `.. sub:: ${item.fields.name || 'Unnamed Folder'}\n`;
            rootContent += `   :id: ${item.id}\n`;
            rootContent += `   :itemtype: ${itemTypeInfo?.display}\n`;
            rootContent += `   :collapse: false\n\n`;
            
            // Add root description
            if (item.fields.description) {
                rootContent += `   ${stripHtmlTags(item.fields.description)}\n\n`;
            } else {
                rootContent += `   This item contains the following child items:\n\n`;
            }

            // Add children without children directly to root RST (simplified version for recursive export)
            console.log(`[RST EXPORT] Adding ${childrenWithoutChildren.length} leaf items to root RST...`);
            for (const childItem of childrenWithoutChildren) {
                rootContent += `   .. item:: ${childItem.fields.name || 'Unnamed Requirement'}\n`;
                rootContent += `      :id: ${childItem.id}\n`;
                rootContent += `      :collapse: false\n\n`;
                rootContent += `      ${childItem.fields.description ? stripHtmlTags(childItem.fields.description) : 'No description available.'}\n\n`;
            }

            // Add needflow diagram
            rootContent += `.. needflow::\n`;
            rootContent += `   :filter: id == "${item.id}" or parent_need == "${item.id}"\n`;
            rootContent += `   :link_types: links, related\n`;
            rootContent += `   :show_link_names:\n`;
            rootContent += `   :config: lefttoright\n\n`;

            // Add toctree for children with children
            if (childrenWithChildren.length > 0) {
                rootContent += `.. toctree::\n`;
                rootContent += `   :maxdepth: 2\n`;
                rootContent += `   :caption: sub-structure:\n\n`;
                
                for (const childWithChildren of childrenWithChildren) {
                    rootContent += `   ${childWithChildren.item.id}/${childWithChildren.item.id}\n`;
                }
            }

            // Add root RST file to archive
            console.log(`[RST EXPORT] Adding root RST file to archive...`);
            archive.append(rootContent, { name: `${item.id}.rst` });

            // Process children with children recursively
            console.log(`[RST EXPORT] Processing ${childrenWithChildren.length} parent items recursively...`);
            for (let i = 0; i < childrenWithChildren.length; i++) {
                const childWithChildren = childrenWithChildren[i];
                const childItem = childWithChildren.item;
                const childChildren = childWithChildren.children;

                console.log(`[RST EXPORT] Processing parent item ${i + 1}/${childrenWithChildren.length}: ${childItem.id} (${childChildren.length} children)`);

                try {
                    // Get child relationships
                    console.log(`[RST EXPORT] Loading relationships for item ${childItem.id}...`);
                    let childUpstream: number[] = [];
                    let childDownstream: number[] = [];
                    try {
                        childUpstream = await jamaService.getUpstreamRelated(childItem.id);
                        childDownstream = await jamaService.getDownstreamRelated(childItem.id);
                        console.log(`[RST EXPORT] Found ${childUpstream.length} upstream and ${childDownstream.length} downstream relationships for item ${childItem.id}`);
                    } catch (error) {
                        console.error(`[RST EXPORT] Failed to get relationships for ${childItem.id}:`, error);
                    }

                    // Create folder and RST file for this child
                    console.log(`[RST EXPORT] Generating RST content for item ${childItem.id}...`);
                    const childRstContent = await generateRstContent(
                        childItem.id,
                        childItem.itemType,
                        '',
                        jamaService
                    );

                    // Add file to folder in archive
                    console.log(`[RST EXPORT] Adding RST file for item ${childItem.id} to archive...`);
                    archive.append(childRstContent, { name: `${childItem.id}/${childItem.id}.rst` });
                    
                } catch (error) {
                    console.error(`[RST EXPORT] Failed to process child with children ${childItem.id}:`, error);
                    // Create error file
                    const errorContent = `${childItem.fields.name || 'Failed to load'}\n${'='.repeat((childItem.fields.name || 'Failed to load').length)}\n\nError loading content for item ${childItem.id}.\n`;
                    archive.append(errorContent, { name: `${childItem.id}/${childItem.id}.rst` });
                }
            }

            // Finalize the archive
            console.log(`[RST EXPORT] Finalizing ZIP archive...`);
            await archive.finalize();

            // Wait for archive to complete
            console.log(`[RST EXPORT] Waiting for archive completion...`);
            const zipBuffer = await archivePromise;
            
            const totalTime = Date.now() - startTime;
            console.log(`[RST EXPORT] Recursive export completed in ${totalTime}ms`);

            const response = new Response(new Uint8Array(zipBuffer), {
                status: 200,
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': `attachment; filename="${item.id}_recursive_export.zip"`,
                    'Content-Length': String(zipBuffer.length),
                },
            });

            return response;
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