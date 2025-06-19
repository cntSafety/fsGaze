'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tree, Input, Modal, Spin, Alert, Typography, Table, Dropdown, Button } from 'antd';
import type { GetProps, MenuProps } from 'antd';
import { DataNode as AntDataNode } from 'antd/es/tree';
import { PlusOutlined, DeleteOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { getComponentRelations, getAssemblyContextForPPort, getAssemblyContextForRPort, AssemblyContextInfo, deleteFailureNode, getNodeLabels } from '@/app/services/ArxmlToNeoService';
import { getFailuresForPorts } from '@/app/services/neo4j/queries/safety/failureModes';
import { createCausationBetweenFailures } from '@/app/services/neo4j/queries/safety/causation';
import AddFM from '../../safety/components/AddFM';

const { Search } = Input;
const { Text, Title } = Typography;

// Helper function to extract string from ReactNode title
const getSortableStringFromTitle = (titleNode: React.ReactNode): string => {
  if (typeof titleNode === 'string') {
    return titleNode;
  }
  if (React.isValidElement(titleNode) && titleNode.type === React.Fragment) {
    const props = titleNode.props as { children?: React.ReactNode };
    if (props.children) {
      const childrenArray = React.Children.toArray(props.children);
      if (childrenArray.length > 0 && typeof childrenArray[0] === 'string') {
        return childrenArray[0];
      }
    }
  }
  // Fallback for unexpected structures or if direct string extraction fails
  // console.warn('SWCompDetailsTree: Could not extract sortable string from title:', titleNode);
  return ''; // Return empty string to prevent crash
};

interface RelationInfo {
  relationshipType: string;
  sourceName: string | null;
  sourceUuid: string | null;
  sourceType: string | null;
  targetName: string | null;
  targetUuid: string | null;
  targetType: string | null;
}

interface CustomDataNode extends AntDataNode {
  title: React.ReactNode;
  children?: CustomDataNode[];
  relationData?: RelationInfo | null;
}

interface SWCompDetailsTreeProps {
  componentUuid: string | null;
  componentName: string | null;
}

const SWCompDetailsTree: React.FC<SWCompDetailsTreeProps> = ({ componentUuid, componentName }) => {
  const [treeData, setTreeData] = useState<CustomDataNode[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<RelationInfo | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalRelations, setModalRelations] = useState<RelationInfo[]>([]);
  
  // New state for failure mode functionality
  const [isAddFMModalVisible, setIsAddFMModalVisible] = useState(false);
  const [selectedElementForFM, setSelectedElementForFM] = useState<{
    uuid: string;
    name: string;
    labels?: string[];
  } | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  
  // State for causation creation
  const [causationMode, setCausationMode] = useState<'none' | 'selectFirst' | 'selectSecond'>('none');
  const [firstFailureForCausation, setFirstFailureForCausation] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  const [, setSecondFailureForCausation] = useState<{
    uuid: string;
    name: string;
  } | null>(null);

  const buildTreeData = useCallback(async (relationsData: RelationInfo[]): Promise<CustomDataNode[]> => {
    const rootNode: CustomDataNode = {
      key: componentUuid || 'root',
      title: componentName || 'Selected Component',
      children: [],
    };

    const relationshipTypeGroups = new Map<string, CustomDataNode>();

    for (const relation of relationsData) {
      const {
        relationshipType,
        sourceName,
        sourceUuid,
        sourceType,
        targetName,
        targetUuid,
        targetType,
      } = relation;

      if (!relationshipType) {
        console.warn('Skipping relation due to missing relationshipType:', relation);
        continue;
      }

      let relTypeGroupNode = relationshipTypeGroups.get(relationshipType);
      if (!relTypeGroupNode) {
        relTypeGroupNode = {
          key: `relType-${relationshipType}-${componentUuid}`,
          title: relationshipType,
          children: [],
          isLeaf: false,
        };
        relationshipTypeGroups.set(relationshipType, relTypeGroupNode);
        rootNode.children!.push(relTypeGroupNode);
      }

      // Determine if the current component is the source or target of this relation
      const isSourceOfRelation = sourceUuid === componentUuid;
      
      const connectedElementName = isSourceOfRelation ? targetName : sourceName;
      const connectedElementUuid = isSourceOfRelation ? targetUuid : sourceUuid;
      const connectedElementType = isSourceOfRelation ? targetType : sourceType;
      
      // Direction prefix for debugging (currently unused in display)
      // const directionPrefix = isSourceOfRelation ? "To: " : "From: ";

      if (!connectedElementUuid || !connectedElementType) {
        console.warn('Skipping relation due to missing connected element info:', relation);
        continue;
      }

      const typeGroupKey = `${relationshipType}-${connectedElementType}`;
      let typeGroupNode = relTypeGroupNode.children!.find(child => child.key === typeGroupKey);

      if (!typeGroupNode) {
        typeGroupNode = {
          key: typeGroupKey,
          title: connectedElementType,
          children: [],
          isLeaf: false,
        };
        relTypeGroupNode.children!.push(typeGroupNode);
      }
      
      const elementNodeKey = `${typeGroupKey}-${connectedElementUuid}`;
      let elementNode = typeGroupNode.children!.find(child => child.key === elementNodeKey);

      if (!elementNode) {
        elementNode = {
          key: elementNodeKey,
          // title: `${directionPrefix}${connectedElementName || `Unnamed ${connectedElementType}`}`,
          title: (
            <>
              {connectedElementName || `Unnamed ${connectedElementType}`}
              <Typography.Text type="secondary" style={{ marginLeft: '8px', fontStyle: 'italic', fontSize: '0.9em' }}>
                ({connectedElementType})
              </Typography.Text>
            </>
          ),
          children: [],
          isLeaf: true, // Will be set to false if assembly context is added
          relationData: relation, // Store original relation for modal
        };
        typeGroupNode.children!.push(elementNode);
      }


      // Fetch and add assembly context for P-Ports and R-Ports
      if (connectedElementType === 'P_PORT_PROTOTYPE' || connectedElementType === 'R_PORT_PROTOTYPE') {
        elementNode.isLeaf = false; // Assume it might have children (assembly context)
        try {
          const assemblyContextResult = connectedElementType === 'P_PORT_PROTOTYPE'
            ? await getAssemblyContextForPPort(connectedElementUuid)
            : await getAssemblyContextForRPort(connectedElementUuid);
          
          const assemblyContextRecords = assemblyContextResult.records.map(r => r.toObject() as unknown as AssemblyContextInfo);
          // console.log('Assembly context records:', assemblyContextRecords); // For debugging
          
          // Fetch failures for this port
          const failuresResult = await getFailuresForPorts(connectedElementUuid);
          const failures = failuresResult.success ? failuresResult.data || [] : [];
          
          if (assemblyContextRecords && assemblyContextRecords.length > 0) {
            const connectorsMap = new Map<string, CustomDataNode>();            for (const record of assemblyContextRecords) {
              const {
                assemblySWConnectorName,
                assemblySWConnectorUUID,
                swComponentName: asmSwCompName, // Renamed to avoid conflict
                swComponentUUID: asmSwCompUUID, // Renamed to avoid conflict
                swComponentType: asmSwCompType, // Get the actual component type from the query
                providerPortName,
                failureModeName,
                failureModeASIL,
              } = record;

              if (!assemblySWConnectorUUID) continue;

              const connectorNodeKey = `${elementNodeKey}-asm-${assemblySWConnectorUUID}`;
              let connectorNode = connectorsMap.get(assemblySWConnectorUUID); // Use map for efficiency within this port's context
              
              if(!connectorNode){
                connectorNode = elementNode.children!.find(child => child.key === connectorNodeKey);
                if(!connectorNode){
                    connectorNode = {
                        key: connectorNodeKey,
                        // title: `ASM: ${assemblySWConnectorName || 'Unnamed Assembly Connector'}`,
                        title: (
                          <>
                            {assemblySWConnectorName || 'Unnamed Assembly Connector'}
                            <Typography.Text type="secondary" style={{ marginLeft: '8px', fontStyle: 'italic', fontSize: '0.9em' }}>
                              (ASSEMBLY_SW_CONNECTOR)
                            </Typography.Text>
                          </>
                        ),
                        children: [],
                        isLeaf: true, // Will be false if components are linked
                    };
                    elementNode.children!.push(connectorNode);
                    connectorsMap.set(assemblySWConnectorUUID, connectorNode);
                }
              }
              
              if (asmSwCompUUID) {
                const asmComponentKey = `${connectorNodeKey}-comp-${asmSwCompUUID}`;
                let asmComponentNode = connectorNode.children!.find(child => child.key === asmComponentKey);
                if (!asmComponentNode) {                  asmComponentNode = {
                    key: asmComponentKey,
                    // title: `SWC: ${asmSwCompName || 'Unnamed SW Component'}`,
                    title: (
                      <>
                        {asmSwCompName || 'Unnamed SW Component'}
                        <Typography.Text type="secondary" style={{ marginLeft: '8px', fontStyle: 'italic', fontSize: '0.9em' }}>
                          ({asmSwCompType || 'UNKNOWN_TYPE'})
                        </Typography.Text>
                        {providerPortName && (
                          <Typography.Text type="secondary" style={{ marginLeft: '8px', fontSize: '0.8em', color: '#52c41a' }}>
                            via {providerPortName}
                          </Typography.Text>
                        )}
                        {failureModeName && failureModeASIL && (
                          <Typography.Text type="danger" style={{ marginLeft: '8px', fontSize: '0.8em', fontWeight: 'bold' }}>
                            ASIL: {failureModeASIL}
                          </Typography.Text>
                        )}
                      </>
                    ),
                    isLeaf: true,
                    // Minimal relation data for context, adjust if modal needs more
                    relationData: { 
                      relationshipType: 'ASSEMBLY_CONTEXT',
                      sourceName: assemblySWConnectorName, sourceUuid: assemblySWConnectorUUID, sourceType: 'ASSEMBLY_SW_CONNECTOR',
                      targetName: asmSwCompName, targetUuid: asmSwCompUUID, targetType: asmSwCompType || 'UNKNOWN_TYPE',
                      // Add the new fields to relation data
                      providerPortName,
                      failureModeName,
                      failureModeASIL,
                    } as any, 
                  };
                  connectorNode.children!.push(asmComponentNode);
                }
              }
              connectorNode.isLeaf = !connectorNode.children || connectorNode.children.length === 0;
            }
            // Sort assembly children
            if (elementNode.children) {
              elementNode.children.sort((a, b) => getSortableStringFromTitle(a.title).localeCompare(getSortableStringFromTitle(b.title)));
              elementNode.children.forEach(connector => {
                if (connector.children) {
                  connector.children.sort((a, b) => getSortableStringFromTitle(a.title).localeCompare(getSortableStringFromTitle(b.title)));
                }
              });
            }
          }
          
          // Add failure nodes if any exist
          if (failures.length > 0) {
            for (const failure of failures) {
              const failureNodeKey = `${elementNodeKey}-failure-${failure.failureUuid}`;
              const failureNode: CustomDataNode = {
                key: failureNodeKey,
                title: (
                  <>
                    <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>⚠️ </span>
                    {failure.failureName || 'Unnamed Failure'}
                    <Typography.Text type="danger" style={{ marginLeft: '8px', fontStyle: 'italic', fontSize: '0.9em' }}>
                      ({failure.failureType})
                    </Typography.Text>
                  </>
                ),
                isLeaf: true,
                relationData: {
                  relationshipType: failure.relationshipType,
                  sourceName: connectedElementName,
                  sourceUuid: connectedElementUuid,
                  sourceType: connectedElementType,
                  targetName: failure.failureName,
                  targetUuid: failure.failureUuid,
                  targetType: failure.failureType,
                },
              };
              elementNode.children!.push(failureNode);
            }
          }
          
        } catch (e) {
          console.error(`Failed to fetch assembly context for ${connectedElementType} ${connectedElementUuid}:`, e);
          // Add an error child node? Or just log? For now, log.
           const errorNode: CustomDataNode = {
            key: `${elementNodeKey}-error`,
            title: `Error loading assembly for ${connectedElementName}`,
            isLeaf: true,
          };
          elementNode.children!.push(errorNode);
        }
        elementNode.isLeaf = !elementNode.children || elementNode.children.length === 0;
      }
    }

    // Sort level 1 (RelationshipType)
    rootNode.children!.sort((a, b) => getSortableStringFromTitle(a.title!).localeCompare(getSortableStringFromTitle(b.title!)));
    // Sort level 2 (Target/SourceType) and level 3 (ComponentName)
    rootNode.children!.forEach(relTypeGroupNode => {
      if (relTypeGroupNode.children) {
        relTypeGroupNode.children.sort((a, b) => getSortableStringFromTitle(a.title!).localeCompare(getSortableStringFromTitle(b.title!)));
        relTypeGroupNode.children.forEach(typeGroupNode => {
          if (typeGroupNode.children) {
            typeGroupNode.children.sort((a, b) => getSortableStringFromTitle(a.title!).localeCompare(getSortableStringFromTitle(b.title!)));
          }
        });
      }
    });

    return rootNode.children!.length > 0 ? [rootNode] : []; // Return array with root, or empty if no relations
  }, [componentUuid, componentName]); // Removed isIncoming

  useEffect(() => {
    if (componentUuid) {
      setLoading(true);
      setError(null);
      getComponentRelations(componentUuid)
        .then(async (response) => {
          if (response.success && response.data) {
            const rawRelations = response.data as unknown as RelationInfo[];
            // console.log("Raw relations:", rawRelations); // For debugging
            const processedTreeData = await buildTreeData(rawRelations);
            // console.log("Processed tree data:", processedTreeData); // For debugging
            setTreeData(processedTreeData);
            // Expand the first level by default (Relationship Types)
            if (processedTreeData.length > 0 && processedTreeData[0].children) {
               setExpandedKeys([processedTreeData[0].key, ...processedTreeData[0].children.map(child => child.key)]);
            } else if (processedTreeData.length > 0) {
               setExpandedKeys([processedTreeData[0].key]);
            }

          } else {
            setError(response.message || 'Failed to fetch relations.');
            setTreeData([]);
          }
        })
        .catch((err) => {
          console.error("Error fetching component relations:", err);
          setError(err.message || 'An unexpected error occurred.');
          setTreeData([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setTreeData([]);
    }
  }, [componentUuid, buildTreeData]); // Removed isIncoming

  const onSelect: GetProps<typeof Tree>['onSelect'] = async (selectedKeys, info) => {
    const selectedCustomNode = info.node as CustomDataNode;
    
    // Handle causation mode first
    if (causationMode !== 'none') {
      await handleNodeClickForCausation(selectedKeys, info);
      return;
    }
    
    // Find the UUID from the relationData or try to extract from the node
    let elementUuid: string | null = null;
    let elementName: string = '';
    
    if (selectedCustomNode.relationData) {
      // For nodes with relation data, determine which element to show relations for
      const relation = selectedCustomNode.relationData;
      const isSourceOfRelation = relation.sourceUuid === componentUuid;
      elementUuid = isSourceOfRelation ? relation.targetUuid : relation.sourceUuid;
      elementName = isSourceOfRelation ? relation.targetName || 'Unknown' : relation.sourceName || 'Unknown';
    } else {
      // For non-leaf nodes, try to extract UUID from the key or use the current component
      if (selectedKeys.length > 0) {
        const key = selectedKeys[0].toString();
        // If this is the root node, use the current component
        if (key === componentUuid) {
          elementUuid = componentUuid;
          elementName = componentName || 'Selected Component';
        }
      }
    }
    
    if (elementUuid) {
      setModalLoading(true);
      setIsModalVisible(true);
      setSelectedNodeDetails({ 
        relationshipType: 'COMPONENT_RELATIONS', 
        sourceName: elementName, 
        sourceUuid: elementUuid, 
        sourceType: 'Selected Element',
        targetName: null, 
        targetUuid: null, 
        targetType: null 
      });
      
      try {
        const result = await getComponentRelations(elementUuid);
        if (result.success && result.data) {
          setModalRelations(result.data as RelationInfo[]);
        } else {
          setModalRelations([]);
        }
      } catch (error) {
        console.error('Error fetching relations for modal:', error);
        setModalRelations([]);
      } finally {
        setModalLoading(false);
      }
    } else {
      // Fallback to old behavior for nodes without clear UUID
      if (selectedCustomNode.isLeaf && selectedCustomNode.relationData) {
        setSelectedNodeDetails(selectedCustomNode.relationData);
        setIsModalVisible(true);
        setModalRelations([]);
      }
    }
  };

  const getParentKey = (key: React.Key, tree: CustomDataNode[]): React.Key | undefined => {
    let parentKey: React.Key | undefined;
    for (let i = 0; i < tree.length; i++) {
      const node = tree[i];
      if (node.children) {
        if (node.children.some(item => item.key === key)) {
          parentKey = node.key;
          break;
        } else {
          const foundParentKey = getParentKey(key, node.children);
          if (foundParentKey) {
            parentKey = foundParentKey;
            break;
          }
        }
      }
    }
    return parentKey;
  };

  const dataList = useMemo(() => {
    const list: { key: React.Key; title: string }[] = [];
    const generateList = (data: CustomDataNode[]) => {
      for (const node of data) {
        list.push({ key: node.key, title: getSortableStringFromTitle(node.title) });
        if (node.children) {
          generateList(node.children);
        }
      }
    };
    generateList(treeData);
    return list;
  }, [treeData]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setSearchTerm(value);
    if (value) {
      const newExpandedKeys = dataList
        .map(item => {
          if (item.title.toLowerCase().includes(value.toLowerCase())) {
            return getParentKey(item.key, treeData);
          }
          return null;
        })
        .filter((item, i, self): item is React.Key => !!(item && self.indexOf(item) === i));
      setExpandedKeys(newExpandedKeys);
      setAutoExpandParent(true);
    } else {
      setExpandedKeys([]);
    }
  };

  // Context menu functionality
  const getElementFromNode = async (node: CustomDataNode): Promise<{ uuid: string; name: string; labels?: string[] } | null> => {
    // Check if this is a failure node first (they have a specific key pattern)
    const keyStr = String(node.key);
    if (keyStr.includes('-failure-')) {
      const parts = keyStr.split('-failure-');
      if (parts.length > 1) {
        const uuid = parts[1];
        const title = getSortableStringFromTitle(node.title);
        if (uuid && title) {
          // Fetch labels for this element from Neo4j
          const labels = await fetchNodeLabels(uuid);
          return { uuid, name: title, labels };
        }
      }
    }

    // Try to get element info from relationData
    if (node.relationData) {
      const relation = node.relationData;
      
      // For failure nodes, use the target information (failure is usually the target)
      if (relation.targetType?.includes('FAILURE') || relation.relationshipType === 'OCCURRENCE') {
        if (relation.targetUuid && relation.targetName) {
          const labels = await fetchNodeLabels(relation.targetUuid);
          return { uuid: relation.targetUuid, name: relation.targetName, labels };
        }
      }
      
      // For other nodes, determine which element to use based on the current component
      const isSourceOfRelation = relation.sourceUuid === componentUuid;
      const elementUuid = isSourceOfRelation ? relation.targetUuid : relation.sourceUuid;
      const elementName = isSourceOfRelation ? relation.targetName : relation.sourceName;
      
      if (elementUuid && elementName) {
        // Fetch labels for this element from Neo4j
        const labels = await fetchNodeLabels(elementUuid);
        return { uuid: elementUuid, name: elementName, labels };
      }
    }
    
    // Try to extract from key for assembly context nodes
    if (keyStr.includes('-comp-')) {
      const parts = keyStr.split('-comp-');
      if (parts.length > 1) {
        const uuid = parts[1];
        const title = getSortableStringFromTitle(node.title);
        if (uuid && title) {
          // Fetch labels for this element from Neo4j
          const labels = await fetchNodeLabels(uuid);
          return { uuid, name: title, labels };
        }
      }
    }
    
    // Try to extract from key for assembly connector nodes
    if (keyStr.includes('-asm-')) {
      const parts = keyStr.split('-asm-');
      if (parts.length > 1) {
        const uuidPart = parts[1].split('-')[0]; // Get UUID before any additional suffixes
        const title = getSortableStringFromTitle(node.title);
        if (uuidPart && title) {
          // Fetch labels for this element from Neo4j
          const labels = await fetchNodeLabels(uuidPart);
          return { uuid: uuidPart, name: title, labels };
        }
      }
    }
    
    // Fallback: use the current component if nothing else matches
    if (componentUuid && componentName) {
      // Fetch labels for this element from Neo4j
      const labels = await fetchNodeLabels(componentUuid);
      return { uuid: componentUuid, name: componentName, labels };
    }
    
    console.warn('Could not extract element from node:', { key: keyStr, title: getSortableStringFromTitle(node.title), relationData: node.relationData });
    return null;
  };

  // Helper function to fetch node labels from Neo4j via service
  const fetchNodeLabels = async (nodeUuid: string): Promise<string[]> => {
    try {
      const result = await getNodeLabels(nodeUuid);
      if (result.success && result.data) {
        return result.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching node labels:', error);
      return [];
    }
  };

  const handleContextMenu = async (info: { event: React.MouseEvent; node: CustomDataNode }) => {
    info.event.preventDefault();
    const element = await getElementFromNode(info.node);
    
    if (element) {
      setSelectedElementForFM(element);
      setContextMenuPosition({ x: info.event.clientX, y: info.event.clientY });
    }
  };

  const handleAddFailureMode = () => {
    setContextMenuPosition(null);
    setIsAddFMModalVisible(true);
  };

  const handleDeleteFailureMode = () => {
    setContextMenuPosition(null);
    
    if (!selectedElementForFM) {
      Modal.error({
        title: 'No Element Selected',
        content: 'Please select an element first.',
      });
      return;
    }

    // Check if the selected element is actually a failure node
    const element = selectedElementForFM;
    const isFailureNode = element.uuid && element.labels?.includes('FAILURE');
    
    if (!isFailureNode) {
      Modal.error({
        title: 'Invalid Selection',
        content: 'Please right-click on a failure node to delete it.',
      });
      return;
    }

    Modal.confirm({
      title: 'Delete Failure Mode',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to delete the failure mode "${element.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const result = await deleteFailureNode(element.uuid);
          
          if (result.success) {
            Modal.success({
              title: 'Failure Mode Deleted',
              content: `Successfully deleted failure mode "${element.name}"`,
            });
            
            // Refresh the tree data
            await handleRefresh();
          } else {
            Modal.error({
              title: 'Delete Failed',
              content: result.message || 'Failed to delete failure mode',
            });
          }
        } catch (error) {
          console.error('Error deleting failure mode:', error);
          Modal.error({
            title: 'Delete Failed',
            content: 'An unexpected error occurred while deleting the failure mode',
          });
        }
      },
    });
  };

  const handleFailureModeSuccess = async (data: any) => {
    Modal.success({
      title: 'Failure Mode Created',
      content: `Successfully created failure mode "${data.failureName}" for element ${selectedElementForFM?.name}`,
    });
    setIsAddFMModalVisible(false);
    setSelectedElementForFM(null);
    
    // Refresh the tree data to show the new failure mode
    await handleRefresh();
  };

  // Causation creation handlers
  const handleCreateCausation = () => {
    setCausationMode('selectFirst');
    setFirstFailureForCausation(null);
    setSecondFailureForCausation(null);
    Modal.info({
      title: 'Create Causation',
      content: 'Please click on the FIRST failure mode (the cause). Look for nodes with the "FAILURE" label.',
    });
  };

  const handleNodeClickForCausation = async (selectedKeys: React.Key[], info: any) => {
    if (causationMode === 'none') return;

    const element = await getElementFromNode(info.node);
    
    if (!element || !element.labels?.includes('FAILURE')) {
      Modal.warning({
        title: 'Invalid Selection',
        content: 'Please select a failure node (nodes with "FAILURE" label).',
      });
      return;
    }

    if (causationMode === 'selectFirst') {
      setFirstFailureForCausation({ uuid: element.uuid, name: element.name });
      setCausationMode('selectSecond');
      Modal.info({
        title: 'First Failure Selected',
        content: `Selected "${element.name}" as the FIRST failure (cause). Now click on the SECOND failure mode (the effect).`,
      });
    } else if (causationMode === 'selectSecond') {
      if (element.uuid === firstFailureForCausation?.uuid) {
        Modal.warning({
          title: 'Same Failure Selected',
          content: 'Please select a different failure mode for the second failure (effect).',
        });
        return;
      }
      
      setSecondFailureForCausation({ uuid: element.uuid, name: element.name });
      setCausationMode('none');
      
      // Automatically create causation when both failures are selected
      if (firstFailureForCausation) {
        await createCausationAutomatically(
          firstFailureForCausation.uuid,
          element.uuid,
          firstFailureForCausation.name,
          element.name
        );
      }
    }
  };

  const handleCausationSuccess = async () => {
    // Reset state
    setFirstFailureForCausation(null);
    setSecondFailureForCausation(null);
    
    // Refresh the tree to potentially show new relationships
    await handleRefresh();
  };

  const handleCancelCausation = () => {
    setCausationMode('none');
    setFirstFailureForCausation(null);
    setSecondFailureForCausation(null);
  };

  const createCausationAutomatically = async (sourceFailureUuid: string, targetFailureUuid: string, sourceName: string, targetName: string) => {
    try {
      await createCausationBetweenFailures(sourceFailureUuid, targetFailureUuid);
      
      Modal.success({
        title: 'Causation Created Successfully',
        content: `Causation relationship created between "${sourceName}" and "${targetName}".`,
      });
      
      // Reset state and refresh
      await handleCausationSuccess();
    } catch (error) {
      Modal.error({
        title: 'Failed to Create Causation',
        content: error instanceof Error ? error.message : 'An unexpected error occurred while creating the causation.',
      });
      
      // Reset state on error
      handleCancelCausation();
    }
  };

  const handleRefresh = async () => {
    if (!componentUuid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await getComponentRelations(componentUuid);
      if (response.success && response.data) {
        const rawRelations = response.data as unknown as RelationInfo[];
        const processedTreeData = await buildTreeData(rawRelations);
        setTreeData(processedTreeData);
        // Expand the first level by default (Relationship Types)
        if (processedTreeData.length > 0 && processedTreeData[0].children) {
          setExpandedKeys([processedTreeData[0].key, ...processedTreeData[0].children.map(child => child.key)]);
        } else if (processedTreeData.length > 0) {
          setExpandedKeys([processedTreeData[0].key]);
        }
      } else {
        setError(response.message || 'Failed to fetch relations.');
        setTreeData([]);
      }
    } catch (error: any) {
      console.error('Error refreshing tree data:', error);
      setError(error.message || 'An unexpected error occurred.');
      setTreeData([]);
    } finally {
      setLoading(false);
    }
  };

  const contextMenuItems: MenuProps['items'] = [
    {
      key: 'add-failure',
      label: 'Add Failure Mode',
      icon: <PlusOutlined />,
      onClick: handleAddFailureMode,
    },
    {
      key: 'delete-failure',
      label: 'Delete Failure Mode',
      icon: <DeleteOutlined />,
      onClick: handleDeleteFailureMode,
    },
    {
      type: 'divider',
    },
    {
      key: 'causation-first',
      label: 'Select as FIRST failure (cause)',
      onClick: () => {
        setContextMenuPosition(null);
        if (selectedElementForFM?.labels?.includes('FAILURE')) {
          setFirstFailureForCausation({ uuid: selectedElementForFM.uuid, name: selectedElementForFM.name });
          setCausationMode('selectSecond');
          Modal.info({
            title: 'First Failure Selected',
            content: `Selected "${selectedElementForFM.name}" as the FIRST failure (cause). Now select the SECOND failure mode (the effect) using the button or right-click menu.`,
          });
        } else {
          Modal.warning({
            title: 'Invalid Selection',
            content: 'Please select a failure node (nodes with "FAILURE" label).',
          });
        }
      },
      disabled: !selectedElementForFM?.labels?.includes('FAILURE'),
    },
    {
      key: 'causation-second',
      label: 'Select as SECOND failure (effect)',
      onClick: () => {
        setContextMenuPosition(null);
        if (selectedElementForFM?.labels?.includes('FAILURE')) {
          if (selectedElementForFM.uuid === firstFailureForCausation?.uuid) {
            Modal.warning({
              title: 'Same Failure Selected',
              content: 'Please select a different failure mode for the second failure (effect).',
            });
            return;
          }
          setSecondFailureForCausation({ uuid: selectedElementForFM.uuid, name: selectedElementForFM.name });
          setCausationMode('none');
          
          // Automatically create causation when both failures are selected
          if (firstFailureForCausation) {
            createCausationAutomatically(
              firstFailureForCausation.uuid,
              selectedElementForFM.uuid,
              firstFailureForCausation.name,
              selectedElementForFM.name
            );
          }
        } else {
          Modal.warning({
            title: 'Invalid Selection',
            content: 'Please select a failure node (nodes with "FAILURE" label).',
          });
        }
      },
      disabled: !selectedElementForFM?.labels?.includes('FAILURE') || causationMode !== 'selectSecond',
    },
  ];

  const treeProps = {
    treeData,
    expandedKeys,
    autoExpandParent,
    onExpand: (newExpandedKeys: React.Key[]) => {
      setExpandedKeys(newExpandedKeys);
      setAutoExpandParent(false);
    },
    onSelect,
    onRightClick: handleContextMenu,
  };

  if (!componentUuid) {
    return <Alert message="Please select a component to view its details." type="info" />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Hierarchical Relations for: <Text strong>{componentName || componentUuid}</Text>
        </Title>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            type={causationMode !== 'none' ? 'primary' : 'default'}
            icon={<PlusOutlined />}
            onClick={handleCreateCausation}
            disabled={loading}
          >
            {causationMode === 'none' ? 'Create Causation' : 
             causationMode === 'selectFirst' ? 'Select FIRST failure...' : 
             'Select SECOND failure...'}
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            loading={loading}
            type="default"
            size="middle"
          >
            Refresh
          </Button>
        </div>
      </div>
      <Search style={{ marginBottom: 8 }} placeholder="Search in tree" onChange={handleSearch} />
      {loading && (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" tip="Loading relations..." />
        </div>
      )}
      {error && <Alert message="Error" description={error} type="error" showIcon />}
      {!loading && !error && treeData.length === 0 && (
        <Alert message="No relations found for this component with the current filter." type="info" />
      )}
      {!loading && !error && treeData.length > 0 && (
        <>
          <Tree
            showLine
            {...treeProps}
            filterTreeNode={(node) => {
              if (!searchTerm) return true;
              // const title = (node as CustomDataNode).title as string; // Old incorrect way
              const title = getSortableStringFromTitle((node as CustomDataNode).title);
              return title.toLowerCase().includes(searchTerm.toLowerCase());
            }}
            onRightClick={handleContextMenu}
          />
          {contextMenuPosition && (
            <Dropdown
              menu={{ items: contextMenuItems }}
              open={true}
              onOpenChange={(open) => {
                if (!open) {
                  setContextMenuPosition(null);
                }
              }}
            >
              <div
                style={{
                  position: 'fixed',
                  left: contextMenuPosition.x,
                  top: contextMenuPosition.y,
                  width: 1,
                  height: 1,
                  pointerEvents: 'none',
                }}
              />
            </Dropdown>
          )}
        </>
      )}
      {selectedNodeDetails && (
        <Modal
          title={`Relations for: ${selectedNodeDetails.sourceName}`}
          open={isModalVisible}
          onOk={() => setIsModalVisible(false)}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
          width={1000}
        >
          {modalLoading ? (
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <Spin size="large" tip="Loading relationships..." />
            </div>
          ) : modalRelations.length > 0 ? (
            <Table
              dataSource={modalRelations}
              size="small"
              pagination={false}
              scroll={{ y: 400 }}
              rowKey={(record) => `${record.relationshipType}-${record.sourceUuid}-${record.targetUuid}`}
              columns={[
                {
                  title: 'Relationship',
                  dataIndex: 'relationshipType',
                  key: 'relationshipType',
                  width: 150,
                  sorter: (a, b) => a.relationshipType.localeCompare(b.relationshipType),
                  filters: Array.from(new Set(modalRelations.map(r => r.relationshipType))).map(type => ({ text: type, value: type })),
                  onFilter: (value, record) => record.relationshipType.includes(value as string),
                },
                {
                  title: 'Target',
                  key: 'target',
                  width: 200,
                  render: (_, record) => (
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{record.targetName || 'N/A'}</div>
                      <div style={{ fontSize: '0.85em', color: '#666' }}>
                        {record.targetType}
                      </div>
                    </div>
                  ),
                  sorter: (a, b) => (a.targetName || '').localeCompare(b.targetName || ''),
                },
                {
                  title: 'Target UUID',
                  dataIndex: 'targetUuid',
                  key: 'targetUuid',
                  width: 120,
                  render: (uuid) => (
                    <Text copyable={{ text: uuid }} style={{ fontSize: '0.8em', fontFamily: 'monospace' }}>
                      {uuid ? `${uuid.substring(0, 8)}...` : 'N/A'}
                    </Text>
                  ),
                },
              ]}
            />
          ) : (
            <Alert 
              message="No Relationships Found" 
              description="This element has no direct relationships in the current dataset."
              type="info" 
              showIcon 
            />
          )}
          
          {/* Original relation details (if available and not showing table) */}
          {selectedNodeDetails.relationshipType !== 'COMPONENT_RELATIONS' && modalRelations.length === 0 && (
            <div style={{ marginTop: '20px' }}>
              <Typography.Title level={5}>Relation Details</Typography.Title>
              <p><strong>Relationship Type:</strong> {selectedNodeDetails.relationshipType}</p>
              <p><strong>Source Name:</strong> {selectedNodeDetails.sourceName || 'N/A'}</p>
              <p><strong>Source UUID:</strong> {selectedNodeDetails.sourceUuid || 'N/A'}</p>
              <p><strong>Source Type:</strong> {selectedNodeDetails.sourceType || 'N/A'}</p>
              <p><strong>Target Name:</strong> {selectedNodeDetails.targetName || 'N/A'}</p>
              <p><strong>Target UUID:</strong> {selectedNodeDetails.targetUuid || 'N/A'}</p>
              <p><strong>Target Type:</strong> {selectedNodeDetails.targetType || 'N/A'}</p>
            </div>
          )}
        </Modal>
      )}
      <Modal
        title={`Add Failure Mode to: ${selectedElementForFM?.name || 'Unknown Element'}`}
        open={isAddFMModalVisible}
        onCancel={() => {
          setIsAddFMModalVisible(false);
          setSelectedElementForFM(null);
        }}
        footer={null}
        width={600}
      >
        {selectedElementForFM && (
          <AddFM 
            existingElementUuid={selectedElementForFM.uuid}
            existingElementName={selectedElementForFM.name}
            onSuccess={handleFailureModeSuccess}
            onCancel={() => setIsAddFMModalVisible(false)}
        />
        )}
      </Modal>
    </div>
  );
};

export default SWCompDetailsTree;
