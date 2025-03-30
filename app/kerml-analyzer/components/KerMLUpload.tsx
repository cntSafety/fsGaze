"use client";

import React, { useState } from "react";
import axios from "axios";

const KerMLUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    // Allow any file type for KerML analysis
    setFile(selectedFile);
    setError(null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post("/api/kerml/analyze", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      // Process the response data
      const processedResult = {
        filename: file.name,
        analysis: {
          nodeCount: response.data.results ? response.data.results.length : 0,
          fileSizeFormatted: formatFileSize(file.size),
          timestamp: new Date().toISOString(),
          results: response.data.results || [],
        },
      };

      setResult(processedResult);
    } catch (err: any) {
      console.error("Error uploading file:", err);
      if (err.response?.status === 404) {
        setError(
          "API endpoint not found. Please check if the server is running correctly."
        );
      } else {
        setError(err.response?.data?.error || "Failed to upload file");
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
      <h2 className="text-2xl font-bold mb-4 dark:text-white">
        KerML File Upload
      </h2>
      <p className="mb-6 text-gray-600 dark:text-gray-300">
        Upload a KerML file
      </p>

      <form onSubmit={handleUpload} className="space-y-4">
        <div className="relative">
          <input
            type="file"
            onChange={handleFileChange}
            id="kerml-file-input"
            className="sr-only"
          />
          <label
            htmlFor="kerml-file-input"
            className="flex items-center justify-center w-full px-3 py-2 border border-gray-300 rounded-md cursor-pointer bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-white text-gray-800 text-sm font-medium transition-colors duration-200 overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {file ? file.name : "Choose KerML file"}
            <svg className="ml-2 size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </label>
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="flex items-center justify-center w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 text-sm font-medium disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {loading ? "Upload..." : "Upload File"}
          <svg className="ml-2 size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-800 rounded-md dark:bg-red-900 dark:text-red-200">
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 p-5 bg-blue-50 rounded-md dark:bg-blue-900 dark:text-blue-100">
          <h3 className="text-xl font-semibold mb-4">
            Analysis Results for {result.filename}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-white rounded-md shadow-sm dark:bg-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Number of Results
              </p>
              <p className="text-2xl font-bold">{result.analysis.nodeCount}</p>
            </div>

            <div className="p-4 bg-white rounded-md shadow-sm dark:bg-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                File Size
              </p>
              <p className="text-2xl font-bold">
                {result.analysis.fileSizeFormatted}
              </p>
            </div>

            <div className="p-4 bg-white rounded-md shadow-sm dark:bg-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Analyzed at
              </p>
              <p className="text-lg font-medium">
                {new Date(result.analysis.timestamp).toLocaleString()}
              </p>
            </div>
          </div>

          <h4 className="text-lg font-semibold mb-3">Detailed Results:</h4>
          <div className="space-y-2">
            {result.analysis.results.map((item: any, index: number) => (
              <div
                key={index}
                className={`p-3 rounded-md flex items-start gap-3 ${
                  item.type === "info"
                    ? "bg-blue-100 border-l-4 border-blue-500 dark:bg-blue-800"
                    : item.type === "warning"
                    ? "bg-yellow-100 border-l-4 border-yellow-500 dark:bg-yellow-800"
                    : "bg-red-100 border-l-4 border-red-500 dark:bg-red-800"
                }`}
              >
                <span className="font-bold text-xs uppercase">
                  {item.type}:
                </span>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 p-5 bg-gray-100 rounded-md dark:bg-gray-700">
        <h3 className="text-lg font-semibold mb-2 dark:text-white">
          API Usage
        </h3>
        <p className="mb-3 text-gray-600 dark:text-gray-300">
          This feature is also available via REST API, see{" "}
          <a
            href="/api-docs"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            api-docs
          </a>
        </p>
      </div>
    </div>
  );
};

export default KerMLUpload;
