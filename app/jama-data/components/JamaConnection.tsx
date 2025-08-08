'use client';

import React, { useState } from 'react';
import { 
    Card, 
    Form, 
    Input, 
    Button, 
    Alert, 
    Space, 
    Radio, 
    Divider,
    Spin,
    Tag,
    Typography 
} from 'antd';
import { 
    LinkOutlined, 
    DisconnectOutlined, 
    KeyOutlined, 
    UserOutlined,
    CheckCircleOutlined 
} from '@ant-design/icons';
import { JamaConnectionConfig, JamaConnectionError } from '../types/jama';
import { JamaService } from '../services/jamaService';

const { Text, Link } = Typography;

interface JamaConnectionProps {
    onConnectionSuccess: (config: JamaConnectionConfig) => void;
    onDisconnect: () => void;
    isConnected: boolean;
    connectionConfig: JamaConnectionConfig | null;
}

const JamaConnection: React.FC<JamaConnectionProps> = ({
    onConnectionSuccess,
    onDisconnect,
    isConnected,
    connectionConfig
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authType, setAuthType] = useState<'oauth' | 'basic'>('oauth');
    const [testingConnection, setTestingConnection] = useState(false);

    const handleConnect = async (values: any) => {
        setLoading(true);
        setError(null);
        
        try {
            const config: JamaConnectionConfig = {
                baseUrl: values.baseUrl,
                authType: authType,
            };

            if (authType === 'oauth') {
                config.clientId = values.clientId;
                config.clientSecret = values.clientSecret;
            } else {
                config.username = values.username;
                config.password = values.password;
            }

            const jamaService = new JamaService(config);

            if (authType === 'oauth') {
                // Exchange credentials for token
                const tokenResponse = await jamaService.getOAuthToken(
                    values.clientId,
                    values.clientSecret,
                    values.baseUrl
                );
                
                config.accessToken = tokenResponse.access_token;
                config.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
            }

            // Test the connection
            const connectionSuccess = await jamaService.testConnection();
            
            if (connectionSuccess) {
                // Get current user info to validate connection
                const currentUser = await jamaService.getCurrentUser();
                console.log('Connected as:', currentUser);
                
                onConnectionSuccess(config);
                form.resetFields();
            } else {
                setError('Connection test failed. Please check your credentials and URL.');
            }
            
        } catch (error: any) {
            console.error('Connection failed:', error);
            setError(error.message || 'Failed to connect to Jama');
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = () => {
        onDisconnect();
        form.resetFields();
        setError(null);
    };

    const testConnection = async () => {
        if (!connectionConfig) return;
        
        setTestingConnection(true);
        try {
            const jamaService = new JamaService(connectionConfig);
            const success = await jamaService.testConnection();
            
            if (success) {
                setError(null);
            } else {
                setError('Connection test failed');
            }
        } catch (error: any) {
            setError(error.message || 'Connection test failed');
        } finally {
            setTestingConnection(false);
        }
    };

    const formatTokenExpiry = (expiry: number) => {
        const expiryDate = new Date(expiry);
        const now = new Date();
        const hoursLeft = Math.floor((expiry - now.getTime()) / (1000 * 60 * 60));
        
        return `${expiryDate.toLocaleString()} (${hoursLeft}h remaining)`;
    };

    if (isConnected && connectionConfig) {
        return (
            <Card 
                title={
                    <Space>
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        Connected to Jama
                    </Space>
                }
                extra={
                    <Button 
                        icon={<DisconnectOutlined />} 
                        onClick={handleDisconnect}
                        danger
                    >
                        Disconnect
                    </Button>
                }
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                        <Text strong>Base URL: </Text>
                        <Link href={connectionConfig.baseUrl} target="_blank" rel="noopener noreferrer">
                            {connectionConfig.baseUrl}
                        </Link>
                    </div>
                    
                    <div>
                        <Text strong>Authentication: </Text>
                        <Tag color={connectionConfig.authType === 'oauth' ? 'blue' : 'green'}>
                            {connectionConfig.authType === 'oauth' ? 'OAuth 2.0' : 'Basic Auth'}
                        </Tag>
                    </div>

                    {connectionConfig.authType === 'oauth' && connectionConfig.tokenExpiry && (
                        <div>
                            <Text strong>Token Expires: </Text>
                            <Text>{formatTokenExpiry(connectionConfig.tokenExpiry)}</Text>
                        </div>
                    )}

                    <div>
                        <Button 
                            onClick={testConnection} 
                            loading={testingConnection}
                            size="small"
                        >
                            Test Connection
                        </Button>
                    </div>

                    {error && (
                        <Alert
                            message="Connection Error"
                            description={error}
                            type="error"
                            showIcon
                            closable
                            onClose={() => setError(null)}
                        />
                    )}
                </Space>
            </Card>
        );
    }

    return (
        <Card title="Connect to Jama">
            <Form
                form={form}
                layout="vertical"
                onFinish={handleConnect}
                disabled={loading}
            >
                <Form.Item
                    name="baseUrl"
                    label="Base URL"
                    rules={[
                        { required: true, message: 'Please enter your Jama base URL' },
                        { type: 'url', message: 'Please enter a valid URL' }
                    ]}
                    extra="e.g., https://yourcompany.jamacloud.com or https://your-jama-server.com"
                >
                    <Input 
                        prefix={<LinkOutlined />}
                        placeholder="https://yourcompany.jamacloud.com"
                    />
                </Form.Item>

                <Form.Item
                    name="authType"
                    label="Authentication Method"
                >
                    <Radio.Group 
                        value={authType} 
                        onChange={(e) => setAuthType(e.target.value)}
                        buttonStyle="solid"
                    >
                        <Radio.Button value="oauth">OAuth 2.0 (Recommended)</Radio.Button>
                        <Radio.Button value="basic">Basic Authentication</Radio.Button>
                    </Radio.Group>
                </Form.Item>

                {authType === 'oauth' && (
                    <>
                        <Alert
                            message="OAuth Setup Required"
                            description={
                                <div>
                                    To use OAuth authentication, you need to create API credentials in your Jama user profile:
                                    <ol style={{ marginTop: 8, marginBottom: 0 }}>
                                        <li>Go to your Jama user profile</li>
                                        <li>Click "Set API Credentials"</li>
                                        <li>Enter a name for your application</li>
                                        <li>Click "Create API Credentials"</li>
                                        <li>Copy the Client ID and Secret (secret shown only once!)</li>
                                    </ol>
                                </div>
                            }
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                        
                        <Form.Item
                            name="clientId"
                            label="Client ID"
                            rules={[{ required: true, message: 'Please enter your Client ID' }]}
                        >
                            <Input 
                                prefix={<KeyOutlined />}
                                placeholder="Your OAuth Client ID"
                            />
                        </Form.Item>

                        <Form.Item
                            name="clientSecret"
                            label="Client Secret"
                            rules={[{ required: true, message: 'Please enter your Client Secret' }]}
                        >
                            <Input.Password 
                                prefix={<KeyOutlined />}
                                placeholder="Your OAuth Client Secret"
                            />
                        </Form.Item>
                    </>
                )}

                {authType === 'basic' && (
                    <>
                        <Alert
                            message="Basic Authentication"
                            description="Basic authentication will not work in SAML/SSO environments. OAuth is recommended for production use."
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                        
                        <Form.Item
                            name="username"
                            label="Username"
                            rules={[{ required: true, message: 'Please enter your username' }]}
                        >
                            <Input 
                                prefix={<UserOutlined />}
                                placeholder="Your Jama username"
                            />
                        </Form.Item>

                        <Form.Item
                            name="password"
                            label="Password"
                            rules={[{ required: true, message: 'Please enter your password' }]}
                        >
                            <Input.Password 
                                prefix={<KeyOutlined />}
                                placeholder="Your Jama password"
                            />
                        </Form.Item>
                    </>
                )}

                {error && (
                    <Alert
                        message="Connection Error"
                        description={error}
                        type="error"
                        showIcon
                        closable
                        onClose={() => setError(null)}
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Form.Item>
                    <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={loading}
                        icon={<LinkOutlined />}
                        block
                    >
                        {loading ? 'Connecting...' : 'Connect to Jama'}
                    </Button>
                </Form.Item>
            </Form>

            <Divider />
            
            <div style={{ fontSize: '12px', color: '#666' }}>
                <Text type="secondary">
                    <strong>API Documentation:</strong>{' '}
                    <Link href="https://dev.jamasoftware.com/api/" target="_blank" rel="noopener noreferrer">
                        Jama REST API
                    </Link>
                    {' | '}
                    <Link href="https://dev.jamasoftware.com/cookbook/" target="_blank" rel="noopener noreferrer">
                        API Cookbook
                    </Link>
                </Text>
            </div>
        </Card>
    );
};

export default JamaConnection;
