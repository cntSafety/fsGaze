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

import React, { useMemo, useState, memo, useEffect, useCallback } from 'react';
import ReactFlow, {
    Controls,
    Background,
    Panel,
    NodeTypes,
    ConnectionLineType,
    Position,
    Handle,
    NodeProps,
    Node,
    Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, Typography, Space, Tag, Button, Spin, Tooltip, Switch } from 'antd';
import { ReloadOutlined, DeleteOutlined, SafetyOutlined } from '@ant-design/icons';
import InteractiveSmoothStepEdge from './InteractiveSmoothStepEdge';
import { getAsilColor } from '@/app/components/asilColors';
import { useTheme } from '@/app/components/ThemeProvider';
import { useSafetyData } from '../hooks/useSafetyData';
import { useCausationManager } from '../hooks/useCausationManager';
import SafetyTreeView from './SafetyTreeView';
import PortConnectionDetailsModal from './PortConnectionDetailsModal';

const { Text } = Typography;

interface SwComponentNodeData {
  component: any;
  providerPorts: any[];
  receiverPorts: any[];
  handleToFailureMap: Map<string, string>;
  onPortClick: (port: any, type: 'provider' | 'receiver') => void;
}

const SwComponentNode = memo(({ data, id }: NodeProps<SwComponentNodeData>) => {
  const { component, providerPorts, receiverPorts, onPortClick } = data;
  
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
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '12px',
        fontSize: '14px',
        fontWeight: '600',
        color: '#1890ff',
        cursor: 'pointer'
      }}>
        {component.name}
      </div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'stretch',
        flex: 1,
        gap: '8px'
      }}>
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
                        color: '#CC5500'
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
                        color: '#CC5500'
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

SwComponentNode.displayName = 'SwComponentNode';

const nodeTypes = { swComponent: SwComponentNode };

export default function CrossCompFlow() {
    const { themeMode } = useTheme();
    const [showPortConnections, setShowPortConnections] = useState(false);
    const [showSafetyTree, setShowSafetyTree] = useState(false);
    
    const {
        nodes, edges, loading, onNodesChange, onEdgesChange, setEdges, setNodes, loadDataAndLayout
    } = useSafetyData(showPortConnections);
    
    const {
        contextMenu,
        onConnect,
        onEdgeContextMenu,
        handleDeleteCausation,
        hideContextMenu,
    } = useCausationManager(nodes, setEdges);
    
    const [selectedPortInfo, setSelectedPortInfo] = useState<{port: any; type: 'provider' | 'receiver'} | null>(null);
    const [isPortModalVisible, setIsPortModalVisible] = useState(false);

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

    const edgeTypes = useMemo(() => ({
        smoothstep: InteractiveSmoothStepEdge,
    }), []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div style={{ height: 'calc(100vh - 200px)', position: 'relative', background: themeMode === 'dark' ? '#141414' : '#f5f5f5' }} onClick={hideContextMenu}>
            <ReactFlow
                nodes={nodesWithHandlers}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onEdgeContextMenu={onEdgeContextMenu}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                className="bg-gray-100 dark:bg-gray-900"
                style={{ background: themeMode === 'dark' ? '#141414' : '#f5f5f5' }}
            >
                <Panel position="top-right">
                    <Space>
                        <Tooltip title="Toggle Port-to-Port Connections">
                            <Switch
                                checkedChildren="Connections ON"
                                unCheckedChildren="Connections OFF"
                                checked={showPortConnections}
                                onChange={setShowPortConnections}
                            />
                        </Tooltip>
                        <Button onClick={() => setShowSafetyTree(true)} icon={<SafetyOutlined />} size="small">
                            Safety Tree
                        </Button>
                        <Button onClick={loadDataAndLayout} icon={<ReloadOutlined />} size="small">
                            Reload
                        </Button>
                    </Space>
                </Panel>
                <Background color={themeMode === 'dark' ? '#434343' : '#f0f0f0'} />
                <Controls />
            </ReactFlow>

            {contextMenu && (
                <div
                    style={{
                        position: 'absolute',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 10,
                        backgroundColor: themeMode === 'dark' ? '#1f1f1f' : 'white',
                        border: `1px solid ${themeMode === 'dark' ? '#434343' : '#ddd'}`,
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
            
            {showSafetyTree && (
                <div style={{ position: 'absolute', top: 0, right: 0, width: '400px', height: '100%', zIndex: 20, background: themeMode === 'dark' ? '#1f1f1f' : 'white', boxShadow: '-2px 0 5px rgba(0,0,0,0.1)' }}>
                    <SafetyTreeView
                        onFailureSelect={(failure) => {
                            console.log('Failure selected:', failure);
                            // Future implementation to highlight the selected failure
                        }}
                    />
                     <Button onClick={() => setShowSafetyTree(false)} style={{ position: 'absolute', top: 10, right: 10 }}>Close</Button>
                </div>
            )}
        </div>
    );
}