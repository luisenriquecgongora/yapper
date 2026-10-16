/**
 * @yapper/react
 * LocalModelCard: UI widget for downloading and managing the private on-device Whisper model.
 * Styled in warm retro-futuristic Her aesthetic.
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
      className={`rounded-2xl border border-[rgba(227,74,59,0.2)] bg-[#1c1211]/85 p-5 text-sm text-[#D6C2B8] shadow-2xl backdrop-blur-md space-y-4 transition-all ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E34A3B] shadow-[0_0_8px_#E34A3B]" />
          <span className="font-medium text-[#FFF8F4] tracking-tight">On-Device Mind</span>
        </div>
        <span className="text-xs uppercase tracking-wider text-[#FAD2B8]/80 font-mono">
          {modelSize} · ~{approxMb} MB
        </span>
      </div>

      <p className="text-xs leading-relaxed text-[#9E8681]">
        Cached gently in your browser memory via WebGPU. Your thoughts and voice stay strictly between you and your computer.
      </p>

      {/* Absent state */}
      {status === 'absent' && (
        <button
          type="button"
          onClick={onDownload}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#E34A3B] to-[#F07167] hover:from-[#d43d2e] hover:to-[#e66359] text-[#FFF8F4] font-medium text-xs tracking-wide transition-all shadow-md hover:shadow-[0_0_15px_rgba(227,74,59,0.4)] flex items-center justify-center gap-2"
        >
          <span>Download Private Model</span>
          <span className="opacity-70">({approxMb} MB)</span>
        </button>
      )}

      {/* Downloading / Loading state */}
      {isBusy && (
        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex justify-between text-xs text-[#FAD2B8]/80">
            <span>{status === 'downloading' ? 'Receiving neural weights...' : 'Awakening WebGPU pipeline...'}</span>
            {totalBytes > 0 && (
              <span className="font-mono">
                {toMb(loadedBytes)} / {toMb(totalBytes)} MB ({Math.round(fraction * 100)}%)
              </span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#120a09] overflow-hidden border border-[rgba(227,74,59,0.15)]">
            <div
              className="h-full bg-gradient-to-r from-[#E34A3B] via-[#F07167] to-[#EBB15B] transition-all duration-200"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Ready state */}
      {status === 'ready' && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-[#EBB15B] flex items-center gap-1.5">
            <span className="text-base leading-none">✦</span> Ready to listen offline
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-[#9E8681] hover:text-[#F07167] transition-colors"
          >
            Release cache
          </button>
        </div>
      )}
    </div>
  );
};
