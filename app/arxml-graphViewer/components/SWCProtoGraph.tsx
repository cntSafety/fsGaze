'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Select, Alert, Spin, Card, Divider, Checkbox } from 'antd';
import { NodeCollapseOutlined, InfoCircleOutlined } from '@ant-design/icons';
import * as d3 from 'd3';
import { getAllSwComponentPrototypes, getComponentDependencyGraph, ComponentVisualizationResult } from '@/app/services/ArxmlToNeoService';

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
  RenderingInfoType: 'center' | 'partner' | 'port';
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
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  type: 'connection' | 'contains';
  connectionType?: string;
  strokeWidth?: number;
  strokeColor?: string;
  strokeDasharray?: string | null;
}

const SWCProtoGraph: React.FC = () => {
  const [prototypes, setPrototypes] = useState<SwcPrototype[]>([]);
  const [selectedPrototype, setSelectedPrototype] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPrototypes, setLoadingPrototypes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<ComponentVisualizationResult | null>(null);
  
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
    'COMPOSITION_SW_COMPONENT_TYPE'
  ]));
  
  // Visibility state for relationship types
  const [visibleRelationshipTypes, setVisibleRelationshipTypes] = useState<Set<string>>(new Set([
    'TYPE-TREF',
    'CONTEXT-COMPONENT-REF',
    'TARGET-P-PORT-REF',
    'TARGET-R-PORT-REF',
    'PROVIDED-INTERFACE-TREF',
    'CONTAINS',
    'REQUIRED-INTERFACE-TREF'
  ]));
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Utility function to copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // console.log(`📋 Copied ${label} to clipboard:`, text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      // console.log(`📋 Copied ${label} to clipboard (fallback):`, text);
    }
  };

  // Function to create enhanced tooltip text
  const createTooltipText = (d: D3Node) => {
    let tooltip = `Name: ${d.name}\nUUID: ${d.id}\nRenderingInfoType: ${d.RenderingInfoType}`;
    
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
    
    tooltip += '\n\n🖱️ Drag to move and pin\n⏸️ Double-click to unpin\n🖱️ Right-click to copy complete data';
    
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

  // Load dependency graph when prototype is selected
  useEffect(() => {
    if (!selectedPrototype) {
      setGraphData(null);
      return;
    }

    const fetchDependencyGraph = async () => {
      try {
        setLoading(true);
        setError(null);
        // console.log('🎯 Fetching dependency graph for:', selectedPrototype);
        
        const result = await getComponentDependencyGraph(selectedPrototype);
        
        if (result.success && result.data) {
          setGraphData(result.data);
          // console.log('✅ Dependency graph loaded:', result.data);
        } else {
          setError(result.message || 'Failed to load dependency graph');
        }
      } catch (err) {
        console.error('❌ Error loading dependency graph:', err);
        setError('Error loading dependency graph');
      } finally {
        setLoading(false);
      }
    };

    fetchDependencyGraph();
  }, [selectedPrototype]);

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
          newSet.add(type);
          hasChanges = true;
        }
      });
      return hasChanges ? newSet : prev; // Only return new set if there are actual changes
    });
  }, [graphData]); // Only depend on graphData, not the visibility sets

  // Create D3 visualization when graph data or visibility changes
  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    // console.log('🎨 Creating D3 visualization with data:', graphData);
    createD3Visualization(graphData);
  }, [graphData, visibleNodeTypes, visibleRelationshipTypes]);

  const createD3Visualization = useCallback((data: ComponentVisualizationResult) => {
    if (!svgRef.current || !containerRef.current) return;

    // console.log('🎨 Creating D3 visualization with simplified data:', data);
    // console.log('📊 Nodes count:', data.nodes?.length || 0);
    // console.log('📊 Relationships count:', data.relationships?.length || 0);
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
      let strokeColor = '#666';
      let strokeDasharray = null;
      
      switch (relationship.type) {
        case 'TYPE-TREF':
          strokeWidth = 1;
          strokeColor = '#45b7d1'; // Blue
          strokeDasharray = '3,3'; // Dotted
          break;
        case 'CONTEXT-COMPONENT-REF':
          strokeWidth = 2;
          strokeColor = '#8B4513'; // Brown
          break;
        case 'TARGET-P-PORT-REF':
          strokeWidth = 2;
          strokeColor = '#4CAF50'; // Green
          break;
        case 'TARGET-R-PORT-REF':
          strokeWidth = 2;
          strokeColor = '#2196F3'; // Blue
          break;
        case 'PROVIDED-INTERFACE-TREF':
          strokeWidth = 1;
          strokeColor = '#FF9800'; // Orange
          break;
        case 'CONTAINS':
          linkType = 'contains';
          strokeWidth = 1;
          strokeColor = '#ccc'; // Gray
          strokeDasharray = '3,3'; // Dotted
          break;
        case 'REQUIRED-INTERFACE-TREF':
          strokeWidth = 1;
          strokeColor = '#9C27B0'; // Purple
          break;
        default:
          strokeWidth = 1;
          strokeColor = '#666';
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
    // console.log('📊 Nodes:', nodes.map(n => ({ id: n.id, name: n.name, RenderingInfoType: n.RenderingInfoType })));
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
          return '#1976D2'; // Medium Blue
        case 'APPLICATION_SW_COMPONENT_TYPE':
          return '#BBDEFB'; // Light Blue
        case 'ASSEMBLY_SW_CONNECTOR':
          return '#5D4037'; // Dark brown
        case 'MODE_SWITCH_INTERFACE':
          return '#D7CCC8'; // Light brown
        case 'SENDER_RECEIVER_INTERFACE':
          return '#FFE0B2'; // Light orange
        case 'CLIENT_SERVER_INTERFACE':
          return '#B2DFDB'; // Light turquoise
        case 'P_PORT_PROTOTYPE':
          return '#4CAF50'; // Green
        case 'R_PORT_PROTOTYPE':
          return '#2196F3'; // Blue
        case 'VirtualArxmlRefTarget':
          return '#E0E0E0'; // Light Gray
        case 'COMPOSITION_SW_COMPONENT_TYPE':
          return '#C8E6C9'; // Light Green
        default:
          return '#9E9E9E'; // Default gray
      }
    };

    const getNodeStroke = (node: D3Node) => {
      switch (node.nodeLabel || node.prototype) {
        case 'SW_COMPONENT_PROTOTYPE':
          return '#1976D2'; // Medium Blue border
        case 'APPLICATION_SW_COMPONENT_TYPE':
          return 'none'; // No border
        case 'ASSEMBLY_SW_CONNECTOR':
          return '#3E2723'; // Dark brown border
        case 'MODE_SWITCH_INTERFACE':
          return '#8D6E63'; // Medium brown border
        case 'SENDER_RECEIVER_INTERFACE':
          return '#F57C00'; // Dark orange border
        case 'CLIENT_SERVER_INTERFACE':
          return '#00695C'; // Dark teal border
        case 'P_PORT_PROTOTYPE':
          return '#2E7D32'; // Dark green border
        case 'R_PORT_PROTOTYPE':
          return '#1565C0'; // Dark blue border
        case 'VirtualArxmlRefTarget':
          return '#757575'; // Medium gray border
        case 'COMPOSITION_SW_COMPONENT_TYPE':
          return '#4CAF50'; // Green border
        default:
          return '#666';
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
      .attr('fill', '#666');

    // Create links with validated data (add to zoom container)
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(validLinks)
      .enter().append('line')
      .attr('stroke', d => d.strokeColor || '#666')
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
      .attr('fill', '#8D6E63')
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
      .attr('fill', '#F57C00')
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
      .attr('fill', '#00695C')
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
      .attr('fill', '#333');

    // Add enhanced tooltips with detailed information
    allNodes.append('title')
      .text((d: any) => createTooltipText(d as D3Node));

    // Add right-click context menu to copy complete component data
    allNodes.on('contextmenu', function(event: any, d: any) {
      event.preventDefault();
      const node = d as D3Node;
      
      // Create comprehensive data object with all available information
      const componentData = {
        // Core identification
        id: node.id,
        name: node.name,
        RenderingInfoType: node.RenderingInfoType,
        nodeLabel: node.nodeLabel,
        prototype: node.prototype,
        
        // Categorization
        subtype: node.subtype,
        group: node.group,
        
        // Visual properties
        shape: node.shape,
        size: node.size,
        
        // Relationships
        parentId: node.parentId,
        
        // Additional metadata
        interfaceGroup: node.interfaceGroup,
        interfaceName: node.interfaceName,
        arxmlPath: node.arxmlPath,
        
        // Position data (if available)
        position: {
          x: node.x,
          y: node.y,
          fx: node.fx, // Fixed position if pinned
          fy: node.fy
        },
        
        // Styling information
        styling: {
          color: getNodeColor(node),
          stroke: getNodeStroke(node),
          strokeWidth: getNodeStrokeWidth(node),
          strokeDasharray: getNodeStrokeDasharray(node)
        }
      };
      
      // Convert to formatted JSON string
      const dataString = JSON.stringify(componentData, null, 2);
      copyToClipboard(dataString);
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
        .attr('stroke', '#ff6b6b')
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
  }, [visibleNodeTypes, visibleRelationshipTypes]);

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
            <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
              <span><strong>Nodes:</strong> {graphData.metadata.totalNodes}</span>
              <span><strong>Relationships:</strong> {graphData.metadata.totalRelationships}</span>
              <span><strong>Component:</strong> {graphData.metadata.componentName}</span>
            </div>
          </div>

          <div 
            ref={containerRef}
            style={{ 
              width: '100%', 
              height: '600px', 
              border: '1px solid #d9d9d9',
              borderRadius: '6px',
              backgroundColor: '#fafafa'
            }}
          >
            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
          </div>

          <div style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>Node Types Filter:</strong>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Checkbox
                  checked={visibleNodeTypes.has('SW_COMPONENT_PROTOTYPE')}
                  onChange={() => toggleNodeTypeVisibility('SW_COMPONENT_PROTOTYPE')}
                >
                  <span style={{ color: '#1976D2' }}>● SW_COMPONENT_PROTOTYPE</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('APPLICATION_SW_COMPONENT_TYPE')}
                  onChange={() => toggleNodeTypeVisibility('APPLICATION_SW_COMPONENT_TYPE')}
                >
                  <span style={{ color: '#BBDEFB' }}>● APPLICATION_SW_COMPONENT_TYPE</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('ASSEMBLY_SW_CONNECTOR')}
                  onChange={() => toggleNodeTypeVisibility('ASSEMBLY_SW_CONNECTOR')}
                >
                  <span style={{ color: '#5D4037' }}>■ ASSEMBLY_SW_CONNECTOR</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('MODE_SWITCH_INTERFACE')}
                  onChange={() => toggleNodeTypeVisibility('MODE_SWITCH_INTERFACE')}
                >
                  <span style={{ color: '#D7CCC8' }}>◗ MODE_SWITCH_INTERFACE</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('SENDER_RECEIVER_INTERFACE')}
                  onChange={() => toggleNodeTypeVisibility('SENDER_RECEIVER_INTERFACE')}
                >
                  <span style={{ color: '#FFE0B2' }}>▲ SENDER_RECEIVER_INTERFACE</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('CLIENT_SERVER_INTERFACE')}
                  onChange={() => toggleNodeTypeVisibility('CLIENT_SERVER_INTERFACE')}
                >
                  <span style={{ color: '#B2DFDB' }}>▲ CLIENT_SERVER_INTERFACE</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('P_PORT_PROTOTYPE')}
                  onChange={() => toggleNodeTypeVisibility('P_PORT_PROTOTYPE')}
                >
                  <span style={{ color: '#4CAF50' }}>■ P_PORT_PROTOTYPE</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('R_PORT_PROTOTYPE')}
                  onChange={() => toggleNodeTypeVisibility('R_PORT_PROTOTYPE')}
                >
                  <span style={{ color: '#2196F3' }}>■ R_PORT_PROTOTYPE</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('VirtualArxmlRefTarget')}
                  onChange={() => toggleNodeTypeVisibility('VirtualArxmlRefTarget')}
                >
                  <span style={{ color: '#E0E0E0' }}>● VirtualArxmlRefTarget</span>
                </Checkbox>
                <Checkbox
                  checked={visibleNodeTypes.has('COMPOSITION_SW_COMPONENT_TYPE')}
                  onChange={() => toggleNodeTypeVisibility('COMPOSITION_SW_COMPONENT_TYPE')}
                >
                  <span style={{ color: '#C8E6C9' }}>⚬ COMPOSITION_SW_COMPONENT_TYPE</span>
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
                  <span style={{ color: '#45b7d1' }}>⋯ TYPE-TREF</span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('CONTEXT-COMPONENT-REF')}
                  onChange={() => toggleRelationshipTypeVisibility('CONTEXT-COMPONENT-REF')}
                >
                  <span style={{ color: '#8B4513' }}>— CONTEXT-COMPONENT-REF</span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('TARGET-P-PORT-REF')}
                  onChange={() => toggleRelationshipTypeVisibility('TARGET-P-PORT-REF')}
                >
                  <span style={{ color: '#4CAF50' }}>— TARGET-P-PORT-REF</span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('TARGET-R-PORT-REF')}
                  onChange={() => toggleRelationshipTypeVisibility('TARGET-R-PORT-REF')}
                >
                  <span style={{ color: '#2196F3' }}>— TARGET-R-PORT-REF</span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('CONTAINS')}
                  onChange={() => toggleRelationshipTypeVisibility('CONTAINS')}
                >
                  <span style={{ color: '#ccc' }}>⋯ CONTAINS</span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('REQUIRED-INTERFACE-TREF')}
                  onChange={() => toggleRelationshipTypeVisibility('REQUIRED-INTERFACE-TREF')}
                >
                  <span style={{ color: '#9C27B0' }}>— REQUIRED-INTERFACE-TREF</span>
                </Checkbox>
                <Checkbox
                  checked={visibleRelationshipTypes.has('PROVIDED-INTERFACE-TREF')}
                  onChange={() => toggleRelationshipTypeVisibility('PROVIDED-INTERFACE-TREF')}
                >
                  <span style={{ color: '#FF9800' }}>— PROVIDED-INTERFACE-TREF</span>
                </Checkbox>
              </div>
            </div>
            <div>
              <strong>Controls:</strong>
              <span style={{ marginLeft: '10px' }}>🖱️ Drag nodes to reposition and pin</span>
              <span style={{ marginLeft: '10px' }}>⏸️ Double-click node to unpin</span>
              <span style={{ marginLeft: '10px' }}>🖱️ Right-click node to copy complete component data</span>
              <span style={{ marginLeft: '10px' }}>🔍 Scroll to zoom in/out</span>
              <span style={{ marginLeft: '10px' }}>🖱️ Drag background to pan</span>
              <span style={{ marginLeft: '10px' }}>⏸️ Double-click background to reset zoom</span>
            </div>
          </div>
        </>
      )}

      {!selectedPrototype && !loadingPrototypes && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <InfoCircleOutlined style={{ fontSize: '24px', marginBottom: '16px' }} />
          <div>Please select a SW Component Prototype to view its dependency graph</div>
        </div>
      )}
    </Card>
  );
};

export default SWCProtoGraph;
