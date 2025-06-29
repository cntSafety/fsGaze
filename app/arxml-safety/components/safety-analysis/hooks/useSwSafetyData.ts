'use client';

import { useState, useEffect } from 'react';
import { message } from 'antd';
import { getInfoForAppSWComp } from '@/app/services/neo4j/queries/components';
import { getFailuresForSwComponents, getFailuresForPorts } from '@/app/services/neo4j/queries/safety/failureModes';
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
    if (swComponentUuid) {
      console.log('🔄 Refreshing data for SW Component:', swComponentUuid);
      setLoading(true);
      
      try {
        const [swComponentResult, failuresResult, providerPortsResult, receiverPortsResult] = await Promise.all([
          getInfoForAppSWComp(swComponentUuid),
          getFailuresForSwComponents(swComponentUuid),
          getProviderPortsForSWComponent(swComponentUuid),
          getReceiverPortsForSWComponent(swComponentUuid)
        ]);

        if (swComponentResult.success && swComponentResult.data) {
          setSwComponent({
            uuid: swComponentResult.data.uuid,
            name: swComponentResult.data.name,
            failures: failuresResult.success && failuresResult.data ? failuresResult.data.map((f: Failure) => ({ uuid: f.failureUuid, name: f.failureName || 'Unnamed Failure' })) : []
          });
        }

        if (failuresResult.success && failuresResult.data) {
          const failuresWithCounts = await Promise.all(failuresResult.data.map(async (failure: Failure) => {
            const [riskRatings, tasks, reqs, notes] = await Promise.all([
              getRiskRatingNodes(failure.failureUuid),
              getSafetyTasksForNode(failure.failureUuid),
              getSafetyReqsForNode(failure.failureUuid),
              getSafetyNotesForNode(failure.failureUuid),
            ]);
            return {
              ...failure,
              riskRatingCount: riskRatings.success ? riskRatings.data?.length ?? 0 : 0,
              safetyTaskCount: tasks.success ? tasks.data?.length ?? 0 : 0,
              safetyReqCount: reqs.success ? reqs.data?.length ?? 0 : 0,
              safetyNoteCount: notes.success ? notes.data?.length ?? 0 : 0,
            };
          }));
          setFailures(failuresWithCounts);
        } else {
          setFailures([]);
        }

        if (providerPortsResult.success && providerPortsResult.data) {
          const freshProviderPorts = providerPortsResult.data;
          setProviderPorts(freshProviderPorts);
          const portFailuresMap: {[portUuid: string]: PortFailure[]} = {};
          for (const port of freshProviderPorts) {
            const portFailuresResult = await getFailuresForPorts(port.uuid);
            if (portFailuresResult.success && portFailuresResult.data) {
              const failuresWithCounts = await Promise.all(portFailuresResult.data.map(async (failure: PortFailure) => {
                const [riskRatings, tasks, reqs, notes] = await Promise.all([
                  getRiskRatingNodes(failure.failureUuid),
                  getSafetyTasksForNode(failure.failureUuid),
                  getSafetyReqsForNode(failure.failureUuid),
                  getSafetyNotesForNode(failure.failureUuid),
                ]);
                return {
                  ...failure,
                  riskRatingCount: riskRatings.success ? riskRatings.data?.length ?? 0 : 0,
                  safetyTaskCount: tasks.success ? tasks.data?.length ?? 0 : 0,
                  safetyReqCount: reqs.success ? reqs.data?.length ?? 0 : 0,
                  safetyNoteCount: notes.success ? notes.data?.length ?? 0 : 0,
                };
              }));
              portFailuresMap[port.uuid] = failuresWithCounts;
            } else {
              portFailuresMap[port.uuid] = [];
            }
          }
          setPortFailures(portFailuresMap);
        } else {
          setProviderPorts([]);
          setPortFailures({});
        }

        if (receiverPortsResult.success && receiverPortsResult.data) {
          const freshReceiverPorts = receiverPortsResult.data;
          setReceiverPorts(freshReceiverPorts);
          if (freshReceiverPorts.length > 0) {
            const receiverPortFailuresMap: {[portUuid: string]: PortFailure[]} = {};
            for (const port of freshReceiverPorts) {
              const receiverPortFailuresResult = await getFailuresForPorts(port.uuid);
              if (receiverPortFailuresResult.success && receiverPortFailuresResult.data) {
                const failuresWithCounts = await Promise.all(receiverPortFailuresResult.data.map(async (failure: PortFailure) => {
                  const [riskRatings, tasks, reqs, notes] = await Promise.all([
                    getRiskRatingNodes(failure.failureUuid),
                    getSafetyTasksForNode(failure.failureUuid),
                    getSafetyReqsForNode(failure.failureUuid),
                    getSafetyNotesForNode(failure.failureUuid),
                  ]);
                  return {
                    ...failure,
                    riskRatingCount: riskRatings.success ? riskRatings.data?.length ?? 0 : 0,
                    safetyTaskCount: tasks.success ? tasks.data?.length ?? 0 : 0,
                    safetyReqCount: reqs.success ? reqs.data?.length ?? 0 : 0,
                    safetyNoteCount: notes.success ? notes.data?.length ?? 0 : 0,
                  };
                }));
                receiverPortFailuresMap[port.uuid] = failuresWithCounts;
              } else {
                receiverPortFailuresMap[port.uuid] = [];
              }
            }
            setReceiverPortFailures(receiverPortFailuresMap);
          }
        } else {
          setReceiverPorts([]);
          setReceiverPortFailures({});
        }
      } catch (error) {
        console.error("Error loading component data:", error);
        message.error('An unexpected error occurred while loading data.');
      } finally {
        setLoading(false);
      }
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
