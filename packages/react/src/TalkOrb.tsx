/**
 * @yapper/react
 * Audio-reactive glowing orb visualizer.
 */

import React from 'react';

export interface TalkOrbProps {
  isListening: boolean;
  isProcessing: boolean;
  audioLevel?: number;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

export const TalkOrb: React.FC<TalkOrbProps> = ({
  isListening,
  isProcessing,
  audioLevel = 0,
  size = 'md',
  onClick,
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-16 h-16',
    md: 'w-32 h-32',
    lg: 'w-48 h-48',
  };

  const scale = isListening ? 1 + audioLevel * 0.35 : 1;
  const glow = isListening ? 25 + audioLevel * 50 : 15;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`relative ${sizeMap[size]} rounded-full flex items-center justify-center cursor-pointer select-none transition-transform duration-75 ${className}`}
      style={{
        transform: `scale(${scale})`,
      }}
    >
      {/* Outer ambient blur */}
      <div
        className="absolute inset-0 rounded-full blur-2xl transition-opacity duration-300"
        style={{
          background: isListening
            ? 'radial-gradient(circle, #ef4444, #14b8a6)'
            : 'radial-gradient(circle, #14b8a6, #6366f1)',
          opacity: isListening ? 0.6 : 0.25,
        }}
      />

      {/* Pulsing ring during processing */}
      {isProcessing && (
        <div
          className="absolute inset-[-8px] rounded-full border-2 border-dashed border-teal-400/60 animate-spin"
          style={{ animationDuration: '3s' }}
        />
      )}

      {/* Audio reactive outline */}
      {isListening && (
        <div
          className="absolute inset-[-4px] rounded-full border border-red-500/50 transition-all duration-75"
          style={{
            transform: `scale(${1 + audioLevel * 0.2})`,
            opacity: 0.3 + audioLevel * 0.5,
          }}
        />
      )}

      {/* Center core */}
      <div
        className="relative w-3/4 h-3/4 rounded-full flex items-center justify-center shadow-lg transition-all duration-150"
        style={{
          background: isListening
            ? 'linear-gradient(135deg, #ef4444, #f97316)'
            : 'linear-gradient(135deg, #14b8a6, #3b82f6)',
          boxShadow: `0 0 ${glow}px ${isListening ? 'rgba(239, 68, 68, 0.6)' : 'rgba(20, 184, 166, 0.4)'}`,
        }}
      >
        <svg
          className="w-8 h-8 text-white fill-current"
          viewBox="0 0 24 24"
        >
          {isProcessing ? (
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          ) : isListening ? (
            <rect x="6" y="6" width="12" height="12" rx="2" />
          ) : (
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM5 10v2a7 7 0 0 0 14 0v-2h-2v2a5 5 0 0 1-10 0v-2H5zm6 11v-2.06A7.002 7.002 0 0 0 19 12h2a9 9 0 0 1-8 8.94V23h-2v-2z" />
          )}
        </svg>
      </div>
    </div>
  );
};
