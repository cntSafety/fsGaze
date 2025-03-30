"use client";

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined' && containerRef.current) {
      // Create an iframe that will load the standalone Swagger UI HTML
      const iframe = document.createElement('iframe');
      iframe.src = '/api-docs.html';
      iframe.style.width = '100%';
      iframe.style.height = '800px';
      iframe.style.border = 'none';
      
      // Clear and append
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(iframe);
    }
    
  }, []);

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4">
        <Link href="/" className="text-blue-500 hover:underline">
          &larr; Back to Home
        </Link>
      </div>
      
      <h1 className="text-2xl font-bold mb-4">API Documentation</h1>
      
      <div ref={containerRef} className="mt-4">
        <p>Loading API documentation...</p>
      </div>
    </div>
  );
}
