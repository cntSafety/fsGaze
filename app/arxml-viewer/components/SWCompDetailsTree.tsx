'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tree, Input, Modal, Spin, Alert, Typography } from 'antd';
import type { GetProps } from 'antd';
import { DataNode as AntDataNode } from 'antd/es/tree';
import { getComponentRelations, getAssemblyContextForPPort, getAssemblyContextForRPort, AssemblyContextInfo } from '@/app/services/ArxmlToNeoService';

const { Search } = Input;
const { Text, Title } = Typography;

// Helper function to extract sortable string from ReactNode title
const getSortableStringFromTitle = (titleNode: React.ReactNode): string => {
  if (typeof titleNode === 'string') {
    return titleNode;
  }
  if (React.isValidElement(titleNode) && titleNode.type === React.Fragment && titleNode.props.children) {
    const childrenArray = React.Children.toArray(titleNode.props.children);
    if (childrenArray.length > 0 && typeof childrenArray[0] === 'string') {
      return childrenArray[0];
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
  relationData?: RelationInfo | null;
  children?: CustomDataNode[];
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
      
      const directionPrefix = isSourceOfRelation ? "To: " : "From: ";

      if (!connectedElementUuid || !connectedElementType) {
        console.warn('Skipping relation due to missing connected element info:', relation);
        continue;
      }

      let typeGroupKey = `${relationshipType}-${connectedElementType}`;
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

          if (assemblyContextRecords && assemblyContextRecords.length > 0) {
            const connectorsMap = new Map<string, CustomDataNode>();
            for (const record of assemblyContextRecords) {
              const {
                assemblySWConnectorName,
                assemblySWConnectorUUID,
                swComponentName: asmSwCompName, // Renamed to avoid conflict
                swComponentUUID: asmSwCompUUID, // Renamed to avoid conflict
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
                if (!asmComponentNode) {
                  asmComponentNode = {
                    key: asmComponentKey,
                    // title: `SWC: ${asmSwCompName || 'Unnamed SW Component'}`,
                    title: (
                      <>
                        {asmSwCompName || 'Unnamed SW Component'}
                        <Typography.Text type="secondary" style={{ marginLeft: '8px', fontStyle: 'italic', fontSize: '0.9em' }}>
                          (SW_COMPONENT_PROTOTYPE) {/* Assuming this is the type, adjust if a more specific type is available */}
                        </Typography.Text>
                      </>
                    ),
                    isLeaf: true,
                    // Minimal relation data for context, adjust if modal needs more
                    relationData: { 
                      relationshipType: 'ASSEMBLY_CONTEXT',
                      sourceName: assemblySWConnectorName, sourceUuid: assemblySWConnectorUUID, sourceType: 'ASSEMBLY_SW_CONNECTOR',
                      targetName: asmSwCompName, targetUuid: asmSwCompUUID, targetType: 'SW_COMPONENT_PROTOTYPE' // Or actual type if available
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

  const onSelect: GetProps<typeof Tree>['onSelect'] = (selectedKeys, info) => {
    const selectedCustomNode = info.node as CustomDataNode;
    if (selectedCustomNode.isLeaf && selectedCustomNode.relationData) {
      setSelectedNodeDetails(selectedCustomNode.relationData);
      setIsModalVisible(true);
    } else {
      setSelectedNodeDetails(null);
      setIsModalVisible(false);
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

  const treeProps = {
    treeData,
    expandedKeys,
    autoExpandParent,
    onExpand: (newExpandedKeys: React.Key[]) => {
      setExpandedKeys(newExpandedKeys);
      setAutoExpandParent(false);
    },
    onSelect,
  };

  if (!componentUuid) {
    return <Alert message="Please select a component to view its details." type="info" />;
  }

  return (
    <div>
      <Title level={4}>
        {/* Relations for: <Text strong>{componentName || componentUuid}</Text> */}
        Hierarchical Relations for: <Text strong>{componentName || componentUuid}</Text>
      </Title>
      <Search style={{ marginBottom: 8 }} placeholder="Search in tree" onChange={handleSearch} />
      {loading && <Spin tip="Loading relations..." />}
      {error && <Alert message="Error" description={error} type="error" showIcon />}
      {!loading && !error && treeData.length === 0 && (
        <Alert message="No relations found for this component with the current filter." type="info" />
      )}
      {!loading && !error && treeData.length > 0 && (
        <Tree
          showLine
          {...treeProps}
          filterTreeNode={(node) => {
            if (!searchTerm) return true;
            // const title = (node as CustomDataNode).title as string; // Old incorrect way
            const title = getSortableStringFromTitle((node as CustomDataNode).title);
            return title.toLowerCase().includes(searchTerm.toLowerCase());
          }}
        />
      )}
      {selectedNodeDetails && (
        <Modal
          title="Relation Details"
          open={isModalVisible} // Changed from visible to open
          onOk={() => setIsModalVisible(false)}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
        >
          <p><strong>Relationship Type:</strong> {selectedNodeDetails.relationshipType}</p>
          <p><strong>Source Name:</strong> {selectedNodeDetails.sourceName || 'N/A'}</p>
          <p><strong>Source UUID:</strong> {selectedNodeDetails.sourceUuid || 'N/A'}</p>
          <p><strong>Source Type:</strong> {selectedNodeDetails.sourceType || 'N/A'}</p>
          <p><strong>Target Name:</strong> {selectedNodeDetails.targetName || 'N/A'}</p>
          <p><strong>Target UUID:</strong> {selectedNodeDetails.targetUuid || 'N/A'}</p>
          <p><strong>Target Type:</strong> {selectedNodeDetails.targetType || 'N/A'}</p>
        </Modal>
      )}
    </div>
  );
};

export default SWCompDetailsTree;
