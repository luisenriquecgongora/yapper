/**
 * @yapper/react
 * LocalModelCard: UI widget for downloading and managing the private on-device Whisper model.
 * Styled as a tactile letterpress postal card on cotton stationery.
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
      className={`rounded-2xl paper-card p-5 text-sm text-[#594A42] space-y-4 transition-all ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#C23B22] shadow-[0_0_6px_rgba(194,59,34,0.4)]" />
          <span className="font-serif italic font-medium text-base text-[#251C17] tracking-tight">
            On-Device Mind
          </span>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-[#8C776E] font-mono">
          {modelSize} · ~{approxMb} MB
        </span>
      </div>

      <p className="text-xs leading-relaxed text-[#736056] font-light">
        Cached gently in your browser memory via WebGPU. Your thoughts and voice stay strictly on this page — zero cloud footprint.
      </p>

      {/* Absent state */}
      {status === 'absent' && (
        <button
          type="button"
          onClick={onDownload}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#C23B22] to-[#D44A3A] hover:from-[#b0341e] hover:to-[#c23b22] text-[#FAF5EB] font-medium text-xs tracking-wide transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Download Private Model</span>
          <span className="opacity-75">({approxMb} MB)</span>
        </button>
      )}

      {/* Downloading / Loading state */}
      {isBusy && (
        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex justify-between text-xs text-[#736056]">
            <span>{status === 'downloading' ? 'Receiving neural weights...' : 'Awakening WebGPU pipeline...'}</span>
            {totalBytes > 0 && (
              <span className="font-mono">
                {toMb(loadedBytes)} / {toMb(totalBytes)} MB ({Math.round(fraction * 100)}%)
              </span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#EADFD0] overflow-hidden border border-[#D9CDBE]">
            <div
              className="h-full bg-gradient-to-r from-[#C23B22] via-[#D44A3A] to-[#D9983B] transition-all duration-200"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Ready state */}
      {status === 'ready' && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-[#A85820] font-medium flex items-center gap-1.5">
            <span className="text-sm leading-none">✦</span> Ready to listen offline
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-[#8C776E] hover:text-[#C23B22] transition-colors underline cursor-pointer"
          >
            Release cache
          </button>
        </div>
      )}
    </div>
  );
};
