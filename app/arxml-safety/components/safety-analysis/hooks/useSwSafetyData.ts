import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { getInfoForAppSWComp } from '../../../../services/neo4j/queries/components';
import { getFailuresForSwComponents, getFailuresForPorts } from '../../../../services/neo4j/queries/safety/failureModes';
import { getProviderPortsForSWComponent, getReceiverPortsForSWComponent } from '../../../../services/neo4j/queries/ports';
import { SwComponent, Failure, PortFailure, ProviderPort } from '../types';

export const useSwSafetyData = (swComponentUuid: string) => {
  const [loading, setLoading] = useState(true);
  const [swComponent, setSwComponent] = useState<SwComponent | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [providerPorts, setProviderPorts] = useState<ProviderPort[]>([]);
  const [portFailures, setPortFailures] = useState<{[portUuid: string]: PortFailure[]}>({});
  const [receiverPorts, setReceiverPorts] = useState<ProviderPort[]>([]);
  const [receiverPortFailures, setReceiverPortFailures] = useState<{[portUuid: string]: PortFailure[]}>({});

  const loadData = useCallback(async () => {
    console.log('🚀 useSwSafetyData: loadData called for component', swComponentUuid);
    try {
      setLoading(true);
      
      // Get SW component details and failures in parallel
      const [swComponentResult, failuresResult, providerPortsResult, receiverPortsResult] = await Promise.all([
        getInfoForAppSWComp(swComponentUuid),
        getFailuresForSwComponents(swComponentUuid),
        getProviderPortsForSWComponent(swComponentUuid),
        getReceiverPortsForSWComponent(swComponentUuid)
      ]);

      // Handle SW component
      if (swComponentResult.success && swComponentResult.data) {
        setSwComponent(swComponentResult.data);
        // console.log('SW Component:', swComponentResult.data);
      } else {
        message.error(swComponentResult.message || 'SW Component not found');
      }

      // Handle SW component failures
      if (failuresResult.success && failuresResult.data) {
        console.log('💾 useSwSafetyData: Setting failures', {
          count: failuresResult.data.length,
          failures: failuresResult.data.map(f => ({ uuid: f.failureUuid, name: f.failureName }))
        });
        setFailures(failuresResult.data);
        // console.log('SW Component Failures:', failuresResult.data);
      } else {
        console.log('💾 useSwSafetyData: No failures found, setting empty array');
        setFailures([]);
      }
      
      // Handle provider ports
      if (providerPortsResult.success && providerPortsResult.data) {
        setProviderPorts(providerPortsResult.data);
        // console.log('Provider Ports:', providerPortsResult.data);
        
        // Get failures for provider ports - call function for each port individually
        if (providerPortsResult.data.length > 0) {
          const portFailuresMap: {[portUuid: string]: PortFailure[]} = {};
          
          for (const port of providerPortsResult.data) {
            const portFailuresResult = await getFailuresForPorts(port.uuid);
            
            if (portFailuresResult.success && portFailuresResult.data) {
              portFailuresMap[port.uuid] = portFailuresResult.data;
            } else {
              portFailuresMap[port.uuid] = [];
            }
          }
          
          setPortFailures(portFailuresMap);
          // console.log('Provider Port Failures:', portFailuresMap);
        }
      }

      // Handle receiver ports
      if (receiverPortsResult.success && receiverPortsResult.data) {
        const receiverPortsData = receiverPortsResult.data.map(port => ({
          name: port.name,
          uuid: port.uuid,
          type: port.type,
        }));
        setReceiverPorts(receiverPortsData);
        // console.log('Receiver Ports:', receiverPortsData);

        // Get failures for receiver ports - call function for each port individually
        if (receiverPortsData.length > 0) {
          const receiverPortFailuresMap: {[portUuid: string]: PortFailure[]} = {};
          
          for (const port of receiverPortsData) {
            const receiverPortFailuresResult = await getFailuresForPorts(port.uuid);
            
            if (receiverPortFailuresResult.success && receiverPortFailuresResult.data) {
              receiverPortFailuresMap[port.uuid] = receiverPortFailuresResult.data;
            } else {
              receiverPortFailuresMap[port.uuid] = [];
            }
          }
          
          setReceiverPortFailures(receiverPortFailuresMap);
          // console.log('Receiver Port Failures:', receiverPortFailuresMap);
        }
      }
    } catch (error) {
      console.error('Error loading component data:', error);
      message.error('Failed to load component data');
    } finally {
      setLoading(false);
    }
  }, [swComponentUuid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    refreshData: loadData,
  };
};
