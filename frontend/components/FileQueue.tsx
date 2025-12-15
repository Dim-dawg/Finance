import React from 'react';
import { FileJob } from '../types';
import { Loader, CheckCircle, XCircle, FileText, Minimize2, Maximize2 } from 'lucide-react';

interface FileQueueProps {
  queue: FileJob[];
  clearCompleted: () => void;
}

export const FileQueue: React.FC<FileQueueProps> = ({ queue, clearCompleted }) => {
  const [minimized, setMinimized] = React.useState(false);

  if (queue.length === 0) return null;

  const pendingCount = queue.filter(j => j.status === 'queued' || j.status === 'processing').length;

  if (minimized) {
    return (
      <div className="fixed bottom-4 left-4 bg-slate-900 shadow-lg rounded-lg p-3 border border-slate-700 z-50 flex items-center space-x-3 cursor-pointer hover:bg-slate-800" onClick={() => setMinimized(false)}>
        {pendingCount > 0 ? (
          <Loader className="animate-spin text-blue-500" size={20} />
        ) : (
          <CheckCircle className="text-green-500" size={20} />
        )}
        <span className="font-medium text-sm text-slate-200">
          {pendingCount > 0 ? `${pendingCount} Files Processing` : 'Uploads Complete'}
        </span>
        <Maximize2 size={14} className="text-slate-400" />
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 w-80 bg-slate-900 shadow-xl rounded-xl border border-slate-700 z-50 overflow-hidden flex flex-col max-h-[400px]">
      <div className="bg-slate-800 p-3 border-b border-slate-700 flex justify-between items-center">
        <h4 className="font-semibold text-sm text-slate-200 flex items-center">
          {pendingCount > 0 ? (
            <><Loader className="animate-spin text-blue-500 mr-2" size={14} /> Processing Queue ({pendingCount})</>
          ) : (
             <><CheckCircle className="text-green-500 mr-2" size={14} /> All Tasks Complete</>
          )}
        </h4>
        <div className="flex space-x-2">
           <button onClick={() => setMinimized(true)} className="text-slate-400 hover:text-slate-200">
             <Minimize2 size={14} />
           </button>
        </div>
      </div>
      
      <div className="overflow-y-auto p-2 space-y-2 flex-1">
        {queue.map(job => (
           <div key={job.id} className="flex items-center p-2 rounded-lg border border-slate-700 bg-slate-900 text-sm">
             <div className="mr-3 text-slate-500">
               <FileText size={16} />
             </div>
             <div className="flex-1 min-w-0">
               <div className="font-medium text-slate-200 truncate">{job.file.name}</div>
               <div className="text-xs text-slate-400">
                  {job.status === 'queued' && 'Waiting...'}
                  {job.status === 'processing' && <span className="text-blue-500">Analyzing with Gemini...</span>}
                  {job.status === 'completed' && <span className="text-green-500">Extracted {job.resultCount} txns</span>}
                  {job.status === 'error' && <span className="text-red-400">{job.error}</span>}
               </div>
             </div>
             <div className="ml-2">
                {job.status === 'processing' && <Loader className="animate-spin text-blue-500" size={16} />}
                {job.status === 'completed' && <CheckCircle className="text-green-500" size={16} />}
                {job.status === 'error' && <XCircle className="text-red-400" size={16} />}
             </div>
           </div>
        ))}
      </div>

      {queue.some(j => j.status === 'completed' || j.status === 'error') && (
        <div className="p-2 border-t border-slate-700 bg-slate-800 text-center">
           <button onClick={clearCompleted} className="text-xs text-slate-400 hover:text-blue-400 font-medium">
             Clear Completed
           </button>
        </div>
      )}
    </div>
  );
};