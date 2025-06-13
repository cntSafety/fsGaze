'use client';

import React, { useState, useEffect } from 'react';
import { Typography, Button } from 'antd';
import { getInformationForPort, ProvidedInterfaceInfo } from '@/app/services/ArxmlToNeoService';

const { Text } = Typography;

interface PortInterfaceInfoProps {
    portUuid: string;
}

const PortInterfaceInfo: React.FC<PortInterfaceInfoProps> = ({ portUuid }) => {
    const [interfaceInfo, setInterfaceInfo] = useState<ProvidedInterfaceInfo | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchInterfaceInfo = async () => {
            setLoading(true);
            try {
                const result = await getInformationForPort(portUuid);
                if (result.success && result.data) {
                    setInterfaceInfo(result.data);
                }
            } catch (error) {
                console.error('Error fetching interface info:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchInterfaceInfo();
    }, [portUuid]);

    const getInterfaceIcon = (interfaceType: string) => {
        switch (interfaceType) {
            case 'SENDER_RECEIVER_INTERFACE':
                return '📡'; // or '🔄' for bidirectional communication
            case 'CLIENT_SERVER_INTERFACE':
                return '🔌'; // or '⚙️' for service
            default:
                return '🔗'; // generic interface symbol
        }
    };

    if (loading) {
        return <Text style={{ fontSize: '12px', marginLeft: '8px', color: '#666' }}>Loading interface...</Text>;
    }

    if (!interfaceInfo) {
        return <Text style={{ fontSize: '12px', marginLeft: '8px', color: '#999' }}>No interface reference</Text>;
    }

    return (
        <div style={{ marginLeft: '8px' }}>
            <Text style={{ fontSize: '14px', color: '#2C2F2B' }}>
                {getInterfaceIcon(interfaceInfo.interfaceType)} {interfaceInfo.interfaceType}
            </Text>
            <br />
            <Text style={{ fontSize: '12px', color: '#666', marginLeft: '16px' }}>
                Referenced Interfaces: 
            </Text>
            <Button 
                type="default" 
                size="small"
                style={{ 
                    fontSize: '11px', 
                    marginLeft: '4px',
                    marginTop: '2px',
                    height: '20px',
                    padding: '0 6px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    backgroundColor: '#fafafa',
                    color: '#595959'
                }}
                onClick={() => {
                    // TODO: Add interface details functionality
                    // console.log('Interface clicked:', interfaceInfo.interfaceName);
                }}
            >
                {interfaceInfo.interfaceName}
            </Button>
        </div>
    );
};

export default PortInterfaceInfo;