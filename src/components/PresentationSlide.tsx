'use client';

import { motion } from 'framer-motion';
import { SlideData } from '../app/presentation/data';
import { Bot, User, Presentation, Database, ShieldCheck, ArrowRightCircle } from 'lucide-react';
import Image from 'next/image';

interface Props {
  slide: SlideData;
  direction: number;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

export default function PresentationSlide({ slide, direction }: Props) {
  const isAi = slide.speaker === 'ai';
  const isHuman = slide.speaker === 'human';
  const isZundamon = slide.speaker === 'zundamon';

  return (
    <motion.div
      key={slide.id}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ x: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
      className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16 w-full h-full text-slate-100"
    >
      <div className="max-w-5xl w-full h-full flex flex-col justify-center relative">
        
        {/* Speaker Badge */}
        {(isAi || isHuman || isZundamon) && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`absolute top-0 right-0 flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-lg ${
              isAi ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 
              isZundamon ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 
              'bg-blue-500/20 text-blue-400 border border-blue-500/50'
            }`}
          >
            {isAi && <Bot className="w-6 h-6" />}
            {isHuman && <User className="w-6 h-6" />}
            {isZundamon && <span className="text-xl">🌿</span>}
            <span>{isAi ? 'Antigravity AI' : isZundamon ? 'ずんだもん' : 'Human'}</span>
          </motion.div>
        )}

        {/* Title */}
        {slide.title && (
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`font-extrabold tracking-tight mb-8 ${slide.type === 'title' ? 'text-6xl md:text-8xl text-center text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-400 drop-shadow-lg leading-tight' : 'text-4xl md:text-5xl text-orange-400'}`}
            style={{ whiteSpace: 'pre-line' }}
          >
            {slide.title}
          </motion.h2>
        )}

        {/* Highlight */}
        {slide.highlight && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8 p-6 bg-slate-800/80 border-l-4 border-orange-500 rounded-r-xl shadow-2xl backdrop-blur-sm"
          >
            <p className="text-2xl md:text-3xl font-bold text-slate-100 whitespace-pre-line leading-relaxed">
              {slide.highlight}
            </p>
          </motion.div>
        )}

        {/* Content */}
        {slide.content && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, staggerChildren: 0.1 }}
            className={`space-y-6 ${slide.type === 'split' ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'}`}
          >
            {(Array.isArray(slide.content) ? slide.content : [slide.content]).map((text, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + (idx * 0.1) }}
                className="flex items-start leading-relaxed text-slate-300"
              >
                {slide.type === 'bullet' || slide.type === 'split' ? (
                  <ArrowRightCircle className="w-8 h-8 mr-4 text-orange-500 shrink-0 mt-1" />
                ) : null}
                <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-orange-400 font-bold">$1</strong>') }} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Architecture Specific Layout */}
        {slide.type === 'architecture' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col md:flex-row items-center justify-center gap-8 mt-12"
          >
            {/* Local */}
            <div className="flex flex-col items-center bg-slate-800 p-8 rounded-2xl border border-slate-700 w-full md:w-1/3 shadow-xl">
              <Presentation className="w-16 h-16 text-blue-400 mb-4" />
              <h3 className="text-2xl font-bold mb-4">自社PC内 (開発)</h3>
              <div className="w-full space-y-4">
                <div className="bg-slate-900 p-4 rounded-xl border border-blue-500/30 text-center font-semibold text-blue-300">Antigravity / Claude Code</div>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-600 text-center">Local Application (Next.js)</div>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-600 text-center">Local Database (SQLite)</div>
              </div>
            </div>

            <ArrowRightCircle className="w-12 h-12 text-slate-500 rotate-90 md:rotate-0 hidden md:block" />

            {/* Cloud */}
            <div className="flex flex-col items-center bg-slate-800 p-8 rounded-2xl border border-orange-700/50 w-full md:w-1/3 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-rose-400"></div>
              <Database className="w-16 h-16 text-orange-400 mb-4" />
              <h3 className="text-2xl font-bold mb-4">WEB (公開環境)</h3>
              <div className="w-full space-y-4">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-600 text-center flex flex-col items-center">
                  <span className="text-sm text-slate-400 mb-1">GitHub (世代管理)</span>
                  <ArrowRightCircle className="w-4 h-4 text-slate-500 my-1 rotate-90" />
                  <span>Vercel (Application)</span>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl border border-orange-500/30 text-center font-semibold text-orange-300">Supabase (Database)</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Image */}
        {slide.image && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12 flex flex-col items-center justify-center"
          >
            <div className="relative w-full max-w-2xl h-80 bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl flex items-center justify-center p-4">
               {/* 実際のプロジェクト環境に合わせてnext/imageまたは標準のimgタグを使用 */}
               <img src={slide.image} alt={slide.title || 'Slide image'} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
            </div>
            {slide.imageCaption && (
              <p className="mt-6 text-xl text-slate-400 whitespace-pre-line text-center">{slide.imageCaption}</p>
            )}
          </motion.div>
        )}

      </div>
    </motion.div>
  );
}
