'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Select, Alert, Spin, Card, Divider, Checkbox, theme, message } from 'antd';
import { NodeCollapseOutlined, InfoCircleOutlined } from '@ant-design/icons';
import * as d3 from 'd3';
import { getAllSwComponentPrototypes, getComponentDependencyGraph, ComponentVisualizationResult } from '@/app/services/ArxmlToNeoService';
import { getFailuresForPorts } from '@/app/services/neo4j/queries/safety/failureModes';
import { getEffectFailureModes } from '@/app/services/neo4j/queries/safety/causation';

const { Option } = Select;

interface SwcPrototype {
  uuid: string;
  name: string;
  shortName: string;
  arxmlPath: string;
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  RenderingInfoType: 'center' | 'partner' | 'port' | 'failure';
  subtype?: 'P_PORT' | 'R_PORT' | 'INTERFACE' | 'UNKNOWN';
  parentId?: string;
  group: number;
  size: number;
  shape?: 'circle' | 'rect' | 'half-circle' | 'triangle';
  nodeLabel?: string;
  // Additional metadata for enhanced tooltips
  prototype?: string;
  interfaceGroup?: string;
  interfaceName?: string;
  arxmlPath?: string;
  // Failure mode specific properties
  asil?: string;
  failureDescription?: string;
  isFailureMode?: boolean;
  connectedPortId?: string;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  type: 'connection' | 'contains' | 'failure' | 'causation';
  connectionType?: string;
  strokeWidth?: number;
  strokeColor?: string;
  strokeDasharray?: string | null;
}

interface FailureModeData {
  failureUuid: string;
  failureName: string | null;
  failureDescription: string | null;
  asil: string | null;
  relationshipType: string;
  connectedPortId: string;
}

interface CausationData {
  causationUuid: string;
  causationName: string | null;
  effectFailureModeUuid: string;
  effectFailureModeName: string | null;
  sourceFailureModeUuid: string; // This will be added when we collect the data
}

const SWCProtoGraph: React.FC = () => {
  const [prototypes, setPrototypes] = useState<SwcPrototype[]>([]);
  const [selectedPrototype, setSelectedPrototype] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPrototypes, setLoadingPrototypes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<ComponentVisualizationResult | null>(null);
  
  // Failure mode state
  const [failureModeData, setFailureModeData] = useState<FailureModeData[]>([]);
  const [showFailureModes, setShowFailureModes] = useState(true);
  
  // Causation state
  const [causationData, setCausationData] = useState<CausationData[]>([]);
  const [showCausations, setShowCausations] = useState(true);
  
  // Visibility state for node types
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set([
    'SW_COMPONENT_PROTOTYPE',
    'APPLICATION_SW_COMPONENT_TYPE',
    'ASSEMBLY_SW_CONNECTOR',
    'MODE_SWITCH_INTERFACE',
    'SENDER_RECEIVER_INTERFACE',
    'CLIENT_SERVER_INTERFACE',
    'P_PORT_PROTOTYPE',
    'R_PORT_PROTOTYPE',
    'VirtualArxmlRefTarget',
    'COMPOSITION_SW_COMPONENT_TYPE',
    'FAILUREMODE'
  ]));
  
  // Visibility state for relationship types
  const [visibleRelationshipTypes, setVisibleRelationshipTypes] = useState<Set<string>>(new Set([
    'TYPE-TREF',
    'TARGET-P-PORT-REF',
    'TARGET-R-PORT-REF',
    'PROVIDED-INTERFACE-TREF',
    'CONTAINS',
    'REQUIRED-INTERFACE-TREF',
    'OCCURRENCE',
    'FIRST',
    'THEN'
  ]));
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { token } = theme.useToken();

  // Utility function to copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`Copied "${text}" to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      message.success(`Copied "${text}" to clipboard`);
    }
  };

  // Function to create enhanced tooltip text
  const createTooltipText = (d: D3Node) => {
    let tooltip = `Name: ${d.name}\nUUID: ${d.id}\nRenderingInfoType: ${d.RenderingInfoType}`;
    
    if (d.isFailureMode) {
      tooltip += `\nType: Failure Mode`;
      if (d.asil) {
        tooltip += `\nASIL: ${d.asil}`;
      }
      if (d.failureDescription) {
        tooltip += `\nDescription: ${d.failureDescription}`;
      }
      if (d.connectedPortId) {
        tooltip += `\nConnected Port: ${d.connectedPortId}`;
      }
    } else {
      if (d.subtype) {
        tooltip += `\nSubtype: ${d.subtype}`;
      }
      
      if (d.prototype) {
        tooltip += `\nPrototype: ${d.prototype}`;
      }
      
      if (d.interfaceGroup) {
        tooltip += `\nInterface Group: ${d.interfaceGroup}`;
      }
      
      if (d.interfaceName) {
        tooltip += `\nInterface: ${d.interfaceName}`;
      }
      
      if (d.arxmlPath) {
        tooltip += `\nARXML Path: ${d.arxmlPath}`;
      }
    }
    
    tooltip += '\n\n🖱️ Drag to move and pin\n⏸️ Double-click to unpin\n🖱️ Right-click to copy name';
    
    return tooltip;
  };

  // Load SW Component Prototypes on mount
  useEffect(() => {
    const fetchPrototypes = async () => {
      try {
        setLoadingPrototypes(true);
        const result = await getAllSwComponentPrototypes();
        
        if (result.success && result.data) {
          setPrototypes(result.data);
          // console.log('✅ Loaded SW Component Prototypes:', result.data.length);
        } else {
          setError(result.message || 'Failed to load SW Component Prototypes');
        }
      } catch (err) {
        console.error('❌ Error loading prototypes:', err);
        setError('Error loading SW Component Prototypes');
      } finally {
        setLoadingPrototypes(false);
      }
    };

    fetchPrototypes();
  }, []);

  // Load all graph data (dependencies, failures, causations) when prototype or toggles change
  useEffect(() => {
    if (!selectedPrototype) {
      setGraphData(null);
      return;
    }

    const fetchAllGraphData = async () => {
      setLoading(true);
      setError(null);
      
      // Clear previous data
      setGraphData(null);
      setFailureModeData([]);
      setCausationData([]);

      try {
        // 1. Fetch base dependency graph
        const graphResult = await getComponentDependencyGraph(selectedPrototype);
        if (!graphResult.success || !graphResult.data) {
          setError(graphResult.message || 'Failed to load dependency graph');
          setLoading(false);
          return;
        }
        const baseGraphData = graphResult.data;

        // 2. Fetch failure modes if enabled
        let failures: FailureModeData[] = [];
        if (showFailureModes) {
          const portNodes = baseGraphData.nodes.filter(node => 
            node.type === 'P_PORT_PROTOTYPE' || node.type === 'R_PORT_PROTOTYPE'
          );
          if (portNodes.length > 0) {
            const failurePromises = portNodes.map(async (portNode) => {
              try {
                const result = await getFailuresForPorts(portNode.id);
                if (result.success && result.data) {
                  return result.data.map(failure => ({ ...failure, connectedPortId: portNode.id }));
                }
                return [];
              } catch (error) {
                console.error(`Error fetching failures for port ${portNode.id}:`, error);
                return [];
              }
            });
            failures = (await Promise.all(failurePromises)).flat();
          }
        }
        
        // 3. Fetch causations if enabled
        let causations: CausationData[] = [];
        if (showCausations && failures.length > 0) {
          const causationPromises = failures.map(async (failureMode) => {
            try {
              const result = await getEffectFailureModes(failureMode.failureUuid);
              if (result.success && result.data) {
                return result.data.map(causation => ({ ...causation, sourceFailureModeUuid: failureMode.failureUuid }));
              }
              return [];
            } catch (error) {
              console.error(`Error fetching causations for failure mode ${failureMode.failureUuid}:`, error);
              return [];
            }
          });
          causations = (await Promise.all(causationPromises)).flat();
        }

        // 4. Set all state at once to trigger a single re-render
        setFailureModeData(failures);
        setCausationData(causations);
        setGraphData(baseGraphData); // Set this last to ensure other data is ready

      } catch (err) {
        console.error('Error loading full dependency graph:', err);
        setError('Error loading dependency graph data');
      } finally {
        setLoading(false);
      }
    };

    fetchAllGraphData();
  }, [selectedPrototype, showFailureModes, showCausations]);

  // Helper functions for managing visibility
  const toggleNodeTypeVisibility = (nodeType: string) => {
    setVisibleNodeTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeType)) {
        newSet.delete(nodeType);
      } else {
        newSet.add(nodeType);
      }
      return newSet;
    });
  };

  const toggleRelationshipTypeVisibility = (relationshipType: string) => {
    setVisibleRelationshipTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(relationshipType)) {
        newSet.delete(relationshipType);
      } else {
        newSet.add(relationshipType);
      }
      return newSet;
    });
  };

  // Auto-update visibility sets when new graph data is loaded
  useEffect(() => {
    if (!graphData) return;

    const availableNodeTypes = [...new Set(graphData.nodes.map(n => n.type || n.label))];
    const availableRelationshipTypes = [...new Set(graphData.relationships.map(r => r.type))];
    
    // Add any missing types to visibility sets (only when graphData changes)
    setVisibleNodeTypes(prev => {
      const newSet = new Set(prev);
      let hasChanges = false;
      availableNodeTypes.forEach(type => {
        if (!newSet.has(type)) {
          newSet.add(type);
          hasChanges = true;
        }
      });
      return hasChanges ? newSet : prev; // Only return new set if there are actual changes
    });
    
    setVisibleRelationshipTypes(prev => {
      const newSet = new Set(prev);
      let hasChanges = false;
      availableRelationshipTypes.forEach(type => {
        if (!newSet.has(type)) {
          if (type === 'CONTEXT-COMPONENT-REF') return; // Do not auto-enable this type
          newSet.add(type);
          hasChanges = true;
        }
      });
      return hasChanges ? newSet : prev; // Only return new set if there are actual changes
    });
  }, [graphData]); // Only depend on graphData, not the visibility sets

  // Create D3 visualization when graph data, failure modes, causations, or visibility changes
  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    // console.log('🎨 Creating D3 visualization with data:', graphData);
    createD3Visualization(graphData, failureModeData, causationData);
  }, [graphData, failureModeData, causationData, visibleNodeTypes, visibleRelationshipTypes, showFailureModes, showCausations, token]);

  const createD3Visualization = useCallback((data: ComponentVisualizationResult, failureData: FailureModeData[] = [], causationData: CausationData[] = []) => {
    if (!svgRef.current || !containerRef.current) return;

    // console.log('🎨 Creating D3 visualization with simplified data:', data);
    // console.log('📊 Nodes count:', data.nodes?.length || 0);
    // console.log('📊 Relationships count:', data.relationships?.length || 0);
    // console.log('📊 Failure modes count:', failureData?.length || 0);
    // console.log('📊 Metadata:', data.metadata);
    
    // Log all available node types and relationship types
    // const availableNodeTypes = [...new Set(data.nodes.map(n => n.type || n.label))];
    // const availableRelationshipTypes = [...new Set(data.relationships.map(r => r.type))];
    // console.log('📊 Available Node Types:', availableNodeTypes);
    // console.log('📊 Visible Node Types:', Array.from(visibleNodeTypes));
    // console.log('📊 Available Relationship Types:', availableRelationshipTypes);
    // console.log('📊 Visible Relationship Types:', Array.from(visibleRelationshipTypes));

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth || 800;
    const height = 600;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Create a container group for zoom and pan
    const container = svg.append('g');

    // Set up zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    // Apply zoom to the SVG
    svg.call(zoom);

    // Add reset zoom functionality on double-click
    svg.on('dblclick.zoom', () => {
      svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity);
    });

    // Create nodes and links from the simplified graph data
    const nodes: D3Node[] = [];
    const links: D3Link[] = [];

    // Convert the simplified nodes to D3 nodes
    data.nodes.forEach((node) => {
      const nodeLabel = node.type || node.label;
      
      // Skip this node if it's not visible
      if (!visibleNodeTypes.has(nodeLabel)) {
        // console.log('🚫 Filtered out node:', nodeLabel, 'for node:', node.name);
        return;
      }
      
      const isCenter = node.id === data.metadata.centerComponentId;
      const nodeType = isCenter ? 'center' : 
                      node.type.includes('PORT') ? 'port' : 'partner';
      
      // Determine group and styling based on actual node label/type
      let group = 0;
      let shape: 'circle' | 'rect' | 'half-circle' | 'triangle' = 'circle'; // Properly typed
      let nodeSize = 15;
      
      switch (nodeLabel) {
        case 'SW_COMPONENT_PROTOTYPE':
          group = 1; // Medium Blue
          shape = 'circle';
          nodeSize = 16;
          break;
        case 'APPLICATION_SW_COMPONENT_TYPE':
          group = 2; // Light Blue
          shape = 'circle';
          nodeSize = 15;
          break;
        case 'ASSEMBLY_SW_CONNECTOR':
          group = 3; // Dark brown
          shape = 'rect';
          nodeSize = 10;
          break;
        case 'MODE_SWITCH_INTERFACE':
          group = 8; // Light brown
          shape = 'half-circle';
          nodeSize = 12;
          break;
        case 'SENDER_RECEIVER_INTERFACE':
          group = 9; // Light orange
          shape = 'triangle';
          nodeSize = 12;
          break;
        case 'CLIENT_SERVER_INTERFACE':
          group = 10; // Turquoise
          shape = 'triangle';
          nodeSize = 12;
          break;
        case 'P_PORT_PROTOTYPE':
          group = 4; // Green
          shape = 'rect';
          nodeSize = 12;
          break;
        case 'R_PORT_PROTOTYPE':
          group = 5; // Blue
          shape = 'rect';
          nodeSize = 12;
          break;
        case 'VirtualArxmlRefTarget':
          group = 6; // Light Gray
          shape = 'circle';
          nodeSize = 14;
          break;
        case 'COMPOSITION_SW_COMPONENT_TYPE':
          group = 7; // Light Green
          shape = 'circle';
          nodeSize = 15;
          break;
        default:
          group = 0;
          shape = 'circle';
          nodeSize = 12;
      }

      nodes.push({
        id: node.id,
        name: node.name,
        RenderingInfoType: nodeType,
        subtype: node.type.includes('P_PORT') ? 'P_PORT' : 
                 node.type.includes('R_PORT') ? 'R_PORT' : undefined,
        group: group,
        size: nodeSize,
        shape: shape,
        nodeLabel: nodeLabel,
        prototype: node.type,
        arxmlPath: (node.properties?.arxmlPath || node.properties?.path) as string | undefined
      });
    });

    // Add failure mode nodes if they should be visible and shown
    if (showFailureModes && visibleNodeTypes.has('FAILUREMODE') && failureData.length > 0) {
      failureData.forEach((failure) => {
        nodes.push({
          id: failure.failureUuid,
          name: failure.failureName || 'Unknown Failure',
          RenderingInfoType: 'failure',
          group: 11, // New group for failure modes
          size: 14,
          shape: 'circle',
          nodeLabel: 'FAILUREMODE',
          prototype: 'FAILUREMODE',
          isFailureMode: true,
          asil: failure.asil || undefined,
          failureDescription: failure.failureDescription || undefined,
          connectedPortId: failure.connectedPortId
        });
      });
    }

    // Convert relationships to D3 links
    // let filteredRelTypeCount = 0;
    // let filteredNodeVisibilityCount = 0;
    data.relationships.forEach(relationship => {
      // Skip this relationship if it's not visible
      if (!visibleRelationshipTypes.has(relationship.type)) {
        // filteredRelTypeCount++;
        // console.log('🚫 Filtered out relationship type:', relationship.type);
        return;
      }

      // Check if both source and target nodes are visible
      const sourceNode = data.nodes.find(n => n.id === relationship.source);
      const targetNode = data.nodes.find(n => n.id === relationship.target);
      
      if (!sourceNode || !targetNode) {
        return;
      }
      
      const sourceNodeLabel = sourceNode.type || sourceNode.label;
      const targetNodeLabel = targetNode.type || targetNode.label;
      
      if (!visibleNodeTypes.has(sourceNodeLabel) || !visibleNodeTypes.has(targetNodeLabel)) {
        // filteredNodeVisibilityCount++;
        // console.log('🚫 Filtered out relationship due to node visibility:', 
        //   `${sourceNodeLabel} -> ${targetNodeLabel}`, 
        //   `(${relationship.type})`);
        return;
      }

      // Determine link type and styling based on relationship type
      let linkType: 'connection' | 'contains' = 'connection';
      let strokeWidth = 2;
      let strokeColor = token.colorTextSecondary;
      let strokeDasharray = null;
      
      switch (relationship.type) {
        case 'TYPE-TREF':
          strokeWidth = 1;
          strokeColor = token.colorInfo; // Blue
          strokeDasharray = '3,3'; // Dotted
          break;
        case 'CONTEXT-COMPONENT-REF':
          strokeWidth = 2;
          strokeColor = token.colorTextSecondary; // Brown
          break;
        case 'TARGET-P-PORT-REF':
          strokeWidth = 2;
          strokeColor = token.colorSuccess; // Green
          break;
        case 'TARGET-R-PORT-REF':
          strokeWidth = 2;
          strokeColor = token.colorPrimary; // Blue
          break;
        case 'PROVIDED-INTERFACE-TREF':
          strokeWidth = 1;
          strokeColor = token.colorWarning; // Orange
          break;
        case 'CONTAINS':
          linkType = 'contains';
          strokeWidth = 1;
          strokeColor = token.colorBorder; // Gray
          strokeDasharray = '3,3'; // Dotted
          break;
        case 'REQUIRED-INTERFACE-TREF':
          strokeWidth = 1;
          strokeColor = token.colorInfoTextActive; // Purple
          break;
        case 'OCCURRENCE':
          strokeWidth = 2;
          strokeColor = token.colorError; // Red
          break;
        case 'CAUSATION':
          strokeWidth = 3;
          strokeColor = token.colorInfoTextActive; // Purple
          strokeDasharray = '5,5'; // Dashed
          break;
        default:
          strokeWidth = 1;
          strokeColor = token.colorTextSecondary;
      }

      links.push({
        source: relationship.source,
        target: relationship.target,
        type: linkType,
        connectionType: relationship.type,
        strokeWidth: strokeWidth,
        strokeColor: strokeColor,
        strokeDasharray: strokeDasharray
      });
    });

    // Add failure mode relationships (OCCURRENCE) if failure modes are shown
    if (showFailureModes && visibleRelationshipTypes.has('OCCURRENCE') && failureData.length > 0) {
      failureData.forEach((failure) => {
        // Check if both failure node and connected port are visible
        const failureNodeExists = nodes.some(n => n.id === failure.failureUuid);
        const portNodeExists = nodes.some(n => n.id === failure.connectedPortId);
        
        if (failureNodeExists && portNodeExists) {
          links.push({
            source: failure.failureUuid,
            target: failure.connectedPortId,
            type: 'failure',
            connectionType: 'OCCURRENCE',
            strokeWidth: 2,
            strokeColor: token.colorError, // Red color for failure relationships
            strokeDasharray: null
          });
        }
      });
    }

    // Add causation relationships between failure modes if causations are shown
    if (showCausations && causationData.length > 0) {
      causationData.forEach((causation) => {
        // Check if both source and target failure nodes are visible
        const sourceFailureExists = nodes.some(n => n.id === causation.sourceFailureModeUuid);
        const targetFailureExists = nodes.some(n => n.id === causation.effectFailureModeUuid);
        
        if (sourceFailureExists && targetFailureExists) {
          // Add direct causation link from source failure to effect failure
          if (visibleRelationshipTypes.has('FIRST') || visibleRelationshipTypes.has('THEN')) {
            links.push({
              source: causation.sourceFailureModeUuid,
              target: causation.effectFailureModeUuid,
              type: 'causation',
              connectionType: 'CAUSATION',
              strokeWidth: 3,
              strokeColor: token.colorInfoTextActive, // Purple color for causation relationships
              strokeDasharray: '5,5' // Dashed line to distinguish from other relationships
            });
          }
        }
      });
    }

    // console.log('📊 D3 Graph Data:', { nodes: nodes.length, links: links.length });
    // console.log('📊 Filtering Summary:', {
    //   originalNodes: data.nodes.length,
    //   filteredNodes: nodes.length,
    //   nodesFilteredOut: filteredNodeCount,
    //   originalRelationships: data.relationships.length,
    //   filteredRelationships: links.length,
    //   relationshipsFilteredByType: filteredRelTypeCount,
    //   relationshipsFilteredByNodeVisibility: filteredNodeVisibilityCount
    // });
    // console.log('�� Nodes:', nodes.map(n => ({ id: n.id, name: n.name, RenderingInfoType: n.RenderingInfoType })));
    // console.log('📊 Links:', links.map(l => ({ 
    //   source: typeof l.source === 'string' ? l.source : l.source.id, 
    //   target: typeof l.target === 'string' ? l.target : l.target.id, 
    //   type: l.type 
    // })));

    // Validate data before creating visualization
    if (nodes.length === 0) {
      console.warn('⚠️ No nodes to visualize');
      return;
    }

    // Final validation: ensure all link references point to existing nodes
    const finalNodeIds = new Set(nodes.map(n => n.id));
    const validLinks = links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return finalNodeIds.has(sourceId) && finalNodeIds.has(targetId);
    });

    if (validLinks.length !== links.length) {
      console.warn(`⚠️ Filtered out ${links.length - validLinks.length} invalid links`);
    }

    // Create color scale for different node types
    const getNodeColor = (node: D3Node) => {
      switch (node.nodeLabel || node.prototype) {
        case 'SW_COMPONENT_PROTOTYPE':
          return token.colorPrimary; // Medium Blue
        case 'APPLICATION_SW_COMPONENT_TYPE':
          return token.colorPrimaryBg; // Light Blue
        case 'ASSEMBLY_SW_CONNECTOR':
          return token.colorTextSecondary; // Dark brown
        case 'MODE_SWITCH_INTERFACE':
          return token.colorTextQuaternary; // Light brown
        case 'SENDER_RECEIVER_INTERFACE':
          return token.colorWarningBg; // Light orange
        case 'CLIENT_SERVER_INTERFACE':
          return token.colorInfoBg; // Light turquoise
        case 'P_PORT_PROTOTYPE':
          return token.colorSuccess; // Green
        case 'R_PORT_PROTOTYPE':
          return token.colorPrimary; // Blue
        case 'VirtualArxmlRefTarget':
          return token.colorBorder; // Light Gray
        case 'COMPOSITION_SW_COMPONENT_TYPE':
          return token.colorSuccessBg; // Light Green
        case 'FAILUREMODE':
          return token.colorErrorBg; // Light red for failure modes
        default:
          return token.colorTextSecondary; // Default gray
      }
    };

    const getNodeStroke = (node: D3Node) => {
      switch (node.nodeLabel || node.prototype) {
        case 'SW_COMPONENT_PROTOTYPE':
          return token.colorPrimaryBorder; // Medium Blue border
        case 'APPLICATION_SW_COMPONENT_TYPE':
          return 'none'; // No border
        case 'ASSEMBLY_SW_CONNECTOR':
          return token.colorText; // Dark brown border
        case 'MODE_SWITCH_INTERFACE':
          return token.colorTextSecondary; // Medium brown border
        case 'SENDER_RECEIVER_INTERFACE':
          return token.colorWarning; // Dark orange border
        case 'CLIENT_SERVER_INTERFACE':
          return token.colorInfo; // Dark teal border
        case 'P_PORT_PROTOTYPE':
          return token.colorSuccessBorder; // Dark green border
        case 'R_PORT_PROTOTYPE':
          return token.colorPrimaryBorder; // Dark blue border
        case 'VirtualArxmlRefTarget':
          return token.colorTextSecondary; // Medium gray border
        case 'COMPOSITION_SW_COMPONENT_TYPE':
          return token.colorSuccess; // Green border
        case 'FAILUREMODE':
          return token.colorError; // Dark red border for failure modes
        default:
          return token.colorTextSecondary;
      }
    };

    const getNodeStrokeWidth = (node: D3Node) => {
      switch (node.nodeLabel || node.prototype) {
        case 'SW_COMPONENT_PROTOTYPE':
          return 2;
        case 'APPLICATION_SW_COMPONENT_TYPE':
          return 0; // No border
        case 'MODE_SWITCH_INTERFACE':
          return 2; // Medium border
        case 'SENDER_RECEIVER_INTERFACE':
          return 2; // Medium border
        case 'CLIENT_SERVER_INTERFACE':
          return 2; // Medium border
        case 'VirtualArxmlRefTarget':
          return 2; // Medium border
        case 'COMPOSITION_SW_COMPONENT_TYPE':
          return 2;
        case 'FAILUREMODE':
          return 2; // Medium border for failure modes
        default:
          return 1;
      }
    };

    const getNodeStrokeDasharray = (node: D3Node) => {
      switch (node.nodeLabel || node.prototype) {
        case 'COMPOSITION_SW_COMPONENT_TYPE':
          return '3,3'; // Dotted border
        default:
          return null;
      }
    };

    // Create simulation with validated data
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(validLinks).id((d: any) => (d as D3Node).id).distance(d => d.type === 'contains' ? 50 : 100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => (d as D3Node).size + 5));

    // Create arrow markers for directed links
    svg.append('defs').selectAll('marker')
      .data(['connection'])
      .enter().append('marker')
      .attr('id', (d) => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', token.colorTextSecondary);

    // Create links with validated data (add to zoom container)
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(validLinks)
      .enter().append('line')
      .attr('stroke', d => d.strokeColor || token.colorTextSecondary)
      .attr('stroke-width', d => d.strokeWidth || 1)
      .attr('stroke-dasharray', d => d.strokeDasharray || null)
      .attr('marker-end', d => d.type === 'connection' ? 'url(#arrow-connection)' : null);

    // Create nodes group
    const nodeGroup = container.append('g').attr('class', 'nodes');

    // Create circles for circular nodes
    const circleNodes = nodeGroup.selectAll('circle')
      .data(nodes.filter(d => d.shape === 'circle'))
      .enter().append('circle')
      .attr('r', d => d.size)
      .attr('fill', getNodeColor)
      .attr('stroke', getNodeStroke)
      .attr('stroke-width', getNodeStrokeWidth)
      .attr('stroke-dasharray', getNodeStrokeDasharray)
      .call(d3.drag<SVGCircleElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Create rectangles for rectangular nodes
    const rectNodes = nodeGroup.selectAll('rect')
      .data(nodes.filter(d => d.shape === 'rect'))
      .enter().append('rect')
      .attr('width', d => d.size * 2)
      .attr('height', d => d.size * 2)
      .attr('x', d => -d.size)
      .attr('y', d => -d.size)
      .attr('fill', getNodeColor)
      .attr('stroke', getNodeStroke)
      .attr('stroke-width', getNodeStrokeWidth)
      .call(d3.drag<SVGRectElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Create half-circles for half-circle nodes
    const halfCircleNodes = nodeGroup.selectAll('path.half-circle')
      .data(nodes.filter(d => d.shape === 'half-circle'))
      .enter().append('path')
      .attr('class', 'half-circle')
      .attr('d', d => {
        const r = d.size;
        return `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`;
      })
      .attr('fill', getNodeColor)
      .attr('stroke', getNodeStroke)
      .attr('stroke-width', getNodeStrokeWidth)
      .call(d3.drag<SVGPathElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Create triangles for triangle nodes
    const triangleNodes = nodeGroup.selectAll('path.triangle')
      .data(nodes.filter(d => d.shape === 'triangle'))
      .enter().append('path')
      .attr('class', 'triangle')
      .attr('d', d => {
        const r = d.size;
        const height = r * Math.sqrt(3);
        return `M 0 ${-height * 0.5} L ${r} ${height * 0.5} L ${-r} ${height * 0.5} Z`;
      })
      .attr('fill', getNodeColor)
      .attr('stroke', getNodeStroke)
      .attr('stroke-width', getNodeStrokeWidth)
      .call(d3.drag<SVGPathElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add text labels for port nodes (P and R)
    const portLabels = nodeGroup.selectAll('text.port-label')
      .data(nodes.filter(d => d.shape === 'rect' && (d.nodeLabel === 'P_PORT_PROTOTYPE' || d.nodeLabel === 'R_PORT_PROTOTYPE')))
      .enter().append('text')
      .attr('class', 'port-label')
      .text(d => d.nodeLabel === 'P_PORT_PROTOTYPE' ? 'P' : 'R')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', 'white')
      .style('pointer-events', 'none');

    // Add text labels for MODE_SWITCH_INTERFACE nodes (M)
    const modeLabels = nodeGroup.selectAll('text.mode-label')
      .data(nodes.filter(d => d.shape === 'half-circle' && d.nodeLabel === 'MODE_SWITCH_INTERFACE'))
      .enter().append('text')
      .attr('class', 'mode-label')
      .text('M')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', token.colorTextSecondary)
      .style('pointer-events', 'none');

    // Add text labels for SENDER_RECEIVER_INTERFACE nodes (S)
    const senderLabels = nodeGroup.selectAll('text.sender-label')
      .data(nodes.filter(d => d.shape === 'triangle' && d.nodeLabel === 'SENDER_RECEIVER_INTERFACE'))
      .enter().append('text')
      .attr('class', 'sender-label')
      .text('S')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', token.colorWarningText)
      .style('pointer-events', 'none');

    // Add text labels for CLIENT_SERVER_INTERFACE nodes (CS)
    const clientServerLabels = nodeGroup.selectAll('text.client-server-label')
      .data(nodes.filter(d => d.shape === 'triangle' && d.nodeLabel === 'CLIENT_SERVER_INTERFACE'))
      .enter().append('text')
      .attr('class', 'client-server-label')
      .text('CS')
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', token.colorInfoText)
      .style('pointer-events', 'none');

    // Add text labels for FAILUREMODE nodes (F)
    const failureLabels = nodeGroup.selectAll('text.failure-label')
      .data(nodes.filter(d => d.shape === 'circle' && d.nodeLabel === 'FAILUREMODE'))
      .enter().append('text')
      .attr('class', 'failure-label')
      .text('F')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('fill', token.colorErrorText)
      .style('pointer-events', 'none');

    // Combine all interactive nodes for unified behavior
    const allNodes = nodeGroup.selectAll('circle, rect, path.half-circle, path.triangle');

    // Add labels (add to zoom container) - exclude ASSEMBLY_SW_CONNECTOR, MODE_SWITCH_INTERFACE, SENDER_RECEIVER_INTERFACE, and CLIENT_SERVER_INTERFACE nodes
    const label = container.append('g')
      .attr('class', 'labels')
      .selectAll('text')
      .data(nodes.filter(d => d.nodeLabel !== 'ASSEMBLY_SW_CONNECTOR' && d.nodeLabel !== 'MODE_SWITCH_INTERFACE' && d.nodeLabel !== 'SENDER_RECEIVER_INTERFACE' && d.nodeLabel !== 'CLIENT_SERVER_INTERFACE'))
      .enter().append('text')
      .text(d => d.name)
      .attr('font-size', d => d.RenderingInfoType === 'center' ? '12px' : d.RenderingInfoType === 'partner' ? '10px' : '8px')
      .attr('font-weight', d => d.RenderingInfoType === 'center' ? 'bold' : 'normal')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.size + 15)
      .attr('fill', token.colorText);

    // Add enhanced tooltips with detailed information
    allNodes.append('title')
      .text((d: any) => createTooltipText(d as D3Node));

    // Add right-click context menu to copy node name
    allNodes.on('contextmenu', function(event: any, d: any) {
      event.preventDefault();
      const node = d as D3Node;
      copyToClipboard(node.name);
    });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => (d.source as D3Node).x || 0)
        .attr('y1', (d: any) => (d.source as D3Node).y || 0)
        .attr('x2', (d: any) => (d.target as D3Node).x || 0)
        .attr('y2', (d: any) => (d.target as D3Node).y || 0);

      circleNodes
        .attr('cx', (d: D3Node) => d.x || 0)
        .attr('cy', (d: D3Node) => d.y || 0);

      rectNodes
        .attr('x', (d: D3Node) => (d.x || 0) - d.size)
        .attr('y', (d: D3Node) => (d.y || 0) - d.size);

      halfCircleNodes
        .attr('transform', (d: D3Node) => `translate(${d.x || 0}, ${d.y || 0})`);

      triangleNodes
        .attr('transform', (d: D3Node) => `translate(${d.x || 0}, ${d.y || 0})`);

      portLabels
        .attr('x', (d: D3Node) => d.x || 0)
        .attr('y', (d: D3Node) => d.y || 0);

      modeLabels
        .attr('x', (d: D3Node) => d.x || 0)
        .attr('y', (d: D3Node) => d.y || 0);

      senderLabels
        .attr('x', (d: D3Node) => d.x || 0)
        .attr('y', (d: D3Node) => d.y || 0);

      clientServerLabels
        .attr('x', (d: D3Node) => d.x || 0)
        .attr('y', (d: D3Node) => d.y || 0);

      failureLabels
        .attr('x', (d: D3Node) => d.x || 0)
        .attr('y', (d: D3Node) => d.y || 0);

      label
        .attr('x', (d: D3Node) => d.x || 0)
        .attr('y', (d: D3Node) => d.y || 0);
    });

    // Enhanced drag behavior with pinning
    function dragstarted(event: any, d: any) {
      const node = d as D3Node;
      if (!event.active) simulation.alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
    }

    function dragged(event: any, d: any) {
      const node = d as D3Node;
      node.fx = event.x;
      node.fy = event.y;
    }

    function dragended(event: any, d: any) {
      const node = d as D3Node;
      if (!event.active) simulation.alphaTarget(0);
      node.fx = event.x;
      node.fy = event.y;
      
      // Visual feedback: change the stroke to indicate pinned state
      d3.select(event.sourceEvent.target)
        .attr('stroke', token.colorError)
        .attr('stroke-width', 3);
        
      // console.log('📌 Pinned node:', node.name, 'at position:', { x: node.fx, y: node.fy });
    }

    // Add double-click to unpin functionality
    allNodes.on('dblclick', function(event: any, d: any) {
      event.stopPropagation();
      
      const node = d as D3Node;
      // Unpin the node
      node.fx = null;
      node.fy = null;
      
      // Reset visual feedback based on node type
      const element = d3.select(this);
      element
        .attr('stroke', getNodeStroke(node))
        .attr('stroke-width', getNodeStrokeWidth(node));
        
      // Restart simulation to allow natural positioning
      simulation.alphaTarget(0.3).restart();
      setTimeout(() => simulation.alphaTarget(0), 1000);
      
      // console.log('📍 Unpinned node:', node.name);
    });
  }, [visibleNodeTypes, visibleRelationshipTypes, showFailureModes, showCausations, token]);

  const selectedPrototypeName = prototypes.find(p => p.uuid === selectedPrototype)?.name || '';

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NodeCollapseOutlined />
          <span>SW Component Prototype Dependencies Graph</span>
        </div>
      }
      style={{ marginTop: '20px' }}
    >
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Select SW Component Prototype:
        </label>
        <Select
          style={{ width: '100%', maxWidth: '500px' }}
          placeholder="Choose a SW Component Prototype"
          value={selectedPrototype}
          onChange={setSelectedPrototype}
          loading={loadingPrototypes}
          showSearch
          filterOption={(input, option) =>
            option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
          }
        >
          {prototypes.map(prototype => (
            <Option key={prototype.uuid} value={prototype.uuid}>
              {prototype.name} ({prototype.shortName})
            </Option>
          ))}
        </Select>
      </div>

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: '20px' }}
        />
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>Loading dependency graph...</div>
        </div>
      )}

      {graphData && !loading && (
        <>
          <Divider orientation="left">
            <InfoCircleOutlined /> Graph for: {selectedPrototypeName}
          </Divider>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '20px', fontSize: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span><strong>Nodes:</strong> {graphData.metadata.totalNodes}</span>
              <span><strong>Relationships:</strong> {graphData.metadata.totalRelationships}</span>
              <span><strong>Component:</strong> {graphData.metadata.componentName}</span>
              {failureModeData.length > 0 && (
                <span><strong>Failure Modes:</strong> {failureModeData.length}</span>
              )}
              {causationData.length > 0 && (
                <span><strong>Causations:</strong> {causationData.length}</span>
              )}
              <Checkbox
                checked={showFailureModes}
                onChange={(e) => setShowFailureModes(e.target.checked)}
                style={{ marginLeft: '10px' }}
              >
                Show Failure Modes
              </Checkbox>
              <Checkbox
                checked={showCausations}
                onChange={(e) => setShowCausations(e.target.checked)}
                style={{ marginLeft: '10px' }}
              >
                Show Causations
              </Checkbox>
            </div>
          </div>

          <div 
            ref={containerRef}
            style={{ 
              width: '100%', 
              height: '600px', 
              border: `1px solid ${token.colorBorder}`,
              borderRadius: '6px',
              backgroundColor: token.colorBgLayout
            }}
          >
            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
          </div>

          <div style={{ marginTop: '16px', fontSize: '12px', color: token.colorTextSecondary }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>Node Types Filter:</strong>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Checkbox
                  checked={visibleNodeTypes.has('SW_COMPONENT_PROTOTYPE')}
                  onChange={() => toggleNodeTypeVisibility('SW_COMPONENT_PROTOTYPE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorPrimary }}>●</span> SW_COMPONENT_PROTOTYPE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('APPLICATION_SW_COMPONENT_TYPE')}
                  onChange={() => toggleNodeTypeVisibility('APPLICATION_SW_COMPONENT_TYPE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorPrimaryBg }}>●</span> APPLICATION_SW_COMPONENT_TYPE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('ASSEMBLY_SW_CONNECTOR')}
                  onChange={() => toggleNodeTypeVisibility('ASSEMBLY_SW_CONNECTOR')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorTextSecondary }}>■</span> ASSEMBLY_SW_CONNECTOR
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('MODE_SWITCH_INTERFACE')}
                  onChange={() => toggleNodeTypeVisibility('MODE_SWITCH_INTERFACE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorTextQuaternary }}>◗</span> MODE_SWITCH_INTERFACE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('SENDER_RECEIVER_INTERFACE')}
                  onChange={() => toggleNodeTypeVisibility('SENDER_RECEIVER_INTERFACE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorWarningBg }}>▲</span> SENDER_RECEIVER_INTERFACE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('CLIENT_SERVER_INTERFACE')}
                  onChange={() => toggleNodeTypeVisibility('CLIENT_SERVER_INTERFACE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorInfoBg }}>▲</span> CLIENT_SERVER_INTERFACE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('P_PORT_PROTOTYPE')}
                  onChange={() => toggleNodeTypeVisibility('P_PORT_PROTOTYPE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorSuccess }}>■</span> P_PORT_PROTOTYPE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('R_PORT_PROTOTYPE')}
                  onChange={() => toggleNodeTypeVisibility('R_PORT_PROTOTYPE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorPrimary }}>■</span> R_PORT_PROTOTYPE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('VirtualArxmlRefTarget')}
                  onChange={() => toggleNodeTypeVisibility('VirtualArxmlRefTarget')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorBorder }}>●</span> VirtualArxmlRefTarget
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('COMPOSITION_SW_COMPONENT_TYPE')}
                  onChange={() => toggleNodeTypeVisibility('COMPOSITION_SW_COMPONENT_TYPE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorSuccessBg }}>⚬</span> COMPOSITION_SW_COMPONENT_TYPE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('FAILUREMODE')}
                  onChange={() => toggleNodeTypeVisibility('FAILUREMODE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorErrorBg }}>●</span> FAILUREMODE
                  </span>
                </Checkbox>
              </div>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <strong>Relationship Types Filter:</strong>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Checkbox
                  checked={visibleRelationshipTypes.has('TYPE-TREF')}
                  onChange={() => toggleRelationshipTypeVisibility('TYPE-TREF')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorInfo }}>⋯</span> TYPE-TREF
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('CONTEXT-COMPONENT-REF')}
                  onChange={() => toggleRelationshipTypeVisibility('CONTEXT-COMPONENT-REF')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorTextSecondary }}>—</span> CONTEXT-COMPONENT-REF
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('TARGET-P-PORT-REF')}
                  onChange={() => toggleRelationshipTypeVisibility('TARGET-P-PORT-REF')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorSuccess }}>—</span> TARGET-P-PORT-REF
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('TARGET-R-PORT-REF')}
                  onChange={() => toggleRelationshipTypeVisibility('TARGET-R-PORT-REF')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorPrimary }}>—</span> TARGET-R-PORT-REF
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('PROVIDED-INTERFACE-TREF')}
                  onChange={() => toggleRelationshipTypeVisibility('PROVIDED-INTERFACE-TREF')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorWarning }}>—</span> PROVIDED-INTERFACE-TREF
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('CONTAINS')}
                  onChange={() => toggleRelationshipTypeVisibility('CONTAINS')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorBorder }}>⋯</span> CONTAINS
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('REQUIRED-INTERFACE-TREF')}
                  onChange={() => toggleRelationshipTypeVisibility('REQUIRED-INTERFACE-TREF')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorInfoTextActive }}>—</span> REQUIRED-INTERFACE-TREF
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('OCCURRENCE')}
                  onChange={() => toggleRelationshipTypeVisibility('OCCURRENCE')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorError }}>—</span> OCCURRENCE
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('FIRST')}
                  onChange={() => toggleRelationshipTypeVisibility('FIRST')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorInfoTextActive }}>⋯</span> FIRST (Causation)
                  </span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('THEN')}
                  onChange={() => toggleRelationshipTypeVisibility('THEN')}
                >
                  <span style={{ backgroundColor: token.colorFillSecondary, padding: '2px 8px', borderRadius: '4px' }}>
                    <span style={{ color: token.colorInfoTextActive }}>⋯</span> THEN (Causation)
                  </span>
                </Checkbox>
              </div>
            </div>
            <div>
              <strong>Controls:</strong>
              <span style={{ marginLeft: '10px' }}>🖱️ Drag nodes to reposition and pin</span>
              <span style={{ marginLeft: '10px' }}>⏸️ Double-click node to unpin</span>
              <span style={{ marginLeft: '10px' }}>🖱️ Right-click node to copy name</span>
              <span style={{ marginLeft: '10px' }}>🔍 Scroll to zoom in/out</span>
              <span style={{ marginLeft: '10px' }}>🖱️ Drag background to pan</span>
              <span style={{ marginLeft: '10px' }}>⏸️ Double-click background to reset zoom</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: token.colorTextSecondary }}>
              <strong>Legend:</strong>
              <span style={{ marginLeft: '10px' }}>F = Failure Mode (light red circles with ASIL ratings)</span>
              <span style={{ marginLeft: '10px' }}>Red lines = OCCURRENCE relationships to ports</span>
              <span style={{ marginLeft: '10px' }}>Purple dashed lines = CAUSATION relationships between failure modes</span>
            </div>
          </div>
        </>
      )}

      {!selectedPrototype && !loadingPrototypes && (
        <div style={{ textAlign: 'center', padding: '40px', color: token.colorTextSecondary }}>
          <InfoCircleOutlined style={{ fontSize: '24px', marginBottom: '16px' }} />
          <div>Please select a SW Component Prototype to view its dependency graph</div>
        </div>
      )}
    </Card>
  );
};

export default SWCProtoGraph;
