'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { slides } from './data';
import PresentationSlide from '@/components/PresentationSlide';
import { ChevronLeft, ChevronRight, Maximize } from 'lucide-react';

export default function PresentationPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const slideCount = slides.length;

  const paginate = (newDirection: number) => {
    const nextIndex = currentIndex + newDirection;
    if (nextIndex >= 0 && nextIndex < slideCount) {
      setDirection(newDirection);
      setCurrentIndex(nextIndex);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        paginate(1);
      } else if (e.key === 'ArrowLeft') {
        paginate(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, slideCount]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 text-slate-100 font-sans selection:bg-orange-500/30">
      {/* Background gradient effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black opacity-80"></div>
        <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-orange-900/10 blur-[120px]"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[100px]"></div>
      </div>

      {/* Main Slide Area */}
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <AnimatePresence initial={false} custom={direction}>
          <PresentationSlide 
            key={currentIndex} 
            slide={slides[currentIndex]} 
            direction={direction} 
          />
        </AnimatePresence>
      </div>

      {/* Navigation Controls */}
      <div className="absolute bottom-6 left-0 right-0 z-50 flex items-center justify-between px-8">
        <div className="flex space-x-2">
          {slides.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${idx === currentIndex ? 'w-8 bg-orange-500' : 'w-2 bg-slate-700 hover:bg-slate-500'}`}
              onClick={() => {
                setDirection(idx > currentIndex ? 1 : -1);
                setCurrentIndex(idx);
              }}
            />
          ))}
        </div>
        
        <div className="flex items-center space-x-6">
          <span className="text-slate-400 font-mono font-bold tracking-widest text-sm">
            {String(currentIndex + 1).padStart(2, '0')} / {slideCount}
          </span>
          <div className="flex space-x-4">
            <button 
              onClick={() => paginate(-1)} 
              disabled={currentIndex === 0}
              className="p-3 rounded-full bg-slate-800/50 text-slate-300 hover:bg-orange-500 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors backdrop-blur-sm border border-slate-700"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={() => paginate(1)} 
              disabled={currentIndex === slideCount - 1}
              className="p-3 rounded-full bg-slate-800/50 text-slate-300 hover:bg-orange-500 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors backdrop-blur-sm border border-slate-700"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
            <button 
              onClick={toggleFullScreen}
              className="p-3 rounded-full bg-slate-800/50 text-slate-300 hover:bg-blue-500 hover:text-white transition-colors backdrop-blur-sm border border-slate-700 ml-4"
            >
              <Maximize className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
