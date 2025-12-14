import React, { useState, useRef } from 'react';
import { Upload, ShieldCheck, FileSpreadsheet, Layers } from 'lucide-react';
import { FileJob } from '../types';

interface FileUploadProps {
  onAddFiles: (files: File[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onAddFiles }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    // Robust check for PDF or CSV by MIME type OR extension (case-insensitive)
    const files = Array.from(fileList).filter(f => {
      const name = f.name.toLowerCase();
      const type = f.type;
      return (
        type === 'application/pdf' || 
        name.endsWith('.pdf') || 
        type === 'text/csv' || 
        name.endsWith('.csv') ||
        type === 'application/vnd.ms-excel' // Common for CSV on Windows
      );
    });
    
    if (files.length > 0) {
      onAddFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="mb-8">
      <div 
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer relative overflow-hidden ${
          isDragOver ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 hover:border-blue-500 bg-slate-900'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,.csv"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        
        <div className="w-16 h-16 bg-blue-900/30 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 relative z-10">
          <Upload size={28} />
          <div className="absolute -bottom-1 -right-1 bg-slate-800 rounded-full p-1 border border-slate-600">
             <Layers size={14} className="text-slate-400" />
          </div>
        </div>
        
        <h3 className="text-lg font-semibold text-slate-100 relative z-10">Batch Upload Bank Statements</h3>
        <p className="text-slate-400 mt-1 relative z-10">Drag and drop PDF statements or CSV files here.</p>
        
        <div className="flex items-center justify-center mt-4 text-xs text-slate-500 relative z-10">
           <ShieldCheck size={12} className="mr-1" />
           <span>Files are processed in the background. You can continue working.</span>
        </div>
      </div>
    </div>
  );
};