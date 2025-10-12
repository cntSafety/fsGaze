"use client";

import React, { useState } from 'react';
import { Button, message } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

const SafetyReportSphinx: React.FC = () => {
	const [generating, setGenerating] = useState(false);

	const handleGenerateSphinxNeeds = async (): Promise<void> => {
		try {
			setGenerating(true);
			message.info('Generating Sphinx-Needs safety report and preparing download...');

			const response = await fetch('/api/safety/sphinx-needs-report', {
				method: 'POST',
			});

			if (!response.ok) {
				let errorMessage = `Request failed with status ${response.status}`;
				try {
					const errorBody = await response.json();
					errorMessage = errorBody?.message ?? errorMessage;
				} catch (parseError) {
					// Swallow JSON parse errors; keep default message
				}
				throw new Error(errorMessage);
			}

			const blob = await response.blob();
			if (blob.size === 0) {
				throw new Error('Received empty export file.');
			}

			const contentDisposition = response.headers.get('Content-Disposition');
			let filename = 'sphinx-needs-export.zip';
			if (contentDisposition) {
				const match = contentDisposition.match(/filename="?([^";]+)"?/i);
				if (match?.[1]) {
					filename = match[1];
				}
			}

			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);

			message.success('Sphinx-Needs project exported as ZIP file.');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			message.error(`Failed to generate Sphinx-Needs project: ${errorMessage}`);
		} finally {
			setGenerating(false);
		}
	};

	return (
		<Button
			type="primary"
			icon={<FileTextOutlined />}
			onClick={handleGenerateSphinxNeeds}
			loading={generating}
			disabled={generating}
		>
			Generate Sphinx-Needs Project
		</Button>
	);
};

export default SafetyReportSphinx;
