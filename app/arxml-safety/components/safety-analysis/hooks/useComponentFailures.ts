'use client';

import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { getFailuresAndCountsForComponent, createFailureModeNode, updateFailureModeNode } from '@/app/services/neo4j/queries/safety/failureModes';
import { Failure } from '../types';

export const useComponentFailures = (swComponentUuid: string) => {
  const [failures, setFailures] = useState<Failure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!swComponentUuid) return;
    setLoading(true);
    try {
      const result = await getFailuresAndCountsForComponent(swComponentUuid);
      if (result.success && result.data) {
        setFailures(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch component failures.');
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

  const addFailure = async (values: { failureName: string; failureDescription: string; asil: string; }) => {
    setLoading(true);
    try {
      const result = await createFailureModeNode(swComponentUuid, values.failureName, values.failureDescription, values.asil);
      if (result.success && result.failureUuid) {
        const newFailure: Failure = {
          failureUuid: result.failureUuid,
          failureName: values.failureName,
          failureDescription: values.failureDescription,
          asil: values.asil,
          relationshipType: 'OCCURRENCE', // Directly related to the component
          riskRatingCount: 0,
          safetyTaskCount: 0,
          safetyReqCount: 0,
          safetyNoteCount: 0,
        };
        setFailures(prev => [...prev, newFailure]);
        message.success('Failure mode added successfully.');
        return { success: true, newFailure };
      } else {
        throw new Error(result.message || 'Failed to add failure mode.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      message.error(errorMessage);
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const updateFailure = async (failureUuid: string, values: { failureName: string; failureDescription: string; asil: string; }) => {
    setLoading(true);
    try {
      const result = await updateFailureModeNode(failureUuid, values.failureName, values.failureDescription, values.asil);
      if (result.success) {
        setFailures(prev => prev.map(f => f.failureUuid === failureUuid ? { ...f, ...values } : f));
        message.success('Failure mode updated successfully.');
        return { success: true };
      } else {
        throw new Error(result.message || 'Failed to update failure mode.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      message.error(errorMessage);
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const deleteFailure = async (failureUuid: string) => {
    // Note: The actual deletion is done via /api/safety/delete which handles cascades.
    // This function is for updating the local state after a successful deletion.
    setFailures(prev => prev.filter(f => f.failureUuid !== failureUuid));
    message.success('Failure mode removed from view.');
  };

  return {
    failures,
    loading,
    error,
    addFailure,
    updateFailure,
    deleteFailure,
    refetch: fetchData,
  };
}; 