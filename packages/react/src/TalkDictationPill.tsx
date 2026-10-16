/**
 * @yapper/react
 * Floating push-to-talk dictation pill showing audio level meter and live running text.
 * Warm Her retro-futuristic aesthetic.
 */

import React from 'react';
import { TalkStatus, VoiceEngine } from '@yapper/core';

export interface TalkDictationPillProps {
  status: TalkStatus;
  engine: VoiceEngine;
  audioLevel?: number;
  interimText?: string;
  onStop?: () => void;
  onCancel?: () => void;
  className?: string;
}

const BAR_WEIGHTS = [0.55, 0.85, 1, 0.85, 0.55];

export const TalkDictationPill: React.FC<TalkDictationPillProps> = ({
  status,
  engine,
  audioLevel = 0,
  interimText = '',
  onStop,
  onCancel,
  className = '',
}) => {
  if (status === 'idle') return null;

  const isRecording = status === 'listening';
  const isTranscribing = status === 'transcribing';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed z-50 bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-full bg-[#1c1211]/92 text-[#FFF8F4] backdrop-blur-xl border border-[rgba(227,74,59,0.35)] shadow-[0_10px_35px_rgba(227,74,59,0.25)] max-w-[90vw] animate-in fade-in slide-in-from-bottom-2 transition-all ${className}`}
    >
      {/* Icon badge */}
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#E34A3B]/20 text-[#F07167] shrink-0">
        {isTranscribing ? (
          <span className="w-3.5 h-3.5 border-2 border-[#EBB15B] border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full bg-[#E34A3B] animate-pulse shadow-[0_0_8px_#E34A3B]" />
        )}
      </span>

      {/* Audio levels */}
      {isRecording && (
        <span className="flex items-center gap-[3px] h-5" aria-hidden="true">
          {BAR_WEIGHTS.map((weight, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-gradient-to-t from-[#E34A3B] to-[#FAD2B8] transition-all duration-75"
              style={{
                height: `${Math.max(15, Math.min(100, audioLevel * weight * 160))}%`,
              }}
            />
          ))}
        </span>
      )}

      {/* Text / Live transcript preview */}
      <div className="flex flex-col min-w-0 pr-2 max-w-xs">
        <span className="text-xs font-serif italic text-[#FFF8F4] truncate tracking-wide">
          {isRecording ? (interimText ? `"${interimText}"` : 'Listening gently...') : 'Refining words...'}
        </span>
        <span className="text-[10px] text-[#9E8681]">
          {engine === 'local' ? 'On-Device Whisper' : engine === 'browser' ? 'Browser Speech' : 'Cloud'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pl-1">
        {isRecording && onStop && (
          <button
            type="button"
            onClick={onStop}
            className="text-xs px-3 py-1 rounded-full bg-[#E34A3B] hover:bg-[#F07167] text-[#FFF8F4] font-medium transition-colors shadow-sm"
          >
            Done
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-2 py-1 rounded-full text-[#9E8681] hover:text-[#FFF8F4] transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
