import { useState, useEffect, useCallback } from 'react';
import { Form, message } from 'antd';
import { createFailureModeNode, updateFailureModeNode } from '../../../../services/neo4j/queries/safety/failureModes';
import { getReceiverPortsForSWComponent } from '../../../../services/neo4j/queries/ports';
import { getFailuresAndCountsForPorts } from '../../../../services/neo4j/queries/safety/failureModes';
import { ProviderPort, PortFailure } from '../types';

export const useReceiverPortFailures = (swComponentUuid: string) => {
  const [form] = Form.useForm();
  const [receiverPorts, setReceiverPorts] = useState<ProviderPort[]>([]);
  const [portFailures, setPortFailures] = useState<{[portUuid: string]: PortFailure[]}>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!swComponentUuid) return;
    setLoading(true);
    setError(null);
    try {
      const portsResult = await getReceiverPortsForSWComponent(swComponentUuid);
      if (!portsResult.success || !portsResult.data) {
        throw new Error(portsResult.message || 'Failed to fetch receiver ports.');
      }
      setReceiverPorts(portsResult.data);
      
      const portUuids = portsResult.data.map(p => p.uuid);
      if (portUuids.length > 0) {
        const failuresResult = await getFailuresAndCountsForPorts(portUuids);
        if (failuresResult.success && failuresResult.data) {
          setPortFailures(failuresResult.data);
        } else {
          throw new Error(failuresResult.message || 'Failed to fetch port failures.');
        }
      } else {
        setPortFailures({});
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

  const addPortFailure = async (portUuid: string, values: { failureName: string; failureDescription: string; asil: string; }) => {
    setLoading(true);
    try {
      const result = await createFailureModeNode(portUuid, values.failureName, values.failureDescription, values.asil);
      if (result.success && result.failureUuid) {
        const newFailure: PortFailure = {
          failureUuid: result.failureUuid,
          failureName: values.failureName,
          failureDescription: values.failureDescription,
          asil: values.asil,
          failureType: null,
          relationshipType: 'OCCURRENCE',
        };
        setPortFailures(prev => ({
          ...prev,
          [portUuid]: [...(prev[portUuid] || []), newFailure],
        }));
        message.success('Port failure mode added successfully.');
        return { success: true, newFailure };
      } else {
        throw new Error(result.message || 'Failed to add port failure mode.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      message.error(errorMessage);
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const updatePortFailure = async (portUuid: string, failureUuid: string, values: { failureName: string; failureDescription: string; asil: string; }) => {
    setLoading(true);
    try {
      const result = await updateFailureModeNode(failureUuid, values.failureName, values.failureDescription, values.asil);
      if (result.success) {
        setPortFailures(prev => ({
          ...prev,
          [portUuid]: (prev[portUuid] || []).map(f => f.failureUuid === failureUuid ? { ...f, ...values } : f),
        }));
        message.success('Port failure mode updated successfully.');
        return { success: true };
      } else {
        throw new Error(result.message || 'Failed to update port failure mode.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      message.error(errorMessage);
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const deletePortFailure = (portUuid: string, failureUuid: string) => {
    setPortFailures(prev => ({
      ...prev,
      [portUuid]: (prev[portUuid] || []).filter(f => f.failureUuid !== failureUuid),
    }));
    message.success('Port failure mode removed from view.');
  };

  return {
    form,
    receiverPorts,
    portFailures,
    loading,
    error,
    refetch: fetchData,
    addPortFailure,
    updatePortFailure,
    deletePortFailure,
  };
};
