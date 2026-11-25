import { useEffect, useState } from 'react';
import { ChevronDown, Disc, Music, Pause, Play, SkipForward, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { lofiAudio, type AudioEngineState } from '@/lib/lofiAudioEngine';
import { cn } from '@/lib/utils';

/**
 * 2D Vinyl Record Component
 * Renders an authentic grooved vinyl disc with light reflection and vintage CircleUp center label.
 */
function VinylDisc({
  isPlaying,
  size = 54,
  className,
}: {
  isPlaying: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative shrink-0 rounded-full select-none shadow-[0_4px_16px_rgba(0,0,0,0.22)]',
        className,
      )}
    >
      {/* Vinyl body with micro grooves */}
      <div
        className={cn(
          'w-full h-full rounded-full relative overflow-hidden transition-transform duration-700 ease-out',
          isPlaying ? 'animate-vinyl-spin' : 'motion-reduce:animate-none',
        )}
        style={{
          background: 'radial-gradient(circle, #242524 0%, #151615 65%, #0e0f0e 100%)',
          boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.08), inset 0 0 12px rgba(0,0,0,0.85)',
        }}
      >
        {/* Concentric Vinyl Grooves (SVG) */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.12" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="#fff" strokeWidth="0.3" strokeOpacity="0.08" />
          <circle cx="50" cy="50" r="38" fill="none" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.14" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="#fff" strokeWidth="0.3" strokeOpacity="0.09" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.12" />
          <circle cx="50" cy="50" r="26" fill="none" stroke="#fff" strokeWidth="0.3" strokeOpacity="0.08" />
          <circle cx="50" cy="50" r="22" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.15" />
        </svg>

        {/* Specular Radial Sheen (Simulates light grazing over spinning vinyl grooves) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none opacity-40 mix-blend-screen"
          style={{
            background:
              'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.18) 35deg, transparent 75deg, transparent 180deg, rgba(255,255,255,0.18) 215deg, transparent 255deg, transparent 360deg)',
          }}
        />

        {/* Vintage Paper Center Label */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex flex-col items-center justify-center text-center shadow-inner border border-amber-900/30"
          style={{
            width: '38%',
            height: '38%',
            background: 'radial-gradient(circle, #ecdcc7 0%, #d8be9a 65%, #c5a478 100%)',
          }}
        >
          {/* Label border ring */}
          <div className="absolute inset-[2px] rounded-full border border-forest/20 pointer-events-none" />

          {/* Micro text inside label */}
          <span className="text-[5px] sm:text-[6px] font-black uppercase tracking-wider text-forest-deep leading-none scale-90">
            CircleUp
          </span>
          <span className="text-[3.5px] uppercase tracking-tighter text-terracotta font-semibold leading-tight">
            33⅓ RPM
          </span>

          {/* Center spindle hole with brass grommet */}
          <div
            className="w-[18%] h-[18%] rounded-full bg-[#1b1c1b] border-[1px] border-amber-600/60 shadow-inner mt-[1px]"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 2D Tone Arm (Turntable Needle)
 * Pivots into playing position on the vinyl when music starts.
 */
function ToneArm({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div
      className="absolute top-1 right-2 pointer-events-none z-20 origin-top-right transition-transform duration-700 ease-out"
      style={{
        transform: isPlaying ? 'rotate(25deg)' : 'rotate(0deg)',
      }}
      aria-hidden="true"
    >
      {/* Pivot mount */}
      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 shadow-md border border-amber-900/40 relative">
        <div className="w-2 h-2 rounded-full bg-forest-deep absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Arm rod */}
      <div
        className="w-1 bg-gradient-to-b from-amber-300 via-neutral-300 to-amber-500 rounded-full shadow-sm ml-2 -mt-1 origin-top"
        style={{ height: '62px', transform: 'rotate(-10deg)' }}
      >
        {/* Cartridge head & stylus needle */}
        <div className="w-2.5 h-4 bg-forest-deep rounded-sm absolute -bottom-1 -left-0.5 border border-amber-400/50 shadow-sm flex items-end justify-center">
          <div className="w-0.5 h-1 bg-amber-300" />
        </div>
      </div>
    </div>
  );
}

/**
 * Soundwave Equalizer Bars
 */
function Soundwave({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-3 px-1" aria-hidden="true">
      <span
        className={cn(
          'w-0.5 bg-forest-deep rounded-full transition-all duration-300',
          isPlaying ? 'h-3 animate-soundwave-1' : 'h-1',
        )}
      />
      <span
        className={cn(
          'w-0.5 bg-terracotta rounded-full transition-all duration-300',
          isPlaying ? 'h-3 animate-soundwave-2' : 'h-1.5',
        )}
      />
      <span
        className={cn(
          'w-0.5 bg-forest-deep rounded-full transition-all duration-300',
          isPlaying ? 'h-2 animate-soundwave-3' : 'h-1',
        )}
      />
    </div>
  );
}

/**
 * CircleUp Spinning 2D Vinyl Music Player
 * Floating dock widget with expandable turntable console.
 */
export function VinylMusicPlayer() {
  const [state, setState] = useState<AudioEngineState>(lofiAudio.getState());
  const [isExpanded, setIsExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.45);

  useEffect(() => {
    if (!lofiAudio.isUserExplicitlyPaused()) {
      lofiAudio.attachGestureUnlock();
      void lofiAudio.start(false);
    }
    const unsubscribe = lofiAudio.subscribe((newState) => {
      setState(newState);
    });
    return () => {
      unsubscribe();
      lofiAudio.stop(false);
    };
  }, []);

  const handleTogglePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    await lofiAudio.toggle();
  };

  const handleToggleMute = () => {
    if (muted) {
      setMuted(false);
      lofiAudio.setVolume(prevVolume || 0.45);
    } else {
      setPrevVolume(state.volume);
      setMuted(true);
      lofiAudio.setVolume(0);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    lofiAudio.setVolume(val);
    if (val > 0 && muted) setMuted(false);
  };

  const handleNextTrack = () => {
    lofiAudio.nextTrack();
  };

  const handleToggleCrackle = () => {
    lofiAudio.toggleCrackle();
  };

  return (
    <aside
      aria-label="CircleUp Vinyl Background Music Player"
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 select-none print:hidden font-body"
    >
      {/* EXPANDED VINTAGE TURNTABLE CARD */}
      {isExpanded ? (
        <div
          role="dialog"
          aria-label="CircleUp Vinyl Turntable Player"
          className="w-[300px] sm:w-[340px] bg-[#fbf7ed] text-[#2c2c2a] rounded-2xl p-4 sm:p-5 shadow-[0_16px_40px_rgba(30,40,25,0.22)] border-2 border-forest/20 relative backdrop-blur-sm transition-all duration-300 animate-in fade-in zoom-in-95"
          style={{
            backgroundImage:
              'radial-gradient(circle at 10% 10%, rgba(255,255,255,0.7) 0%, transparent 60%)',
          }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between pb-3 border-b border-forest/15">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-forest text-cream text-xs">
                <Music className="w-3.5 h-3.5 text-white" />
              </span>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-terracotta leading-none">
                  CircleUp Radio
                </p>
                <p className="text-xs font-serif font-bold text-forest-deep">Thrift Store Lo-Fi</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded-full text-foreground/60 hover:text-foreground hover:bg-forest/10 transition-colors"
              aria-label="Minimize vinyl player"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Turntable Platter & 2D Spinning Vinyl */}
          <div className="relative my-4 flex items-center justify-center p-3 bg-gradient-to-b from-[#eadecb] to-[#dfceb5] rounded-xl border border-forest/15 shadow-inner overflow-hidden">
            {/* Wood-grain / Paper textured turntable base */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Platter metal ring */}
              <div className="absolute inset-1 rounded-full border border-amber-800/30 bg-[#2d2e2c] shadow-md" />

              {/* 2D Vinyl Disc */}
              <VinylDisc isPlaying={state.isPlaying} size={128} />

              {/* 2D Tone Arm */}
              <ToneArm isPlaying={state.isPlaying} />
            </div>

            {/* Live Indicator Pill */}
            <div className="absolute bottom-2 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-forest-deep/90 text-white text-[9px] font-semibold tracking-wider uppercase shadow-sm">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  state.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-400',
                )}
              />
              {state.isPlaying ? 'Playing • 33⅓' : 'Resting'}
            </div>
          </div>

          {/* Track Info */}
          <div className="text-center space-y-0.5 mb-3">
            <p className="font-serif font-bold text-base text-forest-deep truncate px-2">
              {state.currentTrack.title}
            </p>
            <p className="text-[11px] text-foreground/70 font-medium">
              {state.currentTrack.subtitle}
            </p>
          </div>

          {/* Primary Controls */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <button
              type="button"
              onClick={handleTogglePlay}
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform duration-150 active:scale-95',
                state.isPlaying
                  ? 'bg-forest-deep text-white hover:bg-forest'
                  : 'bg-terracotta text-white hover:opacity-95',
              )}
              aria-label={state.isPlaying ? 'Pause music' : 'Play vinyl music'}
            >
              {state.isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleNextTrack}
              className="p-2.5 rounded-full bg-forest/10 text-forest-deep hover:bg-forest/20 transition-colors active:scale-95"
              aria-label="Next mood track"
              title="Change mood"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Volume and Needle Crackle Controls */}
          <div className="pt-2 border-t border-forest/15 flex items-center justify-between text-xs text-foreground/80">
            <div className="flex items-center gap-2 flex-1 max-w-[170px]">
              <button
                type="button"
                onClick={handleToggleMute}
                className="text-forest hover:text-forest-deep transition-colors"
                aria-label={muted || state.volume === 0 ? 'Unmute' : 'Mute'}
              >
                {muted || state.volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : state.volume}
                onChange={handleVolumeChange}
                className="w-full h-1.5 bg-forest/20 rounded-lg appearance-none cursor-pointer accent-forest-deep"
                aria-label="Music volume"
              />
            </div>

            {/* Vinyl crackle toggle */}
            <button
              type="button"
              onClick={handleToggleCrackle}
              className={cn(
                'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border transition-colors',
                state.crackleEnabled
                  ? 'border-terracotta text-terracotta bg-terracotta/10'
                  : 'border-forest/20 text-foreground/50 hover:bg-forest/5',
              )}
              title="Toggle authentic needle dust & crackle"
            >
              <Sparkles className="w-2.5 h-2.5" />
              Crackle
            </button>
          </div>
        </div>
      ) : (
        /* COMPACT FLOATING DOCK BADGE */
        <div className="group flex items-center gap-2">
          {/* Main clickable vinyl dock button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className={cn(
              'flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full bg-[#fbf7ed]/95 border-2 border-forest/25 shadow-[0_6px_22px_rgba(20,30,20,0.18)] hover:shadow-[0_8px_26px_rgba(20,30,20,0.25)] hover:border-forest/40 transition-all duration-300 backdrop-blur-sm',
              state.isPlaying && 'ring-2 ring-terracotta/30',
            )}
            aria-label={
              state.isPlaying
                ? 'Pause background vinyl music'
                : 'Play background vinyl music (CircleUp Radio)'
            }
          >
            {/* Spinning 2D Vinyl Disc */}
            <div className="relative">
              <VinylDisc isPlaying={state.isPlaying} size={42} />

              {/* Tiny Play/Pause overlay badge */}
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white shadow-sm border border-[#fbf7ed]',
                  state.isPlaying ? 'bg-forest-deep' : 'bg-terracotta',
                )}
              >
                {state.isPlaying ? (
                  <Pause className="w-2 h-2 fill-current" />
                ) : (
                  <Play className="w-2 h-2 fill-current ml-0.5" />
                )}
              </span>
            </div>

            {/* Label and soundwave */}
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold uppercase tracking-widest text-terracotta leading-none">
                33⅓ Vinyl
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-serif font-bold text-forest-deep">
                  {state.isPlaying ? 'Thrift Radio' : 'Play Music'}
                </span>
                <Soundwave isPlaying={state.isPlaying} />
              </div>
            </div>
          </button>

          {/* Quick expand button */}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="w-8 h-8 rounded-full bg-[#fbf7ed]/90 border border-forest/25 flex items-center justify-center text-forest-deep shadow-sm hover:bg-[#fbf7ed] hover:border-forest/40 transition-all"
            aria-label="Open vinyl turntable controls"
            title="Open turntable controls"
          >
            <Disc className="w-4 h-4 text-forest" />
          </button>
        </div>
      )}
    </aside>
  );
}
