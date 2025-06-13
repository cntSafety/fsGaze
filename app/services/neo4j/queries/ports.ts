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
    // console.log(`🔍 Fetching interface information for port UUID: ${portUuid}`);
    
    const result = await session.run(
      `MATCH (port) 
       WHERE port.uuid = $portUuid 
       MATCH (port)-[rel_port_to_interface:\`PROVIDED-INTERFACE-TREF\`|\`REQUIRED-INTERFACE-TREF\`]->(interfaceRef)
       RETURN interfaceRef`,
      { portUuid }
    );

    if (result.records.length === 0) {
      // console.log(`❌ No interface found for port UUID: ${portUuid}`);
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

    // console.log(`✅ Interface information retrieved for port ${portUuid}:`, interfaceInfo);

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
    // console.log(`🔍 Fetching provider ports for SW component UUID: ${swComponentUuid}`);
    
    const result = await session.run(
      `MATCH (SWcomponent) 
       WHERE SWcomponent.uuid = $swComponentUuid 
       MATCH (SWcomponent)-[r:CONTAINS]->(pPort:P_PORT_PROTOTYPE)
       RETURN pPort`,
      { swComponentUuid }
    );

    if (result.records.length === 0) {
      // console.log(`❌ No provider ports found for SW component UUID: ${swComponentUuid}`);
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

    // console.log(`✅ Found ${providerPorts.length} provider ports for SW component ${swComponentUuid}:`, providerPorts);

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

/**
 * Get receiver ports (R_PORT_PROTOTYPE) for a given SW component UUID
 */
export const getReceiverPortsForSWComponent = async (swComponentUuid: string): Promise<{
  success: boolean;
  data?: PortInfo[];
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // console.log(`🔍 Fetching receiver ports for SW component UUID: ${swComponentUuid}`);
    
    const result = await session.run(
      `MATCH (SWcomponent) 
       WHERE SWcomponent.uuid = $swComponentUuid 
       MATCH (SWcomponent)-[r:CONTAINS]->(rPort:R_PORT_PROTOTYPE)
       RETURN rPort`,
      { swComponentUuid }
    );

    if (result.records.length === 0) {
      // console.log(`❌ No receiver ports found for SW component UUID: ${swComponentUuid}`);
      return {
        success: true,
        data: [],
        message: `No receiver ports found for SW component with UUID: ${swComponentUuid}`,
      };
    }

    // Process the results
    const receiverPorts: PortInfo[] = result.records.map(record => {
      const rPort = record.get('rPort');
      
      return {
        name: rPort.properties.name || 'Unnamed Port',
        uuid: rPort.properties.uuid || '',
        type: rPort.labels && rPort.labels.length > 0 ? rPort.labels[0] : 'R_PORT_PROTOTYPE',
      };
    });

    // console.log(`✅ Found ${receiverPorts.length} receiver ports for SW component ${swComponentUuid}:`, receiverPorts);

    return {
      success: true,
      data: receiverPorts,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error fetching receiver ports for SW component UUID ${swComponentUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error fetching receiver ports for SW component UUID ${swComponentUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Find communication partners for R-Ports that don't have a connection to ASSEMBLY_SW_CONNECTOR 
 * via the TARGET-R-PORT-REF relationship. This function traces through the required interface
 * to find partner components that provide the same interface.
 */
export const getCommunicationPartnersForRPortWithoutConnector = async (rPortUuid: string): Promise<{
  success: boolean;
  data?: Array<{
    partnerName: string;
    partnerUUID: string;
    partnerPath: string;
  }>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    // console.log(`🔍 Finding communication partners for R-Port without SW connector. UUID: ${rPortUuid}`);
    
    const result = await session.run(
      `MATCH (RPortsWithoutSWConnector) WHERE RPortsWithoutSWConnector.uuid = $rPortUuid
       //for RPorts without SW connector find the Required Interface
       MATCH (RPortsWithoutSWConnector)-[:\`REQUIRED-INTERFACE-TREF\`]->(RPortsWithoutSWConnectorReqiredInterface)
       //for the additional R port interface find the source (this is for example a certain interface type)
       //RPortsWithoutSWConnectorReqiredInterface short is RPortsWOswConReqInter
       MATCH (RPortsWithoutSWConnectorReqiredInterface)<-[:CONTAINS]-(RPortsWOswConReqInterGroup)
       //finally get the partner
       MATCH (RPortsWOswConReqInterGroup)<-[:CONTAINS]-(PartnerForRPortsWOswCon)
       RETURN PartnerForRPortsWOswCon.name as partnerName, 
              PartnerForRPortsWOswCon.uuid as partnerUUID, 
              PartnerForRPortsWOswCon.arxmlPath as partnerPath`,
      { rPortUuid }
    );

    if (result.records.length === 0) {
      // console.log(`❌ No communication partners found for R-Port UUID: ${rPortUuid}`);
      return {
        success: true,
        data: [],
        message: `No communication partners found for R-Port with UUID: ${rPortUuid}`,
      };
    }

    // Process the results
    const partners = result.records.map(record => ({
      partnerName: record.get('partnerName') || 'Unnamed Partner',
      partnerUUID: record.get('partnerUUID') || '',
      partnerPath: record.get('partnerPath') || '',
    }));

    // console.log(`✅ Found ${partners.length} communication partners for R-Port ${rPortUuid}:`, partners);

    return {
      success: true,
      data: partners,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error finding communication partners for R-Port UUID ${rPortUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error finding communication partners for R-Port UUID ${rPortUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};
