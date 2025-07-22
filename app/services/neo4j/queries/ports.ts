/**
 * @file Contains all Neo4j queries related to ARXML ports (P-Ports and R-Ports),
 * their connections, and associated interfaces.
 */
import { driver } from '../config';
import { QueryResult } from 'neo4j-driver';
import { AssemblyContextInfo, ProvidedInterfaceInfo, PortInfo, FullPortConnectionInfo } from '../types';

/**
 * Defines the structure for interface-based connection information for a P-Port.
 */
export interface SRInterfaceConnectionInfo {
  SRInterfaceName: string | null;
  SRInterfaceUUID: string | null;
  receiverPortUUID: string | null;
  receiverPortName: string | null;
  failureModeName: string | null;
  failureModeUUID: string | null;
  failureModeASIL: string | null;
  swComponentClassName: string | null;
  swComponentClassUUID: string | null;
  swComponentClassType: string | null;
}

/**
 * Defines the structure for interface-based connection information for an R-Port.
 */
export interface SRInterfaceConnectionInfoRPort {
  SRInterfaceName: string | null;
  SRInterfaceUUID: string | null;
  providerPortUUID: string | null;
  providerPortName: string | null;
  failureModeName: string | null;
  failureModeUUID: string | null;
  failureModeASIL: string | null;
  swComponentClassName: string | null;
  swComponentClassUUID: string | null;
  swComponentClassType: string | null;
}

/**
 * Defines the structure for information about a partner port found via connection traversal.
 */
export interface PartnerPortInfo {
  partnerPortName: string;
  partnerPortUUID: string;
  partnerPortType: string;
  partnerPortOwner: string;
  partnerPortOwnerUUID: string;
  partnerPortOwnerType: string[];
  failureModeName: string | null;
  failureModeUUID: string | null;
  failureModeASIL: string | null;
}

/**
 * Retrieves the assembly context for a given P-PORT-PROTOTYPE.
 * This includes the connected R-PORT-PROTOTYPE, its containing SW_COMPONENT_PROTOTYPE,
 * and any associated Failure Modes with their ASIL ratings.
 * It also resolves the actual component and port within a composition if delegation is used.
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
      //find the APPLICATION_SW_COMPONENT_TYPE etc which is connected for filtering out the prototype with the same name as the containingSWC to avoid retruning the prototype of the component owning the port
      MATCH (containingSwc) -[:CONTAINS]->(pPortNode)
      WHERE (containingSwc:APPLICATION_SW_COMPONENT_TYPE OR containingSwc:COMPOSITION_SW_COMPONENT_TYPE OR containingSwc:SERVICE_SW_COMPONENT_TYPE OR containingSwc:ECU_ABSTRACTION_SW_COMPONENT_TYPE )
        AND swCompPro.name <> containingSwc.name
      // Get the connected R_PORT and its failure modes with ASIL information
      OPTIONAL MATCH (swConnector)-[:\`TARGET-R-PORT-REF\`]->(rPortNode)
      OPTIONAL MATCH (rPortNode)<-[:OCCURRENCE]-(FM:FAILUREMODE)
      //new --> get also the SW Component Type from prototype compoent to enable uuid based navigation
      OPTIONAL MATCH (swCompPro)-[:\`TYPE-TREF\`]->(swCompClass)
      WHERE (swCompClass:APPLICATION_SW_COMPONENT_TYPE OR swCompClass:COMPOSITION_SW_COMPONENT_TYPE OR swCompClass:SERVICE_SW_COMPONENT_TYPE  OR containingSwc:ECU_ABSTRACTION_SW_COMPONENT_TYPE)
      //If the swCompPro type is COMPOSITION_SW_COMPONENT_TYPE lets find the DELEGATION_SW_CONNECTOR and with that find the component and port within that composition
      OPTIONAL MATCH (rPortNode)<-[:\`OUTER-PORT-REF\`]-(delegationSWCon:DELEGATION_SW_CONNECTOR)  
      OPTIONAL MATCH (delegationSWCon)-[:\`TARGET-R-PORT-REF\`]->(rPortNodeWithinComp)
      OPTIONAL MATCH (rPortNodeWithinComp:R_PORT_PROTOTYPE)<-[:CONTAINS]->(compWithinComposition:APPLICATION_SW_COMPONENT_TYPE)
      OPTIONAL MATCH (rPortNodeWithinComp)<-[:OCCURRENCE]-(FMwithinComprPort:FAILUREMODE)  
      RETURN DISTINCT 
       swConnector.name as assemblySWConnectorName,
       swConnector.uuid as assemblySWConnectorUUID,
       swCompPro.name as swComponentName,
       swCompPro.uuid as swComponentUUID,
       labels(swCompPro)[0] as swComponentType,
       rPortNode.uuid as receiverPortUUID,
       rPortNode.name as receiverPortName,
       FM.name as failureModeName,
       FM.uuid as failureModeUUID,
       FM.asil as failureModeASIL,
       swCompClass.name as swComponentClassName,
       swCompClass.uuid as swComponentClassUUID,
       labels(swCompClass)[0] as swComponentClassType,
       compWithinComposition.name as swComponentWithinCompName,
       compWithinComposition.uuid as swComponentWithinCompUUID,
       rPortNodeWithinComp.uuid as receiverPortWithinCompositionUUID,
       rPortNodeWithinComp.name as receiverPortWithinCompositionUUIDName,
       FMwithinComprPort.name as failureModeNameWithinCompositionRPort,
      FMwithinComprPort.uuid as failureModeUUIDWithinCompositionRPort,
      FMwithinComprPort.asil as failureModeASILWithinCompositionRPort
      `,
      { pPortUuid }
    );
    return result;
  } finally {
    await session.close();
  }
};

/**
 * Retrieves the assembly context for a given R-Port (Receiver Port).
 * This query finds the software component that the R-Port is connected to
 * via an assembly connector. It also fetches details about the connected P-Port
 * on the other side, including any associated failure modes and their ASIL ratings.
 *
 * @param rPortUuid The UUID of the R_PORT_PROTOTYPE node.
 * @returns A Promise that resolves to the raw Neo4j QueryResult containing assembly context and provider port failure info.
 */
export const getAssemblyContextForRPort = async (rPortUuid: string): Promise<QueryResult<AssemblyContextInfo>> => {
  const session = driver.session();
  try {
    const result = await session.run<AssemblyContextInfo>(
      `
       MATCH (rPortNode:R_PORT_PROTOTYPE {uuid: $rPortUuid})

      // Use OPTIONAL MATCH for both direct and delegated paths to find the assembly connector
      OPTIONAL MATCH (rPortNode)<-[:\`TARGET-R-PORT-REF\`]-(directAssemblyConnector:ASSEMBLY_SW_CONNECTOR)
      OPTIONAL MATCH (rPortNode)<-[:\`TARGET-R-PORT-REF\`]-(delegationConnector:DELEGATION_SW_CONNECTOR)-[:\`OUTER-PORT-REF\`]->(outerRPort:R_PORT_PROTOTYPE)
      OPTIONAL MATCH (outerRPort)<-[:\`TARGET-R-PORT-REF\`]-(delegatedAssemblyConnector:ASSEMBLY_SW_CONNECTOR)
      
      // Unify the found connector into a single variable
      WITH rPortNode, COALESCE(directAssemblyConnector, delegatedAssemblyConnector) AS swConnector
      WHERE swConnector IS NOT NULL
      
      // Now proceed with the original logic using the unified 'swConnector'
      // Find the connected component prototype
      MATCH (swConnector)-[:\`CONTEXT-COMPONENT-REF\`]->(swCompPro)
      WHERE swCompPro:SW_COMPONENT_PROTOTYPE OR swCompPro:VirtualArxmlRefTarget
      
      // Find the component that contains the *original* rPortNode to filter it out
      MATCH (containingSwc)-[:CONTAINS]->(rPortNode)
      WHERE (containingSwc:APPLICATION_SW_COMPONENT_TYPE OR containingSwc:COMPOSITION_SW_COMPONENT_TYPE OR containingSwc:SERVICE_SW_COMPONENT_TYPE)
        AND swCompPro.name <> containingSwc.name
      
      // Get the connected P_PORT (the provider) and its failure modes
      OPTIONAL MATCH (swConnector)-[:\`TARGET-P-PORT-REF\`]->(pPortNode:P_PORT_PROTOTYPE)
      OPTIONAL MATCH (pPortNode)<-[:OCCURRENCE]-(FM:FAILUREMODE)
      
      //check if the pPort has also a OUTER-PORT-REF that means it is also part of a composition and we need the DELEGATION_SW_CONNECTOR
       OPTIONAL MATCH (pPortNode)<-[:\`OUTER-PORT-REF\`]->(delegationSWConnectorAtPartner:DELEGATION_SW_CONNECTOR)
       OPTIONAL MATCH (delegationSWConnectorAtPartner)-[:\`CONTEXT-COMPONENT-REF\`]->(swCompProWithinComposition)
      OPTIONAL MATCH (swCompProWithinComposition)-[:\`TYPE-TREF\`]->(swCompClassWithinComposition)
      // Get the connected P_PORT (the provider) and its failure modes
      OPTIONAL MATCH (delegationSWConnectorAtPartner)-[:\`TARGET-P-PORT-REF\`]->(pPortNodeWithinComposition:P_PORT_PROTOTYPE)
      OPTIONAL MATCH (pPortNodeWithinComposition)<-[:OCCURRENCE]-(FMWithinComposition:FAILUREMODE)

      // Get the type of the connected component prototype
      OPTIONAL MATCH (swCompPro)-[:\`TYPE-TREF\`]->(swCompClass)
      WHERE (swCompClass:APPLICATION_SW_COMPONENT_TYPE OR swCompClass:COMPOSITION_SW_COMPONENT_TYPE OR swCompClass:SERVICE_SW_COMPONENT_TYPE)
      
      RETURN DISTINCT
        swConnector.name as assemblySWConnectorName,
        swConnector.uuid as assemblySWConnectorUUID,
        swCompPro.name as swComponentName,
        swCompPro.uuid as swComponentUUID,
        labels(swCompPro)[0] as swComponentType,
        pPortNode.uuid as providerPortUUID,
        pPortNode.name as providerPortName,
        FM.name as failureModeName,
        FM.uuid as failureModeUUID,
        FM.asil as failureModeASIL,
        swCompClass.name as swComponentClassName,
        swCompClass.uuid as swComponentClassUUID,
        labels(swCompClass)[0] as swComponentClassType,
        pPortNodeWithinComposition.uuid as providerPortUUIDWithinComp,
        pPortNodeWithinComposition.name as providerPortNameWithinComp,
        swCompClassWithinComposition.name as swComponentClassNameWithinComp,
        swCompClassWithinComposition.uuid as swComponentClassUUIDWithinComp,
        labels(swCompClassWithinComposition)[0] as swComponentClassTypeWithinComp,
        FMWithinComposition.name as failureModeNameWithinComp,
        FMWithinComposition.uuid as failureModeUUIDWithinComp,
        FMWithinComposition.asil as failureModeASILWithinComp
      `,
      { rPortUuid }
    );
    return result;
  } finally {
    await session.close();
  }
};

/**
 * Fetches the interface information for a specific port (either P-Port or R-Port).
 * An interface defines the "contract" for the port, such as a SENDER-RECEIVER or CLIENT-SERVER interface.
 *
 * @param portUuid The UUID of the port node.
 * @returns A Promise that resolves to an object containing the success status and, if successful,
 *          the `ProvidedInterfaceInfo` data.
 */
export const getInformationForPort = async (portUuid: string): Promise<{
  success: boolean;
  data?: ProvidedInterfaceInfo;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    /*
    console.log(`🔍 Fetching interface information for port UUID: ${portUuid}`);
    */
    
    const result = await session.run(
      `MATCH (port) 
       WHERE port.uuid = $portUuid 
       MATCH (port)-[rel_port_to_interface:\`PROVIDED-INTERFACE-TREF\`|\`REQUIRED-INTERFACE-TREF\`]->(interfaceRef)
       RETURN interfaceRef`,
      { portUuid }
    );

    if (result.records.length === 0) {
      /*
      console.log(`❌ No interface found for port UUID: ${portUuid}`);
      */
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

    /*
    console.log(`✅ Interface information retrieved for port ${portUuid}:`, interfaceInfo);
    */

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
 * Retrieves all provider ports (P_PORT_PROTOTYPE) contained within a given software component.
 *
 * @param swComponentUuid The UUID of the software component.
 * @returns A Promise that resolves to an object containing the success status and, if successful,
 *          an array of `PortInfo` objects.
 */
export const getProviderPortsForSWComponent = async (swComponentUuid: string): Promise<{
  success: boolean;
  data?: PortInfo[];
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    /*
    console.log(`🔍 Fetching provider ports for SW component UUID: ${swComponentUuid}`);
    */
    
    const result = await session.run(
      `MATCH (SWcomponent) 
       WHERE SWcomponent.uuid = $swComponentUuid 
       MATCH (SWcomponent)-[r:CONTAINS]->(pPort:P_PORT_PROTOTYPE)
       RETURN pPort`,
      { swComponentUuid }
    );

    if (result.records.length === 0) {
      /*
      console.log(`❌ No provider ports found for SW component UUID: ${swComponentUuid}`);
      */
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

    /*
    console.log(`✅ Found ${providerPorts.length} provider ports for SW component ${swComponentUuid}:`, providerPorts);
    */

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
 * Retrieves all receiver ports (R_PORT_PROTOTYPE) contained within a given software component.
 *
 * @param swComponentUuid The UUID of the software component.
 * @returns A Promise that resolves to an object containing the success status and, if successful,
 *          an array of `PortInfo` objects.
 */
export const getReceiverPortsForSWComponent = async (swComponentUuid: string): Promise<{
  success: boolean;
  data?: PortInfo[];
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    /*
    console.log(`🔍 Fetching receiver ports for SW component UUID: ${swComponentUuid}`);
    */
    
    const result = await session.run(
      `MATCH (SWcomponent) 
       WHERE SWcomponent.uuid = $swComponentUuid 
       MATCH (SWcomponent)-[r:CONTAINS]->(rPort:R_PORT_PROTOTYPE)
       RETURN rPort`,
      { swComponentUuid }
    );

    if (result.records.length === 0) {
      /*
      console.log(`❌ No receiver ports found for SW component UUID: ${swComponentUuid}`);
      */
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

    /*
    console.log(`✅ Found ${receiverPorts.length} receiver ports for SW component ${swComponentUuid}:`, receiverPorts);
    */

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
 * For a given R-Port that is part of a MODE-SWITCH-INTERFACE, this query finds the
 * "partner" P-Port on the other side of the connection. This is useful for tracing
 * mode switch dependencies.
 *
 * @param rPortUuid The UUID of the R_PORT_PROTOTYPE that has a MODE-SWITCH-INTERFACE.
 * @returns A Promise that resolves to an object containing the success status and, if successful,
 *          an array of partner port details.
 */
export const getSourcePackageForModeSwitchInterface = async (rPortUuid: string): Promise<{
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
    /*
    console.log(`🔍 Fetching source package for mode switch interface, R-Port UUID: ${rPortUuid}`);
    */
    
    const result = await session.run(
      `MATCH (Rports) WHERE Rports.uuid = $rPortUuid
       //for RPorts without SW connector find the Required Interface e.g. mode switch interface
       MATCH (Rports)-[:\`REQUIRED-INTERFACE-TREF\`]->(RequiredInterface)
       //Filter to only include MODE_SWITCH_INTERFACE
       WHERE "MODE_SWITCH_INTERFACE" IN labels(RequiredInterface)
       //for the Rport interface find the parent e.g. Autosar Interface package
       MATCH (RequiredInterface)<-[:CONTAINS]-(interfaceParent)
       //finally get the source package of that interface e.g. /MICROSAR/BswM_swc
       MATCH (interfaceParent)<-[:CONTAINS]-(SourcePackage)
       RETURN SourcePackage.name as partnerName, 
              SourcePackage.uuid as partnerUUID, 
              SourcePackage.arxmlPath as partnerPath`,
      { rPortUuid }
    );

    if (result.records.length === 0) {
      /*
      console.log(`❌ No source package found for R-Port UUID: ${rPortUuid}`);
      */
      return {
        success: false,
        message: `No source package found for R-Port with UUID: ${rPortUuid}`,
      };
    }

    // Process the results
    const partners = result.records.map(record => ({
      partnerName: record.get('partnerName') || 'Unnamed Partner',
      partnerUUID: record.get('partnerUUID') || '',
      partnerPath: record.get('partnerPath') || '',
    }));

    /*
    console.log(`✅ Found ${partners.length} source packages for R-Port ${rPortUuid}:`, partners);
    */

    return {
      success: true,
      data: partners,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error finding source package for MODE_SWITCH_INTERFACE with R-Port UUID ${rPortUuid}:`, errorMessage);
    
    return {
      success: false,
      message: `Error finding source package for MODE_SWITCH_INTERFACE with R-Port UUID ${rPortUuid}.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Fetches all assembly port connections from the database, including names.
 * This is a global query and does not depend on specific diagram contents.
 * @returns A Promise that resolves to an array of FullPortConnectionInfo objects.
 */
export const getAllPortConnections = async (): Promise<{
    success: boolean;
    data?: FullPortConnectionInfo[];
    message?: string;
}> => {
    const session = driver.session();
    try {
        const result = await session.run(
            `
            MATCH (p_port:P_PORT_PROTOTYPE)<-[:\`TARGET-P-PORT-REF\`]-(connector:ASSEMBLY_SW_CONNECTOR)
            MATCH (r_port:R_PORT_PROTOTYPE)<-[:\`TARGET-R-PORT-REF\`]-(connector)
            
            MATCH (p_comp)-[:CONTAINS]->(p_port)
            MATCH (r_comp)-[:CONTAINS]->(r_port)

            RETURN DISTINCT
              p_port.uuid AS sourcePortUuid,
              p_port.name AS sourcePortName,
              p_comp.uuid AS sourceComponentUuid,
              p_comp.name AS sourceComponentName,
              r_port.uuid AS targetPortUuid,
              r_port.name AS targetPortName,
              r_comp.uuid AS targetComponentUuid,
              r_comp.name AS targetComponentName
            `
        );

        const connections: FullPortConnectionInfo[] = result.records.map(record => ({
            sourcePortUuid: record.get('sourcePortUuid'),
            sourcePortName: record.get('sourcePortName'),
            sourceComponentUuid: record.get('sourceComponentUuid'),
            sourceComponentName: record.get('sourceComponentName'),
            targetPortUuid: record.get('targetPortUuid'),
            targetPortName: record.get('targetPortName'),
            targetComponentUuid: record.get('targetComponentUuid'),
            targetComponentName: record.get('targetComponentName'),
        }));
        
        return { success: true, data: connections };

    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        console.error("Error in getAllPortConnections:", message);
        return { success: false, message };
    } finally {
        await session.close();
    }
};

/**
 * Retrieves partner components and ports for a provider port via SENDER_RECEIVER_INTERFACE.
 * This query finds connections that are not based on direct ASSEMBLY_SW_CONNECTORs but on
 * shared SENDER_RECEIVER_INTERFACE definitions.
 *
 * @param pPortUuid The UUID of the P_PORT_PROTOTYPE node.
 * @returns A Promise that resolves to the raw Neo4j QueryResult containing interface-based connection info.
 */
export const getSRInterfaceBasedConforPPort = async (pPortUuid: string): Promise<QueryResult<SRInterfaceConnectionInfo>> => {
  const session = driver.session();
  try {
    const result = await session.run<SRInterfaceConnectionInfo>(
      `
      MATCH (pPortNode:P_PORT_PROTOTYPE {uuid: $pPortUuid})
      //find the swConnector for this P_PORT
      OPTIONAL MATCH (pPortNode)-[:\`PROVIDED-INTERFACE-TREF\`]->(SRInterface:SENDER_RECEIVER_INTERFACE)
      // Get the connected R_PORT 
      OPTIONAL MATCH (SRInterface)<-[:\`REQUIRED-INTERFACE-TREF\`]-(rPortNode) 
      // get the FM of the R_PORT
      OPTIONAL MATCH (rPortNode)<-[:OCCURRENCE]-(FM:FAILUREMODE)
      // Get the component which contain the rPort
      OPTIONAL MATCH (rPortNode)<-[:CONTAINS]-(swCompClass) 
      RETURN DISTINCT 
             SRInterface.name as SRInterfaceName,
             SRInterface.uuid as SRInterfaceUUID,
             rPortNode.uuid as receiverPortUUID,
             rPortNode.name as receiverPortName,
             FM.name as failureModeName,
             FM.uuid as failureModeUUID,
             FM.asil as failureModeASIL,
             swCompClass.name as swComponentClassName,
             swCompClass.uuid as swComponentClassUUID,
             labels(swCompClass)[0] as swComponentClassType,
             pPortNode, SRInterface, rPortNode, swCompClass, FM
      `,
      { pPortUuid }
    );
    return result;
  } finally {
    await session.close();
  }
};

/**
 * Retrieves partner components and ports for a receiver port via SENDER_RECEIVER_INTERFACE.
 * This query finds connections that are not based on direct ASSEMBLY_SW_CONNECTORs but on
 * shared SENDER_RECEIVER_INTERFACE definitions, looking from the perspective of an R-Port.
 *
 * @param rPortUuid The UUID of the R_PORT_PROTOTYPE node.
 * @returns A Promise that resolves to the raw Neo4j QueryResult containing interface-based connection info.
 */
export const getSRInterfaceBasedConforRPort = async (rPortUuid: string): Promise<QueryResult<SRInterfaceConnectionInfoRPort>> => {
  const session = driver.session();
  try {
    const result = await session.run<SRInterfaceConnectionInfoRPort>(
      `
      MATCH (rPortNode:R_PORT_PROTOTYPE {uuid: $rPortUuid})
      //find the swConnector for this P_PORT
      OPTIONAL MATCH (rPortNode)-[:\`REQUIRED-INTERFACE-TREF\`]->(SRInterface:SENDER_RECEIVER_INTERFACE)
      // Get the connected p_PORT 
      OPTIONAL MATCH (SRInterface)<-[:\`PROVIDED-INTERFACE-TREF\`]-(pPortNode) 
      // get the FM of the P_PORT
      OPTIONAL MATCH (pPortNode)<-[:OCCURRENCE]-(FM:FAILUREMODE)
      // Get the component which contain the rPort
      OPTIONAL MATCH (pPortNode)<-[:CONTAINS]-(swCompClass) 
      RETURN DISTINCT 
             SRInterface.name as SRInterfaceName,
             SRInterface.uuid as SRInterfaceUUID,
             pPortNode.uuid as providerPortUUID,
             pPortNode.name as providerPortName,
             FM.name as failureModeName,
             FM.uuid as failureModeUUID,
             FM.asil as failureModeASIL,
             swCompClass.name as swComponentClassName,
             swCompClass.uuid as swComponentClassUUID,
             labels(swCompClass)[0] as swComponentClassType
      `,
      { rPortUuid }
    );
    return result;
  } finally {
    await session.close();
  }
};

/**
 * Gets all ports (both P-Ports and R-Ports) for multiple components in a single batch query.
 * This is optimized for the ArchViewer use case where we need all ports for selected components.
 *
 * @param componentUuids Array of component UUIDs to get all ports for.
 * @returns A Promise that resolves to an object containing success status and port data grouped by component.
 */
export const getAllPortsForComponents = async (componentUuids: string[]): Promise<{
  success: boolean;
  data?: Map<string, PortInfo[]>;
  message?: string;
  error?: string;
}> => {
  const session = driver.session();
  
  try {
    console.log(`🔍 Batch fetching ports for ${componentUuids.length} components`);
    
    const result = await session.run(
      `
      UNWIND $componentUuids as componentUuid
      MATCH (component {uuid: componentUuid})-[:CONTAINS]->(port)
      WHERE port:P_PORT_PROTOTYPE OR port:R_PORT_PROTOTYPE
      RETURN component.uuid as componentUuid,
             port.name as portName,
             port.uuid as portUuid,
             labels(port)[0] as portType
      ORDER BY component.uuid, port.name
      `,
      { componentUuids }
    );

    if (result.records.length === 0) {
      return {
        success: true,
        data: new Map(),
        message: `No ports found for the specified components`,
      };
    }

    // Group ports by component UUID
    const portsByComponent = new Map<string, PortInfo[]>();
    
    result.records.forEach(record => {
      const componentUuid = record.get('componentUuid');
      const portInfo: PortInfo = {
        name: record.get('portName') || 'Unnamed Port',
        uuid: record.get('portUuid') || '',
        type: record.get('portType') || 'UNKNOWN_PORT_TYPE',
      };
      
      if (!portsByComponent.has(componentUuid)) {
        portsByComponent.set(componentUuid, []);
      }
      portsByComponent.get(componentUuid)!.push(portInfo);
    });

    console.log(`✅ Batch port fetch completed: ${result.records.length} ports for ${portsByComponent.size} components`);

    return {
      success: true,
      data: portsByComponent,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Error batch fetching ports for components:`, errorMessage);
    
    return {
      success: false,
      message: `Error batch fetching ports for components.`,
      error: errorMessage,
    };
  } finally {
    await session.close();
  }
};

/**
 * Gets all partner port connections by shortest path querying target-port-ref and outer-port-ref.
 * This shows all connections for a component DIRECTLY to the partner component and NOT to the COMPOSITIONS
 * So this is a good query if you dont need the COMPOSITIONS
 * @param componentUuids Array of component UUIDs to get all port connections for.
 * @returns A Promise that resolves to the raw Neo4j QueryResult containing partner port info.
 */
export const getPartnerPortsForComponentsOptimized = async (componentUuids: string[]): Promise<QueryResult<any>> => {
  const session = driver.session();
  try {
    // ⏱️ Performance Measurement: Database query timing
    const queryStart = performance.now();
    console.log(`🚀 OPTIMIZED: Executing assembly connector-based query for ${componentUuids.length} components...`);
    
    const result = await session.run<PartnerPortInfo & { sourcePortUUID: string }>(
      `
      UNWIND $componentUuids as componentUuid
      MATCH (selectedComp {uuid: componentUuid})-[:CONTAINS]->(portA)
      WHERE (portA:P_PORT_PROTOTYPE OR portA:R_PORT_PROTOTYPE)

      MATCH path = shortestPath((portA)-[:\`TARGET-P-PORT-REF\`|\`TARGET-R-PORT-REF\`|\`OUTER-PORT-REF\`*0..6]-(portB))
      WHERE portB <> portA
      AND (portB:P_PORT_PROTOTYPE OR portB:R_PORT_PROTOTYPE)
      AND labels(portA)[0] <> labels(portB)[0]
      AND ALL(n IN nodes(path) WHERE n:P_PORT_PROTOTYPE OR n:R_PORT_PROTOTYPE OR n:ASSEMBLY_SW_CONNECTOR OR n:DELEGATION_SW_CONNECTOR)
      MATCH (portB)<-[:CONTAINS]-(PortBcontainedBy)
      WHERE NOT 'COMPOSITION_SW_COMPONENT_TYPE' IN labels(PortBcontainedBy)
      OPTIONAL MATCH (portB)<-[:OCCURRENCE]-(FM:FAILUREMODE)
      RETURN DISTINCT 
        portA.uuid as sourcePortUUID,
        selectedComp.uuid as sourceComponentUUID,
        portB.name as partnerPortName, 
        portB.uuid as partnerPortUUID, 
        labels(portB)[0] as partnerPortType, 
        PortBcontainedBy.name as partnerPortOwner, 
        PortBcontainedBy.uuid as partnerPortOwnerUUID, 
        labels(PortBcontainedBy) as partnerPortOwnerType,
        FM.name as failureModeName,
        FM.uuid as failureModeUUID,
        FM.asil as failureModeASIL
      `,
      { componentUuids }
    );
    
    const queryEnd = performance.now();
    const queryTime = queryEnd - queryStart;
    console.log(`⚡ OPTIMIZED query completed in ${queryTime.toFixed(2)}ms`);
    console.log(`📊 Optimized query statistics: 
      - Components queried: ${componentUuids.length}
      - Records returned: ${result.records.length}
      - Query performance: ${(result.records.length / queryTime * 1000).toFixed(0)} records/second`);
    
    return result;
  } catch (error) {
    console.error(`❌ Optimized query failed:`, error);
    throw error;
  } finally {
    await session.close();
  }
};



/**
 * Finds the partner port for a given port by traversing assembly and delegation connectors.
 *
 * @param portUuid The UUID of the starting port (P_PORT_PROTOTYPE or R_PORT_PROTOTYPE).
 * @returns A Promise that resolves to the raw Neo4j QueryResult containing partner port info.
 */
export const getPartnerPort = async (portUuid: string): Promise<QueryResult<PartnerPortInfo>> => {
  const session = driver.session();
  try {
    const result = await session.run<PartnerPortInfo>(
      `
      MATCH (portA {uuid: $portUuid}) 
      MATCH path = shortestPath((portA)-[:\`TARGET-P-PORT-REF\`|\`TARGET-R-PORT-REF\`|\`OUTER-PORT-REF\`*0..6]-(portB))
      WHERE portB <> portA
      AND (portB:P_PORT_PROTOTYPE OR portB:R_PORT_PROTOTYPE)
      AND labels(portA)[0] <> labels(portB)[0]
      AND ALL(n IN nodes(path) WHERE n:P_PORT_PROTOTYPE OR n:R_PORT_PROTOTYPE OR n:ASSEMBLY_SW_CONNECTOR OR n:DELEGATION_SW_CONNECTOR)
      OPTIONAL MATCH (portB)<-[:CONTAINS]-(PortBcontainedBy)
      OPTIONAL MATCH (portB)<-[:OCCURRENCE]-(FM:FAILUREMODE)
      RETURN DISTINCT portB.name as partnerPortName, 
             portB.uuid as partnerPortUUID, 
             labels(portB)[0] as partnerPortType, 
             PortBcontainedBy.name as partnerPortOwner, 
             PortBcontainedBy.uuid as partnerPortOwnerUUID, 
             labels(PortBcontainedBy) as partnerPortOwnerType,
             FM.name as failureModeName,
             FM.uuid as failureModeUUID,
             FM.asil as failureModeASIL
      `,
      { portUuid }
    );
    return result;
  } finally {
    await session.close();
  }
};
