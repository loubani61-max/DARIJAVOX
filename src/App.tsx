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
      // Pause logic
      sourceNodeRef.current?.stop();
      sourceNodeRef.current = null;
      pausedAtRef.current = context.currentTime - startTimeRef.current;
      setIsPlaying(false);
      setIsPaused(true);
    } else {
      // Play (or resume) logic
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

    // Fallback WAV generator
    const getWavBlob = () => {
      const buffer = new ArrayBuffer(44 + len);
      const view = new DataView(buffer);
      view.setUint32(0, 0x52494646, false);
      view.setUint32(4, 36 + len, true);
      view.setUint32(8, 0x57415645, false);
      view.setUint32(12, 0x666d7420, false);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // mono
      view.setUint32(24, 24000, true); // sample rate
      view.setUint32(28, 24000 * 2, true); // byte rate
      view.setUint16(32, 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample
      view.setUint32(36, 0x64617461, false);
      view.setUint32(40, len, true);
      for (let i = 0; i < len; i++) {
        view.setUint8(44 + i, binaryString.charCodeAt(i));
      }
      return new Blob([buffer], { type: 'audio/wav' });
    };

    try {
      // 1. Resolve LameJS Encoder robustly
      const lib: any = lamejs;
      let Mp3EncoderCtor = lib.Mp3Encoder;
      if (!Mp3EncoderCtor && lib.default) {
        Mp3EncoderCtor = lib.default.Mp3Encoder || (typeof lib.default === 'function' ? lib.default : null);
      }
      
      // Fallback to window global if package is acting up in browser
      if (!Mp3EncoderCtor && typeof window !== 'undefined' && (window as any).lamejs) {
        Mp3EncoderCtor = (window as any).lamejs.Mp3Encoder;
      }
      
      if (!Mp3EncoderCtor) {
        throw new Error("L'encodeur MP3 n'est pas disponible.");
      }

      // 2. Prepare PCM Data (Signed 16-bit Mono)
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
        if (mp3buf.length > 0) {
          // Convert Int8Array to Uint8Array for better Blob compatibility
          mp3Data.push(new Uint8Array(mp3buf));
        }
      }
      
      const last = mp3encoder.flush();
      if (last.length > 0) {
        mp3Data.push(new Uint8Array(last));
      }
      
      const blob = new Blob(mp3Data, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `darija_vo_${Date.now()}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      setError(null); // Clear any previous error
    } catch (err: any) {
      console.error('MP3 Conversion failed:', err);
      // Fallback
      const blob = getWavBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `darija_vo_${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      
      setError(`Format MP3 t'3ekkes (error: ${err.message}). Sajjelna lik f WAV f-blastou.`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#141414] font-sans selection:bg-[#9E9319] selection:text-white">
      {/* Studio Header */}
      <header className="border-b border-[#19249E] bg-[#19249E] text-white p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-[#9E9319] p-2 rounded-sm shadow-[0_0_15px_rgba(158,147,25,.5)]">
            <Radio className="w-5 h-5 text-[#19249E]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">DarijaVox</h1>
            <p className="text-[10px] font-mono tracking-widest uppercase opacity-80">MOROCCAN VO STUDIO // by Samir LOUBANI</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-[#9E9319] animate-pulse' : 'bg-green-400'}`} />
            <span>{isGenerating ? 'PROCESSING' : 'LIVE'}</span>
          </div>
          <div className="h-4 w-[1px] bg-white/20" />
          <span>V1.1.0</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[1fr,1.5fr] gap-8">
        {/* Left Column: Input Panel */}
        <section className="space-y-6">
          <div className="bg-[#19249E] text-white rounded-xl shadow-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">Source Input</span>
              <Languages className="w-4 h-4 opacity-60" />
            </div>
            
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter text to convert (English, Arabic, French...)"
              className="w-full h-48 bg-white/5 border border-white/10 p-4 rounded-lg outline-none resize-none text-lg font-medium placeholder:text-white/30 scrollbar-hide focus:border-[#9E9319]/50 transition-colors"
            />
            
            <div className="pt-4 border-t border-white/10">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase opacity-60 italic">Selected Persona</span>
                <span className="text-xs font-semibold text-[#9E9319]">Clean Casablanca VO Artist</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#19249E]/10 rounded-xl p-6 shadow-md space-y-6">
            <h3 className="text-[10px] font-mono tracking-widest uppercase opacity-40 text-[#19249E]">Studio Settings</h3>
            
            <div className="space-y-4">
              {/* Voice Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase opacity-60">Voice Profile</label>
                <select 
                  value={settings.voiceName}
                  onChange={(e) => setSettings({ ...settings, voiceName: e.target.value })}
                  className="w-full bg-[#19249E]/5 border border-[#19249E]/10 rounded-lg px-3 py-2 text-xs font-bold text-[#19249E] outline-none"
                >
                  {VOICES.map(voice => (
                    <option key={voice.id} value={voice.id}>{voice.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !inputText.trim()}
            className="w-full group relative flex items-center justify-center gap-2 bg-[#9E9319] hover:bg-[#BDB21E] disabled:bg-gray-400 text-[#19249E] px-6 py-4 rounded-xl font-bold transition-all overflow-hidden shadow-lg"
            id="generate-btn"
          >
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Sparkles className="w-5 h-5 animate-spin" />
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <span className="tracking-widest">GENERATE DARIJA SCRIPT</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </section>

        {/* Right Column: Output Studio */}
        <section className="space-y-6 min-h-[600px]">
          {!script && !isGenerating && (
            <div className="h-full border-2 border-dashed border-[#19249E]/20 rounded-2xl flex flex-col items-center justify-center text-[#19249E]/30 gap-4 bg-white/30">
              <Headphones className="w-16 h-16 stroke-1" />
              <p className="text-sm font-mono tracking-widest uppercase">Waiting for session input...</p>
            </div>
          )}

          {isGenerating && (
            <div className="h-full bg-white rounded-2xl p-8 shadow-xl border border-black/5 flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-[#9E9319]/20 border-t-[#9E9319] rounded-full animate-spin" />
                <Mic className="absolute inset-0 m-auto w-6 h-6 text-[#9E9319]" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold animate-pulse text-[#19249E]">Adapting to Moroccan Darija...</p>
                <p className="text-xs font-mono opacity-50 mt-2">ANALYZING CADENCE & DIALECT NUANCES</p>
              </div>
              
              <div className="w-full max-w-xs h-1 bg-gray-100 rounded-full overflow-hidden mt-4">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="h-full bg-[#19249E]"
                />
              </div>
            </div>
          )}

          {script && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Audio Monitor */}
              <div className="bg-[#F8F9FF] rounded-2xl p-6 border border-[#19249E]/10 shadow-lg space-y-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={togglePlayPause}
                      disabled={!audioBase64}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all bg-[#9E9319] text-[#19249E] hover:scale-105 shadow-md disabled:opacity-30`}
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6 fill-current" />
                      ) : (
                        <Play className="w-6 h-6 fill-current ml-1" />
                      )}
                    </button>

                    <button
                      onClick={restartAudio}
                      disabled={!audioBase64}
                      className="w-12 h-12 rounded-full border border-[#19249E]/20 flex items-center justify-center text-[#19249E] hover:bg-[#19249E]/5 transition-all disabled:opacity-20"
                      title="Restart"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="h-10 w-[1px] bg-[#19249E]/10 mx-2 hidden sm:block" />

                  <button
                    onClick={downloadAudio}
                    disabled={!audioBase64}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#19249E] text-[#19249E] hover:bg-[#19249E] hover:text-white transition-all disabled:opacity-20 text-[10px] font-mono tracking-widest uppercase"
                  >
                    <Download className="w-4 h-4" />
                    <span>Save Session</span>
                  </button>
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono tracking-widest uppercase opacity-40 text-[#19249E]">
                    <span>Audio Monitor</span>
                    <span>24.0 kHz / MP3 Output</span>
                  </div>
                  <div className="h-12 bg-[#19249E]/5 rounded flex items-center px-4 gap-1">
                    {[...Array(24)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ 
                          height: isPlaying ? [10, Math.random() * 40 + 10, 10] : 10,
                        }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="w-full bg-[#19249E]/60 rounded-full"
                        style={{ height: '10px' }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Scripts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-[#19249E]/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono tracking-widest uppercase opacity-40 text-[#19249E]">Arabic Script</span>
                    <button onClick={() => copyToClipboard(script.arabicScript)} className="p-1 hover:bg-[#19249E]/5 rounded transition-colors text-[#19249E]/40 hover:text-[#19249E]">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-xl font-medium leading-relaxed arabic-font text-right text-[#19249E]" dir="rtl">
                    {script.arabicScript}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-[#19249E]/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono tracking-widest uppercase opacity-40 text-[#19249E]">Phonetic Guide</span>
                    <button onClick={() => copyToClipboard(script.phoneticScript)} className="p-1 hover:bg-[#19249E]/5 rounded transition-colors text-[#19249E]/40 hover:text-[#19249E]">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-sm font-mono leading-relaxed opacity-80 text-[#19249E]">
                    {script.phoneticScript}
                  </div>
                </div>
              </div>

              {/* VO Notes */}
              <div className="bg-[#19249E] text-white rounded-xl p-6 shadow-2xl border border-white/10 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#9E9319]" />
                  <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">Artist Notes</span>
                </div>
                <div className="text-sm leading-relaxed opacity-90 space-y-2 italic">
                  {script.voNotes.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="mt-12 border-t border-[#19249E]/10 p-8 text-center text-[10px] font-mono tracking-widest uppercase opacity-40 text-[#19249E]">
        Professional Darija Synthesis Engine • Casablanca Edition
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        .arabic-font {
          font-family: 'IBM+Plex+Sans+Arabic', sans-serif;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
