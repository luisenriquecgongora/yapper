/**
 * @yapper/react
 * Audio-reactive glowing orb visualizer.
 * Styled as an illuminated warm wax seal / living ink aperture on fine stationery.
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
  const glow = isListening ? 40 + audioLevel * 45 : 24;

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
      {/* Outer ambient warm breathing aura into the paper */}
      <div
        className="absolute inset-[-25%] rounded-full blur-3xl transition-all duration-700 pointer-events-none"
        style={{
          background: isListening
            ? 'radial-gradient(circle, rgba(194, 59, 34, 0.6) 0%, rgba(217, 152, 59, 0.3) 45%, transparent 75%)'
            : isProcessing
            ? 'radial-gradient(circle, rgba(217, 152, 59, 0.5) 0%, rgba(194, 59, 34, 0.25) 50%, transparent 80%)'
            : 'radial-gradient(circle, rgba(194, 59, 34, 0.35) 0%, rgba(217, 152, 59, 0.15) 50%, transparent 75%)',
          opacity: isListening ? 0.95 : isProcessing ? 0.75 : 0.5,
          animation: !isListening && !isProcessing ? 'breathe 6s ease-in-out infinite' : undefined,
        }}
      />

      {/* Concentric thinking halo */}
      {isProcessing && (
        <div
          className="absolute inset-[-10px] rounded-full border border-[#D9983B]/60 animate-spin"
          style={{ animationDuration: '4s' }}
        />
      )}

      {/* Audio reactive resonance rings */}
      {isListening && (
        <>
          <div
            className="absolute inset-[-8px] rounded-full border transition-all duration-75"
            style={{
              borderColor: 'rgba(194, 59, 34, 0.45)',
              transform: `scale(${1 + audioLevel * 0.25})`,
              opacity: 0.5 + audioLevel * 0.5,
            }}
          />
          <div
            className="absolute inset-[-18px] rounded-full border transition-all duration-100"
            style={{
              borderColor: 'rgba(217, 152, 59, 0.3)',
              transform: `scale(${1 + audioLevel * 0.45})`,
              opacity: audioLevel * 0.7,
            }}
          />
        </>
      )}

      {/* Living Wax Seal Core */}
      <div
        className="relative w-3/4 h-3/4 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden"
        style={{
          background: isListening
            ? 'linear-gradient(135deg, #C23B22 0%, #D44A3A 50%, #D9983B 100%)'
            : isProcessing
            ? 'linear-gradient(135deg, #D9983B 0%, #C23B22 100%)'
            : 'linear-gradient(135deg, #B5321B 0%, #C23B22 60%, #D44A3A 100%)',
          boxShadow: `0 4px 18px rgba(35, 15, 10, 0.35), 0 0 ${glow}px ${isListening ? 'rgba(194, 59, 34, 0.7)' : 'rgba(194, 59, 34, 0.35)'}`,
        }}
      >
        {/* Soft internal lens reflection */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/25 rounded-full pointer-events-none" />

        {/* Minimalist icon / aperture */}
        <div className="relative text-[#FAF5EB] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
          {isProcessing ? (
            <div className="w-6 h-6 border-2 border-[#FAF5EB]/90 border-t-transparent rounded-full animate-spin" />
          ) : isListening ? (
            <div className="w-5 h-5 rounded-md bg-[#FAF5EB]/90 shadow-sm" />
          ) : (
            <svg
              className="w-8 h-8 text-[#FAF5EB] fill-current drop-shadow-sm"
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
