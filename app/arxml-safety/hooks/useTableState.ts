// Custom hook for managing table state and operations
import { useState, useCallback } from 'react';
import { Form, message } from 'antd';
import { SafetyTableRow } from '../types';
import { DEFAULT_PAGE_SIZE, MESSAGES } from '../utils/constants';

export const useTableState = () => {
  const [form] = Form.useForm();
  const [editingKey, setEditingKey] = useState('');
  const [isAddingFailure, setIsAddingFailure] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const edit = useCallback((record: SafetyTableRow) => {
    form.setFieldsValue({
      ...record,
      failureName: record.failureName === 'No failures defined' ? '' : record.failureName,
      failureDescription: record.failureDescription === '-' ? '' : record.failureDescription,
      asil: record.asil === '-' ? 'TBC' : record.asil,
    });
    setEditingKey(record.key);
  }, [form]);

  const cancel = useCallback(() => {
    setEditingKey('');
    form.resetFields();
  }, [form]);

  const startSaving = useCallback(() => {
    setIsAddingFailure(true);
  }, []);

  const stopSaving = useCallback(() => {
    setIsAddingFailure(false);
  }, []);

  const resetEditing = useCallback(() => {
    setEditingKey('');
    form.resetFields();
  }, [form]);

  const handlePageChange = useCallback((page: number, size?: number) => {
    if (editingKey !== '') {
      cancel();
    }
    setCurrentPage(page);
    if (size && size !== pageSize) {
      setPageSize(size);
    }
  }, [editingKey, cancel, pageSize]);

  const handlePageSizeChange = useCallback((current: number, size: number) => {
    if (editingKey !== '') {
      cancel();
    }
    setCurrentPage(1); // Reset to first page when changing page size
    setPageSize(size);
  }, [editingKey, cancel]);

  const validateFields = useCallback(async (): Promise<SafetyTableRow | null> => {
    try {
      const row = await form.validateFields();
      return row as SafetyTableRow;
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
      message.error(MESSAGES.ERROR.SAVE_FAILED);
      return null;
    }
  }, [form]);
  return {
    form,
    editingKey,
    isAddingFailure,
    currentPage,
    pageSize,
    edit,
    cancel,
    startSaving,
    stopSaving,
    resetEditing,
    handlePageChange,
    handlePageSizeChange,
    validateFields,
    setEditingKey,
  };
};
