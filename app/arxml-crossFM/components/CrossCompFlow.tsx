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

import React, { useMemo } from 'react';
import ReactFlow, {
    Controls,
    Background,
    Panel,
    NodeTypes,
    ConnectionLineType,
    Position,
    Handle,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, Typography, Space, Tag, Button, Spin, Tooltip } from 'antd';
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import InteractiveSmoothStepEdge from './InteractiveSmoothStepEdge';
import { getAsilColor } from '@/app/components/asilColors';
import { useSafetyData } from '@/app/arxml-crossFM/hooks/useSafetyData';
import { useCausationManager } from '@/app/arxml-crossFM/hooks/useCausationManager';

const { Text } = Typography;

/**
 * A custom React Flow node to display a Software Component (SWC) and its ports.
 * This is a pure presentation component; all its data is passed in via props.
 */
function SwComponentNode({ data }: { data: any }) {
  const { component, providerPorts, receiverPorts } = data;
  
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
            <div key={port.uuid}>
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
            <div key={port.uuid}>
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
}

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
  } = useSafetyData();
  
  const {
      contextMenu,
      onConnect,
      onEdgeContextMenu,
      handleDeleteCausation,
      hideContextMenu,
  } = useCausationManager(nodes, setEdges);

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
    <div style={{ height: '80vh', width: '100%', position: 'relative' }} onClick={hideContextMenu}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
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
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              backgroundColor: 'white',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
            }}
          >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
              <Text strong>Delete Causation</Text>
            </div>
            <div style={{ padding: '4px 0' }}>
              <Button
                type="text"
                icon={<DeleteOutlined />}
                onClick={handleDeleteCausation}
                style={{ width: '100%', textAlign: 'left', color: '#ff4d4f' }}
                danger
              >
                Delete
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}