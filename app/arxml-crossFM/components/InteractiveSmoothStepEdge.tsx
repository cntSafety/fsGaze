'use client';
import React from 'react';
import { EdgeProps, BaseEdge, Position } from 'reactflow';

/**
 * This function generates a gentle, custom S-shaped path that always
 * connects to handles horizontally, using a curve factor to avoid extreme angles.
 */
function getGentleSPath({
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

  // Determine stub end points based on port position
  const sourceStubX = sourcePosition === Position.Right ? sourceX + horizontalStub : sourceX - horizontalStub;
  const targetStubX = targetPosition === Position.Left ? targetX - horizontalStub : targetX + horizontalStub;
  
  const horizontalDistance = Math.abs(targetStubX - sourceStubX);

  // The "roundness" factor for the curve. We use a fraction of the horizontal
  // distance to ensure the curve is gentle and never creates loops.
  const curveFactor = horizontalDistance * 0.25;

  // Determine control points based on port position
  const controlPoint1X = sourcePosition === Position.Right ? sourceStubX + curveFactor : sourceStubX - curveFactor;
  const controlPoint1Y = sourceY;

  const controlPoint2X = targetPosition === Position.Left ? targetStubX - curveFactor : targetStubX + curveFactor;
  const controlPoint2Y = targetY;

  // Apply the parallel line offset to the control points
  const finalCP1X = controlPoint1X + offsetX;
  const finalCP2X = controlPoint2X + offsetX;

  // Build the path
  const path = `M ${sourceX},${sourceY} L ${sourceStubX},${sourceY} C ${finalCP1X},${controlPoint1Y} ${finalCP2X},${controlPoint2Y} ${targetStubX},${targetY} L ${targetX},${targetY}`;

  return path;
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

  const edgePath = getGentleSPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    offsetX,
  });

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />;
} 