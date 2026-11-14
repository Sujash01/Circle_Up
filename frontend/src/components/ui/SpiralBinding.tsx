/** Decorative notebook coil, kept static and hidden from assistive technology. */
export function SpiralBinding({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`spiral-binding ${className}`}>
      {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
    </span>
  );
}
