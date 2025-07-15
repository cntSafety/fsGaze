// Clean refactored safety analysis table without resizing
'use client';

import React, { useState, useEffect } from 'react';
import { message, Table, Card, Tag, Button, Space } from 'antd';
import { PlusSquareOutlined, MinusSquareOutlined } from '@ant-design/icons';
import type { ColumnType } from 'antd/es/table';
import { getApplicationSwComponents, getAppForComposition } from '../services/neo4j/queries/components';
import { getFailuresAndCountsForComponents } from '../services/neo4j/queries/safety/failureModes';
import { MESSAGES } from './utils/constants';
import Link from 'next/link';
import { getAsilColor } from '../components/asilColors';

interface SafetyStatisticRow {
  key: string;
  swComponentUuid: string;
  swComponentName: string;
  componentType?: string;
  numberOfFailureModes: number;
  asil: string;
  children?: SafetyStatisticRow[];
}

export default function ArxmlSafetyAnalysisTable() {
  const [tableData, setTableData] = useState<SafetyStatisticRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<readonly React.Key[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Step 1: Fetch all components and failure stats
      const swComponentsResult = await getApplicationSwComponents();
      if (!swComponentsResult.success || !swComponentsResult.data) {
        message.error(MESSAGES.ERROR.LOAD_FAILED);
        setLoading(false);
        return;
      }
      const allComponents = swComponentsResult.data;
      const componentUuids = allComponents.map(c => c.uuid);
      const failuresResult = await getFailuresAndCountsForComponents(componentUuids);

      // Step 2: Create a map of all component data, including their stats
      const componentDataMap = new Map<string, SafetyStatisticRow>();
      const failuresByComponent = new Map<string, any[]>();
      if (failuresResult.success && failuresResult.data) {
        for (const failure of failuresResult.data) {
          if (!failuresByComponent.has(failure.swComponentUuid)) {
            failuresByComponent.set(failure.swComponentUuid, []);
          }
          failuresByComponent.get(failure.swComponentUuid)!.push(failure);
        }
      }

      const asilOrder: { [key: string]: number } = { 'QM': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'TBC': -1 };
      const getHighestAsil = (failures: any[]): string => {
        if (!failures || failures.length === 0) return 'N/A';
        return failures.reduce((highest, current) => {
          const currentAsil = current.asil || 'TBC';
          const highestAsil = highest || 'TBC';
          if ((asilOrder[currentAsil] ?? -1) > (asilOrder[highestAsil] ?? -1)) {
            return currentAsil;
          }
          return highest;
        }, 'TBC');
      };

      for (const component of allComponents) {
        const componentFailures = failuresByComponent.get(component.uuid) || [];
        componentDataMap.set(component.uuid, {
          key: component.uuid,
          swComponentUuid: component.uuid,
          swComponentName: component.name,
          componentType: component.componentType,
          numberOfFailureModes: componentFailures.length,
          asil: getHighestAsil(componentFailures),
          children: [], // Initialize children
        });
      }

      // Step 3: Identify compositions and their children
      const containedAppUuids = new Set<string>();
      const compositionToAppsMap = new Map<string, string[]>();

      const compositionPromises = allComponents
        .filter(c => c.componentType === 'COMPOSITION_SW_COMPONENT_TYPE')
        .map(async (composition) => {
          const appsResult = await getAppForComposition(composition.uuid);
          if (appsResult.success && appsResult.data && appsResult.data.length > 0) {
            const appUuids = appsResult.data.map(app => app.uuid);
            compositionToAppsMap.set(composition.uuid, appUuids);
            appUuids.forEach(uuid => containedAppUuids.add(uuid));
          }
        });
      await Promise.all(compositionPromises);

      // Step 4: Build the final hierarchical data structure
      const topLevelRows: SafetyStatisticRow[] = [];
      for (const component of allComponents) {
        if (containedAppUuids.has(component.uuid)) {
          // This component is a child, so skip it from the top level
          continue;
        }

        const topLevelData = componentDataMap.get(component.uuid);
        if (!topLevelData) continue;

        // If it's a composition, find its children and add them
        if (compositionToAppsMap.has(component.uuid)) {
          const childUuids = compositionToAppsMap.get(component.uuid) || [];
          topLevelData.children = childUuids
            .map(uuid => componentDataMap.get(uuid))
            .filter((child): child is SafetyStatisticRow => !!child)
            .sort((a, b) => a.swComponentName.localeCompare(b.swComponentName));
        }
        topLevelRows.push(topLevelData);
      }
      
      // Step 5: Recursively clean up empty children from the entire tree
      const traverseAndClean = (nodes: SafetyStatisticRow[]) => {
        nodes.forEach(node => {
          if (node.children) {
            if (node.children.length > 0) {
              traverseAndClean(node.children);
            } else {
              delete node.children;
            }
          }
        });
      };
      traverseAndClean(topLevelRows);

      topLevelRows.sort((a, b) => a.swComponentName.localeCompare(b.swComponentName));
      setTableData(topLevelRows);

    } catch (error) {
      console.error('Error loading data:', error);
      message.error(MESSAGES.ERROR.LOAD_FAILED);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getAllExpandableKeys = (data: SafetyStatisticRow[]): React.Key[] => {
    let keys: React.Key[] = [];
    data.forEach(item => {
      if (item.children && item.children.length > 0) {
        keys.push(item.key);
        keys = keys.concat(getAllExpandableKeys(item.children));
      }
    });
    return keys;
  };

  const handleExpandAll = () => {
    const allKeys = getAllExpandableKeys(tableData);
    setExpandedKeys(allKeys);
  };

  const handleCollapseAll = () => {
    setExpandedKeys([]);
  };

  const handleExpandedRowsChange = (keys: readonly React.Key[]) => {
    setExpandedKeys([...keys]);
  };

  const columns: ColumnType<SafetyStatisticRow>[] = [
    {
      title: 'SW Component Name',
      dataIndex: 'swComponentName',
      key: 'swComponentName',
      sorter: (a, b) => a.swComponentName.localeCompare(b.swComponentName),
      render: (text: string, record: SafetyStatisticRow) => (
        <Link href={`/arxml-safety/${record.swComponentUuid}`} passHref>
          <span style={{ fontWeight: 'bold', cursor: 'pointer' }} className="ant-typography ant-typography-link">
            {text}
          </span>
        </Link>
      ),
    },
    {
      title: 'Component Type',
      dataIndex: 'componentType',
      key: 'componentType',
      width: 250,
      sorter: (a, b) => (a.componentType || '').localeCompare(b.componentType || ''),
      render: (type: string) => {
        if (!type) return '-';
        const displayType = type.replace(/_/g, ' ').replace('SW COMPONENT TYPE', '');
        let color = 'default';
        if (type.includes('COMPOSITION')) {
          color = 'gray';
        } else if (type.includes('APPLICATION')) {
          color = 'blue';
        }
        return <Tag color={color}>{displayType.trim()}</Tag>;
      },
    },
    {
      title: 'Number of Functional FM',
      dataIndex: 'numberOfFailureModes',
      key: 'numberOfFailureModes',
      width: 200,
      sorter: (a, b) => a.numberOfFailureModes - b.numberOfFailureModes,
    },
    {
      title: 'ASIL Max',
      dataIndex: 'asil',
      key: 'asil',
      width: 120,
      sorter: (a, b) => {
        const asilOrder: { [key: string]: number } = { 'QM': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'N/A': -1, 'TBC': -1 };
        const aOrder = asilOrder[a.asil as keyof typeof asilOrder] ?? -1;
        const bOrder = asilOrder[b.asil as keyof typeof asilOrder] ?? -1;
        return aOrder - bOrder;
      },
      render: (text: string) => {
        if (text === 'N/A') {
          return <span style={{ color: '#999' }}>{text}</span>;
        }
        return (
          <Tag color={getAsilColor(text)}>
            {text.toUpperCase()}
          </Tag>
        )
      },
    },
  ];

  return (
    <Card title="SW Safety Analysis Overview" variant="borderless">
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={handleExpandAll} icon={<PlusSquareOutlined />}>
          Expand All
        </Button>
        <Button onClick={handleCollapseAll} icon={<MinusSquareOutlined />}>
          Collapse All
        </Button>
      </Space>
      <Table
        bordered
        dataSource={tableData}
        columns={columns}
        pagination={false}
        loading={loading}
        scroll={{ x: 'max-content' }}
        size="small"
        expandedRowKeys={[...expandedKeys]}
        onExpandedRowsChange={handleExpandedRowsChange}
        expandable={{
          rowExpandable: (record) => !!record.children && record.children.length > 0,
        }}
      />
    </Card>
  );
}