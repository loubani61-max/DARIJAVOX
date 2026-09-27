/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
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
  Sliders,
  Key,
  Lock,
  Unlock,
  Info,
  Sun,
  Moon,
  Eye,
  EyeOff,
  AudioLines as WaveIcon,
  Timer,
  Zap,
  Activity,
  History,
  Trash2,
  ArrowUpRight,
  Clock
} from 'lucide-react';
import { generateDarijaScript, generateDarijaAudio, hasDefaultApiKey, type DarijaScript, type AudioSettings } from './services/geminiService';

export interface PerformanceMetrics {
  scriptTimeMs: number;
  audioTimeMs: number | null;
  totalTimeMs: number;
  timestamp: Date;
}

export interface HistoryItem {
  id: string;
  inputText: string;
  script: DarijaScript;
  audioBase64?: string | null;
  timestamp: number;
  voiceName: string;
  tone?: string;
  metrics?: PerformanceMetrics | null;
}

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "À l'instant";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays} j`;
}

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
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [script, setScript] = useState<DarijaScript | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toneDropdownOpen, setToneDropdownOpen] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('darijavox_history');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.slice(0, 5);
          }
        }
      } catch (e) {
        console.error('Failed to load history from localStorage', e);
      }
    }
    return [];
  });
  
  const [apiKey, setApiKey] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('darijavox_gemini_api_key') || '' : '';
  });
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const [settings, setSettings] = useState<AudioSettings>({
    voiceName: 'Kore',
    speakingRate: 1.0,
    pitch: 1.0,
    tone: 'Standard'
  });
  
  const [isLocalVoiceFallbackActive, setIsLocalVoiceFallbackActive] = useState(false);
  
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('darijavox_theme') as 'dark' | 'light') || 'dark';
    }
    return 'dark';
  });
  const [screenDim, setScreenDim] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('darijavox_screendim') || '0');
    }
    return 0;
  });
  const [blueLightFilter, setBlueLightFilter] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('darijavox_bluelight') || '0');
    }
    return 0;
  });
  const [showVisualComfortMenu, setShowVisualComfortMenu] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('darijavox_theme', theme);
      if (theme === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('darijavox_screendim', String(screenDim));
    }
  }, [screenDim]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('darijavox_bluelight', String(blueLightFilter));
    }
  }, [blueLightFilter]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    setScript(null);
    setAudioBase64(null);
    setMetrics(null);
    setIsPlaying(false);
    setIsPaused(false);
    
    // Proactive check for API key
    if (!apiKey && !hasDefaultApiKey()) {
      setError("Clé API Gemini absente. Puisque vous avez déployé l'application (par exemple sur Cloudflare), vous devez configurer votre propre Clé API Gemini (gratuite). Cliquez sur le bouton 'Configurer Clé API' en haut à droite !");
      setShowApiKeyModal(true);
      setIsGenerating(false);
      return;
    }
    
    const startTimeTotal = performance.now();
    try {
      setIsLocalVoiceFallbackActive(false);
      const scriptStartTime = performance.now();
      const generatedScript = await generateDarijaScript(inputText);
      const scriptElapsed = Math.round(performance.now() - scriptStartTime);
      setScript(generatedScript);
      
      let audioElapsed: number | null = null;
      let audio: string | null = null;
      try {
        const audioStartTime = performance.now();
        audio = await generateDarijaAudio(generatedScript.arabicScript, generatedScript.phoneticScript, settings);
        audioElapsed = Math.round(performance.now() - audioStartTime);
        if (audio) {
          setAudioBase64(audio);
          prepareAudio(audio);
        }
      } catch (audioErr) {
        console.warn("Gemini TTS audio generation failed, activating local speech synthesis fallback.", audioErr);
        setIsLocalVoiceFallbackActive(true);
      }

      const totalElapsed = Math.round(performance.now() - startTimeTotal);
      const newMetrics: PerformanceMetrics = {
        scriptTimeMs: scriptElapsed,
        audioTimeMs: audioElapsed,
        totalTimeMs: totalElapsed,
        timestamp: new Date()
      };
      setMetrics(newMetrics);

      // Save to local history (capped to 5 latest scripts)
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 6),
        inputText,
        script: generatedScript,
        audioBase64: audio || null,
        timestamp: Date.now(),
        voiceName: settings.voiceName,
        tone: settings.tone,
        metrics: newMetrics
      };

      setHistory(prev => {
        const filtered = prev.filter(item => item.inputText.trim() !== inputText.trim());
        const updated = [newHistoryItem, ...filtered].slice(0, 5);
        try {
          localStorage.setItem('darijavox_history', JSON.stringify(updated));
        } catch (e) {
          console.warn('Quota exceeded in localStorage with audio payload, saving without audioBase64', e);
          try {
            const stripped = updated.map(item => ({ ...item, audioBase64: null }));
            localStorage.setItem('darijavox_history', JSON.stringify(stripped));
          } catch (err) {
            console.error('Failed to store history in localStorage:', err);
          }
        }
        return updated;
      });
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg === 'API_KEY_MISSING' || errMsg.includes('API key') || errMsg.includes('KEY_INVALID') || errMsg.includes('API_KEY')) {
        setError("Clé API Gemini invalide ou absente. S'il vous plaît, configurez une clé API valide pour DarijaVox.");
        setShowApiKeyModal(true);
      } else {
        setError(`L-khata2 f l-khidma: ${errMsg || 'L-moushkil ma3roufsh'}. Réessayez s'il vous plaît.`);
      }
      console.error('Generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAudioOnly = async () => {
    if (!script) return;
    setIsGeneratingAudio(true);
    setError(null);
    setAudioBase64(null);
    setIsPlaying(false);
    setIsPaused(false);
    
    audioBufferRef.current = null;
    
    if (!apiKey && !hasDefaultApiKey()) {
      setError("Clé API Gemini absente. S'il vous plaît, configurez votre clé API Gemini (gratuite) pour continuer.");
      setShowApiKeyModal(true);
      setIsGeneratingAudio(false);
      return;
    }

    try {
      setIsLocalVoiceFallbackActive(false);
      const audioStartTime = performance.now();
      const audio = await generateDarijaAudio(script.arabicScript, script.phoneticScript, settings);
      const audioElapsed = Math.round(performance.now() - audioStartTime);
      if (audio) {
        setAudioBase64(audio);
        await prepareAudio(audio);
      }
      setMetrics(prev => {
        const sTime = prev ? prev.scriptTimeMs : 0;
        return {
          scriptTimeMs: sTime,
          audioTimeMs: audioElapsed,
          totalTimeMs: sTime + audioElapsed,
          timestamp: new Date()
        };
      });

      // Update history item with fresh audio if found
      if (audio && script) {
        setHistory(prev => {
          const updated = prev.map(item => {
            if (item.script.arabicScript === script.arabicScript) {
              return {
                ...item,
                audioBase64: audio,
                voiceName: settings.voiceName,
                tone: settings.tone,
                metrics: {
                  scriptTimeMs: item.metrics?.scriptTimeMs ?? 0,
                  audioTimeMs: audioElapsed,
                  totalTimeMs: (item.metrics?.scriptTimeMs ?? 0) + audioElapsed,
                  timestamp: new Date()
                }
              };
            }
            return item;
          });
          try {
            localStorage.setItem('darijavox_history', JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
      }
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg === 'API_KEY_MISSING' || errMsg.includes('API key') || errMsg.includes('KEY_INVALID') || errMsg.includes('API_KEY')) {
        setError("Clé API Gemini invalide ou absente. S'il vous plaît, configurer votre clé pour continuer.");
        setShowApiKeyModal(true);
      } else {
        console.warn('Gemini TTS audio generation failed, falling back to browser-native synthesis:', err);
        setIsLocalVoiceFallbackActive(true);
      }
      console.error('Voice generation error:', err);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleRestoreHistoryItem = async (item: HistoryItem) => {
    setInputText(item.inputText);
    setScript(item.script);
    setAudioBase64(item.audioBase64 || null);
    setIsPlaying(false);
    setIsPaused(false);
    setError(null);
    setIsLocalVoiceFallbackActive(false);

    if (item.voiceName) {
      setSettings(prev => ({
        ...prev,
        voiceName: item.voiceName,
        tone: item.tone || prev.tone
      }));
    }

    if (item.metrics) {
      setMetrics(item.metrics);
    } else {
      setMetrics(null);
    }

    if (item.audioBase64) {
      await prepareAudio(item.audioBase64);
    } else {
      audioBufferRef.current = null;
    }
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      try {
        localStorage.setItem('darijavox_history', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to remove history item from localStorage', err);
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('darijavox_history');
    } catch (err) {
      console.error('Failed to clear history from localStorage', err);
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
    if (isLocalVoiceFallbackActive) {
      if (isPlaying) {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.pause();
        }
        setIsPlaying(false);
        setIsPaused(true);
      } else {
        if (isPaused) {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.resume();
          }
          setIsPlaying(true);
          setIsPaused(false);
        } else {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            
            let cleanText = script?.arabicScript || '';
            // Remove parenthetical notes
            cleanText = cleanText.replace(/\([^)]*\)/g, "");
            cleanText = cleanText.replace(/\[[^\]]*\]/g, "");
            cleanText = cleanText.replace(/\s+/g, " ").trim();
            
            if (!cleanText && script) {
              cleanText = script.arabicScript;
            }
            
            const utterance = new SpeechSynthesisUtterance(cleanText);
            const voices = window.speechSynthesis.getVoices();
            let arabicVoice = voices.find(v => v.lang.toLowerCase().includes('ar-ma')) ||
                              voices.find(v => v.lang.toLowerCase().includes('ar')) ||
                              voices.find(v => v.lang.toLowerCase().includes('fr')) ||
                              voices[0];
            
            if (arabicVoice) {
              utterance.voice = arabicVoice;
            }
            
            utterance.rate = settings.speakingRate || 1.0;
            utterance.pitch = settings.pitch || 1.0;
            
            utterance.onend = () => {
              setIsPlaying(false);
              setIsPaused(false);
            };
            
            utterance.onerror = (e) => {
              console.error("SpeechSynthesis error:", e);
              setIsPlaying(false);
              setIsPaused(false);
            };
            
            setIsPlaying(true);
            setIsPaused(false);
            window.speechSynthesis.speak(utterance);
          }
        }
      }
      return;
    }

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
    if (isLocalVoiceFallbackActive) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPaused(false);
      setTimeout(() => {
        togglePlayPause();
      }, 50);
      return;
    }

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
    <div className={`min-h-screen font-sans transition-colors duration-500 ${theme === 'light' ? 'bg-slate-50 text-slate-900 light-theme' : 'bg-slate-950 text-slate-100'}`}>
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
          className="flex items-center gap-3 md:gap-6"
        >
          {/* Mobile and Desktop clickable API Key Configuration */}
          <button 
            type="button"
            onClick={() => {
              setTempApiKey(apiKey);
              setShowApiKeyModal(true);
            }}
            className={`glass-card p-2.5 md:p-3 flex items-center gap-2 overflow-hidden cursor-pointer transition-all border ${
              apiKey || hasDefaultApiKey()
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20' 
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 animate-pulse'
            }`}
          >
             <Key className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400/80" style={{ color: !(apiKey || hasDefaultApiKey()) ? '#fbbf24' : '#34d399' }} />
             <span className="text-[9px] md:text-xs font-semibold uppercase tracking-wider">
               {apiKey || hasDefaultApiKey() ? 'Clé API Active' : 'Configurer Clé API'}
             </span>
          </button>

          {/* Confort Visuel / Protection des Yeux Control */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowVisualComfortMenu(!showVisualComfortMenu)}
              className={`glass-card p-2.5 md:p-3 flex items-center gap-2 overflow-hidden cursor-pointer transition-all border select-none ${
                screenDim > 0 || blueLightFilter > 0 || theme === 'light'
                  ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/25 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
              }`}
              title="Ajustements de l'écran & Protection oculaire"
            >
              <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-400" />
              <span className="text-[9px] md:text-xs font-semibold uppercase tracking-wider">
                Yeux
              </span>
            </button>

            <AnimatePresence>
              {showVisualComfortMenu && (
                <>
                  {/* Backdrop to close the popover on clicking outer area */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowVisualComfortMenu(false)} 
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-80 glass-card p-6 z-50 shadow-2xl border border-white/10 space-y-6 bg-slate-900/95 backdrop-blur-2xl"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-indigo-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                          Confort Visuel
                        </h4>
                      </div>
                      <span className="text-[9px] font-mono bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full uppercase font-bold">
                        PROTÈGE-YEUX
                      </span>
                    </div>

                    {/* Brightness/Mode Slider */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        <span>Luminosité (Thème)</span>
                        <span className="text-fuchsia-400 font-mono text-xs font-bold font-display">
                          {theme === 'dark' ? 'Sombre' : 'Clair'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 bg-black/20 p-1 rounded-2xl border border-white/5">
                        <button
                          type="button"
                          onClick={() => setTheme('dark')}
                          className={`py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
                            theme === 'dark'
                              ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          <Moon className="w-3 h-3" />
                          Noircir (Sombre)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme('light')}
                          className={`py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
                            theme === 'light'
                              ? 'bg-white text-slate-950 shadow-lg'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          <Sun className="w-3 h-3 text-amber-500" />
                          Éclaircir (Clair)
                        </button>
                      </div>
                    </div>

                    {/* Dimmer Slider to dark overlays */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        <div className="flex items-center gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-slate-400" />
                          <span>Filtre d'Ombrage</span>
                        </div>
                        <span className="font-mono text-indigo-400 text-xs font-bold">{screenDim}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="80"
                        value={screenDim}
                        onChange={(e) => setScreenDim(Number(e.target.value))}
                        className="w-full h-1.5 bg-black/30 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none border border-white/5 animate-none"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                        <span>Fermé (0%)</span>
                        <span>Max (80%)</span>
                      </div>
                    </div>

                    {/* Blue Light Filter Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        <div className="flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-amber-500" />
                          <span>Anti-Lumière Bleue</span>
                        </div>
                        <span className="font-mono text-amber-400 text-xs font-bold">{blueLightFilter}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="70"
                        value={blueLightFilter}
                        onChange={(e) => setBlueLightFilter(Number(e.target.value))}
                        className="w-full h-1.5 bg-black/30 rounded-lg appearance-none cursor-pointer accent-amber-500 outline-none border border-white/5 animate-none"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                        <span>Désactivé (0%)</span>
                        <span>Chaud (70%)</span>
                      </div>
                    </div>

                    {/* System Information */}
                    <p className="text-[10px] leading-relaxed text-slate-400 italic font-medium pt-1 border-t border-white/5">
                      Ajustez ces curseurs de protection oculaire pour réduire la fatigue visuelle lors des sessions nocturnes.
                    </p>

                    {/* Reset Button */}
                    {(screenDim > 0 || blueLightFilter > 0 || theme === 'light') && (
                      <button
                        type="button"
                        onClick={() => {
                          setScreenDim(0);
                          setBlueLightFilter(0);
                          setTheme('dark');
                        }}
                        className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-2xl text-[10px] font-bold uppercase border border-white/5 transition-all text-center"
                      >
                        Paramètres par défaut
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] font-mono uppercase opacity-40 text-slate-400">System Status</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              <span className="text-xs font-semibold text-slate-100">ALL SYSTEMS NOMINAL</span>
            </div>
          </div>
          <div className="hidden md:flex glass-card p-3 items-center gap-2 overflow-hidden glow-border">
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

              {/* Ton (Tone) selection button and elegant dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setToneDropdownOpen(!toneDropdownOpen)}
                  className={`px-4 py-2 rounded-2xl text-[10px] font-bold uppercase transition-all flex items-center gap-3 min-h-[44px] min-w-[100px] justify-between border ${
                    settings.tone && settings.tone !== 'Standard'
                      ? 'bg-gradient-to-r from-fuchsia-600/20 to-indigo-600/20 text-fuchsia-300 border-fuchsia-500/30'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 border-white/5'
                  }`}
                >
                  <div className="flex flex-col items-start gap-px">
                    <span className="text-[7px] font-medium tracking-wider uppercase opacity-50">Ton</span>
                    <span className="text-white text-[10px] font-bold">{settings.tone || 'Standard'}</span>
                  </div>
                  <Sliders className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                </button>

                <AnimatePresence>
                  {toneDropdownOpen && (
                    <>
                      {/* Click outside to close */}
                      <div 
                        className="fixed inset-0 z-30 cursor-default" 
                        onClick={() => setToneDropdownOpen(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 bottom-full mb-3 z-40 w-44 bg-slate-950/95 border border-white/10 rounded-2xl shadow-2xl p-1.5 backdrop-blur-xl"
                      >
                        <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest px-3 py-1.5 border-b border-white/5 mb-1">
                          Choisir le Ton
                        </div>
                        {['Standard', 'Excité', 'Calme', 'Rauque', 'Grave'].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setSettings({ ...settings, tone: t });
                              setToneDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-between ${
                              (settings.tone || 'Standard') === t
                                ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span>{t}</span>
                            {(settings.tone || 'Standard') === t && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
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

          {/* Local History Section (5 Latest Scripts) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card p-6 md:p-7 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                    Historique Récent
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    5 derniers scripts en cache local
                  </p>
                </div>
              </div>

              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-xl hover:bg-white/5 font-semibold"
                  title="Effacer tout l'historique"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Effacer</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto text-slate-500">
                  <Clock className="w-5 h-5 opacity-70" />
                </div>
                <p className="text-xs text-slate-300 font-semibold">
                  Aucun script récent
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Vos 5 derniers scripts générés apparaîtront automatiquement ici pour les réécouter ou les réutiliser en 1 clic.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item, index) => {
                  const isCurrentActive = script?.arabicScript === item.script.arabicScript;
                  const timeAgo = formatTimeAgo(item.timestamp);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleRestoreHistoryItem(item)}
                      className={`group p-4 rounded-2xl transition-all cursor-pointer border relative overflow-hidden text-left ${
                        isCurrentActive
                          ? 'bg-fuchsia-500/10 border-fuchsia-500/40 shadow-lg shadow-fuchsia-500/5 ring-1 ring-fuchsia-500/20'
                          : 'bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/15'
                      }`}
                      title="Cliquer pour restaurer ce script dans le studio"
                    >
                      <div className="space-y-2">
                        {/* Top meta tags */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-200">
                              #{index + 1}
                            </span>
                            <span className="text-[11px] font-semibold text-fuchsia-400">
                              {item.voiceName} {item.tone && item.tone !== 'Standard' ? `• ${item.tone}` : ''}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {item.metrics && (
                              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                {item.metrics.totalTimeMs} ms
                              </span>
                            )}
                            <span className="text-[9px] text-slate-400 font-mono">
                              {timeAgo}
                            </span>
                          </div>
                        </div>

                        {/* Source prompt preview */}
                        <p className="text-xs text-slate-200 font-medium line-clamp-2 leading-relaxed group-hover:text-white transition-colors">
                          {item.inputText}
                        </p>

                        {/* Arabic text preview */}
                        <p className="text-xs arabic-font text-slate-400 line-clamp-1 text-right pt-0.5 border-t border-white/5" dir="rtl">
                          {item.script.arabicScript}
                        </p>

                        {/* Footer action bar */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          <span className="text-[10px] text-slate-400 group-hover:text-fuchsia-300 font-semibold flex items-center gap-1 transition-colors">
                            <span>Restaurer</span>
                            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </span>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                            className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Supprimer cet élément de l'historique"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
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
                {/* Performance & Latency Indicator Card */}
                {metrics && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="glass-card p-6 md:p-8 border border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 via-slate-950/40 to-indigo-950/20 relative overflow-hidden"
                  >
                    {/* Subtle top indicator bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-fuchsia-500 to-indigo-500" />
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <Activity className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-100">
                              Indicateur de Performance
                            </h3>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-ping" />
                              SUCCÈS
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Temps écoulé mesuré avec précision après chaque traitement réussi
                          </p>
                        </div>
                      </div>

                      {/* Global elapsed time pill */}
                      <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end bg-black/30 px-4 py-2 rounded-2xl border border-white/10">
                        <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">Durée Totale :</span>
                        <span className="font-mono text-xs md:text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                          <Timer className="w-4 h-4 text-emerald-400" />
                          {metrics.totalTimeMs.toLocaleString('fr-FR')} ms
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({(metrics.totalTimeMs / 1000).toFixed(2)}s)
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Metric Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                      {/* 1. Script Generation Timing */}
                      <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="text-[10px] font-mono uppercase tracking-wider">1. Génération Script</span>
                          <FileText className="w-3.5 h-3.5 text-fuchsia-400" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-mono font-bold text-fuchsia-400">
                            {metrics.scriptTimeMs.toLocaleString('fr-FR')}
                          </span>
                          <span className="text-xs font-mono text-slate-400 font-semibold">ms</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
                          <span>Gemini Dialect Engine</span>
                          <span className="font-mono text-slate-300">{(metrics.scriptTimeMs / 1000).toFixed(2)}s</span>
                        </div>
                      </div>

                      {/* 2. Audio Generation Timing */}
                      <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="text-[10px] font-mono uppercase tracking-wider">2. Synthèse Audio</span>
                          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          {metrics.audioTimeMs !== null ? (
                            <>
                              <span className="text-2xl font-mono font-bold text-indigo-400">
                                {metrics.audioTimeMs.toLocaleString('fr-FR')}
                              </span>
                              <span className="text-xs font-mono text-slate-400 font-semibold">ms</span>
                            </>
                          ) : (
                            <span className="text-base font-semibold text-amber-400">Mode Local</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
                          <span>Voix: {settings.voiceName}</span>
                          {metrics.audioTimeMs !== null && (
                            <span className="font-mono text-slate-300">{(metrics.audioTimeMs / 1000).toFixed(2)}s</span>
                          )}
                        </div>
                      </div>

                      {/* 3. Combined / Latency Summary */}
                      <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="text-[10px] font-mono uppercase tracking-wider">3. Traitement Total</span>
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-mono font-bold text-emerald-400">
                            {metrics.totalTimeMs.toLocaleString('fr-FR')}
                          </span>
                          <span className="text-xs font-mono text-slate-400 font-semibold">ms</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
                          <span>Pipeline IA complet</span>
                          <span className="font-mono text-emerald-300/80">100% terminé</span>
                        </div>
                      </div>
                    </div>

                    {/* Distribution bar */}
                    {metrics.audioTimeMs !== null && metrics.totalTimeMs > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span className="text-fuchsia-400">
                            Script : {Math.round((metrics.scriptTimeMs / metrics.totalTimeMs) * 100)}% ({metrics.scriptTimeMs.toLocaleString('fr-FR')} ms)
                          </span>
                          <span className="text-indigo-400">
                            Audio : {Math.round((metrics.audioTimeMs / metrics.totalTimeMs) * 100)}% ({metrics.audioTimeMs.toLocaleString('fr-FR')} ms)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden flex">
                          <div 
                            style={{ width: `${Math.min(100, Math.max(5, (metrics.scriptTimeMs / metrics.totalTimeMs) * 100))}%` }} 
                            className="h-full bg-fuchsia-500 rounded-l-full"
                            title={`Script: ${metrics.scriptTimeMs} ms`}
                          />
                          <div 
                            style={{ width: `${Math.min(100, Math.max(5, (metrics.audioTimeMs / metrics.totalTimeMs) * 100))}%` }} 
                            className="h-full bg-indigo-500 rounded-r-full"
                            title={`Audio: ${metrics.audioTimeMs} ms`}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Audio Engine */}
                <div className="glass-card p-10 space-y-8 relative overflow-hidden">
                   {isLocalVoiceFallbackActive && (
                     <motion.div 
                       initial={{ opacity: 0, y: -10 }}
                       animate={{ opacity: 1, y: 0 }}
                       className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3.5 text-xs text-amber-200 leading-relaxed"
                     >
                       <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                       <div className="space-y-1">
                         <p className="font-semibold text-amber-100">Synthèse vocale locale active (Bascule automatique)</p>
                         <p className="text-amber-300/80 text-[11px]">L'API de synthèse vocale en ligne de Google Gemini (tts-preview) a renvoyé une erreur 500 (caractéristique fréquente lors de l'envoi d'arabe Unicode sur un hébergement public ou d'une limitation de clé gratuite sur Cloudflare). Pour garantir un service ininterrompu, DarijaVox utilise le synthétiseur local de votre appareil pour lire le script !</p>
                       </div>
                     </motion.div>
                   )}

                   <div className="flex flex-wrap items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <button 
                          onClick={togglePlayPause}
                          disabled={isGeneratingAudio}
                          className="w-20 h-20 rounded-full bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 text-white flex items-center justify-center hover:scale-105 transition-transform shadow-2xl shadow-purple-500/20 active:scale-95 disabled:opacity-50"
                        >
                          {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-2" />}
                        </button>
                        <button 
                          onClick={restartAudio}
                          disabled={isGeneratingAudio}
                          className="w-14 h-14 rounded-full glass-card flex items-center justify-center hover:bg-white/10 transition-all text-slate-400 hover:text-white disabled:opacity-50"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleGenerateAudioOnly}
                          disabled={isGeneratingAudio}
                          className="px-6 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-[2.5rem] transition-all font-display text-sm font-bold flex items-center gap-2.5 active:scale-95 disabled:opacity-50 shadow-md shadow-fuchsia-500/5"
                        >
                          <Sparkles className={`w-4 h-4 text-fuchsia-400 ${isGeneratingAudio ? 'animate-spin' : ''}`} />
                          <span>{isGeneratingAudio ? 'REGÉNÉRATION EN COURS...' : 'REGÉNÉRER LA VOIX'}</span>
                        </button>

                        <button 
                           onClick={downloadAudio}
                           disabled={isGeneratingAudio || !audioBase64}
                           className="px-8 py-4 bg-gradient-to-r from-fuchsia-600/10 to-indigo-600/10 border border-fuchsia-500/20 hover:from-fuchsia-600/20 hover:to-indigo-600/20 text-white rounded-[2.5rem] transition-all font-display text-sm font-bold flex items-center gap-3 active:scale-95 disabled:opacity-40"
                           title={isLocalVoiceFallbackActive ? "L'exportation MP3 n'est pas disponible en mode synthèse vocale locale." : "Exporter en fichier audio (.MP3)"}
                        >
                           <Download className="w-5 h-5" />
                           <span>EXPORT MASTER (.MP3)</span>
                        </button>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <WaveIcon className="w-4 h-4 text-slate-400" />
                           <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400">Atmospheric Monitor</span>
                           {metrics && (
                             <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold flex items-center gap-1">
                               <Timer className="w-2.5 h-2.5" />
                               {metrics.totalTimeMs.toLocaleString('fr-FR')} ms
                             </span>
                           )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {isGeneratingAudio 
                            ? 'VOICE SYNTHESIS ACTIVE' 
                            : metrics 
                              ? `LATENCE : ${metrics.totalTimeMs} MS (SCRIPT : ${metrics.scriptTimeMs} MS • AUDIO : ${metrics.audioTimeMs ?? 0} MS)`
                              : '24.0 KHZ / 128 KBPS'}
                        </span>
                      </div>
                      <div className="h-24 glass-card bg-slate-950/20 border-white/5 border flex items-end justify-center gap-1.5 p-6 overflow-hidden">
                         {[...Array(40)].map((_, i) => (
                           <motion.div 
                             key={i}
                             animate={{ 
                               height: isPlaying 
                                 ? [Math.random() * 20 + 5, Math.random() * 80 + 10, Math.random() * 20 + 5] 
                                 : isGeneratingAudio
                                   ? [Math.random() * 30 + 10, Math.random() * 60 + 20, Math.random() * 30 + 10]
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

      {/* Elegant, fully responsive and accessible Gemini API key modal config */}
      <AnimatePresence>
        {showApiKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with elegant blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowApiKeyModal(false)}
              className="absolute inset-0 bg-slate-950/85 backdrop-blur-md cursor-pointer"
            />
            
            {/* Modal card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-card border border-white/10 bg-slate-900/90 p-8 md:p-10 shadow-2xl rounded-[2.5rem] overflow-hidden"
            >
              {/* Outer soft glows */}
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-fuchsia-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 flex items-center justify-center text-white shrink-0">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white uppercase tracking-wider">Mettre à Jour la Clé API</h3>
                    <p className="text-xs text-slate-400">Pour le bon fonctionnement de DarijaVox sur Cloudflare</p>
                  </div>
                </div>

                <div className="space-y-4 text-slate-300 text-xs md:text-sm leading-relaxed">
                  <p>
                    DarijaVox utilise l'API de pointe **Gemini** pour traduire vos textes puis générer les voix de synthèse.
                  </p>
                  <p className="text-slate-400">
                    Comme l'application est maintenant déployée sur votre propre domaine ou Cloudflare, vous devez fournir votre propre clé API Gemini (qui propose un niveau d'utilisation gratuit généreux). Votre clé reste stockée localement de manière sécurisée dans votre propre navigateur.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest">Votre Clé API Gemini</label>
                  <div className="relative flex items-center">
                    <input
                      type="password"
                      value={tempApiKey || ''}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      placeholder={hasDefaultApiKey() ? "••••••••••••••••••••••••" : "Votre clé API Gemini..."}
                      className="w-full bg-slate-950/60 text-slate-100 placeholder:text-slate-600 font-mono text-sm px-4 py-3 rounded-2xl border border-white/5 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/20 transition-all font-medium pr-24"
                    />
                    <div className="absolute right-2 flex gap-1">
                      {tempApiKey && (
                        <button
                          type="button"
                          onClick={() => setTempApiKey('')}
                          className="px-2.5 py-1 text-[9px] font-mono font-bold uppercase rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          Effacer
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <a
                      href="https://aistudio.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors underline flex items-center gap-1"
                    >
                      Obtenir une clé API gratuite sur Google AI Studio ↗
                    </a>
                    {hasDefaultApiKey() && (
                      <span className="text-[10px] text-emerald-400 font-medium">
                        Une clé par défaut est active
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem('darijavox_gemini_api_key', tempApiKey);
                      setApiKey(tempApiKey);
                      setShowApiKeyModal(false);
                      setError(null);
                    }}
                    className="flex-1 py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:opacity-90 active:scale-98 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    Enregistrer la Clé
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowApiKeyModal(false)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 active:scale-98 text-slate-300 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all border border-white/5"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Screen regulators (dimming & warmth overlays) utilizing absolute secure pointer-events-none */}
      {screenDim > 0 && (
        <div 
          className="fixed inset-0 bg-black pointer-events-none z-[9999] transition-opacity duration-300" 
          style={{ opacity: screenDim / 100 }} 
        />
      )}

      {blueLightFilter > 0 && (
        <div 
          className="fixed inset-0 pointer-events-none z-[9998] transition-opacity duration-300" 
          style={{ 
            backgroundColor: 'rgba(251, 191, 36, 0.15)',
            mixBlendMode: 'multiply',
            opacity: blueLightFilter / 100
          }} 
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        .arabic-font {
          font-family: 'IBM+Plex+Sans+Arabic', sans-serif;
        }
      `}</style>
    </div>
  );
}
