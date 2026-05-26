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
          className="absolute -top-40 -left-40 w-[30rem] h-[30rem] bg-violet-600/10 rounded-full blur-[120px]"
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], x: [0, -70, 0], y: [0, 60, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-40 -right-40 w-[30rem] h-[30rem] bg-pink-500/10 rounded-full blur-[120px]"
        />
      </div>

      <header className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center"
        >
          {/* Custom brand DarijaVox logo with the circular purple badge and custom monogram DV matching the user uploaded logo beautifully */}
          <div className="h-28 md:h-36 w-auto select-none drop-shadow-2xl">
            <svg viewBox="0 0 800 800" className="h-full w-auto" xmlns="http://www.w3.org/2000/svg">
              <defs>
                {/* Background circular gradient */}
                <linearGradient id="bg-grad" x1="0.8" y1="0.1" x2="0.2" y2="0.9">
                  <stop offset="0%" stopColor="#2e0f6c" />
                  <stop offset="50%" stopColor="#170644" />
                  <stop offset="100%" stopColor="#080121" />
                </linearGradient>

                {/* V monogram and visualizer bars gradient */}
                <linearGradient id="v-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f472b6" />
                  <stop offset="50%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>

                {/* D monogram gradient */}
                <linearGradient id="d-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="85%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#f1f5f9" />
                </linearGradient>

                {/* Soft natural drop shadow for origami overlap look */}
                <filter id="v-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="-8" dy="8" stdDeviation="8" floodColor="#000000" floodOpacity="0.6" />
                </filter>
              </defs>

              {/* Background circular badge */}
              <circle cx="400" cy="400" r="380" fill="url(#bg-grad)" />

              {/* Light accent circle of color #1186AD around the logo */}
              <circle 
                cx="400" 
                cy="400" 
                r="390" 
                fill="none" 
                stroke="#1186AD" 
                strokeWidth="6" 
                strokeOpacity="0.8" 
              />

              {/* Bold stylized D Monogram in the center */}
              <path 
                d="M 180,210 H 310 C 390,210 435,255 435,335 C 435,415 390,460 310,460 H 180 Z M 240,265 V 405 H 300 C 350,405 372,380 372,335 C 372,290 350,265 300,265 Z" 
                fill="url(#d-grad)" 
              />

              {/* Fluid, layered brand V Monogram overlaying the D with soft shadow */}
              <path 
                d="M 390,210 L 470,450 H 525 L 610,210 H 550 L 498,390 L 445,210 Z" 
                fill="url(#v-grad)"
                filter="url(#v-shadow)"
              />

              {/* High-fidelity sound wave vertical indicators aligned perfectly with monogram */}
              <rect x="635" y="315" width="10" height="40" rx="5" fill="url(#v-grad)" />
              <rect x="655" y="275" width="10" height="120" rx="5" fill="url(#v-grad)" />
              <rect x="675" y="250" width="10" height="170" rx="5" fill="url(#v-grad)" />
              <rect x="695" y="285" width="10" height="100" rx="5" fill="url(#v-grad)" />
              <rect x="715" y="315" width="10" height="40" rx="5" fill="url(#v-grad)" />

              {/* Primary Typographic Wordmark */}
              <text 
                x="400" 
                y="585" 
                textAnchor="middle" 
                fontFamily="'Outfit', 'Inter', sans-serif" 
                fontSize="96" 
                letterSpacing="-1"
              >
                <tspan fill="#ffffff" fontWeight="800">Darija</tspan>
                <tspan fill="url(#v-grad)" fontWeight="800">Vox</tspan>
              </text>

              {/* Premium sub-text credit */}
              <text 
                x="560" 
                y="642" 
                textAnchor="middle" 
                fontFamily="'Inter', 'Outfit', sans-serif" 
                fontWeight="700" 
                fontSize="30" 
                fill="#f472b6" 
                letterSpacing="0.5"
              >
                by Samir Loubani
              </text>
            </svg>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden md:flex items-center gap-6"
        >
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono uppercase opacity-40 text-slate-400">System Status</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              <span className="text-xs font-semibold text-slate-100">ALL SYSTEMS NOMINAL</span>
            </div>
          </div>
          <div className="glass-card p-3 flex items-center gap-2 overflow-hidden glow-border">
             <Settings className="w-4 h-4 opacity-40 text-slate-400" />
             <span className="text-xs font-medium text-slate-300">Samir LOUBANI Studio</span>
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
                <div className="flex flex-col">
                  <h2 className="text-sm font-display font-medium uppercase tracking-wider text-slate-400">Texte Source</h2>
                  <span className="text-[10px] text-fuchsia-400/80 font-mono uppercase tracking-wide">N'importe quelle langue</span>
                </div>
              </div>
              <div className="px-3 py-1 rounded-full bg-white/5 text-[10px] font-bold text-slate-400 border border-white/5">
                AI CORE ACTIVATED
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Écrivez ou collez votre script dans n'importe quelle langue (Français, Anglais, Arabe standard, Espagnol, etc.) pour le traduire et le synthétiser en Darija marocain..."
              className="w-full h-56 bg-transparent text-xl font-medium text-slate-100 placeholder:text-slate-500 resize-none outline-none border-none focus:ring-0 leading-relaxed transition-all"
            />
            
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <div className="flex gap-2">
                {VOICES.slice(0, 3).map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => setSettings({ ...settings, voiceName: voice.id })}
                    className={`px-5 py-2 rounded-2xl text-[10px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-0.5 min-w-[70px] ${
                      settings.voiceName === voice.id 
                        ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white' 
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    <span>{voice.name.split(' ')[0]}</span>
                    <span className={`text-[8px] font-medium tracking-wider lowercase transition-colors ${
                      settings.voiceName === voice.id ? 'text-white/80' : 'text-slate-500'
                    }`}>
                      {voice.gender.toLowerCase()}
                    </span>
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
            className="w-full h-20 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 hover:opacity-90 disabled:opacity-40 disabled:scale-100 text-white font-display text-lg font-bold flex items-center justify-center gap-4 group transition-all duration-300 active:scale-95 border border-white/20 shadow-lg shadow-purple-500/10 rounded-[2.5rem]"
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
                  <span>Synthèse du dialecte...</span>
                </motion.div>
              ) : (
                <motion.div 
                  key="idle" 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  <span>Générer l'Audio en Darija</span>
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
                className="h-full min-h-[500px] glass-card flex flex-col items-center justify-center text-center p-12 border-dashed border-white/20"
              >
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/5">
                  <Headphones className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-xl font-display font-medium text-white mb-2">Prêt pour la Synthèse</h3>
                <p className="text-sm text-slate-400 max-w-xs mx-auto">
                  Saisissez un texte dans n'importe quelle langue pour lancer la traduction et la synthèse vocale en Darija marocain.
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
                <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 animate-pulse" />
                <div className="relative z-10 space-y-8 text-center w-full">
                   <div className="flex justify-center">
                     <div className="relative w-32 h-32">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-0 border-t-2 border-fuchsia-500 rounded-full"
                        />
                        <motion.div 
                          animate={{ rotate: -360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-4 border-b-2 border-violet-500 rounded-full opacity-50"
                        />
                        <div className="absolute inset-0 m-auto w-12 h-12 flex items-center justify-center">
                          <Mic className="w-6 h-6 text-white" />
                        </div>
                     </div>
                   </div>
                   <div>
                     <h3 className="text-2xl font-display font-bold text-white">Neural Synthesis</h3>
                     <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mt-2">Harmonizing Cadence & Tone</p>
                   </div>
                   <div className="max-w-xs mx-auto">
                     <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ x: '-100%' }}
                          animate={{ x: '100%' }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          className="h-full w-1/2 bg-gradient-to-r from-fuchsia-500 to-indigo-500 rounded-full"
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
                          className="w-20 h-20 rounded-full bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 text-white flex items-center justify-center hover:scale-105 transition-transform shadow-2xl shadow-purple-500/20 active:scale-95"
                        >
                          {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-2" />}
                        </button>
                        <button 
                          onClick={restartAudio}
                          className="w-14 h-14 rounded-full glass-card flex items-center justify-center hover:bg-white/10 transition-all text-slate-400 hover:text-white"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </div>

                      <button 
                         onClick={downloadAudio}
                         className="px-8 py-4 bg-gradient-to-r from-fuchsia-600/10 to-indigo-600/10 border border-fuchsia-500/20 hover:from-fuchsia-600/20 hover:to-indigo-600/20 text-white rounded-[2.5rem] transition-all font-display text-sm font-bold flex items-center gap-3 active:scale-95"
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
                      <div className="h-24 glass-card bg-slate-950/20 border-white/5 border flex items-end justify-center gap-1.5 p-6 overflow-hidden">
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
                             className="w-1.5 bg-fuchsia-500/80 rounded-full"
                             style={{ height: '4px' }}
                           />
                         ))}
                      </div>
                   </div>
                </div>

                {/* Script Display */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-card p-8 space-y-4 bg-slate-950/40 border border-white/5">
                     <div className="flex items-center justify-between text-slate-400">
                       <span className="text-[10px] font-mono uppercase tracking-widest">Arabic Synthesis</span>
                       <button onClick={() => copyToClipboard(script.arabicScript)} className="hover:text-white transition-colors">
                         <Copy className="w-4 h-4" />
                       </button>
                     </div>
                     <p className="text-2xl font-bold leading-relaxed text-right arabic-font text-slate-100" dir="rtl">
                        {script.arabicScript}
                      </p>
                   </div>

                  <div className="glass-card p-8 space-y-4 bg-slate-950/30 border border-white/5">
                     <div className="flex items-center justify-between text-slate-400">
                       <span className="text-[10px] font-mono uppercase tracking-widest">Phonetic Guide</span>
                       <button onClick={() => copyToClipboard(script.phoneticScript)} className="hover:text-white transition-colors">
                         <Copy className="w-4 h-4" />
                       </button>
                     </div>
                     <p className="text-sm font-mono text-slate-300 leading-relaxed">
                        {script.phoneticScript}
                      </p>
                   </div>
                </div>

                {/* Director's Notes */}
                <div className="glass-card p-8 bg-slate-950/60 border border-fuchsia-500/20 text-white relative overflow-hidden">
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
                className="p-6 glass-card bg-rose-950/40 border border-rose-500/30 flex items-center gap-4 text-rose-300"
              >
                <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center flex-shrink-0">
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

      <footer className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between border-t border-white/10">
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
