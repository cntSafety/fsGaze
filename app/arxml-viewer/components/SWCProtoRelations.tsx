'use client';

import React, { useState, useEffect } from 'react';
import { Select, Spin, Alert, Card, Tree, Typography, Tag, Space, Divider } from 'antd';
import { ApartmentOutlined, ShareAltOutlined, NodeIndexOutlined } from '@ant-design/icons';
import { getAllSwComponentPrototypes, getComponentDependencyGraph, ComponentVisualizationResult } from '@/app/services/ArxmlToNeoService';
import type { TreeDataNode } from 'antd';

const { Title, Text } = Typography;
const { Option } = Select;

interface SwcPrototype {
  uuid: string;
  name: string;
  shortName: string;
  arxmlPath: string;
}

const SWCProtoRelations: React.FC = () => {
  const [swcPrototypes, setSwcPrototypes] = useState<SwcPrototype[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [dependencyGraph, setDependencyGraph] = useState<ComponentVisualizationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);

  useEffect(() => {
    const loadSwcPrototypes = async () => {
      try {
        setLoading(true);
        const result = await getAllSwComponentPrototypes();
        if (result.success && result.data) {
          setSwcPrototypes(result.data);
        } else {
          setError(result.error || 'Failed to load SW Component Prototypes');
        }
      } catch (err) {
        setError('Error loading SW Component Prototypes');
      } finally {
        setLoading(false);
      }
    };
    loadSwcPrototypes();
  }, []);

  const handleComponentSelect = async (uuid: string) => {
    setSelectedComponent(uuid);
    setLoadingGraph(true);
    setDependencyGraph(null);
    setGraphError(null);
    try {
      const result = await getComponentDependencyGraph(uuid);
      if (result.success && result.data) {
        setDependencyGraph(result.data);
      } else {
        setGraphError(result.error || 'Failed to load dependency graph');
      }
    } catch (err) {
      setGraphError('Error loading dependency graph');
    } finally {
      setLoadingGraph(false);
    }
  };

  const transformToTreeData = (): TreeDataNode[] => {
    if (!dependencyGraph) return [];

    const { nodes, relationships, metadata } = dependencyGraph;

    const nodesByType = nodes.reduce((acc, node) => {
      if (!acc[node.type]) acc[node.type] = [];
      acc[node.type].push(node);
      return acc;
    }, {} as Record<string, any[]>);

    const relationshipsByType = relationships.reduce((acc, rel) => {
      if (!acc[rel.type]) acc[rel.type] = [];
      acc[rel.type].push(rel);
      return acc;
    }, {} as Record<string, any[]>);

    return [
      {
        title: <Text strong>Component Details</Text>,
        key: 'center',
        icon: <ApartmentOutlined />,
        children: [
          { title: <><Text>Name: </Text><Tag color="blue">{metadata.componentName}</Tag></>, key: 'center-name' },
          { title: <><Text>Total Nodes: </Text><Tag>{metadata.totalNodes}</Tag></>, key: 'center-nodes' },
          { title: <><Text>Total Relationships: </Text><Tag>{metadata.totalRelationships}</Tag></>, key: 'center-rels' },
        ],
      },
      {
        title: <Text strong>Nodes ({nodes.length})</Text>,
        key: 'all-nodes',
        icon: <NodeIndexOutlined />,
        children: Object.entries(nodesByType).map(([nodeType, nodesOfType]) => ({
          title: <><Text>{nodeType} </Text><Tag color="purple">{nodesOfType.length}</Tag></>,
          key: `nodes-${nodeType}`,
          children: nodesOfType.map(node => ({
            title: <Text code>{node.name}</Text>,
            key: `node-${node.id}`,
          })),
        })),
      },
      {
        title: <Text strong>Relationships ({relationships.length})</Text>,
        key: 'all-relationships',
        icon: <ShareAltOutlined />,
        children: Object.entries(relationshipsByType).map(([relType, relsOfType]) => ({
          title: <><Text>{relType} </Text><Tag color="geekblue">{relsOfType.length}</Tag></>,
          key: `rels-${relType}`,
          children: relsOfType.map((rel, index) => {
            const sourceNode = nodes.find(n => n.id === rel.source);
            const targetNode = nodes.find(n => n.id === rel.target);
            return {
              title: <Space><Text code>{sourceNode?.name || 'Unknown'}</Text> → <Text code>{targetNode?.name || 'Unknown'}</Text></Space>,
              key: `rel-${rel.id}-${index}`,
            };
          }),
        })),
      },
    ];
  };

  const renderDependencyTree = () => {
    if (loadingGraph) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <Spin size="large" tip="Loading dependency graph..." />
        </div>
      );
    }
    if (graphError) {
      return <Alert message="Error" description={graphError} type="error" showIcon />;
    }
    if (dependencyGraph) {
      return <Tree showIcon defaultExpandAll treeData={transformToTreeData()} />;
    }
    return null;
  };

  return (
    <Card>
      <Title level={4}>Software Component Relationship Viewer</Title>
      <Text type="secondary">Select a component to view its dependency graph as a tree.</Text>
      <Divider />
      
      <Select
        showSearch
        style={{ width: '100%', maxWidth: '600px', marginBottom: '24px' }}
        placeholder="Select a Software Component Prototype"
        onChange={handleComponentSelect}
        loading={loading}
        filterOption={(input, option) =>
          option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
        }
        value={selectedComponent}
      >
        {swcPrototypes.map(proto => (
          <Option key={proto.uuid} value={proto.uuid}>
            {proto.name} ({proto.shortName})
          </Option>
        ))}
      </Select>

      {error && <Alert message="Error" description={error} type="error" showIcon />}
      
      {selectedComponent && (
        <Card type="inner" title="Dependency Details">
          {renderDependencyTree()}
        </Card>
      )}
    </Card>
  );
};

export default SWCProtoRelations;