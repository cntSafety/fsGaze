'use client';

import React, { useState } from 'react';
import { Card, Tabs } from 'antd';
import JamaConnection from './components/JamaConnection';
import RequirementsViewer from './components/RequirementsViewer';
import { JamaConnectionConfig } from './types/jama';

const { TabPane } = Tabs;

const JamaDataPage: React.FC = () => {
    const [connectionConfig, setConnectionConfig] = useState<JamaConnectionConfig | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const handleConnectionSuccess = (config: JamaConnectionConfig) => {
        setConnectionConfig(config);
        setIsConnected(true);
    };

    const handleDisconnect = () => {
        setConnectionConfig(null);
        setIsConnected(false);
    };

    return (
        <div style={{ padding: '24px' }}>
            <Card title="Jama Connect Integration" style={{ marginBottom: '24px' }}>
                <p>
                    Connect to your Jama instance to retrieve and analyze requirements data. 
                    This integration supports both OAuth (recommended) and Basic Authentication methods.
                </p>
            </Card>

            <Tabs defaultActiveKey="connection" type="card">
                <TabPane tab="Connection" key="connection">
                    <JamaConnection 
                        onConnectionSuccess={handleConnectionSuccess}
                        onDisconnect={handleDisconnect}
                        isConnected={isConnected}
                        connectionConfig={connectionConfig}
                    />
                </TabPane>
                
                <TabPane tab="Requirements" key="requirements" disabled={!isConnected}>
                    {isConnected && connectionConfig && (
                        <RequirementsViewer connectionConfig={connectionConfig} />
                    )}
                </TabPane>
            </Tabs>
        </div>
    );
};

export default JamaDataPage;
