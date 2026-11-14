import { memo, type CSSProperties, type RefObject } from 'react';
import { buildLidFacets } from './chestMath';
import { ChestIvyFront, ChestIvySide } from './ivy';

interface ChestBackModelProps {
  layer: 'back';
  backRigRef: RefObject<HTMLDivElement>;
  lidRef: RefObject<HTMLDivElement>;
}

interface ChestFrontModelProps {
  layer: 'front';
  frontRigRef: RefObject<HTMLDivElement>;
  frontFaceRef: RefObject<HTMLDivElement>;
  sideFaceRef: RefObject<HTMLDivElement>;
}

type ChestModelProps = ChestBackModelProps | ChestFrontModelProps;

const LID_FACETS = buildLidFacets();

function ChestModelComponent(props: ChestModelProps) {
  const facetStyle = (
    transform: string,
    height?: number,
    clipPath?: string,
    depth = false,
  ): CSSProperties =>
    ({
      '--fw': depth ? 'var(--d)' : 'var(--w)',
      '--fh': height ? `calc(var(--u) * ${height.toFixed(2)}px)` : 'var(--lh)',
      transform,
      clipPath,
    }) as CSSProperties;

  if (props.layer === 'back') {
    return (
      <div className="tc-layer">
        <div ref={props.backRigRef} className="tc-rig">
          <div className="tc-f tc-velvet tc-back" />
          <div className="tc-f tc-velvet tc-left" />
          <div className="tc-f tc-velvet tc-floor" />
          <div className="tc-f tc-pile tc-pilef" />
          <div className="tc-f tc-gold tc-rimb" />
          <div className="tc-f tc-gold tc-riml" />
          <div ref={props.lidRef} className="tc-lid">
            {LID_FACETS.map((facet) => (
              <div
                key={facet.id}
                className={`tc-f ${facet.className}`}
                style={facetStyle(facet.transform, facet.height, facet.clipPath, facet.depth)}
                data-lid-outer={facet.outer ? 'true' : undefined}
                data-ny={facet.normalY}
                data-nz={facet.normalZ}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tc-layer">
      <div ref={props.frontRigRef} className="tc-rig">
        <div ref={props.frontFaceRef} className="tc-f tc-gold tc-st tc-fr">
          <svg className="tc-grain" viewBox="0 0 440 208" aria-hidden="true">
            <defs>
              <filter id="tc-wood-noise">
                <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" seed="17" />
                <feColorMatrix
                  type="matrix"
                  values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 .1"
                />
              </filter>
            </defs>
            <rect width="100%" height="100%" filter="url(#tc-wood-noise)" />
          </svg>
          <ChestIvyFront />
          <div className="tc-lock" />
        </div>
        <div ref={props.sideFaceRef} className="tc-f tc-gold tc-st tc-rt">
          <ChestIvySide />
          <div className="tc-handle" />
        </div>
        <div className="tc-f tc-gold tc-rimf" />
        <div className="tc-f tc-gold tc-rimr" />
      </div>
    </div>
  );
}

export const ChestModel = memo(ChestModelComponent);
