export const progressStore = new Map<string, string[]>();

export function addProgressMessage(exportId: string, message: string) {
    if (!progressStore.has(exportId)) {
        progressStore.set(exportId, []);
    }
    progressStore.get(exportId)!.push(message);
}
