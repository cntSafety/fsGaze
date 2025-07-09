'use client';

import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { getInfoForAppSWComp } from '@/app/services/neo4j/queries/components';
import { SwComponent } from '../types';

export const useSwComponentInfo = (swComponentUuid: string) => {
  const [swComponent, setSwComponent] = useState<SwComponent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!swComponentUuid) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getInfoForAppSWComp(swComponentUuid);
      if (result.success && result.data) {
        setSwComponent(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch SW Component info.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [swComponentUuid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { swComponent, loading, error, refetch: fetchData };
}; 