import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { baseUrl, clientId, clientSecret } = await request.json();

        if (!baseUrl || !clientId || !clientSecret) {
            return NextResponse.json(
                { error: 'Missing required parameters: baseUrl, clientId, clientSecret' },
                { status: 400 }
            );
        }

        const tokenUrl = `${baseUrl}/rest/oauth/token`;
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: 'grant_type=client_credentials',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Jama OAuth error:', response.status, errorText);
            return NextResponse.json(
                { 
                    error: 'Authentication failed',
                    details: errorText,
                    status: response.status 
                },
                { status: response.status }
            );
        }

        const tokenData = await response.json();
        return NextResponse.json(tokenData);

    } catch (error) {
        console.error('Token request error:', error);
        return NextResponse.json(
            { error: 'Failed to request token', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
