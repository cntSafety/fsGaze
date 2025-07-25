import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Tag, Button, Space, Input } from 'antd';
import type { ColumnType, TableProps } from 'antd/es/table';
import Link from 'next/link';
import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getFailuresAndCountsForComponents } from '@/app/services/neo4j/queries/safety/failureModes';
import { getAllPortsForComponents } from '@/app/services/neo4j/queries/ports';
import { getFailuresAndCountsForPorts } from '@/app/services/neo4j/queries/safety/failureModes';
import type { Key } from 'react';

const SafetyStatistics: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef<any>(null);

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
      let missingFMByComponent: Record<string, number> = {};
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
            FunctionFM: 0,
            RiskRating: 0,
            SafetyTask: 0,
            SafetyReq: 0,
            SafetyNote: 0,
            portCount: (portsByComponent[comp.uuid]?.receiver || 0) + (portsByComponent[comp.uuid]?.provider || 0),
            missingFM: missingFMByComponent[comp.uuid] || 0,
          };
        });
        componentFMstatistics.data.forEach((fm: any) => {
          if (fm.swComponentUuid && statsMap[fm.swComponentUuid]) {
            statsMap[fm.swComponentUuid].FunctionFM += 1;
            statsMap[fm.swComponentUuid].RiskRating += fm.riskRatingCount || 0;
            statsMap[fm.swComponentUuid].SafetyTask += fm.safetyTaskCount || 0;
            statsMap[fm.swComponentUuid].SafetyReq += fm.safetyReqCount || 0;
            statsMap[fm.swComponentUuid].SafetyNote += fm.safetyNoteCount || 0;
          }
        });
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
      ) : (
        <Link href={`/arxml-safety/${record.uuid}`} legacyBehavior passHref>
          <a target="_blank" rel="noopener noreferrer">{text}</a>
        </Link>
      ),
  });

  const handleSearch = (selectedKeys: string[] | number[], confirm: () => void, dataIndex: string) => {
    confirm();
    setSearchText((selectedKeys[0] as string) || '');
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters: (() => void) | undefined) => {
    clearFilters && clearFilters();
    setSearchText('');
  };

  const columns: TableProps<any>["columns"] = [
    {
      title: 'Component Name',
      dataIndex: 'name',
      key: 'name',
      ...getColumnSearchProps('name'),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    { title: 'Functional FM', dataIndex: 'FunctionFM', key: 'FunctionFM', sorter: (a, b) => a.FunctionFM - b.FunctionFM },
    { title: 'RiskRating', dataIndex: 'RiskRating', key: 'RiskRating', sorter: (a, b) => a.RiskRating - b.RiskRating },
    { title: 'SafetyTask', dataIndex: 'SafetyTask', key: 'SafetyTask', sorter: (a, b) => a.SafetyTask - b.SafetyTask },
    { title: 'SafetyReq', dataIndex: 'SafetyReq', key: 'SafetyReq', sorter: (a, b) => a.SafetyReq - b.SafetyReq },
    { title: 'SafetyNote', dataIndex: 'SafetyNote', key: 'SafetyNote', sorter: (a, b) => a.SafetyNote - b.SafetyNote },
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
      render: (count: number) => <Tag color="red">{count}</Tag>,
      sorter: (a, b) => a.missingFM - b.missingFM,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Button onClick={fetchData} loading={loading} type="default">
        Refresh
      </Button>
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