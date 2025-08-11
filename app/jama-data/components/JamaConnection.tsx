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
    Tag,
    Typography,
    Badge,
    Dropdown
} from 'antd';
import { 
    LinkOutlined, 
    DisconnectOutlined, 
    KeyOutlined, 
    UserOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    ReloadOutlined,
    SettingOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { JamaConnectionConfig } from '../types/jama';
import { useJamaConnection } from '../../components/JamaConnectionProvider';

const { Text, Link } = Typography;

interface JamaConnectionProps {
    onConnectionSuccess?: (config: JamaConnectionConfig) => void;
    onDisconnect?: () => void;
    showStatusOnly?: boolean;
    showFullStatus?: boolean;
    onOpenConnectionModal?: () => void;
    variant?: 'full' | 'status' | 'compact' | 'mini';
}

const JamaConnection: React.FC<JamaConnectionProps> = ({
    onConnectionSuccess,
    onDisconnect,
    showStatusOnly = false,
    showFullStatus = false,
    onOpenConnectionModal,
    variant = 'full'
}) => {
    const {
        isConnected,
        isConnecting,
        connectionError,
        connectionConfig,
        connect,
        disconnect,
        testConnection,
        isTokenValid,
        isTokenExpiringSoon,
    } = useJamaConnection();

    const [form] = Form.useForm();
    const [authType, setAuthType] = useState<'oauth' | 'basic'>('oauth');

    // Check if we have stored connection info on component mount
    React.useEffect(() => {
        if (connectionConfig && !isConnected) {
            // Pre-fill form with stored config
            form.setFieldsValue({
                baseUrl: connectionConfig.baseUrl,
                clientId: connectionConfig.clientId,
                username: connectionConfig.username,
            });
            setAuthType(connectionConfig.authType);
        }
    }, [connectionConfig, isConnected, form]);

    // Status helper methods
    const getStatusColor = () => {
        if (!isConnected) return 'default';
        if (connectionError) return 'error';
        if (!isTokenValid) return 'error';
        if (isTokenExpiringSoon) return 'warning';
        return 'success';
    };

    const getStatusText = () => {
        if (isConnecting) return 'Connecting...';
        if (!isConnected) return 'Not Connected';
        if (connectionError) return 'Connection Error';
        if (!isTokenValid) return 'Token Expired';
        if (isTokenExpiringSoon) return 'Token Expiring Soon';
        return 'Connected';
    };

    const getStatusIcon = () => {
        if (isConnecting) return <ReloadOutlined spin />;
        if (!isConnected) return <DisconnectOutlined />;
        if (connectionError || !isTokenValid) return <ExclamationCircleOutlined />;
        if (isTokenExpiringSoon) return <ClockCircleOutlined />;
        return <CheckCircleOutlined />;
    };

    const formatTokenExpiry = (expiry?: number) => {
        if (!expiry) return 'N/A';
        
        const expiryDate = new Date(expiry);
        const now = new Date();
        const minutesLeft = Math.floor((expiry - now.getTime()) / (1000 * 60));
        
        if (variant === 'full') {
            return expiryDate.toLocaleString();
        }
        return `${minutesLeft}m remaining`;
    };

    const handleConnect = async (values: any) => {
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

            await connect(config);
            
            if (onConnectionSuccess) {
                onConnectionSuccess(config);
            }
            
            form.resetFields();
            
        } catch (error: any) {
            console.error('Connection failed:', error);
        }
    };

    const handleDisconnect = () => {
        disconnect();
        
        if (onDisconnect) {
            onDisconnect();
        }
        
        form.resetFields();
    };

    const handleTestConnection = async () => {
        await testConnection();
    };

    // Menu items for dropdown
    const menuItems: MenuProps['items'] = [
        {
            key: 'test',
            label: 'Test Connection',
            icon: <ReloadOutlined />,
            onClick: testConnection,
            disabled: !isConnected || isConnecting,
        },
        {
            key: 'settings',
            label: 'Connection Settings',
            icon: <SettingOutlined />,
            onClick: onOpenConnectionModal,
        },
        {
            type: 'divider',
        },
        {
            key: 'disconnect',
            label: 'Disconnect',
            icon: <DisconnectOutlined />,
            onClick: disconnect,
            disabled: !isConnected,
            danger: true,
        },
    ];

    // Mini variant for collapsed sidebar (icon + dot only)
    if (variant === 'mini') {
        return (
            <Dropdown 
                menu={{ items: menuItems }} 
                placement="bottomRight"
                trigger={['click']}
            >
                <Button 
                    size="small" 
                    type="text"
                    style={{ 
                        padding: '4px 8px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <Space size={4}>
                        <Badge status={getStatusColor()} />
                        <Text style={{ fontSize: '10px', lineHeight: 1 }}>
                            Jama
                        </Text>
                    </Space>
                </Button>
            </Dropdown>
        );
    }

    // Compact variant for navbar/header
    if (variant === 'compact') {
        return (
            <Dropdown 
                menu={{ items: menuItems }} 
                placement="bottomRight"
                trigger={['click']}
            >
                <Button size="small" type="text">
                    <Space size="small">
                        <Badge status={getStatusColor()} />
                        {getStatusIcon()}
                        <Text style={{ fontSize: '12px' }}>
                            Jama: {getStatusText()}
                        </Text>
                    </Space>
                </Button>
            </Dropdown>
        );
    }

    // Status variant (detailed status display)
    if (variant === 'status' || showStatusOnly || showFullStatus) {
        return (
            <div style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: '6px' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                        <Badge status={getStatusColor()} />
                        {getStatusIcon()}
                        <Text strong>Jama Connection: {getStatusText()}</Text>
                    </Space>
                    
                    {isConnected && connectionConfig && (
                        <>
                            <div>
                                <Text type="secondary">URL: </Text>
                                <Text>{connectionConfig.baseUrl}</Text>
                            </div>
                            
                            <div>
                                <Text type="secondary">Auth: </Text>
                                <Text>{connectionConfig.authType === 'oauth' ? 'OAuth 2.0' : 'Basic Auth'}</Text>
                            </div>
                            
                            {connectionConfig.authType === 'oauth' && connectionConfig.tokenExpiry && (
                                <div>
                                    <Text type="secondary">Token: </Text>
                                    <Text type={isTokenExpiringSoon ? 'warning' : undefined}>
                                        {formatTokenExpiry(connectionConfig.tokenExpiry)}
                                    </Text>
                                </div>
                            )}
                        </>
                    )}
                    
                    {connectionError && (
                        <Text type="danger" style={{ fontSize: '12px' }}>
                            {connectionError}
                        </Text>
                    )}
                    
                    <Divider style={{ margin: '8px 0' }} />
                    
                    <Space size="small">
                        <Button 
                            size="small" 
                            onClick={testConnection}
                            loading={isConnecting}
                            disabled={!isConnected}
                        >
                            Test
                        </Button>
                        
                        {onOpenConnectionModal && (
                            <Button size="small" onClick={onOpenConnectionModal}>
                                Settings
                            </Button>
                        )}
                        
                        <Button 
                            size="small" 
                            danger 
                            onClick={disconnect}
                            disabled={!isConnected}
                        >
                            Disconnect
                        </Button>
                    </Space>
                </Space>
            </div>
        );
    }

    // Full variant (connection form + status)
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
                            onClick={handleTestConnection} 
                            loading={isConnecting}
                            size="small"
                        >
                            Test Connection
                        </Button>
                    </div>

                    {connectionError && (
                        <Alert
                            message="Connection Error"
                            description={connectionError}
                            type="error"
                            showIcon
                            closable
                        />
                    )}
                </Space>
            </Card>
        );
    }

    return (
        <Card title="Connect to Jama">
            {/* Show restoration message if we have stored config */}
            {connectionConfig && !isConnected && (
                <Alert
                    message="Previous Connection Found"
                    description={
                        connectionConfig.authType === 'oauth' 
                            ? `Found saved connection to ${connectionConfig.baseUrl}. Please enter your OAuth client secret to reconnect.`
                            : `Found saved connection to ${connectionConfig.baseUrl}. Please enter your password to reconnect.`
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}
            
            <Form
                form={form}
                layout="vertical"
                onFinish={handleConnect}
                disabled={isConnecting}
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
                                        <li>Click &quot;Set API Credentials&quot;</li>
                                        <li>Enter a name for your application</li>
                                        <li>Click &quot;Create API Credentials&quot;</li>
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

                {connectionError && (
                    <Alert
                        message="Connection Error"
                        description={connectionError}
                        type="error"
                        showIcon
                        closable
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Form.Item>
                    <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={isConnecting}
                        icon={<LinkOutlined />}
                        block
                    >
                        {isConnecting ? 'Connecting...' : 'Connect to Jama'}
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
