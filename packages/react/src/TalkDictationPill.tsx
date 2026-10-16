/**
 * @yapper/react
 * Floating push-to-talk dictation pill showing audio level meter and live running text.
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

const BAR_WEIGHTS = [0.6, 0.85, 1, 0.85, 0.6];

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
      className={`fixed z-50 bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-full bg-slate-900/90 text-white backdrop-blur-xl border border-teal-500/40 shadow-2xl max-w-[90vw] animate-in fade-in slide-in-from-bottom-2 ${className}`}
    >
      {/* Icon badge */}
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-teal-500/20 text-teal-400 shrink-0">
        {isTranscribing ? (
          <span className="w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
        )}
      </span>

      {/* Audio levels */}
      {isRecording && (
        <span className="flex items-center gap-[3px] h-5" aria-hidden="true">
          {BAR_WEIGHTS.map((weight, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-teal-400 transition-all duration-75"
              style={{
                height: `${Math.max(15, Math.min(100, audioLevel * weight * 150))}%`,
              }}
            />
          ))}
        </span>
      )}

      {/* Text / Live transcript preview */}
      <div className="flex flex-col min-w-0 pr-2 max-w-xs">
        <span className="text-xs font-semibold text-slate-200 truncate">
          {isRecording ? (interimText ? interimText : 'Listening...') : 'Transcribing...'}
        </span>
        <span className="text-[10px] text-slate-400">
          via {engine === 'local' ? 'On-Device Whisper' : engine === 'browser' ? 'Browser Speech' : 'Cloud'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {isRecording && onStop && (
          <button
            type="button"
            onClick={onStop}
            className="text-xs px-2.5 py-1 rounded-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-medium transition-colors"
          >
            Done
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-2 py-1 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
