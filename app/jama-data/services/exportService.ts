import { JamaItem } from '../types/jama';
import { globalJamaService } from '../../services/globalJamaService';

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

export interface ExportProgressCallback {
    (current: number, total: number, message: string): void;
}

export interface ExportRstOptions {
    onProgress?: ExportProgressCallback;
}

export interface ExportRstResult {
    content: string;
    filename: string;
}

/**
 * Export a single layer (item with its direct children) to RST format
 */
export async function exportOneLayerToRst(
    item: JamaItem,
    itemTypeInfo: { id: number; display: string } | null,
    asilInfo: { field: string; value: string; optionName: string } | null,
    upstreamRelated: number[],
    downstreamRelated: number[],
    children: number[],
    options: ExportRstOptions = {}
): Promise<ExportRstResult> {
    
    const { onProgress } = options;
    
    if (onProgress) {
        onProgress(0, 5, 'Initializing export...');
    }

    // Check if this item has children
    const hasChildren = children.length > 0;

    const generateRstContent = async (): Promise<string> => {
        const exportTitle = item.fields.name || 'Unnamed item';
        let content = `${exportTitle}\n${'='.repeat(exportTitle.length)}\n\n`;
        
        if (onProgress) {
            onProgress(1, 5, 'Analyzing item type...');
        }
        
        if (hasChildren) {
            if (onProgress) {
                onProgress(2, 5, 'Processing folder structure...');
            }
            
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
                if (onProgress) {
                    onProgress(3, 4, `Loading ${children.length} child requirements in batches...`);
                }
                
                try {
                    // Load all child items in batches for better performance
                    const childItems = await globalJamaService.getMultipleItems(children);
                    
                    if (onProgress) {
                        onProgress(3, 4, `Processing ${childItems.length} loaded child requirements...`);
                    }
                    
                    // Cache for item types and picklist options to avoid repeated API calls
                    const itemTypeCache = new Map<number, any>();
                    const picklistCache = new Map<number, any>();
                    
                    // Process each child item
                    for (let i = 0; i < childItems.length; i++) {
                        const childItem = childItems[i];
                        
                        try {
                            // Get child item type (with caching)
                            let childItemType;
                            if (itemTypeCache.has(childItem.itemType)) {
                                childItemType = itemTypeCache.get(childItem.itemType);
                            } else {
                                childItemType = await globalJamaService.getItemType(childItem.itemType);
                                itemTypeCache.set(childItem.itemType, childItemType);
                            }
                            
                            // Check if this child has children by querying for them
                            const childChildren = await globalJamaService.getChildren(childItem.id);
                            const childHasChildren = childChildren.length > 0;
                            console.log(`Child item ${childItem.id} has children: ${childHasChildren}`);
                            // Get child's upstream/downstream relations
                            const childUpstream = await globalJamaService.getUpstreamRelated(childItem.id);
                            const childDownstream = await globalJamaService.getDownstreamRelated(childItem.id);
                            
                            // Get child's ASIL info (with caching)
                            const childAsilData = extractAsilFromFields(childItem.fields, childItem.itemType);
                            let childAsilInfo = null;
                            if (childAsilData) {
                                if (picklistCache.has(childAsilData.value)) {
                                    const cachedOption = picklistCache.get(childAsilData.value);
                                    childAsilInfo = { optionName: cachedOption.name };
                                } else {
                                    try {
                                        const picklistOption = await globalJamaService.getPicklistOption(childAsilData.value);
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
                    console.error('Failed to load child items in batch:', error);
                    // Fallback to individual loading if batch fails
                    for (let i = 0; i < children.length; i++) {
                        const childId = children[i];
                        try {
                            const childItem = await globalJamaService.getItem(childId);
                            content += `   .. item:: ${childItem.fields.name || 'Failed to load requirement'}\n`;
                            content += `      :id: ${childId}\n`;
                            content += `      :collapse: false\n\n`;
                            content += `      Error loading detailed requirement data.\n\n`;
                        } catch {
                            content += `   .. item:: Failed to load requirement\n`;
                            content += `      :id: ${childId}\n`;
                            content += `      :collapse: false\n\n`;
                            content += `      Error loading requirement data.\n\n`;
                        }
                    }
                }
            }
        } else {
            if (onProgress) {
                onProgress(2, 5, 'Processing requirement data...');
            }
            
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
        
        if (onProgress) {
            onProgress(4, 5, 'Adding flow diagram...');
        }
        
        // Add needflow diagram at the end
        content += `.. needflow::\n`;
        content += `   :filter: id == "${item.id}" or parent_need == "${item.id}"\n`;
        content += `   :link_types: links, related\n`;
        content += `   :show_link_names:\n`;
        content += `   :config: lefttoright\n`;
        
        return content;
    };

    const rstContent = await generateRstContent();
    
    if (onProgress) {
        onProgress(5, 5, 'Export completed successfully!');
    }
    
    // Use item ID as filename
    const filename = `${item.id}.rst`;

    return {
        content: rstContent,
        filename: filename
    };
}