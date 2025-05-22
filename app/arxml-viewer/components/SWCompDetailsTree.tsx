'use client';

import React, { useEffect, useState } from 'react';
import { Tree, Spin, Alert, Typography, Input } from 'antd';
import type { TreeDataNode, GetProps } from 'antd';
import { getComponentRelations } from '../../services/ArxmlToNeoService';

const { Title } = Typography;
const { Search } = Input;
const { DirectoryTree } = Tree;

type DirectoryTreeProps = GetProps<typeof Tree.DirectoryTree>;

interface Relation {
  relationshipType: string;
  sourceName: string;
  sourceUuid: string;
  sourceType: string;
  targetName: string;
  targetUuid: string;
  targetType: string;
}

interface SWCompDetailsTreeProps {
  componentUuid: string | null;
  componentName?: string;
}

const SWCompDetailsTree: React.FC<SWCompDetailsTreeProps> = ({ componentUuid, componentName }) => {
  const [treeData, setTreeData] = useState<TreeDataNode[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    if (componentUuid) {
      fetchRelationsAndBuildTree(componentUuid, componentName || 'Root');
    } else {
      setTreeData([]);
      setExpandedKeys([]);
    }
  }, [componentUuid, componentName]);

  const fetchRelationsAndBuildTree = async (uuid: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getComponentRelations(uuid);
      if (result.success && result.data) {
        const builtTree = buildTreeData(uuid, name, result.data);
        setTreeData(builtTree);
        // Automatically expand the first level
        if (builtTree.length > 0) {
          setExpandedKeys([builtTree[0].key]);
        }
      } else {
        setError(result.message || 'Failed to fetch component relations.');
        setTreeData([]);
      }
    } catch (err) {
      setError('An unexpected error occurred while fetching relations.');
      setTreeData([]);
    } finally {
      setLoading(false);
    }
  };

  const buildTreeData = (rootUuid: string, rootName: string, relations: Relation[]): TreeDataNode[] => {
    const nodesMap = new Map<string, TreeDataNode>();
    const rootNode: TreeDataNode = {
      title: `${rootName} (${rootUuid.substring(0,8)}) - Root Component`,
      key: rootUuid,
      children: [],
    };
    nodesMap.set(rootUuid, rootNode);

    relations.forEach(rel => {
      // Determine the child and its properties based on the relation direction
      let childName, childUuid, childType, relType;

      if (rel.sourceUuid === rootUuid) {
        childName = rel.targetName;
        childUuid = rel.targetUuid;
        childType = rel.targetType;
        relType = rel.relationshipType;
      } else if (rel.targetUuid === rootUuid) {
        childName = rel.sourceName;
        childUuid = rel.sourceUuid;
        childType = rel.sourceType;
        relType = rel.relationshipType; // Consider if you want to show inverse relation type
      } else {
        return; // This relation does not directly involve the root node
      }

      if (!childUuid) return; // Skip if childUuid is not defined

      const childNode: TreeDataNode = {
        title: `${childName || 'Unnamed'} (${childType || 'UnknownType'}) - ${relType}`,
        key: `${rootUuid}-${childUuid}-${relType}-${Math.random()}`, // Ensure unique key for each relation instance
        isLeaf: true, // For now, consider all direct relations as leaves in this simple tree
      };
      rootNode.children?.push(childNode);
    });
    return [rootNode]; // Return the root node as an array
  };

  const onSelect: DirectoryTreeProps['onSelect'] = (keys, info) => {
    console.log('Trigger Select', keys, info);
  };

  const onExpand = (keys: React.Key[]) => {
    setExpandedKeys(keys);
  };
  
  // Basic search filter for the tree (only top-level nodes for simplicity)
  // A more sophisticated search would require recursive filtering or a flattened list
  const filteredTreeData = treeData.map(rootNode => {
    if (!searchTerm) return rootNode;
    const newRootNode = { ...rootNode };
    if (rootNode.children) {
        newRootNode.children = rootNode.children.filter(child => 
            typeof child.title === 'string' && child.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    // Only include the root node if its title matches or it has matching children
    if ((typeof newRootNode.title === 'string' && newRootNode.title.toLowerCase().includes(searchTerm.toLowerCase())) || (newRootNode.children && newRootNode.children.length > 0)) {
        return newRootNode;
    }
    return null;
  }).filter(Boolean) as TreeDataNode[];


  if (!componentUuid) {
    return <Alert message="Select a component and click the tree icon to view its relations as a tree." type="info" showIcon style={{ marginTop: 20 }} />;
  }

  return (
    <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #e8e8e8', borderRadius: '8px' }}>
      <Title level={4}>Relation Tree for: {componentName || componentUuid}</Title>
      <Search
        placeholder="Search in relations..."
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ marginBottom: '20px', width: '100%', maxWidth: '400px' }}
        allowClear
        enterButton
      />
      {loading && <Spin tip="Loading relations..." style={{ display: 'block', marginTop: '20px' }} />}
      {error && <Alert message="Error Fetching Relations" description={error} type="error" showIcon style={{ marginBottom: '20px' }} />}
      {!loading && !error && treeData.length === 0 && componentUuid && (
        <Alert message="No relations found or tree could not be built for this component." type="info" showIcon />
      )}
      {!loading && !error && treeData.length > 0 && filteredTreeData.length === 0 && searchTerm && (
         <Alert message={`No relations found matching "${searchTerm}".`} type="info" showIcon />
      )}
      {!loading && !error && filteredTreeData.length > 0 && (
        <DirectoryTree
          multiple
          defaultExpandAll={false} // Set to false, using controlled expandedKeys
          expandedKeys={expandedKeys}
          onExpand={onExpand}
          onSelect={onSelect}
          treeData={filteredTreeData}
          showLine
          showIcon={false} // Ant Design default icons are fine for now
        />
      )}
    </div>
  );
};

export default SWCompDetailsTree;
