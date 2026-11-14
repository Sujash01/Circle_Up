import { cn } from '@/lib/utils';

export type WaveDividerVariant = 'wave' | 'scallop' | 'torn';

interface WaveDividerProps {
  variant?: WaveDividerVariant;
  flip?: boolean;
  className?: string;
}

const paths: Record<WaveDividerVariant, string> = {
  wave: 'M0 24 C120 4 200 44 320 24 C440 4 520 44 640 24 C760 4 840 44 960 24 V48 H0 Z',
  scallop: 'M0 18 C40 18 40 42 80 42 C120 42 120 18 160 18 C200 18 200 42 240 42 C280 42 280 18 320 18 V48 H0 Z',
  torn: 'M0 20 L42 17 L81 23 L127 15 L169 21 L212 16 L260 24 L302 18 L350 22 L401 15 L450 21 L501 17 L552 23 L600 18 L650 24 L702 16 L751 21 L800 17 L850 24 L903 16 L960 20 V48 H0 Z',
};

export function WaveDivider({
  variant = 'wave',
  flip = false,
  className,
}: WaveDividerProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 960 48"
      preserveAspectRatio="none"
      className={cn('wave-divider', flip && 'wave-divider-flip', className)}
    >
      <path d={paths[variant]} fill="currentColor" />
    </svg>
  );
}
