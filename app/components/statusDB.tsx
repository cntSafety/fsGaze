'use client';

import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { Card, Statistic, Row, Col, Button, Alert, Tag, Space, Spin } from 'antd';
import { DatabaseOutlined, NodeIndexOutlined, ShareAltOutlined, TagsOutlined, ReloadOutlined } from '@ant-design/icons';
import { getDatabaseStats, testDatabaseConnection } from '../services/neo4j/queries/general';

interface DatabaseStats {
  nodeCount: number;
  relationshipCount: number;
  labels: string[];
  relationshipTypes: string[];
}

interface StatusDBProps {
  // No auto-refresh, only manual refresh
  // This interface is intentionally minimal as the component takes no props
  // Using object type to explicitly allow any object props if needed in the future
  [key: string]: unknown;
}

export interface StatusDBRef {
  refresh: () => void;
}

const StatusDB = forwardRef<StatusDBRef, StatusDBProps>((props, ref) => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First test the connection
      const connectionTest = await testDatabaseConnection();
      
      if (!connectionTest.success) {
        setError(`Database connection failed: ${connectionTest.message}`);
        return;
      }
      
      // Add timeout to prevent indefinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout (30 seconds)')), 30000)
      );
      
      const result = await Promise.race([
        getDatabaseStats(),
        timeoutPromise
      ]) as { success: boolean; data?: DatabaseStats; error?: string; message?: string };
      
      if (result.success && result.data) {
        setStats(result.data);
        setLastUpdated(new Date());
      } else {
        const errorMsg = result.message || result.error || 'Failed to fetch database statistics';
        setError(errorMsg);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Connection error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Expose refresh method via ref
  useImperativeHandle(ref, () => ({
    refresh: fetchStats
  }));

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleString();
  };

  return (
    <div>
      {/* Header with Refresh Button */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          <DatabaseOutlined style={{ marginRight: 8, color: '#52c41a' }} />
          Neo4j Database Status
        </h3>
        <Space>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              Last updated: {formatTime(lastUpdated)}
            </span>
          )}
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={fetchStats}
            loading={loading}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* Loading State */}
      {loading && !stats && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading database statistics...</div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert
          message="Database Connection Error"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" danger onClick={fetchStats}>
              Retry
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Statistics Cards */}
      {stats && !loading && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Total Nodes"
                  value={stats.nodeCount}
                  prefix={<NodeIndexOutlined style={{ color: '#1890ff' }} />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Total Relationships"
                  value={stats.relationshipCount}
                  prefix={<ShareAltOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Node Labels"
                  value={stats.labels.length}
                  prefix={<TagsOutlined style={{ color: '#722ed1' }} />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Relationship Types"
                  value={stats.relationshipTypes.length}
                  prefix={<TagsOutlined style={{ color: '#fa8c16' }} />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
          </Row>

          {/* Detailed Lists */}
          <Row gutter={[16, 16]}>
            {stats.labels.length > 0 && (
              <Col xs={24} lg={12}>
                <Card title="Node Labels" size="small">
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    <Space size={[8, 8]} wrap>
                      {stats.labels.map((label, index) => (
                        <Tag key={index} color="blue">
                          {label}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                </Card>
              </Col>
            )}

            {stats.relationshipTypes.length > 0 && (
              <Col xs={24} lg={12}>
                <Card title="Relationship Types" size="small">
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    <Space size={[8, 8]} wrap>
                      {stats.relationshipTypes.map((type, index) => (
                        <Tag key={index} color="green">
                          {type}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                </Card>
              </Col>
            )}
          </Row>

          {/* Connection Status */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Tag color="success" icon={<DatabaseOutlined />}>
              Connected to Neo4j Database
            </Tag>
          </div>
        </>
      )}
    </div>
  );
});

StatusDB.displayName = 'StatusDB';

export default StatusDB;