import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ARButton, XR } from '@react-three/xr';
import { ResetIcon, TargetIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import ARRuler from './ARRuler';

function App() {
  const [cm, setCm] = useState<string>("0.0");
  const [inches, setInches] = useState<string>("0.0");
  const [step, setStep] = useState<number>(0);

  const getInstructions = () => {
    if (step === 0) return "Aim down at surface and tap.";
    if (step === 1) return "Walk to the end point and tap.";
    return "Measurement locked. Tap to restart.";
  };

  return (
    <div className="relative w-screen h-screen bg-neutral-950">
      
      {/* OPTICAL CROSSHAIR */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center opacity-50">
        <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,1)]"></div>
        <div className="absolute w-10 h-[1px] bg-white/40"></div>
        <div className="absolute h-10 w-[1px] bg-white/40"></div>
      </div>

      {/* TOP STUDIO HUD - Furniture Optimized */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[92%] max-w-sm z-10 p-5 rounded-3xl bg-neutral-900/60 backdrop-blur-2xl border border-white/10 shadow-2xl pointer-events-none transition-all duration-300 flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-1">
          <TargetIcon className="w-4 h-4 text-sky-400" />
          <h1 className="text-xs font-bold tracking-[0.2em] text-neutral-400 uppercase">Measure.pics AR</h1>
        </div>
        
        {/* Dual Unit Display */}
        <div className="flex flex-col items-center justify-center my-2">
          <div className="text-6xl font-black tracking-tighter bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
            {cm} <span className="text-2xl font-bold text-neutral-500 tracking-normal">cm</span>
          </div>
          <div className="text-lg font-medium text-sky-400/90 mt-1">
            {inches} <span className="text-sm">inches</span>
          </div>
        </div>

        {/* Dynamic State Badge */}
        <div className={`text-xs font-bold mt-2 px-4 py-2 rounded-full uppercase tracking-wider transition-colors duration-300 ${step === 1 ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : step === 2 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-neutral-300 border border-white/5'}`}>
          {getInstructions()}
        </div>
      </div>

      {/* Reset / Clear Button */}
      <button 
        onClick={() => window.location.reload()}
        className="absolute bottom-10 right-8 z-10 p-4 bg-neutral-900/60 backdrop-blur-xl border border-white/10 shadow-2xl text-neutral-300 hover:text-white rounded-full transition-all active:scale-95"
      >
        <ResetIcon className="w-6 h-6" />
      </button>

      {/* Enter AR Button */}
      <ARButton 
        className="absolute bottom-10 left-8 z-10 px-8 py-4 rounded-2xl bg-sky-600/90 backdrop-blur-xl border border-sky-400/50 text-white shadow-[0_0_30px_rgba(14,165,233,0.3)] font-bold tracking-wide transition-all active:scale-95"
      />

      {/* 3D Scene */}
      <Canvas>
        <XR>
          <ARRuler onUpdate={(c, i, s) => { setCm(c); setInches(i); setStep(s); }} />
        </XR>
      </Canvas>
      
    </div>
  );
}

export default App;