import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { baseUrl, endpoint, method = 'GET', body, headers = {}, authToken } = await request.json();

        if (!baseUrl || !endpoint) {
            return NextResponse.json(
                { error: 'Missing required parameters: baseUrl, endpoint' },
                { status: 400 }
            );
        }

        const url = `${baseUrl}${endpoint}`;
        const requestHeaders: Record<string, string> = {
            'Accept': 'application/json',
            ...headers,
        };

        // Add authorization header if token provided
        if (authToken) {
            requestHeaders['Authorization'] = `Bearer ${authToken}`;
        }

        // Add content-type for POST/PUT requests with body
        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestHeaders['Content-Type'] = 'application/json';
        }

        const fetchOptions: RequestInit = {
            method,
            headers: requestHeaders,
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Jama API error:', response.status, errorText);
            return NextResponse.json(
                { 
                    error: 'API request failed',
                    details: errorText,
                    status: response.status 
                },
                { status: response.status }
            );
        }

        const responseData = await response.json();
        return NextResponse.json(responseData);

    } catch (error) {
        console.error('API proxy error:', error);
        return NextResponse.json(
            { error: 'Failed to proxy API request', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
