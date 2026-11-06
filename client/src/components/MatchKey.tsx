import { useRef, useEffect } from 'react';
import { KeyRound } from 'lucide-react';
import { useMatch } from '@/context/MatchContext';

const ILLUSION_VIDEO_SRC =
  '/assets/aistudio/illusionillusionhypnosisfypcalm_1793904347123_d7a84613.mp4';

interface MatchKeyProps {
  disabled?: boolean;
}

export default function MatchKey({ disabled = false }: MatchKeyProps) {
  const {
    discoveryState,
    hasActiveSubscription,
    hasActiveMatch,
    dailyStatus,
    triggerMatchDiscovery,
  } = useMatch();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isSpinning = discoveryState === 'searching';

  useEffect(() => {
    if (!videoRef.current) return;
    if (isSpinning) {
      videoRef.current.currentTime = 0;
      videoRef.current.playbackRate = 1.6;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.playbackRate = 1.0;
    }
  }, [isSpinning]);

  const canTrigger =
    !disabled &&
    !isSpinning &&
    hasActiveSubscription &&
    !hasActiveMatch &&
    !dailyStatus.dailyLimitReached &&
    dailyStatus.remainingToday > 0;

  const handleKeyClick = () => {
    if (!canTrigger) return;
    triggerMatchDiscovery();
  };

  return (
    <div className="mt-2 flex flex-col items-center">
      <style>{`
        @keyframes illusionDrift {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.06); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes illusionVortex {
          0% { transform: rotate(0deg) scale(1.08); }
          50% { transform: rotate(-180deg) scale(1.18); }
          100% { transform: rotate(-360deg) scale(1.08); }
        }
        @keyframes illusionCounterDrift {
          0% { transform: rotate(0deg) scale(1.04); }
          50% { transform: rotate(-180deg) scale(0.98); }
          100% { transform: rotate(-360deg) scale(1.04); }
        }
      `}</style>
      <div className="relative w-full aspect-[9/14] max-h-[520px] rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-900/80 bg-black">
        {/* Optical illusion video at full contrast with continuous hypnotic motion */}
        <video
          ref={videoRef}
          src={ILLUSION_VIDEO_SRC}
          autoPlay
          playsInline
          muted
          loop
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-95"
          style={{
            animation: isSpinning
              ? 'illusionVortex 2.2s linear infinite'
              : 'illusionDrift 24s linear infinite',
          }}
        />

        {/* Counter-rotating radial optical illusion rays around the center circle */}
        <div
          className="absolute inset-[-40%] pointer-events-none mix-blend-overlay opacity-75"
          style={{
            animation: isSpinning
              ? 'illusionVortex 1.6s linear infinite'
              : 'illusionCounterDrift 18s linear infinite',
            backgroundImage: `
              repeating-conic-gradient(
                from 0deg at 50% 50%,
                rgba(255, 255, 255, 0.9) 0deg 4deg,
                rgba(10, 15, 35, 0.9) 4deg 8deg,
                rgba(251, 191, 36, 0.75) 8deg 10deg,
                rgba(10, 15, 35, 0.9) 10deg 14deg
              )
            `,
          }}
        />
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
            isSpinning ? 'opacity-80' : 'opacity-65'
          }`}
          style={{
            backgroundImage: `
              repeating-radial-gradient(
                circle at 50% 50%,
                transparent 0px,
                transparent 14px,
                rgba(0, 0, 0, 0.65) 15px,
                rgba(59, 130, 246, 0.28) 18px,
                transparent 20px
              )
            `,
          }}
        />

        {/* Dark round circle in the exact middle of the illusion */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full bg-black/95 border-2 transition-all duration-300 pointer-events-none ${
            isSpinning
              ? 'border-amber-400 scale-110 shadow-[0_0_50px_rgba(251,191,36,0.9)]'
              : 'border-amber-400/60 shadow-[0_0_35px_rgba(0,0,0,0.95)]'
          }`}
        />

        {/* Central glowing key icon dead-center inside the round circle */}
        <button
          type="button"
          onClick={handleKeyClick}
          disabled={!canTrigger}
          aria-label="Click key in center to start AI illusion match"
          className={`group absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none ${
            isSpinning
              ? 'bg-black ring-4 ring-amber-400 scale-110 shadow-[0_0_40px_rgba(251,191,36,0.95)]'
              : canTrigger
              ? 'bg-black/90 hover:bg-black ring-2 ring-amber-400/80 hover:ring-amber-300 hover:scale-105 shadow-[0_0_25px_rgba(251,191,36,0.5)] cursor-pointer'
              : 'bg-black/75 ring-2 ring-gray-500/50 opacity-60 cursor-not-allowed'
          }`}
        >
          <span
            className={`absolute inset-0 rounded-full bg-amber-400/25 blur-md transition-opacity duration-300 ${
              isSpinning ? 'opacity-100 animate-ping' : 'opacity-65 group-hover:opacity-95'
            }`}
          />
          <KeyRound
            className={`relative z-10 w-9 h-9 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.9)] transition-transform duration-500 ${
              isSpinning ? 'rotate-90 scale-110 text-amber-200' : 'group-hover:rotate-12'
            }`}
            strokeWidth={2.2}
          />
        </button>

        {/* Bottom status pill */}
        <div className="absolute bottom-4 inset-x-4 flex justify-center pointer-events-none z-10">
          <div className="bg-black/80 backdrop-blur-md text-white/95 text-xs font-medium px-4 py-2 rounded-full border border-white/15 shadow-lg text-center">
            {isSpinning
              ? 'AI Illusion Active — Searching for your 1-on-1 match...'
              : 'Tap the key in the center circle to unlock your AI match'}
          </div>
        </div>
      </div>
    </div>
  );
}
