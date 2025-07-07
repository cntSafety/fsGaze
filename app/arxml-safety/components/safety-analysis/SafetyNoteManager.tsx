'use client';

import React, { useState, useEffect } from 'react';
import { Button, Modal, Input, message, Tooltip, Space, Typography, Card } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, FileTextOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { 
  createSafetyNote, 
  updateSafetyNote, 
  deleteSafetyNote, 
  getSafetyNotesForNode 
} from '@/app/services/ArxmlToNeoService';
import { SafetyNote } from './types';

const { TextArea } = Input;
const { Text } = Typography;

interface SafetyNoteManagerProps {
  nodeUuid: string;
  nodeType: string;
  nodeName: string;
  showInline?: boolean;
  onNotesUpdate?: () => void;
}

export default function SafetyNoteManager({ 
  nodeUuid, 
  nodeType, 
  nodeName,
  showInline = false,
  onNotesUpdate,
}: SafetyNoteManagerProps) {
  const [safetyNotes, setSafetyNotes] = useState<SafetyNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<SafetyNote | null>(null);
  const [noteText, setNoteText] = useState('');

  // Load safety notes on component mount
  useEffect(() => {
    loadSafetyNotes();
  }, [nodeUuid]);

  const loadSafetyNotes = async () => {
    try {
      const result = await getSafetyNotesForNode(nodeUuid);

      if (result.success && result.data) {
        setSafetyNotes(result.data);
      } else {
        setSafetyNotes([]);
      }
    } catch (error) {
      console.error('Error loading safety notes:', error);
      setSafetyNotes([]);
    }
  };

  const handleAddNote = () => {
    setEditingNote(null);
    setNoteText('');
    setModalVisible(true);
  };

  const handleEditNote = (note: SafetyNote) => {
    setEditingNote(note);
    setNoteText(note.note);
    setModalVisible(true);
  };

  const handleDeleteNote = async (note: SafetyNote) => {
    Modal.confirm({
      title: 'Delete Safety Note',
      content: 'Are you sure you want to delete this safety note? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true);
          const result = await deleteSafetyNote(note.uuid);
          if (result.success) {
            message.success('Safety note deleted successfully');
            await loadSafetyNotes();
            if (onNotesUpdate) onNotesUpdate();
          } else {
            message.error(result.message || 'Failed to delete safety note');
          }
        } catch (error) {
          message.error('Error deleting safety note');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      message.error('Please enter a note');
      return;
    }

    try {
      setLoading(true);
      let result;

      if (editingNote) {
        // Update existing note
        result = await updateSafetyNote(editingNote.uuid, noteText);
      } else {
        // Create new note
        result = await createSafetyNote(nodeUuid, noteText);
      }

      if (result.success) {
        message.success(editingNote ? 'Safety note updated successfully' : 'Safety note created successfully');
        setModalVisible(false);
        setNoteText('');
        setEditingNote(null);
        await loadSafetyNotes();
        if (onNotesUpdate) onNotesUpdate();
      } else {
        message.error(result.message || 'Failed to save safety note');
      }
    } catch (error) {
      message.error('Error saving safety note');
    } finally {
      setLoading(false);
    }
  };

  const renderNoteControls = () => {
    // When showing inline, don't show controls here (they're handled in renderInlineNotes)
    if (showInline) return null;
    
    // For modal mode (showInline=false), always show the interface
    return (
      <div>
        {/* Add Note Button */}
        <div style={{ marginBottom: safetyNotes.length > 0 ? '16px' : '0' }}>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAddNote}
            size="small"
          >
            Add New Note
          </Button>
        </div>
        
        {/* Existing Notes List for Modal Mode */}
        {safetyNotes.length > 0 && (
          <div>
            <Text strong style={{ marginBottom: '8px', display: 'block' }}>
              Existing Notes ({safetyNotes.length}):
            </Text>
            {safetyNotes.map((note, index) => (
              <Card 
                key={note.uuid}
                size="small"
                style={{ 
                  marginBottom: index < safetyNotes.length - 1 ? '8px' : '0',
                }}
                actions={[
                  <Button 
                    key="edit"
                    type="link" 
                    icon={<EditOutlined />} 
                    onClick={() => handleEditNote(note)}
                    size="small"
                  >
                    Edit
                  </Button>,
                  <Button 
                    key="delete"
                    type="link" 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleDeleteNote(note)}
                    size="small"
                    danger
                  >
                    Delete
                  </Button>
                ]}
              >
                <Text>{note.note}</Text>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ClockCircleOutlined style={{ color: '#8c8c8c', fontSize: '12px' }} />
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                            Created: {note.created ? new Date(note.created).toLocaleString() : 'N/A'}
                        </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <EditOutlined style={{ color: '#8c8c8c', fontSize: '12px' }} />
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                            Modified: {note.lastModified ? new Date(note.lastModified).toLocaleString() : 'N/A'}
                        </Text>
                    </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };
  const renderInlineNotes = () => {
    if (!showInline) return null;

    return (
      <div style={{ marginTop: '8px' }}>
        {safetyNotes.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text type="secondary" style={{ fontSize: '14px' }}>No safety notes</Text>
            <Tooltip title="Add safety note">
              <Button 
                type="link" 
                icon={<PlusOutlined />} 
                onClick={handleAddNote}
                size="small"
                style={{ 
                  padding: '0', 
                  minWidth: 'auto', 
                  height: 'auto',
                  color: '#52c41a'
                }}
              />
            </Tooltip>
          </div>
        ) : (
          <>
            {safetyNotes.map((note, index) => (
              <div 
                key={note.uuid}
                style={{ 
                  marginBottom: index < safetyNotes.length - 1 ? '4px' : '0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}
              >
                <Text style={{ flex: 1 }}>{note.note}</Text>
                <Space size="small">
                  <Button 
                    type="link" 
                    icon={<EditOutlined />} 
                    onClick={() => handleEditNote(note)}
                    size="small"
                    style={{ padding: '0', minWidth: 'auto', height: 'auto' }}
                  />
                  <Button 
                    type="link" 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleDeleteNote(note)}
                    size="small"
                    danger
                    style={{ padding: '0', minWidth: 'auto', height: 'auto' }}
                  />
                </Space>
              </div>
            ))}
            {/* Add button for additional notes */}
            <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'flex-start' }}>
              <Tooltip title="Add another safety note">
                <Button 
                  type="link" 
                  icon={<PlusOutlined />} 
                  onClick={handleAddNote}
                  size="small"
                  style={{ 
                    padding: '0', 
                    minWidth: 'auto', 
                    height: 'auto',
                    color: '#52c41a'
                  }}
                />
              </Tooltip>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {renderNoteControls()}
      {renderInlineNotes()}
      
      <Modal
        title={editingNote ? 'Edit Safety Note' : 'Add Safety Note'}
        open={modalVisible}
        onOk={handleSaveNote}
        onCancel={() => {
          setModalVisible(false);
          setNoteText('');
          setEditingNote(null);
        }}
        confirmLoading={loading}
        width={600}
      >
        <div style={{ marginBottom: '16px' }}>
          <Text strong>Node: </Text>
          <Text>{nodeName}</Text>
          <br />
          <Text strong>Type: </Text>
          <Text>{nodeType}</Text>
        </div>
        
        <TextArea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Enter your safety note here..."
          rows={6}
          maxLength={2000}
          showCount
          style={{ marginBottom: '20px' }}
        />
      </Modal>
    </>
  );
}
