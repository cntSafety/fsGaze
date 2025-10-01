import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Tag, Button, Space, Input } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnType, TableProps } from 'antd/es/table';
import Link from 'next/link';
import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getFailuresAndCountsForComponents } from '@/app/services/neo4j/queries/safety/failureModes';
import { getAllPortsForComponents } from '@/app/services/neo4j/queries/ports';
import { getFailuresAndCountsForPorts } from '@/app/services/neo4j/queries/safety/failureModes';
import { getTagsFromNote } from '@/app/services/neo4j/queries/safety/safetyNotes';
import type { Key } from 'react';
import { theme } from 'antd';
import { getAsilColor } from '@/app/components/asilColors';

const SafetyStatistics: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [tagFilters, setTagFilters] = useState<Array<{ text: string; value: string }>>([]);
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const searchInput = useRef<any>(null);
    const { token } = theme.useToken();

    const getOverallRiskColor = (val: number) => {
        if (val >= 17) return token.colorError;
        if (val >= 9) return token.colorWarning;
        if (val > 3) return token.colorSuccess;
        return '#bfbfbf'; // gray for 0-3
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        const compResult = await getApplicationSwComponents();
        if (compResult.success && compResult.data) {
            // Filter out COMPOSITION_SW_COMPONENT_TYPE
            const filtered = compResult.data.filter((item: any) => item.componentType !== 'COMPOSITION_SW_COMPONENT_TYPE');
            const componentUuids = filtered.map((item: any) => item.uuid);
            const componentFMstatistics = await getFailuresAndCountsForComponents(componentUuids);
            const portsResult = await getAllPortsForComponents(componentUuids);
            // Map ports by componentUuid
            const portsByComponent: Record<string, { receiver: number; provider: number; portUuids: string[] }> = {};
            let allPortUuids: string[] = [];
            if (portsResult.success && portsResult.data) {
                portsResult.data.forEach((ports: any[], componentUuid: string) => {
                    let receiver = 0;
                    let provider = 0;
                    const portUuids: string[] = [];
                    ports.forEach((port: any) => {
                        portUuids.push(port.uuid);
                        if (port.type === 'R_PORT_PROTOTYPE') receiver++;
                        if (port.type === 'P_PORT_PROTOTYPE') provider++;
                    });
                    portsByComponent[componentUuid] = { receiver, provider, portUuids };
                    allPortUuids = allPortUuids.concat(portUuids);
                });
            }
            // Get missing FM for ports
            const missingFMByComponent: Record<string, number> = {};
            if (allPortUuids.length > 0) {
                const portFMStats = await getFailuresAndCountsForPorts(allPortUuids);
                if (portFMStats.success && portFMStats.data) {
                    const portFMMap: Record<string, any[]> = portFMStats.data || {};
                    // For each component, count ports with no failureUuid
                    filtered.forEach((comp: any) => {
                        let missing = 0;
                        const portUuids = portsByComponent[comp.uuid]?.portUuids || [];
                        portUuids.forEach((portUuid: string) => {
                            const portFailures = portFMMap[portUuid];
                            // If no entry or the array is empty, count as missing
                            if (!Array.isArray(portFailures) || portFailures.length === 0) {
                                missing++;
                            }
                        });
                        missingFMByComponent[comp.uuid] = missing;
                    });
                }
            }
            if (componentFMstatistics.success && componentFMstatistics.data) {
                // Group by component
                const statsMap: Record<string, any> = {};
                filtered.forEach((comp: any) => {
                    statsMap[comp.uuid] = {
                        uuid: comp.uuid,
                        name: comp.name,
                        componentType: comp.componentType,
                        FunctionFM: 0,
                        RiskRating: 0,
                        SafetyTask: 0,
                        finishedTaskCount: 0,
                        SafetyReq: 0,
                        SafetyNote: 0,
                        portCount: (portsByComponent[comp.uuid]?.receiver || 0) + (portsByComponent[comp.uuid]?.provider || 0),
                        missingFM: missingFMByComponent[comp.uuid] || 0,
                        riskScore: 0,
                        maxAsil: '',
                        tags: [] as string[],
                    };
                });
                componentFMstatistics.data.forEach((fm: any) => {
                    if (fm.swComponentUuid && statsMap[fm.swComponentUuid]) {
                        statsMap[fm.swComponentUuid].FunctionFM += 1;
                        statsMap[fm.swComponentUuid].RiskRating += fm.riskRatingCount || 0;
                        statsMap[fm.swComponentUuid].SafetyTask += fm.safetyTaskCount || 0;
                        statsMap[fm.swComponentUuid].finishedTaskCount += fm.finishedTaskCount || 0;
                        statsMap[fm.swComponentUuid].SafetyReq += fm.safetyReqCount || 0;
                        statsMap[fm.swComponentUuid].SafetyNote += fm.safetyNoteCount || 0;
                        // Calculate risk score for this failure mode
                        const sev = Number(fm.Severity);
                        const occ = Number(fm.Occurrence);
                        const det = Number(fm.Detection);
                        if (!isNaN(sev) && !isNaN(occ) && !isNaN(det)) {
                            const score = sev * occ * det;
                            if (score > statsMap[fm.swComponentUuid].riskScore) {
                                statsMap[fm.swComponentUuid].riskScore = score; // store maximum risk score
                            }
                        }
                        // Track maximum ASIL
                        const currentAsil = fm.asil;
                        if (currentAsil) {
                            const asilOrder = { 'QM': 0, 'TBC': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
                            const currentOrder = asilOrder[currentAsil as keyof typeof asilOrder] ?? -1;
                            const maxOrder = asilOrder[statsMap[fm.swComponentUuid].maxAsil as keyof typeof asilOrder] ?? -1;
                            if (currentOrder > maxOrder) {
                                statsMap[fm.swComponentUuid].maxAsil = currentAsil;
                            }
                        }
                    }
                });
                // Calculate open tasks
                
                Object.values(statsMap).forEach((comp: any) => {
                    comp.openSafetyTasks = Math.max(0, comp.SafetyTask - comp.finishedTaskCount);
                });

                // Fetch tags for each component in parallel
                const tagPromises = Object.values(statsMap).map(async (comp: any) => {
                    try {
                        const res = await getTagsFromNote(comp.uuid);
                        if (res.success && res.tags) {
                            comp.tags = res.tags;
                        } else {
                            comp.tags = [];
                        }
                    } catch {
                        comp.tags = [];
                    }
                });
                await Promise.all(tagPromises);

                // Build filters from collected tags (unique)
                const uniqueTags = Array.from(new Set(Object.values(statsMap).flatMap((c: any) => c.tags || []))).sort();
                setTagFilters(uniqueTags.map(t => ({ text: t, value: t })));

                setData(Object.values(statsMap));
            } else {
                setData([]);
            }
        } else {
            setData([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Ant Design Table search helpers
    const getColumnSearchProps = (dataIndex: string): ColumnType<any> => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
            <div style={{ padding: 8 }}>
                <Input
                    ref={searchInput}
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={e => setSelectedKeys(e.target.value ? [String(e.target.value)] : [])}
                    onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
                    style={{ marginBottom: 8, display: 'block' }}
                />
                <Space>
                    <Button
                        type="primary"
                        onClick={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
                        size="small"
                        style={{ width: 90 }}
                    >
                        Search
                    </Button>
                    <Button onClick={() => handleReset(clearFilters)} size="small" style={{ width: 90 }}>
                        Reset
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: (filtered: boolean) => (
            <span style={{ color: filtered ? '#1890ff' : undefined }}>🔍</span>
        ),
        onFilter: (value, record) =>
            record[dataIndex]
                ? record[dataIndex].toString().toLowerCase().includes((value as string).toLowerCase())
                : false,
        onFilterDropdownVisibleChange: visible => {
            if (visible) {
                setTimeout(() => searchInput.current?.select(), 100);
            }
        },
        render: (text: string, record: any) =>
            searchedColumn === dataIndex ? (
                <span style={{ backgroundColor: '#ffc069', padding: 0 }}>{text}</span>
            ) : dataIndex === 'name' ? (
                <Link href={`/arxml-safety/${record.uuid}`} legacyBehavior passHref>
                    <a target="_blank" rel="noopener noreferrer">{text}</a>
                </Link>
            ) : (
                text
            ),
    });

    const handleSearch = (selectedKeys: string[] | number[], confirm: () => void, dataIndex: string) => {
        confirm();
        setSearchText((selectedKeys[0] as string) || '');
        setSearchedColumn(dataIndex);
    };

    const handleReset = (clearFilters: (() => void) | undefined) => {
        if (clearFilters) {
            clearFilters();
        }
        setSearchText('');
    };

    const exportToCSV = useCallback(() => {
        if (data.length === 0) {
            return;
        }

        // Define CSV headers
        const headers = [
            'Component Name',
            'Component Type',
            'ASIL Max',
            'Functional FM',
            'RiskRating',
            'SafetyReq',
            'SafetyNote', 
            'Tags',
            'Risk Score',
            'Port Count',
            'Missing FM for Ports'
        ];

        // Convert data to CSV format
        const csvData = data.map(row => [
            row.name || '',
            row.componentType || '',
            row.maxAsil || '',
            row.FunctionFM || 0,
            row.RiskRating || 0,
            row.SafetyReq || 0,
            row.SafetyNote || 0,
            (row.tags || []).join('|'),
            row.riskScore || 0,
            row.portCount || 0,
            row.missingFM || 0
        ]);

        // Combine headers and data
        const csvContent = [headers, ...csvData]
            .map(row => row.map(field => {
                // Escape quotes and wrap in quotes if contains comma, quote, or newline
                const stringField = String(field);
                if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            }).join(','))
            .join('\n');

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `safety_statistics_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [data]);

    const columns: TableProps<any>["columns"] = [
        {
            title: 'Component Name',
            dataIndex: 'name',
            key: 'name',
            ...getColumnSearchProps('name'),
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: 'Component Type',
            dataIndex: 'componentType',
            key: 'componentType',
            ...getColumnSearchProps('componentType'),
            sorter: (a, b) => a.componentType.localeCompare(b.componentType),
            render: (type: string) => {
                const typeColors: Record<string, string> = {
                    'APPLICATION_SW_COMPONENT_TYPE': 'blue',
                    'SERVICE_SW_COMPONENT_TYPE': 'green',
                    'ECU_ABSTRACTION_SW_COMPONENT_TYPE': 'orange',
                    'COMPOSITION_SW_COMPONENT_TYPE': 'purple'
                };
                const displayText = type?.replace('_SW_COMPONENT_TYPE', '').replace('_', ' ');
                
                if (searchedColumn === 'componentType') {
                    return (
                        <Tag color={typeColors[type] || 'default'}>
                            <span style={{ backgroundColor: '#ffc069', padding: 0 }}>{displayText}</span>
                        </Tag>
                    );
                }
                return <Tag color={typeColors[type] || 'default'}>{displayText}</Tag>;
            },
        },
        {
            title: 'ASIL Max',
            dataIndex: 'maxAsil',
            key: 'maxAsil',
            sorter: (a, b) => {
                const asilOrder = { 'QM': 0, 'TBC': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
                const aOrder = asilOrder[a.maxAsil as keyof typeof asilOrder] ?? -1;
                const bOrder = asilOrder[b.maxAsil as keyof typeof asilOrder] ?? -1;
                return aOrder - bOrder;
            },
            render: (asil: string) => {
                if (!asil) return <span>-</span>;
                return <Tag style={{ background: getAsilColor(asil), color: '#fff', border: 0 }}>{asil}</Tag>;
            },
        },
        {
            title: 'Functional FM',
            dataIndex: 'FunctionFM',
            key: 'FunctionFM',
            sorter: (a, b) => a.FunctionFM - b.FunctionFM,
            render: (count: number) => {
                if (count === 0) {
                    return <Tag color="red">{count}</Tag>;
                } else if (count === 1) {
                    return <Tag color="orange">{count}</Tag>;
                } else {
                    return <span>{count}</span>;
                }
            }
        },
        {
            title: 'RiskRating',
            dataIndex: 'RiskRating',
            key: 'RiskRating',
            sorter: (a, b) => a.RiskRating - b.RiskRating,
            render: (count: number) => {
                if (count === 0) {
                    return <Tag color="red">{count}</Tag>;
                } else {
                    return <span>{count}</span>;
                }
            }
        },
        {
            title: 'SafetyReq',
            dataIndex: 'SafetyReq',
            key: 'SafetyReq',
            sorter: (a, b) => a.SafetyReq - b.SafetyReq,
            render: (count: number) => {
                if (count === 0) {
                    return <Tag color="red">{count}</Tag>;
                } else {
                    return <span>{count}</span>;
                }
            }
        },
        {
            title: 'SafetyNote',
            dataIndex: 'SafetyNote',
            key: 'SafetyNote',
            sorter: (a, b) => a.SafetyNote - b.SafetyNote,
        },
        {
            title: 'Tags',
            dataIndex: 'tags',
            key: 'tags',
            filters: tagFilters,
            onFilter: (value, record) => Array.isArray(record.tags) && record.tags.includes(value as string),
            render: (tags: string[]) => {
                if (!tags || tags.length === 0) return <span style={{ color: '#999' }}>-</span>;
                return (
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                        {tags.map(t => (
                            <Tag key={t} color="geekblue">{t}</Tag>
                        ))}
                    </span>
                );
            }
        },
        {
            title: 'Risk Score',
            dataIndex: 'riskScore',
            key: 'riskScore',
            sorter: (a, b) => a.riskScore - b.riskScore,
            render: (score: number) => (
                <Tag style={{ background: getOverallRiskColor(score), color: '#fff', border: 0 }}>{score}</Tag>
            ),
        },
        {
            title: 'Port count',
            dataIndex: 'portCount',
            key: 'portCount',
            render: (count: number) => <Tag color="blue">{count}</Tag>,
            sorter: (a, b) => a.portCount - b.portCount,
        },
        {
            title: 'Missing FM for ports',
            dataIndex: 'missingFM',
            key: 'missingFM',
            render: (count: number) => {
                if (count === 0) {
                    return <Tag color="green">{count}</Tag>;
                } else {
                    return <Tag color="red">{count}</Tag>;
                }
            },
            sorter: (a, b) => a.missingFM - b.missingFM,
        },
    ];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Space>
                <Button onClick={fetchData} loading={loading} type="default">
                    Refresh
                </Button>
                <Button 
                    onClick={exportToCSV} 
                    disabled={data.length === 0} 
                    icon={<DownloadOutlined />}
                    type="primary"
                >
                    Export to CSV
                </Button>
            </Space>
            <div style={{ overflowX: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={data}
                    loading={loading}
                    rowKey="uuid"
                    pagination={false}
                    size="small"
                    style={{ minWidth: 700 }}
                />
            </div>
        </Space>
    );
};

export default SafetyStatistics; 