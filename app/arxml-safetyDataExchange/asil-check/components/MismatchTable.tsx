import React, { useState } from 'react';
import { Table, Tag, Space, Typography, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getAsilColor } from '@/app/components/asilColors';
import Link from 'next/link';

const { Text } = Typography;

export interface ASILMismatchData {
  causationUUID: string;
  causationName: string | null;
  causesFMName: string | null;
  causesFMUUID: string;
  causesFMASIL: string | null;
  causeOccuranceName: string | null;
  causeOccuranceUUID: string;
  causeOccuranceType: string;
  containingElementCauseName: string | null;
  containingElementCauseUUID: string | null;
  containingElementCauseType: string | null;
  effectsFMName: string | null;
  effectsFMUUID: string;
  effectsFMASIL: string | null;
  effectsOccuranceName: string | null;
  effectsOccuranceUUID: string;
  effectsOccuranceType: string;
  containingElementEffectName: string | null;
  containingElementEffectUUID: string | null;
  containingElementEffectType: string | null;
  asilStatus: 'MATCH' | 'LOWTOHIGH' | 'TBC' | 'OTHERMISMATCH';
}

interface MismatchTableProps {
  data: ASILMismatchData[];
  loading: boolean;
}

const MismatchTable: React.FC<MismatchTableProps> = ({ data, loading }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCausation, setSelectedCausation] = useState<ASILMismatchData | null>(null);

  const handleRowClick = (record: ASILMismatchData) => {
    setSelectedCausation(record);
    setModalVisible(true);
  };

  const isValidComponentType = (type: string | null): boolean => {
    return type === 'APPLICATION_SW_COMPONENT_TYPE' || 
           type === 'SERVICE_SW_COMPONENT_TYPE' || 
           type === 'ECU_ABSTRACTION_SW_COMPONENT_TYPE';
  };

  const columns: ColumnsType<ASILMismatchData> = [
    {
      title: 'ASIL Check',
      key: 'asilStatus',
      render: (_, record) => {
        let color = 'green';
        if (record.asilStatus === 'LOWTOHIGH') color = 'red';
        else if (record.asilStatus === 'TBC') color = 'orange';
        else if (record.asilStatus === 'OTHERMISMATCH') color = 'default';
        return <Tag color={color}>{record.asilStatus}</Tag>;
      },
      filters: [
        { text: 'Critical (Low-to-High)', value: 'LOWTOHIGH' },
        { text: 'TBC', value: 'TBC' },
        { text: 'Other Mismatch', value: 'OTHERMISMATCH' },
        { text: 'Match', value: 'MATCH' },
      ],
      onFilter: (value, record) => record.asilStatus === value,
      width: 120,
    },
    {
      title: '#',
      key: 'rowNumber',
      width: 60,
      render: (_, record, index) => (
        <Text 
          style={{ 
            cursor: 'pointer', 
            color: '#1890ff',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
          onClick={() => handleRowClick(record)}
        >
          {index + 1}
        </Text>
      ),
    },
    {
      title: 'Cause (Source)',
      key: 'cause',
      ellipsis: true,
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong>Failure Mode:</Text>
            <br />
            <Text>{record.causesFMName || 'Unnamed FM'}</Text>
          </div>
          <div>
            <Text strong>ASIL:</Text>
            <br />
            {record.causesFMASIL ? (
              <Tag style={{ background: getAsilColor(record.causesFMASIL), color: '#fff', border: 0 }}>
                {record.causesFMASIL}
              </Tag>
            ) : (
              <Tag color="default">No ASIL</Tag>
            )}
          </div>
          <div>
            <Text strong>FM occurs at:</Text>
            <br />
            {record.causeOccuranceName && isValidComponentType(record.causeOccuranceType) ? (
              <Link href={`/arxml-safety/${record.causeOccuranceUUID}`} legacyBehavior passHref>
                <a target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                  {record.causeOccuranceName}
                </a>
              </Link>
            ) : (
              <Text>{record.causeOccuranceName || 'Unnamed'}</Text>
            )}
            <br />
            <Tag color="blue">{record.causeOccuranceType}</Tag>
          </div>
          {record.containingElementCauseName && isValidComponentType(record.containingElementCauseType) && (
            <div>
              <Text strong>Component:</Text>
              <br />
              <Link href={`/arxml-safety/${record.containingElementCauseUUID}`} legacyBehavior passHref>
                <a target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                  {record.containingElementCauseName}
                </a>
              </Link>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Effect (Target)',
      key: 'effect',
      ellipsis: true,
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong>Failure Mode:</Text>
            <br />
            <Text>{record.effectsFMName || 'Unnamed FM'}</Text>
          </div>
          <div>
            <Text strong>ASIL:</Text>
            <br />
            {record.effectsFMASIL ? (
              <Tag style={{ background: getAsilColor(record.effectsFMASIL), color: '#fff', border: 0 }}>
                {record.effectsFMASIL}
              </Tag>
            ) : (
              <Tag color="default">No ASIL</Tag>
            )}
          </div>
          <div>
            <Text strong>FM occurs at:</Text>
            <br />
            {record.effectsOccuranceName && isValidComponentType(record.effectsOccuranceType) ? (
              <Link href={`/arxml-safety/${record.effectsOccuranceUUID}`} legacyBehavior passHref>
                <a target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                  {record.effectsOccuranceName}
                </a>
              </Link>
            ) : (
              <Text>{record.effectsOccuranceName || 'Unnamed'}</Text>
            )}
            <br />
            <Tag color="blue">{record.effectsOccuranceType}</Tag>
          </div>
          {record.containingElementEffectName && isValidComponentType(record.containingElementEffectType) && (
            <div>
              <Text strong>Component:</Text>
              <br />
              <Link href={`/arxml-safety/${record.containingElementEffectUUID}`} legacyBehavior passHref>
                <a target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                  {record.containingElementEffectName}
                </a>
              </Link>
            </div>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="causationUUID"
        pagination={false}
        scroll={{ x: 1200 }}
        size="middle"
      />
      
      <Modal
        title="Causation Details"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={500}
      >
        {selectedCausation && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text strong>Causation Name:</Text>
              <br />
              <Text>{selectedCausation.causationName || 'Unnamed Causation'}</Text>
            </div>
            <div>
              <Text strong>Causation UUID:</Text>
              <br />
              <Text code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                {selectedCausation.causationUUID}
              </Text>
            </div>
            <div>
              <Text strong>ASIL Check:</Text>
              <br />
              <Tag color={
                selectedCausation.asilStatus === 'LOWTOHIGH' ? 'red' :
                selectedCausation.asilStatus === 'TBC' ? 'orange' :
                selectedCausation.asilStatus === 'OTHERMISMATCH' ? 'default' :
                'green'
              }>
                {selectedCausation.asilStatus}
              </Tag>
            </div>
          </Space>
        )}
      </Modal>
    </>
  );
};

export default MismatchTable; 