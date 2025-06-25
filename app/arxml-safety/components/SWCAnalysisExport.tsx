import React, { useState } from 'react';
import { Button, message } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { getSafetyNodesForComponent, ComponentSafetyData } from '@/app/services/neo4j/queries/safety';

interface SWCAnalysisExportProps {
  componentUuid: string;
  componentName?: string;
}

const SWCAnalysisExport: React.FC<SWCAnalysisExportProps> = ({ 
  componentUuid, 
  componentName 
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const convertToCSV = (data: ComponentSafetyData[]): string => {
    if (data.length === 0) {
      return 'No data available';
    }

    // Define CSV headers
    const headers = [
      'Component Name',
      'Safety Note',
      'Failure Mode Name',
      'Failure Mode Description',
      'FM Note',
      'FM Task',
      'Risk Rating Name',
      'Severity',
      'Occurrence',
      'Detection',
      'Rating Comment',
      'Risk Rating Task Name',
      'Risk Rating Task Description'
    ];

    // Convert data to CSV rows
    const csvRows = data.map(row => [
      row.componentName || '',
      row.safetyNote || '',
      row.fmName || '',
      row.fmDescription || '',
      row.fmNote || '',
      row.fmTask || '',
      row.riskRatingName || '',
      row.Severity?.toString() || '',
      row.Occurrence?.toString() || '',
      row.Detection?.toString() || '',
      row.RatingComment || '',
      row.RiskRatingTaskName || '',
      row.RiskRatingTaskDescription || ''
    ]);

    // Escape CSV values (handle commas, quotes, and newlines)
    const escapeCSVValue = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.map(escapeCSVValue).join(','))
    ].join('\n');

    return csvContent;
  };

  const downloadCSV = async (csvContent: string, filename: string): Promise<void> => {
    try {
      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: 'CSV files',
                accept: {
                  'text/csv': ['.csv'],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(csvContent);
          await writable.close();
          
          console.log('CSV file saved successfully');
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('Error saving CSV file:', err);
            // Fallback to traditional download
            fallbackDownloadCSV(csvContent, filename);
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        fallbackDownloadCSV(csvContent, filename);
      }
    } catch (error) {
      console.error('Error in downloadCSV:', error);
      fallbackDownloadCSV(csvContent, filename);
    }
  };

  const fallbackDownloadCSV = (csvContent: string, filename: string): void => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (!componentUuid) {
      message.error('Component UUID is required for export');
      return;
    }

    setIsExporting(true);
    
    try {
      const result = await getSafetyNodesForComponent(componentUuid);
      
      if (result.success && result.data) {
        const csvContent = convertToCSV(result.data);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        const safeComponentName = (componentName || 'component').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `safety_analysis_${safeComponentName}_${timestamp}.csv`;
        
        await downloadCSV(csvContent, filename);
        
        message.success(`Safety analysis exported successfully! ${result.data.length} records exported.`);
      } else {
        message.error(result.message || 'Failed to export safety analysis');
      }
    } catch (error) {
      console.error('Error exporting safety analysis:', error);
      message.error('An error occurred while exporting safety analysis');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      type="primary"
      icon={<ExportOutlined />}
      onClick={handleExport}
      loading={isExporting}
      style={{ marginTop: 16 }}
    >
      Export to Table
    </Button>
  );
};

export default SWCAnalysisExport;
