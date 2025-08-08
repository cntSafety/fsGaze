'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
    Table, 
    Card, 
    Button, 
    Upload, 
    Alert, 
    Spin, 
    Typography, 
    Space, 
    Tag, 
    Divider,
    message
} from 'antd';
import { UploadOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { executeNeo4jQuery } from '../services/KerMLToNeoService';
import { importSphinxNeedsToNeo4j } from '../services/SphinxNeedsImport';

const { Title, Text } = Typography;

interface RequirementData {
    key: string;
    declaredName: string;
    elementId: string;
    qualifiedName: string;
    sphinxNeedsId?: string;
    asilValue?: string;
    safetyReqType?: string;
    isLoadingSphinxId?: boolean;
}

const Requirements: React.FC = () => {
    const [requirements, setRequirements] = useState<any[]>([]);
    const [requirementSphinxNeeds, setRequirementSphinxNeeds] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingSphinxIds, setLoadingSphinxIds] = useState<Record<string, boolean>>({});
    const [expandedRequirements, setExpandedRequirements] = useState<Record<string, boolean>>({});
    // Add new state for ASIL values
    const [requirementAsils, setRequirementAsils] = useState<Record<string, string>>({});
    // Add new state for Safety Requirements Types
    const [requirementSafetyTypes, setRequirementSafetyTypes] = useState<Record<string, string>>({});

    // New state variables for Sphinx Needs import
    const [importLoading, setImportLoading] = useState<boolean>(false);
    const [importResults, setImportResults] = useState<{
        success?: boolean;
        message?: string;
        project?: string | null;
        nodeCount?: number;
        relationshipCount?: number;
        reqUsageRelationshipCount?: number;
        error?: string | null;
    } | null>(null);

    // Function to handle file selection
    const handleFileSelect = async (file: File) => {
        setImportLoading(true);
        setImportResults(null);

        try {
            // Read file content
            const fileContent = await readFileContent(file);

            // Import data to Neo4j
            const results = await importSphinxNeedsToNeo4j(fileContent);
            setImportResults(results);

            // If import was successful, refresh requirements list
            if (results.success) {
                message.success('Sphinx Needs data imported successfully!');
                fetchRequirements();
            } else {
                message.error('Failed to import Sphinx Needs data');
            }
        } catch (err: any) {
            setImportResults({
                success: false,
                error: err.message || 'An error occurred during file import',
                message: 'Import failed'
            });
            message.error('Import failed: ' + (err.message || 'Unknown error'));
        } finally {
            setImportLoading(false);
        }
        
        return false; // Prevent default upload behavior
    };

    // Function to read file content
    const readFileContent = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(e.target?.result as string);
            };
            reader.onerror = (e) => {
                reject(new Error('Failed to read file'));
            };
            reader.readAsText(file);
        });
    };

    // Function to trigger file input click
    const uploadProps = {
        beforeUpload: handleFileSelect,
        accept: '.json',
        showUploadList: false,
        disabled: importLoading
    };

    const toggleRequirementExpand = (elementId: string) => {
        setExpandedRequirements(prev => ({
            ...prev,
            [elementId]: !prev[elementId]
        }));
    };

    // Function to fetch ASIL and Safety Requirements Type for a requirement with Sphinx Needs ID
    const fetchAsilForRequirement = async (requirementId: string, sphinxNeedsId: string) => {
        try {
            const query = `
                MATCH (SNNodes)
                WHERE SNNodes.source = 'sphinx_needs' AND SNNodes.id = '${sphinxNeedsId}'
                RETURN SNNodes.asil, SNNodes.sreqtype
            `;

            const response = await executeNeo4jQuery(query);

            if (response.success && response.results.length > 0) {
                setRequirementAsils(prev => ({
                    ...prev,
                    [requirementId]: response.results[0]["SNNodes.asil"] || 'N/A'
                }));

                // Store the Safety Requirements Type
                setRequirementSafetyTypes(prev => ({
                    ...prev,
                    [requirementId]: response.results[0]["SNNodes.sreqtype"] || 'N/A'
                }));
            }
        } catch (err) {
            console.error(`Error fetching ASIL and Safety Requirements Type for requirement ${requirementId}:`, err);
        }
    };

    const fetchSphinxNeedsId = async (requirementId: string) => {
        setLoadingSphinxIds(prev => ({ ...prev, [requirementId]: true }));

        try {
            const query = `
                MATCH (req:RequirementUsage{elementId: '${requirementId}'})
                MATCH (req)-[:links{usage:true}]->(refU:ReferenceUsage{name:'sphinx_needs_id'})
                MATCH (refU)-[:links{ownedMember:true}]->(sphinx_needs_id:LiteralString)
                RETURN DISTINCT sphinx_needs_id.value
            `;

            const response = await executeNeo4jQuery(query);

            if (response.success && response.results.length > 0) {
                const sphinx_needs_id = response.results[0]["sphinx_needs_id.value"];
                setRequirementSphinxNeeds(prev => ({
                    ...prev,
                    [requirementId]: sphinx_needs_id
                }));

                // Fetch ASIL for this requirement using its Sphinx Needs ID
                if (sphinx_needs_id) {
                    fetchAsilForRequirement(requirementId, sphinx_needs_id);
                }
            }
        } catch (err) {
            console.error(`Error fetching sphinx_needs_id for requirement ${requirementId}:`, err);
        } finally {
            setLoadingSphinxIds(prev => ({ ...prev, [requirementId]: false }));
        }
    };

    const fetchRequirements = async () => {
        setLoading(true);
        setError(null);
        setRequirementSphinxNeeds({});

        try {
            const query = `MATCH(req:RequirementUsage) RETURN req`;
            const response = await executeNeo4jQuery(query);

            if (response.success) {
                setRequirements(response.results);
                // Fetch sphinx_needs_id for each requirement
                for (const result of response.results) {
                    if (result.req?.properties?.elementId) {
                        fetchSphinxNeedsId(result.req.properties.elementId);
                    }
                }
            } else {
                setError(response.error || 'An error occurred while fetching requirements');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred while fetching requirements');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Fetch requirements when component mounts
        fetchRequirements();
    }, []);

    // Prepare data for Ant Design table
    const tableData: RequirementData[] = requirements.map((result, index) => {
        const req = result.req;
        const elementId = req?.properties?.elementId || 'No ID';
        return {
            key: index.toString(),
            declaredName: req?.properties?.declaredName || 'Unnamed Requirement',
            elementId,
            qualifiedName: req?.properties?.qualifiedName || 'No qualified name',
            sphinxNeedsId: requirementSphinxNeeds[elementId],
            asilValue: requirementAsils[elementId],
            safetyReqType: requirementSafetyTypes[elementId],
            isLoadingSphinxId: loadingSphinxIds[elementId] || false
        };
    });

    // Define table columns
    const columns: ColumnsType<RequirementData> = [
        {
            title: 'Req. Name SysML',
            dataIndex: 'declaredName',
            key: 'declaredName',
            render: (text: string, record: RequirementData) => (
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={expandedRequirements[record.elementId] ? <DownOutlined /> : <RightOutlined />}
                        onClick={() => toggleRequirementExpand(record.elementId)}
                    />
                    <Text strong>{text}</Text>
                </Space>
            ),
        },
        {
            title: 'Sphinx Needs ID',
            dataIndex: 'sphinxNeedsId',
            key: 'sphinxNeedsId',
            render: (text: string, record: RequirementData) => {
                if (record.isLoadingSphinxId) {
                    return <Spin size="small" />;
                }
                return text ? <Tag color="blue">{text}</Tag> : <Text type="secondary">Not found</Text>;
            },
        },
        {
            title: 'ASIL from SN',
            dataIndex: 'asilValue',
            key: 'asilValue',
            render: (text: string, record: RequirementData) => {
                if (record.sphinxNeedsId) {
                    if (text) {
                        const getAsilColor = (asil: string) => {
                            switch (asil?.toUpperCase()) {
                                case 'A': return 'red';
                                case 'B': return 'orange';
                                case 'C': return 'gold';
                                case 'D': return 'green';
                                case 'QM': return 'blue';
                                default: return 'default';
                            }
                        };
                        return <Tag color={getAsilColor(text)}>{text}</Tag>;
                    }
                    return <Text type="secondary">Import needs.json...</Text>;
                }
                return <Text type="secondary">N/A</Text>;
            },
        },
        {
            title: 'Safety Req Type from SN',
            dataIndex: 'safetyReqType',
            key: 'safetyReqType',
            render: (text: string, record: RequirementData) => {
                if (record.sphinxNeedsId) {
                    if (text) {
                        return <Tag color="purple">{text}</Tag>;
                    }
                    return <Text type="secondary">Import needs.json...</Text>;
                }
                return <Text type="secondary">N/A</Text>;
            },
        },
    ];

    // Expandable row render
    const expandedRowRender = (record: RequirementData) => (
        <div style={{ padding: '16px', backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
            <Space direction="vertical" size="small">
                <div>
                    <Text strong>ID: </Text>
                    <Text code>{record.elementId}</Text>
                </div>
                <div>
                    <Text strong>Qualified Name: </Text>
                    <Text>{record.qualifiedName}</Text>
                </div>
            </Space>
        </div>
    );

    return (
        <div style={{ padding: '24px' }}>
            <Card>
                <Title level={2}>SysML-v2 Requirements</Title>

                {error && (
                    <Alert
                        message="Error"
                        description={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: '16px' }}
                    />
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: '16px' }}>
                            <Text>Loading requirements...</Text>
                        </div>
                    </div>
                ) : requirements.length > 0 ? (
                    <Table
                        columns={columns}
                        dataSource={tableData}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            showTotal: (total, range) =>
                                `${range[0]}-${range[1]} of ${total} requirements`,
                        }}
                        expandable={{
                            expandedRowRender,
                            expandedRowKeys: Object.keys(expandedRequirements).filter(
                                key => expandedRequirements[key]
                            ),
                            onExpand: (expanded, record) => {
                                toggleRequirementExpand(record.elementId);
                            },
                            showExpandColumn: false,
                        }}
                        scroll={{ x: 800 }}
                    />
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <Text type="secondary">No requirements found.</Text>
                    </div>
                )}

                <Divider />

                {/* Sphinx Needs Import Section */}
                <Card 
                    title="Import Sphinx Needs Data to the Graph DB to get the Req. Attributes"
                    style={{ marginTop: '24px' }}
                >
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        <Upload {...uploadProps}>
                            <Button 
                                icon={<UploadOutlined />} 
                                loading={importLoading}
                                size="large"
                            >
                                {importLoading ? 'Importing...' : 'Import Sphinx Needs JSON File'}
                            </Button>
                        </Upload>

                        {/* Import Results */}
                        {importResults && (
                            <Alert
                                message={importResults.message}
                                type={importResults.success ? 'success' : 'error'}
                                showIcon
                                description={
                                    importResults.success ? (
                                        <Space direction="vertical" size="small">
                                            {importResults.project && (
                                                <Text>
                                                    Project: <Text strong>{importResults.project}</Text>
                                                </Text>
                                            )}
                                            <Text>
                                                Imported nodes: <Text strong>{importResults.nodeCount}</Text>
                                            </Text>
                                            <Text>
                                                Created relationships: <Text strong>{importResults.relationshipCount}</Text>
                                            </Text>
                                        </Space>
                                    ) : (
                                        importResults.error && (
                                            <Text>Error: {importResults.error}</Text>
                                        )
                                    )
                                }
                            />
                        )}
                    </Space>
                </Card>
            </Card>
        </div>
    );
};

export default Requirements;
