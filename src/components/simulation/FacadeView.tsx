import React from 'react';

interface FacadeViewProps {
  actualAngleEast: number;
  actualAngleWest: number;
  elevation: number;
  azimuth: number;
  isDaytime: boolean;
}

export function FacadeView({ actualAngleEast, actualAngleWest, elevation, azimuth, isDaytime }: FacadeViewProps) {
  // Make simulation bigger
  const width = 800;
  const height = 500;
  const cx = width / 2;
  const cy = height - 100;
  const r = 300; // Larger sun arc radius

  // Map elevation & azimuth to a 2D arc from East (Right, 0 deg) to West (Left, 180 deg)
  // Morning (azimuth < 180) -> East side
  // Afternoon (azimuth >= 180) -> West side
  let arcAngleDeg = 0;
  if (isDaytime) {
    if (azimuth < 180) {
      arcAngleDeg = elevation; // 0 to 90
    } else {
      arcAngleDeg = 180 - elevation; // 90 to 180
    }
  }
  
  const arcAngleRad = (arcAngleDeg * Math.PI) / 180;
  const sunX = cx + r * Math.cos(arcAngleRad);
  const sunY = cy - r * Math.sin(arcAngleRad);

  const louverCount = 6;
  const louverSpacing = 45;
  const louverWidth = 40;
  const startY = 120;
  const buildingWidth = 200;
  const buildingLeft = cx - buildingWidth / 2;
  const buildingRight = cx + buildingWidth / 2;

  return (
    <div className="w-full h-full bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center p-4 relative overflow-hidden min-h-[500px]">
      <div className="absolute top-4 left-4 text-xs font-mono text-white/70 font-semibold uppercase tracking-widest drop-shadow-md">
        2D Cross-Section (Double-Sided Facade)
      </div>

      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="mt-4 drop-shadow-xl" preserveAspectRatio="xMidYMid meet">
        {/* Sky / Grid Arc */}
        <path d={`M ${cx + r} ${cy} A ${r} ${r} 0 0 0 ${cx - r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
        
        {/* Building outline */}
        <rect x={buildingLeft} y={startY - 50} width={buildingWidth} height={cy - (startY - 50)} fill="rgba(17, 24, 39, 0.8)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        
        {/* West Facade Wall (Left) */}
        <line x1={buildingLeft} y1={startY - 50} x2={buildingLeft} y2={cy} stroke="#00D084" strokeWidth="2" strokeOpacity="0.8" />
        {/* East Facade Wall (Right) */}
        <line x1={buildingRight} y1={startY - 50} x2={buildingRight} y2={cy} stroke="#38BDF8" strokeWidth="2" strokeOpacity="0.8" />
        
        {/* Floor */}
        <line x1={50} y1={cy} x2={width - 50} y2={cy} stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
        
        <text x={cx} y={cy - 20} fill="rgba(255,255,255,0.7)" fontSize="16" fontWeight="bold" textAnchor="middle" className="font-mono" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}>INTERIOR</text>
        <text x={buildingLeft - 60} y={cy - 20} fill="#34d399" fontSize="14" fontWeight="bold" textAnchor="middle" className="font-mono" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}>WEST</text>
        <text x={buildingRight + 60} y={cy - 20} fill="#7dd3fc" fontSize="14" fontWeight="bold" textAnchor="middle" className="font-mono" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}>EAST</text>

        {/* Calculate how much light passes through based on louver angle vs sun elevation */}
        {(() => {
          const blockAngle = Math.max(0.1, 90 - elevation);
          const transmissionWest = Math.max(0, 1 - (actualAngleWest / blockAngle));
          const transmissionEast = Math.max(0, 1 - (actualAngleEast / blockAngle));

          return (
            <>
              {/* Shaded/Light region in interior (abstract visualization) */}
              {isDaytime && azimuth >= 180 && transmissionWest > 0 && (
                // West light coming in
                <polygon 
                  points={`${buildingLeft},${startY} ${cx},${startY + (cx - buildingLeft) * Math.abs(Math.tan(arcAngleRad))} ${cx},${cy} ${buildingLeft},${cy}`} 
                  fill="#00D084" 
                  opacity={0.15 * transmissionWest} 
                />
              )}
              {isDaytime && azimuth < 180 && transmissionEast > 0 && (
                // East light coming in
                <polygon 
                  points={`${buildingRight},${startY} ${cx},${startY + (buildingRight - cx) * Math.abs(Math.tan(arcAngleRad))} ${cx},${cy} ${buildingRight},${cy}`} 
                  fill="#38BDF8" 
                  opacity={0.15 * transmissionEast} 
                />
              )}
            </>
          );
        })()}

        {/* West Louvers */}
        {Array.from({ length: louverCount }).map((_, i) => {
          const lY = startY + i * louverSpacing;
          // For West, 0 is horizontal, 90 is vertical closed. 
          // To block afternoon sun (coming from left), tilting down means rotating anti-clockwise (-angle).
          return (
            <g key={`w-${i}`} transform={`translate(${buildingLeft}, ${lY})`}>
              <line 
                x1={-louverWidth/2} y1={0} 
                x2={louverWidth/2} y2={0} 
                stroke="#00D084" 
                strokeWidth="4"
                transform={`rotate(${-actualAngleWest})`}
              />
            </g>
          );
        })}

        {/* East Louvers */}
        {Array.from({ length: louverCount }).map((_, i) => {
          const lY = startY + i * louverSpacing;
          // For East, 0 is horizontal, 90 is vertical closed. 
          // To block morning sun (coming from right), tilting down means rotating clockwise (+angle).
          return (
            <g key={`e-${i}`} transform={`translate(${buildingRight}, ${lY})`}>
              <line 
                x1={-louverWidth/2} y1={0} 
                x2={louverWidth/2} y2={0} 
                stroke="#38BDF8" 
                strokeWidth="4"
                transform={`rotate(${actualAngleEast})`}
              />
            </g>
          );
        })}

        {/* Sun and Ray */}
        {isDaytime && (
          <>
            {/* Ray to East or West Facade depending on azimuth, aligned with the top of the interior light polygon */}
            <line 
              x1={sunX} y1={sunY} 
              x2={azimuth < 180 ? buildingRight : buildingLeft} 
              y2={startY} 
              stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" 
            />
            <circle cx={sunX} cy={sunY} r="12" fill="#f59e0b" style={{ filter: 'drop-shadow(0px 0px 10px rgba(245,158,11,0.8))' }} />
            <circle cx={sunX} cy={sunY} r="24" fill="#f59e0b" opacity="0.2" />
            <text x={sunX} y={sunY - 35} fill="#fcd34d" fontSize="14" fontWeight="bold" textAnchor="middle" className="font-mono" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}>
              {elevation.toFixed(1)}°
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
