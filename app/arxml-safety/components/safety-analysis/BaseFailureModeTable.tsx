import React from 'react';
import { Card, Typography } from 'antd';
import CoreSafetyTable, { SafetyTableColumn, SafetyTableRow } from '../CoreSafetyTable';
import { RiskRatingManager } from './RiskRatingManager';
import { SafetyTaskManager } from './SafetyTaskManager';
import SafetyReqManager from './SafetyReqManager';
import type { FormInstance } from 'antd/es/form';
import type { TableProps } from 'antd/es/table';

const { Title } = Typography;

interface BaseFailureModeTableProps {
  title: string | React.ReactNode;
  dataSource: SafetyTableRow[];
  columns: SafetyTableColumn[];
  loading?: boolean;
  editingKey: string;
  onEdit?: (record: SafetyTableRow) => void;
  onSave?: (key: React.Key) => Promise<void>;
  onCancel?: () => void;
  onAdd?: (swComponentUuid: string, swComponentName: string) => void;
  onDelete?: (record: SafetyTableRow) => Promise<void>;
  isSaving?: boolean;
  showComponentActions?: boolean;
  form?: FormInstance;
  onFailureSelect?: (failure: { uuid: string; name: string }) => void;
  selectedFailures?: {
    first: { uuid: string; name: string } | null;
    second: { uuid: string; name: string } | null;
  };
  pagination?: false | TableProps<SafetyTableRow>['pagination'];
  emptyStateConfig: {
    primaryMessage: string;
    secondaryMessage?: string;
    itemsList?: string[];
  };
  onSafetyTaskClick?: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>;
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
}

export const BaseFailureModeTable: React.FC<BaseFailureModeTableProps> = ({
  title,
  dataSource,
  columns,
  loading = false,
  editingKey,
  onEdit,
  onSave,
  onCancel,
  onAdd,
  onDelete,
  isSaving = false,
  showComponentActions = true,
  form,
  onFailureSelect,
  selectedFailures,
  pagination,
  emptyStateConfig,
  onSafetyTaskClick,
  getFailureSelectionState,
  handleFailureSelection,
  isCauseSelected,
}) => {  return (
    <RiskRatingManager>
      {({ handleRiskRatingClick }) => (
        <SafetyTaskManager>
          {({ handleSafetyTaskClick }) => (
            <SafetyReqManager>
              {({ handleSafetyReqClick }) => (
                <Card style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    {typeof title === 'string' ? (
                      <Title level={4} style={{ margin: 0 }}>
                        {title}
                      </Title>
                    ) : (
                      title
                    )}
                  </div>
              
              {dataSource.length > 0 ? (
                <CoreSafetyTable
                  dataSource={dataSource}
                  columns={columns}
                  loading={loading}
                  editingKey={editingKey}
                  onEdit={onEdit}
                  onSave={onSave}
                  onCancel={onCancel}
                  onAdd={onAdd}
                  onDelete={onDelete}                  onRiskRatingClick={handleRiskRatingClick}
                  onSafetyTaskClick={onSafetyTaskClick || handleSafetyTaskClick}
                  onSafetyReqClick={handleSafetyReqClick}
                  isSaving={isSaving}
                  showComponentActions={showComponentActions}
                  form={form}
                  onFailureSelect={onFailureSelect}
                  selectedFailures={selectedFailures}
                  pagination={pagination}
                  getFailureSelectionState={getFailureSelectionState}
                  handleFailureSelection={handleFailureSelection}
                  isCauseSelected={isCauseSelected}
                />
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px',
                  backgroundColor: '#fafafa',
                  borderRadius: '8px'
                }}>
                  <Typography.Text type="secondary" style={{ fontSize: '16px' }}>
                    {emptyStateConfig.primaryMessage}
                  </Typography.Text>
                  {emptyStateConfig.secondaryMessage && (
                    <>
                      <br />
                      <Typography.Text type="secondary" style={{ fontSize: '14px', marginTop: '8px' }}>
                        {emptyStateConfig.secondaryMessage}
                      </Typography.Text>
                    </>
                  )}
                  {emptyStateConfig.itemsList && emptyStateConfig.itemsList.length > 0 && (
                    <>
                      <br />
                      <Typography.Text type="secondary" style={{ fontSize: '14px', marginTop: '8px' }}>
                        {emptyStateConfig.itemsList.join(', ')}
                      </Typography.Text>
                    </>
                  )}                </div>
              )}
            </Card>
              )}
            </SafetyReqManager>
          )}
        </SafetyTaskManager>
      )}
    </RiskRatingManager>
  );
};
