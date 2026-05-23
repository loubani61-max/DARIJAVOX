/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import lamejs from 'lamejs';
import { 
  Mic, 
  Volume2, 
  FileText, 
  Settings, 
  Play, 
  Pause,
  RotateCcw,
  Download,
  Languages, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  ChevronRight,
  Headphones,
  Radio,
  AudioLines as WaveIcon
} from 'lucide-react';
import { generateDarijaScript, generateDarijaAudio, type DarijaScript, type AudioSettings } from './services/geminiService';

const VOICES = [
  { id: 'Kore', name: 'Kore (Female - Neutral)', gender: 'Female' },
  { id: 'Zephyr', name: 'Zephyr (Female - Soft)', gender: 'Female' },
  { id: 'Charon', name: 'Charon (Male - Deep)', gender: 'Male' },
  { id: 'Fenrir', name: 'Fenrir (Male - Vibrant)', gender: 'Male' },
  { id: 'Puck', name: 'Puck (Male - Youthful)', gender: 'Male' },
];

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [script, setScript] = useState<DarijaScript | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<AudioSettings>({
    voiceName: 'Kore',
    speakingRate: 1.0,
    pitch: 1.0
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    setScript(null);
    setAudioBase64(null);
    setIsPlaying(false);
    setIsPaused(false);
    
    try {
      const generatedScript = await generateDarijaScript(inputText);
      setScript(generatedScript);
      
      const audio = await generateDarijaAudio(generatedScript.arabicScript, settings);
      if (audio) {
        setAudioBase64(audio);
        prepareAudio(audio);
      }
    } catch (err: any) {
      setError(`L-khata2 f l-khidma: ${err.message || 'L-moushkil ma3roufsh'}. Réessayez s'il vous plaît.`);
      console.error('Generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const prepareAudio = async (base64: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const context = audioContextRef.current;
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const bufferLen = len / 2;
    const audioBuffer = context.createBuffer(1, bufferLen, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < bufferLen; i++) {
      channelData[i] = dataView.getInt16(i * 2, true) / 32768;
    }
    audioBufferRef.current = audioBuffer;
  };

  const togglePlayPause = async () => {
    if (!audioBufferRef.current) {
      if (audioBase64) await prepareAudio(audioBase64);
      else return;
    }

    const context = audioContextRef.current!;
    if (context.state === 'suspended') {
      await context.resume();
    }

    if (isPlaying) {
      sourceNodeRef.current?.stop();
      sourceNodeRef.current = null;
      pausedAtRef.current = context.currentTime - startTimeRef.current;
      setIsPlaying(false);
      setIsPaused(true);
    } else {
      const source = context.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(context.destination);
      
      const offset = isPaused ? pausedAtRef.current : 0;
      source.start(0, offset % audioBufferRef.current!.duration);
      startTimeRef.current = context.currentTime - offset;
      
      source.onended = () => {
        if (sourceNodeRef.current === source) {
          setIsPlaying(false);
          setIsPaused(false);
          pausedAtRef.current = 0;
        }
      };
      
      sourceNodeRef.current = source;
      setIsPlaying(true);
      setIsPaused(false);
    }
  };

  const restartAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPaused(false);
    pausedAtRef.current = 0;
    togglePlayPause();
  };

  const downloadAudio = () => {
    if (!audioBase64) return;
    const binaryString = window.atob(audioBase64);
    const len = binaryString.length;

    const getWavBlob = () => {
      const buffer = new ArrayBuffer(44 + len);
      const view = new DataView(buffer);
      view.setUint32(0, 0x52494646, false);
      view.setUint32(4, 36 + len, true);
      view.setUint32(8, 0x57415645, false);
      view.setUint32(12, 0x666d7420, false);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 24000, true);
      view.setUint32(28, 24000 * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      view.setUint32(36, 0x64617461, false);
      view.setUint32(40, len, true);
      for (let i = 0; i < len; i++) {
        view.setUint8(44 + i, binaryString.charCodeAt(i));
      }
      return new Blob([buffer], { type: 'audio/wav' });
    };

    try {
      const lib: any = lamejs;
      let Mp3EncoderCtor = lib.Mp3Encoder;
      if (!Mp3EncoderCtor && lib.default) {
        Mp3EncoderCtor = lib.default.Mp3Encoder || (typeof lib.default === 'function' ? lib.default : null);
      }
      if (!Mp3EncoderCtor && typeof window !== 'undefined' && (window as any).lamejs) {
        Mp3EncoderCtor = (window as any).lamejs.Mp3Encoder;
      }
      if (!Mp3EncoderCtor) throw new Error("Encodeur MP3 non dispo.");

      const bufferLen = Math.floor(len / 2);
      const pcmData = new Int16Array(bufferLen);
      for (let i = 0; i < bufferLen; i++) {
        const low = binaryString.charCodeAt(i * 2);
        const high = binaryString.charCodeAt(i * 2 + 1);
        let s = (high << 8) | low;
        if (s > 32767) s -= 65536;
        pcmData[i] = s;
      }

      const mp3encoder = new Mp3EncoderCtor(1, 24000, 128);
      const mp3Data: Uint8Array[] = [];
      const blockSize = 1152; 
      for (let i = 0; i < pcmData.length; i += blockSize) {
        const chunk = pcmData.subarray(i, Math.min(i + blockSize, pcmData.length));
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));
      }
      const last = mp3encoder.flush();
      if (last.length > 0) mp3Data.push(new Uint8Array(last));
      
      const blob = new Blob(mp3Data, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `darija_vo_${Date.now()}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      setError(null);
    } catch (err: any) {
      const blob = getWavBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `darija_vo_${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      setError(`MP3 fail, saved as WAV.`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen font-sans">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden -z-10 pointer-events-none">
        <motion.div 
          animate={{ scale: [1, 1.3, 1], x: [0, 70, 0], y: [0, -40, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-40 -left-40 w-[30rem] h-[30rem] bg-pastel-mint/80 rounded-full blur-[120px]"
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], x: [0, -70, 0], y: [0, 60, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-40 -right-40 w-[30rem] h-[30rem] bg-pastel-lavender/80 rounded-full blur-[120px]"
        />
      </div>

      <header className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center"
        >
          {/* Recreating the DarijaVox Logo exactly as requested */}
          <div className="h-28 md:h-36 w-auto select-none drop-shadow-2xl">
            <svg viewBox="0 0 1024 1024" className="h-full w-auto filter drop-shadow-xl" xmlns="http://www.w3.org/2000/svg">
              {/* Background Blue Square */}
              <rect width="900" height="900" x="62" y="62" rx="180" fill="#3D9BEE" />
              
              {/* White Document */}
              <path d="M220 300 C 220 285, 235 270, 250 270 H 460 L 550 360 V 700 C 550 715, 535 730, 520 730 H 250 C 235 730, 220 715, 220 700 Z" fill="white" />
              <rect x="280" y="420" width="180" height="25" rx="5" fill="#3D9BEE" opacity="0.6" />
              <rect x="280" y="475" width="150" height="25" rx="5" fill="#3D9BEE" opacity="0.6" />
              <rect x="280" y="530" width="120" height="25" rx="5" fill="#3D9BEE" opacity="0.6" />
              <path d="M460 270 V 315 C 460 340, 485 365, 510 365 H 550 L 460 270 Z" fill="#E0E0E0" />

              {/* Speaker / Megaphone (Blue Shades for 3D/Origami effect) */}
              <path d="M480 500 L 710 370 V 730 L 480 600 Z" fill="#2E7ED4" />
              <path d="M480 500 L 640 500 L 710 730 L 480 600 Z" fill="#5AA6F7" />
              <path d="M480 500 L 600 520 L 710 370 Z" fill="#8AC2FF" />
              
              {/* Sound Waves */}
              <path d="M750 490 Q 770 550 750 610" stroke="white" strokeWidth="25" fill="none" strokeLinecap="round" strokeOpacity="0.4" />
              <path d="M790 450 Q 820 550 790 650" stroke="white" strokeWidth="25" fill="none" strokeLinecap="round" strokeOpacity="0.7" />
              <path d="M830 410 Q 880 550 830 690" stroke="white" strokeWidth="28" fill="none" strokeLinecap="round" />

              {/* Text Label */}
              <text x="512" y="855" fontSize="145" fontWeight="900" fill="white" textAnchor="middle" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '4px' }}>DARIJAVOX</text>
            </svg>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden md:flex items-center gap-6"
        >
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono uppercase opacity-40">System Status</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              <span className="text-xs font-semibold">ALL SYSTEMS NOMINAL</span>
            </div>
          </div>
          <div className="glass-card p-3 flex items-center gap-2 overflow-hidden glow-border">
             <Settings className="w-4 h-4 opacity-40" />
             <span className="text-xs font-medium">Samir LOUBANI Studio</span>
          </div>
        </motion.div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-20 grid grid-cols-1 lg:grid-cols-[1fr,1.4fr] gap-12">
        {/* Input Panel */}
        <div className="space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <h2 className="text-sm font-display font-medium uppercase tracking-wider text-slate-500">Source Text</h2>
              </div>
              <div className="px-3 py-1 rounded-full bg-slate-900/5 text-[10px] font-bold text-slate-500">
                AI CORE ACTIVATED
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter your script here..."
              className="w-full h-56 bg-transparent text-xl font-medium placeholder:text-slate-300 resize-none outline-none border-none focus:ring-0 leading-relaxed transition-all"
            />
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-900/5">
              <div className="flex gap-2">
                {VOICES.slice(0, 3).map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => setSettings({ ...settings, voiceName: voice.id })}
                    className={`px-4 py-2 rounded-2xl text-[10px] font-bold uppercase transition-all ${
                      settings.voiceName === voice.id 
                        ? 'bg-slate-900 text-white' 
                        : 'bg-slate-900/5 text-slate-400 hover:bg-slate-900/10'
                    }`}
                  >
                    {voice.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={handleGenerate}
            disabled={isGenerating || !inputText.trim()}
            className="w-full h-20 glass-card bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-display text-lg font-bold flex items-center justify-center gap-4 group transition-all"
          >
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.div 
                  key="gen" 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  <Sparkles className="w-6 h-6 animate-spin" />
                  <span>Synthesizing Dialect...</span>
                </motion.div>
              ) : (
                <motion.div 
                  key="idle" 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  <span>Generate Moroccan Audio</span>
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Studio Panel */}
        <div className="space-y-8">
          <AnimatePresence mode="wait">
            {!script && !isGenerating ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full min-h-[500px] glass-card flex flex-col items-center justify-center text-center p-12 border-dashed"
              >
                <div className="w-24 h-24 rounded-full bg-slate-900/5 flex items-center justify-center mb-8">
                  <Headphones className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-display font-medium text-slate-900 mb-2">Ready for Capture</h3>
                <p className="text-sm text-slate-400 max-w-xs mx-auto">
                  Submit a script to initiate the Moroccan synthesis process. Modern CAD for the Voice Industry.
                </p>
              </motion.div>
            ) : isGenerating ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[500px] glass-card flex flex-col items-center justify-center p-12 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-pastel-mint/10 to-pastel-lavender/10 animate-pulse" />
                <div className="relative z-10 space-y-8 text-center w-full">
                   <div className="flex justify-center">
                     <div className="relative w-32 h-32">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-0 border-t-2 border-slate-900 rounded-full"
                        />
                        <motion.div 
                          animate={{ rotate: -360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-4 border-b-2 border-slate-400 rounded-full opacity-50"
                        />
                        <div className="absolute inset-0 m-auto w-12 h-12 flex items-center justify-center">
                          <Mic className="w-6 h-6 text-slate-900" />
                        </div>
                     </div>
                   </div>
                   <div>
                     <h3 className="text-2xl font-display font-bold text-slate-900">Neural Synthesis</h3>
                     <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mt-2">Harmonizing Cadence & Tone</p>
                   </div>
                   <div className="max-w-xs mx-auto">
                     <div className="h-1 bg-slate-900/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ x: '-100%' }}
                          animate={{ x: '100%' }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          className="h-full w-1/2 bg-slate-900 rounded-full"
                        />
                     </div>
                   </div>
                </div>
              </motion.div>
            ) : script && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Audio Engine */}
                <div className="glass-card p-10 space-y-8 relative overflow-hidden">
                   <div className="flex flex-wrap items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <button 
                          onClick={togglePlayPause}
                          className="w-20 h-20 rounded-full bg-slate-900 text-white flex items-center justify-center hover:scale-105 transition-transform shadow-2xl active:scale-95"
                        >
                          {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-2" />}
                        </button>
                        <button 
                          onClick={restartAudio}
                          className="w-14 h-14 rounded-full glass-card flex items-center justify-center hover:bg-slate-900/5 transition-all text-slate-400 hover:text-slate-900"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </div>

                      <button 
                         onClick={downloadAudio}
                         className="px-8 py-4 glass-card bg-white hover:bg-slate-900 hover:text-white transition-all font-display text-sm font-bold flex items-center gap-3 active:scale-95"
                      >
                         <Download className="w-5 h-5" />
                         <span>EXPORT MASTER (.MP3)</span>
                      </button>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <WaveIcon className="w-4 h-4 text-slate-400" />
                          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400">Atmospheric Monitor</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">24.0 KHZ / 128 KBPS</span>
                      </div>
                      <div className="h-24 glass-card bg-slate-900/5 border-none flex items-end justify-center gap-1.5 p-6 overflow-hidden">
                         {[...Array(40)].map((_, i) => (
                           <motion.div 
                             key={i}
                             animate={{ 
                               height: isPlaying 
                                 ? [Math.random() * 20 + 5, Math.random() * 80 + 10, Math.random() * 20 + 5] 
                                 : 4 
                             }}
                             transition={{ 
                               duration: 0.4, 
                               repeat: Infinity, 
                               delay: i * 0.02,
                               ease: "easeInOut"
                             }}
                             className="w-1.5 bg-slate-900/20 rounded-full"
                             style={{ height: '4px' }}
                           />
                         ))}
                      </div>
                   </div>
                </div>

                {/* Script Display */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="glass-card p-8 space-y-4 bg-white/60">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-mono uppercase tracking-widest">Arabic Synthesis</span>
                        <button onClick={() => copyToClipboard(script.arabicScript)} className="hover:text-slate-900 transition-colors">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-2xl font-bold leading-relaxed text-right arabic-font text-slate-900" dir="rtl">
                        {script.arabicScript}
                      </p>
                   </div>

                   <div className="glass-card p-8 space-y-4 bg-white/60">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-mono uppercase tracking-widest">Phonetic Guide</span>
                        <button onClick={() => copyToClipboard(script.phoneticScript)} className="hover:text-slate-900 transition-colors">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm font-mono text-slate-600 leading-relaxed">
                        {script.phoneticScript}
                      </p>
                   </div>
                </div>

                {/* Director's Notes */}
                <div className="glass-card p-8 bg-slate-900 text-white relative overflow-hidden">
                   <motion.div 
                      className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"
                   />
                   <div className="relative z-10">
                      <div className="space-y-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">Artist Instruction</span>
                        <p className="text-sm leading-relaxed text-white/80 italic font-medium">
                          {script.voNotes}
                        </p>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="p-6 glass-card bg-rose-50 border-rose-100 flex items-center gap-4 text-rose-600"
              >
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold uppercase tracking-tight">System Interrupt</p>
                  <p className="text-xs opacity-80 leading-relaxed font-medium">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between border-t border-slate-900/5">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-400 mb-4 md:mb-0">
          Powered by Gemini 1.5 Pro & Samir LOUBANI Labs
        </p>
        <div className="flex gap-8 text-[10px] font-mono uppercase tracking-widest text-slate-400">
          <span className="flex items-center gap-2 italic">
            <div className="w-1 h-1 bg-emerald-400 rounded-full animate-ping" />
            SYNTHESIS ENGINE READY
          </span>
          <span>EST. 2026 // CASABLANCA</span>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        .arabic-font {
          font-family: 'IBM+Plex+Sans+Arabic', sans-serif;
        }
      `}</style>
    </div>
  );
}
