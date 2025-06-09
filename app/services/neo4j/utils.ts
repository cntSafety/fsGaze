
// Browser-compatible UUID generation function
export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  
  // Fallback UUID generation for browsers without crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Ensures the input is an array. If not, wraps it in an array.
 * If null or undefined, returns an empty array.
 */
export const ensureArray = (item: any) => {
  if (item === undefined || item === null) return [];
  return Array.isArray(item) ? item : [item];
};

/**
 * Converts an XML tag name to a Neo4j-friendly label.
 * (e.g., "P-PORT-PROTOTYPE" becomes "P_PORT_PROTOTYPE")
 * @param {string} xmlTag The XML tag name.
 * @returns {string} A sanitized string suitable for a Neo4j label.
 */
export function getLabelFromXmlTag(xmlTag: string): string {
  if (!xmlTag || typeof xmlTag !== 'string') return "UnknownElementTag";
  return xmlTag.replace(/-/g, "_").replace(/:/g, "_").toUpperCase();
}

/**
 * Extracts the string value from a SHORT-NAME element,
 * handling cases where it might be a direct string or an object with text content.
 * @param {any} shortNameElement The SHORT-NAME element from xml2js.
 * @returns {string|null} The string value of SHORT-NAME or null.
 */
export function extractShortNameValue(shortNameElement: any): string | null {
    if (typeof shortNameElement === 'string') {
        return shortNameElement;
    } else if (shortNameElement && typeof shortNameElement === 'object') {
        // With explicitArray: false, text content is usually direct,
        // but if attributes exist on SHORT-NAME tag itself, it might be in '_' or 'CONTENT'
        return shortNameElement._ || shortNameElement.CONTENT || null;
    }
    return null;
}
