'use client';

import { useState, useEffect } from 'react';
import { message } from 'antd';
import { getInfoForAppSWComp } from '@/app/services/neo4j/queries/components';
import { getFailuresAndCountsForComponent, getFailuresAndCountsForPorts } from '@/app/services/neo4j/queries/safety/failureModes';
import { getProviderPortsForSWComponent, getReceiverPortsForSWComponent } from '../../../../services/neo4j/queries/ports';
import { SwComponent, Failure, PortFailure, ProviderPort } from '../types';
import { getRiskRatingNodes } from '@/app/services/neo4j/queries/safety/riskRating';
import { getSafetyTasksForNode } from '@/app/services/neo4j/queries/safety/safetyTasks';
import { getSafetyReqsForNode } from '@/app/services/neo4j/queries/safety/safetyReq';
import { getSafetyNotesForNode } from '@/app/services/neo4j/queries/safety/safetyNotes';

export const useSwSafetyData = (swComponentUuid: string) => {
  const [loading, setLoading] = useState(true);
  const [swComponent, setSwComponent] = useState<SwComponent | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [providerPorts, setProviderPorts] = useState<ProviderPort[]>([]);
  const [portFailures, setPortFailures] = useState<{[portUuid: string]: PortFailure[]}>({});
  const [receiverPorts, setReceiverPorts] = useState<ProviderPort[]>([]);
  const [receiverPortFailures, setReceiverPortFailures] = useState<{[portUuid: string]: PortFailure[]}>({});

  const refreshData = async () => {
    if (!swComponentUuid) return;
    
    console.log('🔄 Refreshing data for SW Component:', swComponentUuid);
    setLoading(true);
    
    try {
      // Fetch component info, failures, and all ports in parallel
      const [swComponentResult, failuresResult, providerPortsResult, receiverPortsResult] = await Promise.all([
        getInfoForAppSWComp(swComponentUuid),
        getFailuresAndCountsForComponent(swComponentUuid),
        getProviderPortsForSWComponent(swComponentUuid),
        getReceiverPortsForSWComponent(swComponentUuid)
      ]);

      // Process component info
      if (swComponentResult.success && swComponentResult.data) {
        setSwComponent({
          uuid: swComponentResult.data.uuid,
          name: swComponentResult.data.name,
          failures: failuresResult.success && failuresResult.data ? failuresResult.data.map((f: Failure) => ({ uuid: f.failureUuid, name: f.failureName || 'Unnamed Failure' })) : []
        });
      }

      // Process component failures
      setFailures(failuresResult.success && failuresResult.data ? failuresResult.data : []);

      // Process provider ports and their failures
      const providerPortsData = providerPortsResult.success && providerPortsResult.data ? providerPortsResult.data : [];
      setProviderPorts(providerPortsData);
      const providerPortUuids = providerPortsData.map(p => p.uuid);
      const providerPortFailuresResult = await getFailuresAndCountsForPorts(providerPortUuids);
      if (providerPortFailuresResult.success) {
        setPortFailures(providerPortFailuresResult.data || {});
      }

      // Process receiver ports and their failures
      const receiverPortsData = receiverPortsResult.success && receiverPortsResult.data ? receiverPortsResult.data : [];
      setReceiverPorts(receiverPortsData);
      const receiverPortUuids = receiverPortsData.map(p => p.uuid);
      const receiverPortFailuresResult = await getFailuresAndCountsForPorts(receiverPortUuids);
      if (receiverPortFailuresResult.success) {
        setReceiverPortFailures(receiverPortFailuresResult.data || {});
      }

    } catch (error) {
      console.error("Error loading component data:", error);
      message.error('An unexpected error occurred while loading data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [swComponentUuid]);

  return { 
    loading, 
    swComponent, 
    failures, 
    setFailures, 
    providerPorts, 
    portFailures, 
    setPortFailures,
    receiverPorts,
    receiverPortFailures,
    setReceiverPortFailures,
    refreshData 
  };
};
