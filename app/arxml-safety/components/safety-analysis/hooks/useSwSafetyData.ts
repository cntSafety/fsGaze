import { useState, useEffect } from 'react';
import { message } from 'antd';
import { getInfoForAppSWComp } from '../../../../services/neo4j/queries/components';
import { getFailuresForSwComponents, getFailuresForPorts } from '../../../../services/neo4j/queries/safety';
import { getProviderPortsForSWComponent } from '../../../../services/neo4j/queries/ports';
import { SwComponent, Failure, PortFailure, ProviderPort } from '../types';
import { SafetyTableRow } from '../../CoreSafetyTable';

export const useSwSafetyData = (swComponentUuid: string) => {
  const [loading, setLoading] = useState(true);
  const [swComponent, setSwComponent] = useState<SwComponent | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [providerPorts, setProviderPorts] = useState<ProviderPort[]>([]);
  const [portFailures, setPortFailures] = useState<{[portUuid: string]: PortFailure[]}>({});

  const loadComponentData = async () => {
    try {
      setLoading(true);
      
      // Get SW component details using the new efficient query
      const swComponentResult = await getInfoForAppSWComp(swComponentUuid);
      if (swComponentResult.success && swComponentResult.data) {
        setSwComponent(swComponentResult.data);
        console.log('SW Component:', swComponentResult.data);
        
        // Get failures for this component
        const failuresResult = await getFailuresForSwComponents(swComponentUuid);
        if (failuresResult.success && failuresResult.data) {
          setFailures(failuresResult.data);
        }
        
        // Get provider ports for this component
        const providerPortsResult = await getProviderPortsForSWComponent(swComponentUuid);
        if (providerPortsResult.success && providerPortsResult.data) {
          setProviderPorts(providerPortsResult.data);
          console.log('Provider Ports:', providerPortsResult.data);
          
          // Get failures for each provider port
          const portFailuresMap: {[portUuid: string]: PortFailure[]} = {};
          
          for (const port of providerPortsResult.data) {
            const portFailuresResult = await getFailuresForPorts(port.uuid);
            if (portFailuresResult.success && portFailuresResult.data) {
              portFailuresMap[port.uuid] = portFailuresResult.data;
            }
          }
          
          setPortFailures(portFailuresMap);
        }
      } else {
        message.error(swComponentResult.message || 'SW Component not found');
      }
    } catch (error) {
      console.error('Error loading component data:', error);
      message.error('Failed to load component data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComponentData();
  }, [swComponentUuid]);

  return {
    loading,
    swComponent,
    failures,
    setFailures,
    providerPorts,
    portFailures,
    setPortFailures,
    loadComponentData
  };
};
