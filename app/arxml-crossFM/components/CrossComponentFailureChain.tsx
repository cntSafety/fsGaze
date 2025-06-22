'use client';

import React, { useState, useEffect } from 'react';
import { Typography, Table, Card, Row, Col, Spin, Alert, Tabs } from 'antd';
import { getSafetyGraph } from '@/app/services/neo4j/queries/safety/exportGraph';
import type { SafetyGraphData } from '@/app/services/neo4j/queries/safety/types';

const { Title } = Typography;

export default function CrossComponentFailureChain() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<SafetyGraphData | null>(null);

  useEffect(() => {
    loadSafetyGraphData();
  }, []);

  const loadSafetyGraphData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await getSafetyGraph();
      
      if (result.success && result.data) {
        setGraphData(result.data);
        console.log(result.data);
      } else {
        setError(result.message || 'Failed to load safety graph data');
      }
    } catch (err) {
      console.error('Error loading safety graph:', err);
      setError('An error occurred while loading the safety graph data');
    } finally {
      setLoading(false);
    }
  };

  // Table columns for failures
  const failureColumns = [
    {
      title: 'UUID',
      dataIndex: 'uuid',
      key: 'uuid',
      width: 200,
      render: (text: string) => <code>{text}</code>,
    },
    {
      title: 'Name',
      dataIndex: 'properties',
      key: 'name',
      render: (properties: Record<string, unknown>) => properties.name || 'N/A',
    },
    {
      title: 'Description',
      dataIndex: 'properties',
      key: 'description',
      render: (properties: Record<string, unknown>) => properties.description || 'N/A',
    },
    {
      title: 'ASIL',
      dataIndex: 'properties',
      key: 'asil',
      render: (properties: Record<string, unknown>) => properties.asil || 'N/A',
    },
  ];

  // Table columns for causations
  const causationColumns = [
    {
      title: 'Causation UUID',
      dataIndex: 'uuid',
      key: 'uuid',
      width: 200,
      render: (text: string) => <code>{text}</code>,
    },
    {
      title: 'Causation Name',
      dataIndex: 'properties',
      key: 'name',
      render: (properties: Record<string, unknown>) => properties.name || 'N/A',
    },
    {
      title: 'Description',
      dataIndex: 'properties',
      key: 'description',
      render: (properties: Record<string, unknown>) => properties.description || 'N/A',
    },
  ];

  // Table columns for causation links
  const causationLinkColumns = [
    {
      title: 'Causation',
      dataIndex: 'causationName',
      key: 'causationName',
    },
    {
      title: 'Cause Failure',
      dataIndex: 'causeFailureName',
      key: 'causeFailureName',
    },
    {
      title: 'Effect Failure',
      dataIndex: 'effectFailureName',
      key: 'effectFailureName',
    },
  ];

  // Table columns for occurrences
  const occurrenceColumns = [
    {
      title: 'Failure Name',
      dataIndex: 'failureName',
      key: 'failureName',
    },
    {
      title: 'Source Component',
      dataIndex: 'occuranceSourceName',
      key: 'occuranceSourceName',
    },
    {
      title: 'Type',
      dataIndex: 'occuranceSourceLabels',
      key: 'occuranceSourceLabels',
      render: (labels: string[]) => labels ? labels.join(', ') : 'N/A',
    },
    {
      title: 'Source UUID',
      dataIndex: 'occuranceSourceUuid',
      key: 'occuranceSourceUuid',
      width: 200,
      render: (text: string) => <code>{text}</code>,
    },
    {
      title: 'ARXML Path',
      dataIndex: 'occuranceSourceArxmlPath',
      key: 'occuranceSourceArxmlPath',
      render: (text: string) => text || 'N/A',
    },
  ];

  // Create tabs items
  const getTabsItems = () => {
    if (!graphData) return [];

    return [
      {
        key: 'failures',
        label: `Failures (${graphData.failures.length})`,
        children: (
          <Card title="Failure Modes" className="mb-4">
            <Table
              dataSource={graphData.failures}
              columns={failureColumns}
              rowKey="uuid"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </Card>
        ),
      },
      {
        key: 'causations',
        label: `Causations (${graphData.causations.length})`,
        children: (
          <Card title="Causation Definitions" className="mb-4">
            <Table
              dataSource={graphData.causations}
              columns={causationColumns}
              rowKey="uuid"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </Card>
        ),
      },
      {
        key: 'causationLinks',
        label: `Causation Links (${graphData.causationLinks.length})`,
        children: (
          <Card title="Failure Mode Propagation" className="mb-4">
            <Table
              dataSource={graphData.causationLinks}
              columns={causationLinkColumns}
              rowKey="causationUuid"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </Card>
        ),
      },
      {
        key: 'occurrences',
        label: `Occurrences (${graphData.occurrences.length})`,
        children: (
          <Card title="Failure Mode Occurrences" className="mb-4">
            <Table
              dataSource={graphData.occurrences}
              columns={occurrenceColumns}
              rowKey={(record) => `${record.failureUuid}-${record.occuranceSourceUuid}`}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1000 }}
            />
          </Card>
        ),
      },
    ];
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Title level={2} className="mb-6">
          Failure Chain
        </Title>
        <div className="flex justify-center items-center h-64">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Title level={2} className="mb-6">
          Failure Chain
        </Title>
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          action={
            <button onClick={loadSafetyGraphData} className="text-blue-600 hover:text-blue-800">
              Retry
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Title level={2} className="mb-6">
        Failure Chain
      </Title>
      
      {graphData && (
        <Tabs defaultActiveKey="failures" size="large" items={getTabsItems()} />
      )}
    </div>
  );
} 