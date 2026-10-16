/**
 * @yapper/react
 * LocalModelCard: UI widget for downloading and managing the private on-device Whisper model.
 */

import React from 'react';
import { LocalModelDownloadProgress, ModelSize } from '@yapper/core';

export interface LocalModelCardProps {
  progress: LocalModelDownloadProgress;
  modelSize?: ModelSize;
  approxMb?: number;
  onDownload: () => void;
  onRemove: () => void;
  className?: string;
}

export const LocalModelCard: React.FC<LocalModelCardProps> = ({
  progress,
  modelSize = 'tiny',
  approxMb = 40,
  onDownload,
  onRemove,
  className = '',
}) => {
  const { status, progress: fraction, loadedBytes, totalBytes } = progress;
  const isBusy = status === 'downloading' || status === 'loading';
  const toMb = (b: number) => Math.max(1, Math.round(b / (1024 * 1024)));

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-200 shadow-xl backdrop-blur-md space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
          <span className="font-semibold text-white">Private On-Device Voice Model</span>
        </div>
        <span className="text-xs uppercase tracking-wider text-teal-400/80 font-mono">
          {modelSize} (~{approxMb} MB)
        </span>
      </div>

      <p className="text-xs text-slate-400">
        Runs 100% locally in your browser via WebGPU. Audio never leaves your computer.
      </p>

      {/* Absent state */}
      {status === 'absent' && (
        <button
          type="button"
          onClick={onDownload}
          className="w-full py-2 px-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold transition-colors flex items-center justify-center gap-2"
        >
          Download Model ({approxMb} MB)
        </button>
      )}

      {/* Downloading / Loading state */}
      {isBusy && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{status === 'downloading' ? 'Downloading weights...' : 'Initializing WebGPU pipeline...'}</span>
            {totalBytes > 0 && (
              <span>
                {toMb(loadedBytes)} / {toMb(totalBytes)} MB ({Math.round(fraction * 100)}%)
              </span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-teal-400 transition-all duration-200"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Ready state */}
      {status === 'ready' && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-emerald-400 flex items-center gap-1.5">
            ✓ Ready for offline dictation
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            Remove from cache
          </button>
        </div>
      )}
    </div>
  );
};
