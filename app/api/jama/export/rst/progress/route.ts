import { NextRequest } from 'next/server';
import { progressStore } from '@/app/api/jama/export/rst/progress/store';

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const exportId = url.searchParams.get('exportId');
    
    if (!exportId) {
        return new Response('Export ID required', { status: 400 });
    }

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            const data = `data: ${JSON.stringify({ message: 'Connected to progress stream' })}\n\n`;
            controller.enqueue(encoder.encode(data));

            // Function to send stored messages
            const sendStoredMessages = () => {
                const messages: string[] = progressStore.get(exportId) ?? [];
                messages.forEach((message: string) => {
                    const data = `data: ${JSON.stringify({ message })}\n\n`;
                    controller.enqueue(encoder.encode(data));
                });
            };

            // Send any existing messages
            sendStoredMessages();

            // Poll for new messages every 100ms
            const interval = setInterval(() => {
                const messages: string[] = progressStore.get(exportId) ?? [];
                if (messages.length === 0) return;

                // Send new messages and clear the store
                messages.forEach((message: string) => {
                    const data = `data: ${JSON.stringify({ message })}\n\n`;
                    controller.enqueue(encoder.encode(data));
                });
                
                // Clear sent messages
                progressStore.set(exportId, []);

                // Check if export is done (indicated by a special message)
                if (messages.some((msg: string) => msg.includes('completed') || msg.includes('done'))) {
                    clearInterval(interval);
                    const doneData = `data: ${JSON.stringify({ done: true })}\n\n`;
                    controller.enqueue(encoder.encode(doneData));
                    controller.close();
                }
            }, 100);

            // Cleanup on close
            controller.close = () => {
                clearInterval(interval);
                progressStore.delete(exportId);
            };
        },
        cancel() {
            progressStore.delete(exportId);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    });
}