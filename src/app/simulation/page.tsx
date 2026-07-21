"use client"

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useSimulation } from '@/hooks/useSimulation';
import { FacadeView } from '@/components/simulation/FacadeView';
import { Dashboard } from '@/components/simulation/Dashboard';
import { Controls } from '@/components/simulation/Controls';
import { AlgorithmFlowchart } from '@/components/simulation/AlgorithmFlowchart';
import { AlgorithmsDetail } from '@/components/simulation/AlgorithmsDetail';

import { GlobalBackground } from '@/components/3d/GlobalBackground';

export default function SimulationPage() {
  // Kuala Lumpur, Malaysia (3.14°N, 101.69°E, UTC+8)
  const sim = useSimulation(3.14, 101.69, 8);

  return (
    <div className="min-h-screen relative text-white p-4 md:p-8 flex flex-col font-sans selection:bg-emerald-500/30 pt-16 z-0">
      <GlobalBackground />
      
      <div className="mb-8 border-b border-white/10 pb-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-emerald-400 transition-colors mb-6 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Homepage
        </Link>
        <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-sky-400">
          Kinetic Facade Simulation
        </h1>
        <p className="text-gray-400 text-sm mt-2 max-w-2xl leading-relaxed">
          Interactive validation of the 4-layer control logic. 
          Modify sensors below to trigger priority state overrides.
        </p>
      </div>

      {/* Main Layout: Side-by-Side on desktop */}
      <div className="flex flex-col lg:flex-row gap-6 mb-6 relative z-10">
        
        {/* LEFT: 2D Visualizer */}
        <div className="w-full lg:w-1/2 min-h-[500px]">
          <FacadeView 
            actualAngleEast={sim.actualAngleEast} 
            actualAngleWest={sim.actualAngleWest} 
            elevation={sim.solarData.elevation} 
            azimuth={sim.solarData.azimuth}
            isDaytime={sim.solarData.isDaytime} 
          />
        </div>

        {/* RIGHT: Live Dashboard */}
        <div className="w-full lg:w-1/2 min-h-[500px]">
          <Dashboard 
            sensorData={sim.sensorData}
            solarData={sim.solarData}
            facadeState={sim.facadeState}
            computedClearSky={sim.computedClearSky}
            targetAngleEast={sim.targetAngleEast}
            actualAngleEast={sim.actualAngleEast}
            targetAngleWest={sim.targetAngleWest}
            actualAngleWest={sim.actualAngleWest}
          />
        </div>

      </div>

      {/* BOTTOM: Controls */}
      <div className="mt-4 relative z-10">
        <Controls 
          controls={sim.controls}
          setControls={sim.setControls}
          isPlaying={sim.isPlaying}
          setIsPlaying={sim.setIsPlaying}
          setTimeToRealTime={sim.setTimeToRealTime}
        />
      </div>

      {/* ALGORITHM FLOWCHART */}
      <AlgorithmFlowchart />

      {/* DETAILED ALGORITHMS */}
      <AlgorithmsDetail />

    </div>
  );
}
