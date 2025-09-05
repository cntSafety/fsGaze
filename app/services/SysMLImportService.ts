export interface ImportResult {
  success: boolean;
  message: string;
  error?: string | null;
  stats?: {
    nodesCreated: number;
    relationshipsCreated: number;
  };
}

export async function importSysML(content: string, fileName: string): Promise<ImportResult> {
  const res = await fetch('/api/sysml/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, fileName }),
  });

  const data = await res.json();
  if (!res.ok) {
    return {
      success: false,
      message: data?.message || 'Failed to import SysML',
      error: data?.error || null,
    };
  }
  return {
    success: true,
    message: data?.message || 'Imported successfully',
    stats: data?.stats || { nodesCreated: 0, relationshipsCreated: 0 },
  };
}


