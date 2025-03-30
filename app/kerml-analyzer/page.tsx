"use client";

import React from 'react';
import KerMLUpload from '@/app/kerml-analyzer/components/KerMLUpload';
import Link from 'next/link';

export default function KerMLAnalyzerPage() {
  return (
    <div className="container mx-auto p-4">
      <KerMLUpload />
    </div>
  );
}
