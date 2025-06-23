'use client';
import React from 'react';
import { EdgeProps, BaseEdge, Position, getSmoothStepPath } from 'reactflow';

/**
 * This function generates a more robust custom orthogonal edge path.
 * It creates a 20px horizontal "stub" at both the source and target,
 * ensuring a clean, blocky connection regardless of node position.
 */
function getCustomOrthogonalPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  offsetX,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: string;
  targetPosition: string;
  offsetX: number;
}) {
  const horizontalStub = 20;
  const path = [];
  
  const sourceStubX = sourcePosition === Position.Right ? sourceX + horizontalStub : sourceX - horizontalStub;
  const targetStubX = targetPosition === Position.Left ? targetX - horizontalStub : targetX + horizontalStub;

  const midY = (sourceY + targetY) / 2;

  // Start point
  path.push(`M ${sourceX},${sourceY}`);
  // Horizontal stub from source
  path.push(`L ${sourceStubX},${sourceY}`);
  // Apply horizontal offset here for the main vertical line
  path.push(`L ${sourceStubX + offsetX},${sourceY}`);
  // Vertical line to the midpoint
  path.push(`L ${sourceStubX + offsetX},${midY}`);
  // Horizontal line to align with the target stub
  path.push(`L ${targetStubX + offsetX},${midY}`);
  // Vertical line to align with the target
  path.push(`L ${targetStubX + offsetX},${targetY}`);
  // Horizontal stub to target
  path.push(`L ${targetStubX},${targetY}`);
  // Final connection to target
  path.push(`L ${targetX},${targetY}`);
  
  return path.join(' ');
}

export default function InteractiveSmoothStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const offsetX = data?.offsetX || 0;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 15,
    offset: offsetX,
  });

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />;
} 