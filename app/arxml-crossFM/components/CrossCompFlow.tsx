/**
 * @file This file implements the main view for the Cross-Component Failure Flow diagram.
 * It has been refactored to use a modular, hook-based architecture for better separation of concerns.
 * 
 * The main responsibilities of this component are:
 * - Orchestrating the `useSafetyData` and `useCausationManager` hooks.
 * - Rendering the ReactFlow canvas and its UI elements (Controls, Panel, etc.).
 * - Defining the custom node and edge types to be used in the diagram.
 * - Displaying the loading state and the final rendered graph.
 */
'use client';

import React, { useMemo, useState, memo, useEffect } from 'react';
import ReactFlow, {
    Controls,
    Background,
    Panel,
    NodeTypes,
    ConnectionLineType,
    Position,
    Handle,
    NodeProps,
    Edge,
    MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, Typography, Space, Tag, Button, Spin, Tooltip, Switch } from 'antd';
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import InteractiveSmoothStepEdge from './InteractiveSmoothStepEdge';
import { getAsilColor } from '@/app/components/asilColors';
import { useSafetyData } from '@/app/arxml-crossFM/hooks/useSafetyData';
import { useCausationManager } from '@/app/arxml-crossFM/hooks/useCausationManager';
import PortConnectionDetailsModal from './PortConnectionDetailsModal';
import { getAssemblyContextForRPort } from '@/app/services/neo4j/queries/ports';

const { Text } = Typography;

interface SwComponentNodeData {
  component: any;
  providerPorts: any[];
  receiverPorts: any[];
  handleToFailureMap: Map<string, string>;
  onPortClick: (port: any, type: 'provider' | 'receiver') => void;
}

/**
 * A custom React Flow node to display a Software Component (SWC) and its ports.
 * This is a pure presentation component; all its data is passed in via props.
 */
const SwComponentNode = memo(({ data }: NodeProps<SwComponentNodeData>) => {
  const { component, providerPorts, receiverPorts, onPortClick } = data;
  const nodeRef = React.useRef<HTMLDivElement>(null);
  
  return (
    <div style={{
      padding: '16px',
      borderRadius: '12px',
      background: 'rgba(248, 250, 252, 0.3)',
      border: '2px solid rgba(24, 144, 255, 0.3)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      minWidth: '350px',
      minHeight: '120px',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between'
    }}>
      {/* Component Title */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '12px',
        fontSize: '14px',
        fontWeight: '600',
        color: '#1890ff'
      }}>
        {component.name}
      </div>

      {/* Ports Container */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'stretch',
        flex: 1,
        gap: '8px'
      }}>
        {/* Receiver Ports (Left) */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '4px',
          minWidth: '120px'
        }}>
          {receiverPorts.map((port: any) => (
            <div key={port.uuid} style={{ position: 'relative', paddingLeft: '20px' }}>
              <Handle
                type="target"
                position={Position.Left}
                id={`port-${port.uuid}`}
                style={{ top: '50%', background: '#4b5563', left: '0px', zIndex: 10 }}
              />
              <div style={{cursor: 'pointer'}} onClick={() => onPortClick(port, 'receiver')}>
                <Tooltip title={port.name} placement="left">
                  <div style={{
                    fontSize: '10px',
                    color: '#6B7280',
                    textAlign: 'left',
                    paddingLeft: '8px',
                    marginBottom: '4px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {port.name}
                  </div>
                </Tooltip>
                {port.failureModes.map((failure: any, index: number) => (
                  <div key={`${failure.uuid}-${index}`} style={{ position: 'relative', marginBottom: '2px' }}>
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`failure-${port.uuid}-${failure.uuid}`}
                      style={{
                        background: '#3B82F6',
                        width: '8px',
                        height: '8px',
                        left: '-20px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: '1px solid white',
                        zIndex: 10
                      }}
                    />
                    <div style={{
                      fontSize: '11px',
                      color: '#374151',
                      textAlign: 'left',
                      paddingLeft: '12px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      <span style={{
                        fontWeight: 'bold',
                        color: '#CC5500' // Dark orange color
                      }}>
                        {failure.name.replace(/_/g, ' ')}
                      </span>
                      {failure.asil && <Tag 
                        color={getAsilColor(failure.asil)}
                        style={{ 
                          fontSize: '8px', 
                          marginLeft: '4px',
                          border: 'none',
                          padding: '1px 4px',
                          lineHeight: '1'
                        }}
                      >
                        {failure.asil}
                      </Tag>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Provider Ports (Right) */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '4px',
          minWidth: '120px'
        }}>
          {providerPorts.map((port: any) => (
            <div key={port.uuid} style={{ position: 'relative', paddingRight: '20px' }}>
              <Handle
                type="source"
                position={Position.Right}
                id={`port-${port.uuid}`}
                style={{ top: '50%', background: '#4b5563', right: '0px', zIndex: 10 }}
              />
              <div style={{cursor: 'pointer'}} onClick={() => onPortClick(port, 'provider')}>
                <Tooltip title={port.name} placement="right">
                  <div style={{
                    fontSize: '10px',
                    color: '#6B7280',
                    textAlign: 'right',
                    paddingRight: '8px',
                    marginBottom: '4px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {port.name}
                  </div>
                </Tooltip>
                {port.failureModes.map((failure: any, index: number) => (
                  <div key={`${failure.uuid}-${index}`} style={{ position: 'relative', marginBottom: '2px' }}>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`failure-${port.uuid}-${failure.uuid}`}
                      style={{
                        background: '#F59E0B',
                        width: '8px',
                        height: '8px',
                        right: '-20px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: '1px solid white',
                        zIndex: 10
                      }}
                    />
                    <div style={{
                      fontSize: '11px',
                      color: '#374151',
                      textAlign: 'right',
                      paddingRight: '12px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {failure.asil && <Tag 
                        color={getAsilColor(failure.asil)}
                        style={{ 
                          fontSize: '8px', 
                          marginRight: '4px',
                          border: 'none',
                          padding: '1px 4px',
                          lineHeight: '1'
                        }}
                      >
                        {failure.asil}
                      </Tag>}
                      <span style={{
                        fontWeight: 'bold',
                        color: '#CC5500' // Dark orange color
                      }}>
                        {failure.name.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Component Info */}
      <div style={{ 
        fontSize: '10px', 
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: '8px'
      }}>
        {receiverPorts.reduce((sum: number, port: any) => sum + port.failureModes.length, 0)} in / {providerPorts.reduce((sum: number, port: any) => sum + port.failureModes.length, 0)} out
      </div>
    </div>
  );
});

/**
 * The main component for the Cross-Component Failure Flow page.
 * It integrates the data loading and causation management hooks to provide
 * an interactive graph visualization of failure mode causations.
 */
export default function CrossCompFlow() {
  const {
      nodes,
      edges,
      loading,
      onNodesChange,
      onEdgesChange,
      setEdges,
      loadDataAndLayout,
      setNodes,
  } = useSafetyData();
  
  const [selectedPortInfo, setSelectedPortInfo] = useState<{port: any; type: 'provider' | 'receiver'} | null>(null);
  const [isPortModalVisible, setIsPortModalVisible] = useState(false);
  const [showPortConnections, setShowPortConnections] = useState(false);
  const [isFetchingPortConnections, setIsFetchingPortConnections] = useState(false);
  const [portConnectionEdges, setPortConnectionEdges] = useState<Edge[]>([]);
  
  const {
      contextMenu,
      onConnect,
      onEdgeContextMenu,
      handleDeleteCausation,
      hideContextMenu,
  } = useCausationManager(nodes, setEdges);

  useEffect(() => {
      const fetchPortConnections = async () => {
          if (!showPortConnections) {
              setPortConnectionEdges([]);
              return;
          }

          setIsFetchingPortConnections(true);
          
          const rPorts = nodes.flatMap(node =>
              node.data.receiverPorts.map((p: any) => ({ port: p, componentId: node.id }))
          );

          const promises = rPorts.map(async ({ port, componentId }) => {
              const result = await getAssemblyContextForRPort(port.uuid);
              
              if (result.records && result.records.length > 0) {
                  console.group(`Connections found for R-Port: ${port.name} (${port.uuid})`);
                  console.table(result.records.map(r => r.toObject()));
                  console.groupEnd();
              }
              
              if (result.records) {
                  return result.records.map(record => {
                      const context = record.toObject() as any;
                      if (context.providerPortUUID && context.swComponentUUID) {
                          return {
                              id: `pconn-${port.uuid}-${context.providerPortUUID}`,
                              source: context.swComponentUUID,
                              target: componentId,
                              sourceHandle: `port-${context.providerPortUUID}`,
                              targetHandle: `port-${port.uuid}`,
                              type: 'smoothstep',
                              style: { stroke: '#0ea5e9', strokeWidth: 2, strokeDasharray: '5 5' },
                              markerEnd: { type: MarkerType.ArrowClosed, color: '#0ea5e9' },
                              zIndex: 0,
                          };
                      }
                      return null;
                  }).filter(Boolean) as Edge[];
              }
              return [];
          });

          try {
              const results = await Promise.all(promises);
              setPortConnectionEdges(results.flat());
          } catch (error) {
              console.error("Failed to fetch port connections:", error);
          } finally {
              setIsFetchingPortConnections(false);
          }
      };

      fetchPortConnections();

  }, [showPortConnections, nodes]);

  const handlePortClick = (port: any, type: 'provider' | 'receiver') => {
    setSelectedPortInfo({ port, type });
    setIsPortModalVisible(true);
  };
  
  const handleClosePortModal = () => {
    setIsPortModalVisible(false);
    setSelectedPortInfo(null);
  };

  const nodesWithHandlers = useMemo(() => {
    return nodes.map(node => ({
        ...node,
        data: {
            ...node.data,
            onPortClick: handlePortClick,
        },
    }));
  }, [nodes]);

  const nodeTypes: NodeTypes = useMemo(() => ({
    swComponent: SwComponentNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    interactive: InteractiveSmoothStepEdge,
  }), []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 200px)', position: 'relative' }} onClick={hideContextMenu}>
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={[...edges, ...portConnectionEdges]}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeContextMenu={onEdgeContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ 
            padding: 0.1,
            includeHiddenNodes: false,
            minZoom: 0.1,
            maxZoom: 1.2
          }}
          proOptions={{ hideAttribution: true }}
          connectionLineType={ConnectionLineType.Straight}
          minZoom={0.1}
          maxZoom={2}
        >
          <Panel position="top-right">
            <Space>
              <Switch
                checkedChildren="Port Links"
                unCheckedChildren="Port Links"
                loading={isFetchingPortConnections}
                checked={showPortConnections}
                onChange={setShowPortConnections}
                size="small"
              />
              <Button onClick={loadDataAndLayout} icon={<ReloadOutlined />} size="small">
                Reload Layout
              </Button>
            </Space>
          </Panel>
          <Background />
          <Controls />
        </ReactFlow>

        {contextMenu && (
          <div
            style={{
              position: 'absolute',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 10,
              backgroundColor: 'white',
              border: '1px solid #ddd',
              boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
              borderRadius: '4px',
              padding: '8px',
            }}
          >
            <Button
              type="primary"
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeleteCausation}
            >
              Delete Causation
            </Button>
          </div>
        )}

        <PortConnectionDetailsModal
          isVisible={isPortModalVisible}
          onClose={handleClosePortModal}
          portInfo={selectedPortInfo}
        />
    </div>
  );
}