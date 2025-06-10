import { driver } from '../config';
import { QueryResult } from 'neo4j-driver';
import { AssemblyContextInfo, ProvidedInterfaceInfo, PortInfo } from '../types';

/**
 * Get assembly context information for a P_PORT_PROTOTYPE
 */
export const getAssemblyContextForPPort = async (pPortUuid: string): Promise<QueryResult<AssemblyContextInfo>> => {
  const session = driver.session(); 
  try {
    const result = await session.run<AssemblyContextInfo>(
      `
      MATCH (pPortNode:P_PORT_PROTOTYPE {uuid: $pPortUuid})
      //find the swConnector for this P_PORT
      MATCH (pPortNode)<-[:\`TARGET-P-PORT-REF\`]-(swConnector:ASSEMBLY_SW_CONNECTOR)
      //find the SW_COMPONENT_PROTOTYPEs which are connected to the swConnector
      MATCH (swConnector)-[:\`CONTEXT-COMPONENT-REF\`]->(swCompPro)
      WHERE swCompPro:SW_COMPONENT_PROTOTYPE OR swCompPro:VirtualArxmlRefTarget
      //find the APPLICATION_SW_COMPONENT_TYPE which is connected for filtering out
      MATCH (containingSwc:APPLICATION_SW_COMPONENT_TYPE) -[:CONTAINS]->(pPortNode)
      WHERE swCompPro.name <> containingSwc.name
      RETURN DISTINCT 
       swConnector.name as assemblySWConnectorName,
       swConnector.uuid as assemblySWConnectorUUID,
       swCompPro.name as swComponentName,
       swCompPro.uuid as swComponentUUID,
       labels(swCompPro)[0] as swComponentType
      `,
      { pPortUuid }
    );
    return result;
  } finally {
    await session.close();
  }
};

/**
 * Get assembly context information for an R_PORT_PROTOTYPE
 */
export const getAssemblyContextForRPort = async (rPortUuid: string): Promise<QueryResult<AssemblyContextInfo>> => {
  const session = driver.session();
  try {
    const result = await session.run<AssemblyContextInfo>(
      `
      MATCH (rPortNode:R_PORT_PROTOTYPE {uuid: $rPortUuid})
      //find the swConnector for this R_PORT
      MATCH (rPortNode)<-[:\`TARGET-R-PORT-REF\`]-(swConnector:ASSEMBLY_SW_CONNECTOR)
      //find the SW_COMPONENT_PROTOTYPEs which are connected to the swConnector
      MATCH (swConnector)-[:\`CONTEXT-COMPONENT-REF\`]->(swCompPro)
      WHERE swCompPro:SW_COMPONENT_PROTOTYPE OR swCompPro:VirtualArxmlRefTarget
      //find the APPLICATION_SW_COMPONENT_TYPE which is connected for filtering out
      MATCH (containingSwc:APPLICATION_SW_COMPONENT_TYPE) -[:CONTAINS]->(rPortNode)
      WHERE swCompPro.name <> containingSwc.name
      RETURN DISTINCT 
       swConnector.name as assemblySWConnectorName,
       swConnector.uuid as assemblySWConnectorUUID,
       swCompPro.name as swComponentName,
       swCompPro.uuid as swComponentUUID,
       labels(swCompPro)[0] as swComponentType
      `,
      { rPortUuid }
    );
    return result;
  } finally {
    await session.close();
  }
};

/**
 * Get interface information for a specific port
 */
export const getInformationForPort = async (portUuid: string): Promise<{
  success: boolean;
  data?: ProvidedInterfaceInfo;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    console.log(`🔍 Fetching interface information for port UUID: ${portUuid}`);
    
    const result = await session.run(
      `MATCH (port) 
       WHERE port.uuid = $portUuid 
       MATCH (port)-[rel_port_to_interface:\`PROVIDED-INTERFACE-TREF\`|\`REQUIRED-INTERFACE-TREF\`]->(interfaceRef)
       RETURN interfaceRef`,
      { portUuid }
    );

    if (result.records.length === 0) {
      console.log(`❌ No interface found for port UUID: ${portUuid}`);
      return {
        success: false,
        message: `No interface reference found for port with UUID: ${portUuid}`,
      };
    }

    // Process the result - should be a single record
    const record = result.records[0];
    const interfaceRef = record.get('interfaceRef');
    
    if (!interfaceRef || !interfaceRef.properties) {
      return {
        success: false,
        message: `Invalid interface reference data for port UUID: ${portUuid}`,
      };
    }

    const interfaceInfo: ProvidedInterfaceInfo = {
      interfaceType: interfaceRef.labels && interfaceRef.labels.length > 0 ? interfaceRef.labels[0] : 'UNKNOWN',
      interfaceName: interfaceRef.properties.name || 'Unnamed Interface',
      arxmlPath: interfaceRef.properties.arxmlPath || '',
      uuid: interfaceRef.properties.uuid || '',
    };

    console.log(`✅ Interface information retrieved for port ${portUuid}:`, interfaceInfo);

    return {
      success: true,
      data: interfaceInfo,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching interface information for port UUID ${portUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error fetching interface information for port UUID ${portUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Get provider ports (P_PORT_PROTOTYPE) for a given SW component UUID
 */
export const getProviderPortsForSWComponent = async (swComponentUuid: string): Promise<{
  success: boolean;
  data?: PortInfo[];
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    console.log(`🔍 Fetching provider ports for SW component UUID: ${swComponentUuid}`);
    
    const result = await session.run(
      `MATCH (SWcomponent) 
       WHERE SWcomponent.uuid = $swComponentUuid 
       MATCH (SWcomponent)-[r:CONTAINS]->(pPort:P_PORT_PROTOTYPE)
       RETURN pPort`,
      { swComponentUuid }
    );

    if (result.records.length === 0) {
      console.log(`❌ No provider ports found for SW component UUID: ${swComponentUuid}`);
      return {
        success: true,
        data: [],
        message: `No provider ports found for SW component with UUID: ${swComponentUuid}`,
      };
    }

    // Process the results
    const providerPorts: PortInfo[] = result.records.map(record => {
      const pPort = record.get('pPort');
      
      return {
        name: pPort.properties.name || 'Unnamed Port',
        uuid: pPort.properties.uuid || '',
        type: pPort.labels && pPort.labels.length > 0 ? pPort.labels[0] : 'P_PORT_PROTOTYPE',
      };
    });

    console.log(`✅ Found ${providerPorts.length} provider ports for SW component ${swComponentUuid}:`, providerPorts);

    return {
      success: true,
      data: providerPorts,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching provider ports for SW component UUID ${swComponentUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error fetching provider ports for SW component UUID ${swComponentUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
