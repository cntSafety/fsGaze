"use client";

import React, { useEffect } from 'react';
import KerMLUpload from '@/app/kerml-analyzer/components/KerMLUpload';
import { useLoading } from '../components/LoadingProvider';

export default function KerMLAnalyzerPage() {
  const { hideLoading } = useLoading();

  useEffect(() => {
    // Hide loading once component is mounted
    hideLoading();
  }, [hideLoading]);

  return (
    <div className="container mx-auto p-4">
      <KerMLUpload />
    </div>
  );
}
