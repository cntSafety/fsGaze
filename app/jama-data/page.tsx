'use client';

import React from 'react';
import { Card, Tabs } from 'antd';
import JamaConnection from './components/JamaConnection';
import RequirementsViewer from './components/RequirementsViewer';
import JamaServiceDemo from '../components/JamaServiceDemo';
import { useJamaConnection } from '../components/JamaConnectionProvider';

const { TabPane } = Tabs;

const JamaDataPage: React.FC = () => {
    const { isConnected, connectionConfig } = useJamaConnection();

    return (
        <div style={{ padding: '24px' }}>
            <Card title="Jama Connect Integration" style={{ marginBottom: '24px' }}>
                <p>
                    Connect to your Jama instance to retrieve and analyze requirements data. 
                    This integration supports both OAuth (recommended) and Basic Authentication methods.
                    Your connection will be available across all parts of the application.
                </p>
            </Card>

            <Tabs defaultActiveKey="connection" type="card">
                <TabPane tab="Connection" key="connection">
                    <JamaConnection />
                </TabPane>
                
                <TabPane tab="Requirements Viewer" key="requirements" disabled={!isConnected}>
                    {isConnected && (
                        <RequirementsViewer />
                    )}
                </TabPane>

                <TabPane tab="Service Demo" key="demo" disabled={!isConnected}>
                    {isConnected && <JamaServiceDemo />}
                </TabPane>
                

            </Tabs>
        </div>
    );
};

export default JamaDataPage;
