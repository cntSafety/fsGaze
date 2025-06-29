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
  scroll?: TableProps<SafetyTableRow>['scroll'];
  emptyStateConfig: {
    primaryMessage: string;
    secondaryMessage?: string;
    itemsList?: string[];
  };
  onSafetyTaskClick?: (failureUuid: string, failureName: string, failureDescription?: string) => Promise<void>;
  getFailureSelectionState?: (failureUuid: string) => 'first' | 'second' | null;
  handleFailureSelection?: (failureUuid: string, failureName: string, sourceType: 'component' | 'provider-port' | 'receiver-port', componentUuid?: string, componentName?: string) => void | Promise<void>;
  isCauseSelected?: boolean;
  refreshData?: () => void;
}

export const BaseFailureModeTable: React.FC<BaseFailureModeTableProps> =
  ({
    title,
    dataSource,
    columns,
    loading,
    editingKey,
    onEdit,
    onSave,
    onCancel,
    onAdd,
    onDelete,
    isSaving,
    showComponentActions,
    form,
    onFailureSelect,
    selectedFailures,
    pagination,
    scroll,
    emptyStateConfig,
    onSafetyTaskClick,
    getFailureSelectionState,
    handleFailureSelection,
    isCauseSelected,
    refreshData,
  }) => {
    return (
      <RiskRatingManager onSaveSuccess={refreshData}>
        {({ handleRiskRatingClick }) => (
          <SafetyTaskManager onSaveSuccess={refreshData}>
            {({ handleSafetyTaskClick }) => (
              <SafetyReqManager onSaveSuccess={refreshData}>
                {({ handleSafetyReqClick }) => (
                  <Card style={{ marginTop: '24px' }} className="base-failure-mode-table-card">
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
                        onDelete={onDelete}
                        onRiskRatingClick={handleRiskRatingClick}
                        onSafetyTaskClick={onSafetyTaskClick || handleSafetyTaskClick}
                        onSafetyReqClick={handleSafetyReqClick}
                        isSaving={isSaving}
                        showComponentActions={showComponentActions}
                        form={form}
                        onFailureSelect={onFailureSelect}
                        selectedFailures={selectedFailures}
                        pagination={pagination}
                        scroll={scroll}
                        getFailureSelectionState={getFailureSelectionState}
                        handleFailureSelection={handleFailureSelection}
                        isCauseSelected={isCauseSelected}
                        refreshData={refreshData}
                      />
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '40px',
                        borderRadius: '8px'
                      }}>
                        <Typography.Text type="secondary" style={{ fontSize: '16px' }}>
                          {emptyStateConfig.primaryMessage}
                        </Typography.Text>
                        <br />
                        {emptyStateConfig.secondaryMessage && (
                           <>
                             <br />
                             <Typography.Text type="secondary">
                               {emptyStateConfig.secondaryMessage}
                             </Typography.Text>
                           </>
                        )}
                      </div>
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