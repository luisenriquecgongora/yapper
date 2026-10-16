/**
 * @yapper/react
 * Audio-reactive glowing orb visualizer.
 * Inspired by the warm, intimate retro-futuristic aesthetic of the film "Her".
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
    sm: 'w-20 h-20',
    md: 'w-36 h-36',
    lg: 'w-52 h-52',
  };

  const scale = isListening ? 1 + audioLevel * 0.35 : 1;
  const glow = isListening ? 35 + audioLevel * 50 : 20;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`relative ${sizeMap[size]} rounded-full flex items-center justify-center cursor-pointer select-none transition-transform duration-100 ease-out group ${className}`}
      style={{
        transform: `scale(${scale})`,
      }}
    >
      {/* Outer ambient warm breathing aura */}
      <div
        className="absolute inset-[-20%] rounded-full blur-3xl transition-all duration-700 pointer-events-none"
        style={{
          background: isListening
            ? 'radial-gradient(circle, rgba(227, 74, 59, 0.7) 0%, rgba(240, 113, 103, 0.4) 40%, rgba(235, 177, 91, 0.15) 70%, transparent 100%)'
            : isProcessing
            ? 'radial-gradient(circle, rgba(235, 177, 91, 0.6) 0%, rgba(227, 74, 59, 0.3) 50%, transparent 80%)'
            : 'radial-gradient(circle, rgba(227, 74, 59, 0.45) 0%, rgba(235, 177, 91, 0.2) 50%, transparent 75%)',
          opacity: isListening ? 0.95 : isProcessing ? 0.75 : 0.45,
          animation: !isListening && !isProcessing ? 'breathe 6s ease-in-out infinite' : undefined,
        }}
      />

      {/* Delicate concentric halo during processing */}
      {isProcessing && (
        <div
          className="absolute inset-[-10px] rounded-full border border-amber-300/40 animate-spin"
          style={{ animationDuration: '4s' }}
        />
      )}

      {/* Audio reactive vocal resonance rings */}
      {isListening && (
        <>
          <div
            className="absolute inset-[-8px] rounded-full border transition-all duration-75"
            style={{
              borderColor: 'rgba(240, 113, 103, 0.5)',
              transform: `scale(${1 + audioLevel * 0.25})`,
              opacity: 0.4 + audioLevel * 0.6,
            }}
          />
          <div
            className="absolute inset-[-18px] rounded-full border transition-all duration-100"
            style={{
              borderColor: 'rgba(235, 177, 91, 0.3)',
              transform: `scale(${1 + audioLevel * 0.45})`,
              opacity: audioLevel * 0.7,
            }}
          />
        </>
      )}

      {/* Living Core */}
      <div
        className="relative w-3/4 h-3/4 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden shadow-2xl"
        style={{
          background: isListening
            ? 'linear-gradient(135deg, #E34A3B 0%, #F07167 50%, #EBB15B 100%)'
            : isProcessing
            ? 'linear-gradient(135deg, #EBB15B 0%, #E34A3B 100%)'
            : 'linear-gradient(135deg, #D44234 0%, #E34A3B 60%, #F07167 100%)',
          boxShadow: `0 0 ${glow}px ${isListening ? 'rgba(227, 74, 59, 0.75)' : 'rgba(227, 74, 59, 0.4)'}`,
        }}
      >
        {/* Soft internal lens reflection */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/20 rounded-full pointer-events-none" />

        {/* Minimalist icon / aperture */}
        <div className="relative text-white flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
          {isProcessing ? (
            <div className="w-6 h-6 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          ) : isListening ? (
            <div className="w-5 h-5 rounded-md bg-white/90 shadow-sm" />
          ) : (
            <svg
              className="w-8 h-8 text-white fill-current drop-shadow-md"
              viewBox="0 0 24 24"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-1 16.93V21h2v-2.07A7.003 7.003 0 0 0 19 12h-2a5 5 0 0 1-10 0H5a7.003 7.003 0 0 0 6 6.93z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};
