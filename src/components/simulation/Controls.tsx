import React from 'react';
import { SimulationControls } from '@/hooks/useSimulation';

interface ControlsProps {
  controls: SimulationControls;
  setControls: React.Dispatch<React.SetStateAction<SimulationControls>>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setTimeToRealTime: () => void;
}

export function Controls({ controls, setControls, isPlaying, setIsPlaying, setTimeToRealTime }: ControlsProps) {
  
  const handleSlider = (key: keyof SimulationControls, value: number | boolean) => {
    setControls(prev => ({ ...prev, [key]: value }));
  };

  const formatTime = (decimalHours: number) => {
    const hrs = Math.floor(decimalHours);
    const mins = Math.floor((decimalHours - hrs) * 60);
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const displayHrs = hrs % 12 === 0 ? 12 : hrs % 12;
    return `${displayHrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="w-full bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6 relative z-10">
      <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
        <h3 className="font-mono text-white/70 font-bold uppercase tracking-widest drop-shadow-md">Simulation Controls</h3>
        <button 
          onClick={setTimeToRealTime}
          className="text-xs font-mono px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.2)]"
        >
          Reset to KL Real-Time
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Time of Day */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between font-mono text-[10px] uppercase font-bold text-white/60 drop-shadow-sm">
            <span>Time of Day</span>
            <span className="text-white drop-shadow-md font-bold">{formatTime(controls.timeHours)}</span>
          </div>
          <input 
            type="range" min="0" max="24" step="0.1" 
            value={controls.timeHours} 
            onChange={(e) => updateControl('timeHours', parseFloat(e.target.value))}
            className="accent-emerald-500"
          />
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className={`mt-2 py-2 text-xs font-mono uppercase tracking-widest rounded border transition-colors shadow-md ${isPlaying ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}
          >
            {isPlaying ? 'Pause Cycle' : 'Play Cycle'}
          </button>
        </div>

        {/* Cloud Cover */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between font-mono text-[10px] uppercase font-bold text-white/60 drop-shadow-sm">
            <span>Cloud Cover</span>
            <span className="text-white drop-shadow-md font-bold">{Math.round(controls.cloudCover * 100)}%</span>
          </div>
          <input 
            type="range" min="0" max="1" step="0.05" 
            value={controls.cloudCover} 
            onChange={(e) => updateControl('cloudCover', parseFloat(e.target.value))}
            className="accent-sky-500"
          />
          <span className="text-[9px] text-white/50 font-mono">Slide right to drop irradiance and trigger P3 (CLOUD).</span>
        </div>

        {/* Indoor Temp */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between font-mono text-[10px] uppercase font-bold text-white/60 drop-shadow-sm">
            <span>Indoor Temp</span>
            <span className="text-white drop-shadow-md font-bold">{controls.indoorTemp.toFixed(1)}°C</span>
          </div>
          <input 
            type="range" min="20" max="35" step="0.5" 
            value={controls.indoorTemp} 
            onChange={(e) => updateControl('indoorTemp', parseFloat(e.target.value))}
            className="accent-rose-500"
          />
          <span className="text-[9px] text-white/50 font-mono">Above 24°C increases thermal demand, closing louvers.</span>
        </div>

        {/* Wind Speed */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between font-mono text-[10px] uppercase font-bold text-white/60 drop-shadow-sm">
            <span>Wind Gust</span>
            <span className="text-white drop-shadow-md font-bold">{controls.windSpeed.toFixed(0)} km/h</span>
          </div>
          <input 
            type="range" min="0" max="60" step="1" 
            value={controls.windSpeed} 
            onChange={(e) => updateControl('windSpeed', parseFloat(e.target.value))}
            className="accent-orange-500"
          />
          <span className="text-[9px] text-white/50 font-mono">Exceed 40 km/h to trigger P1 (SAFETY STORM).</span>
        </div>

        {/* Rain */}
        <div className="flex flex-col gap-2 col-span-1 md:col-span-4 md:w-1/4 md:ml-auto">
          <div className="flex justify-between font-mono text-[10px] uppercase font-bold text-white/60 drop-shadow-sm">
            <span>Rain Sensor</span>
          </div>
          <button 
            onClick={() => updateControl('rain', !controls.rain)}
            className={`py-2 text-xs font-mono rounded border transition-colors shadow-md ${controls.rain ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-black/20 border-white/10 text-white/60 hover:bg-white/5'}`}
          >
            {controls.rain ? 'RAINING' : 'DRY'}
          </button>
          <span className="text-[9px] text-white/50 font-mono text-center">Triggers P1 (RAIN).</span>
        </div>
      </div>
    </div>
  );
}
