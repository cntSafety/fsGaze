'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, List, Alert, Spin, Typography, Space, Tag } from 'antd';
import { ReloadOutlined, ApiOutlined } from '@ant-design/icons';
import { globalJamaService } from '../services/globalJamaService';
import { useJamaConnection } from '../components/JamaConnectionProvider';
import { JamaProject, JamaItem } from '../jama-data/types/jama';

const { Title, Text } = Typography;

/**
 * Demo component showing how to use the global Jama service
 * from any part of the application
 */
const JamaServiceDemo: React.FC = () => {
    const { isConnected } = useJamaConnection();
    const [projects, setProjects] = useState<JamaProject[]>([]);
    const [recentItems, setRecentItems] = useState<JamaItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        if (!isConnected) return;

        setLoading(true);
        setError(null);

        try {
            // Get projects using the global service
            const projectsData = await globalJamaService.getProjects();
            setProjects(projectsData);

            // Get some recent items from the first project
            if (projectsData.length > 0) {
                const items = await globalJamaService.getItems(
                    projectsData[0].id,
                    { /* Add filters if needed */ }
                );
                // Show only the first 10 items
                setRecentItems(items.slice(0, 10));
            }

        } catch (err: any) {
            setError(err.message || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const testConnection = async () => {
        setLoading(true);
        try {
            const result = await globalJamaService.testConnection();
            if (!result) {
                setError('Connection test failed');
            }
        } catch (err: any) {
            setError(err.message || 'Connection test failed');
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch data when connection becomes available
    useEffect(() => {
        if (isConnected) {
            fetchData();
        } else {
            setProjects([]);
            setRecentItems([]);
            setError(null);
        }
    }, [isConnected]);

    if (!isConnected) {
        return (
            <Card title="Jama Service Demo" style={{ margin: '16px 0' }}>
                <Alert
                    message="Not Connected"
                    description="Please connect to Jama first to see this demo in action."
                    type="info"
                    showIcon
                />
            </Card>
        );
    }

    return (
        <Card 
            title={
                <Space>
                    <ApiOutlined />
                    Jama Service Demo
                </Space>
            } 
            extra={
                <Button 
                    icon={<ReloadOutlined />} 
                    onClick={fetchData}
                    loading={loading}
                >
                    Refresh
                </Button>
            }
            style={{ margin: '16px 0' }}
        >
            {error && (
                <Alert
                    message="Error"
                    description={error}
                    type="error"
                    showIcon
                    closable
                    onClose={() => setError(null)}
                    style={{ marginBottom: 16 }}
                />
            )}

            <Spin spinning={loading}>
                <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                    {/* Projects List */}
                    <Card type="inner" title="Projects" size="small">
                        <List
                            size="small"
                            dataSource={projects}
                            renderItem={(project) => (
                                <List.Item>
                                    <div>
                                        <Text strong>{project.name}</Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                            Key: {project.projectKey} | ID: {project.id}
                                        </Text>
                                        {project.isFolder && (
                                            <Tag color="blue" style={{ marginLeft: 8, fontSize: '11px' }}>
                                                Folder
                                            </Tag>
                                        )}
                                    </div>
                                </List.Item>
                            )}
                            locale={{ emptyText: 'No projects found' }}
                        />
                    </Card>

                    {/* Recent Items */}
                    <Card type="inner" title="Recent Items" size="small">
                        <List
                            size="small"
                            dataSource={recentItems}
                            renderItem={(item) => (
                                <List.Item>
                                    <div>
                                        <Text strong>{item.fields.name}</Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                            {item.documentKey} | Type: {item.type}
                                        </Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: '11px' }}>
                                            Modified: {new Date(item.modifiedDate).toLocaleDateString()}
                                        </Text>
                                    </div>
                                </List.Item>
                            )}
                            locale={{ emptyText: 'No items found' }}
                        />
                    </Card>
                </div>

                {/* Connection Info */}
                <Card type="inner" title="Connection Info" size="small" style={{ marginTop: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div>
                            <Text strong>Service Status:</Text>
                            <Tag color="green" style={{ marginLeft: 8 }}>
                                {globalJamaService.isConnected() ? 'Connected' : 'Disconnected'}
                            </Tag>
                        </div>
                        
                        <div>
                            <Text strong>Base URL:</Text>
                            <Text style={{ marginLeft: 8 }}>
                                {globalJamaService.getConnectionConfig()?.baseUrl || 'N/A'}
                            </Text>
                        </div>
                        
                        <div>
                            <Text strong>Auth Type:</Text>
                            <Text style={{ marginLeft: 8 }}>
                                {globalJamaService.getConnectionConfig()?.authType || 'N/A'}
                            </Text>
                        </div>

                        <Button size="small" onClick={testConnection} loading={loading}>
                            Test Connection
                        </Button>
                    </Space>
                </Card>
            </Spin>
        </Card>
    );
};

export default JamaServiceDemo;
