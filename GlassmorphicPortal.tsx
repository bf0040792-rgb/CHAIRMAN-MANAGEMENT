/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LEVEL-5 DIRECTOR'S PORTAL — Glassmorphic Executive Login & Control System
 * (स्तर-5 निदेशक पोर्टल — ग्लासमॉर्फिक एक्जीक्यूटिव लॉगिन और नियंत्रण प्रणाली)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * VIEW SEQUENCE (दृश्य अनुक्रम):
 *   1. Login (लॉगिन) — Credentials entry with floating labels
 *   2. Biometric Handshake (बायोमेट्रिक हैंडशेक) — Fingerprint verification animation
 *   3. Secure PIN Entry (सुरक्षित पिन प्रविष्टि) — 4-digit keypad
 *   4. Verification (सत्यापन) — System integrity check animation
 *   5. Access Granted Telemetry (पहुँच स्वीकृत टेलीमेट्री) — HUD metrics display
 *   6. Director's Dashboard (निदेशक डैशबोर्ड) — Executive control workstation
 *
 * BACKGROUND ELEMENTS (पृष्ठभूमि तत्व):
 *   - Deep space gradient: #02020a -> crimson/sunset pink
 *     (गहरा अंतरिक्ष ग्रेडिएंट: गहरा काला से गहरा गुलाबी/सूर्यास्त)
 *   - Dot-mesh alignment grid: 28px spacing with rose-glow dots
 *     (डॉट-मेश ग्रिड: 28px अंतराल, गुलाबी चमक बिंदु)
 *   - Glowing volcanic peak (Mt. Fuji) SVG at footer
 *     (ज्वालामुखी शिखर SVG फुटर पर, चमकता हुआ)
 *   - Cherry blossom branches (sakura) on left/right margins
 *     (चेरी ब्लॉसम शाखाएँ बाएँ/दाएँ किनारों पर)
 *   - Rose-gold petal particles drifting with wind animation
 *     (गुलाबी-सुनहरी पंखुड़ी कण हवा के साथ बहते हुए)
 *
 * TECH STACK (तकनीकी स्टैक): React 18+ | TypeScript | Tailwind CSS | Lucide Icons
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Lock, Fingerprint, Eye, EyeOff, Zap, Activity,
  Server, Wifi, AlertTriangle, CheckCircle2, Clock, Globe,
  BarChart3, Database, Cpu, Network, Radio, Layers, ScanLine, ShieldCheck
} from 'lucide-react';

// ─── TYPES (प्रकार परिभाषा) ──────────────────────────────────────────────────
// Stage flow: login -> biometric -> pin -> verification -> hud -> dashboard
// चरण प्रवाह: लॉगिन -> बायोमेट्रिक -> पिन -> सत्यापन -> HUD -> डैशबोर्ड
type Stage = 'login' | 'biometric' | 'pin' | 'verification' | 'hud' | 'dashboard';

interface MetricCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

interface LogEntry {
  time: string;
  message: string;
  level: 'info' | 'warn' | 'success';
}

// ─── VOLCANIC PEAK SVG (ज्वालामुखी शिखर — फुटर दृश्य) ───────────────────────
// Renders a glowing Mt. Fuji silhouette at the bottom of the viewport
// व्यूपोर्ट के निचले भाग में चमकता हुआ फुजी पर्वत सिल्हूट प्रस्तुत करता है
const VolcanicPeak: React.FC = () => (
  <div className="absolute bottom-0 left-0 w-full h-[280px] md:h-[320px] z-[1] pointer-events-none">
    <svg viewBox="0 0 1440 320" className="w-full h-full" preserveAspectRatio="xMidYMax slice" fill="none">
      <defs>
        <linearGradient id="peakGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="rgba(139,30,63,0.6)" />
          <stop offset="40%" stopColor="rgba(80,20,50,0.8)" />
          <stop offset="100%" stopColor="rgba(20,5,15,0.95)" />
        </linearGradient>
        <linearGradient id="snowGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,240,250,0.9)" />
          <stop offset="100%" stopColor="rgba(200,150,180,0.3)" />
        </linearGradient>
        <radialGradient id="peakGlow" cx="50%" cy="20%" r="50%">
          <stop offset="0%" stopColor="rgba(255,100,150,0.25)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="hazeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,120,160,0.08)" />
          <stop offset="100%" stopColor="rgba(100,20,60,0.15)" />
        </linearGradient>
      </defs>

      {/* Atmospheric haze behind the peak / शिखर के पीछे वायुमंडलीय धुंध */}
      <ellipse cx="720" cy="180" rx="500" ry="120" fill="url(#peakGlow)">
        <animate attributeName="rx" values="500;520;500" dur="6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
      </ellipse>

      {/* Distant range / दूर की पर्वत श्रृंखला */}
      <path d="M0 280 L200 230 L400 250 L600 210 L800 240 L1000 220 L1200 250 L1440 260 L1440 320 L0 320Z"
        fill="rgba(30,10,25,0.5)" />

      {/* Main volcanic peak / मुख्य ज्वालामुखी शिखर */}
      <path d="M520 320 L660 140 L700 120 L720 110 L740 120 L780 140 L920 320Z"
        fill="url(#peakGrad)" />

      {/* Snow cap / बर्फ की टोपी */}
      <path d="M670 155 L700 128 L720 118 L740 128 L770 155 L750 150 L720 140 L690 150Z"
        fill="url(#snowGrad)" />

      {/* Ridge lines / पर्वत शिखर रेखाएँ */}
      <path d="M660 140 L720 110 L780 140" stroke="rgba(255,180,200,0.2)" strokeWidth="0.8" fill="none" />
      <path d="M640 170 L720 125 L800 170" stroke="rgba(255,150,180,0.1)" strokeWidth="0.5" fill="none" />

      {/* Foothills / तलहटी */}
      <path d="M0 300 L300 270 L520 285 L920 285 L1140 270 L1440 300 L1440 320 L0 320Z"
        fill="rgba(15,5,12,0.7)" />

      {/* Haze layer / धुंध परत */}
      <rect x="0" y="220" width="1440" height="100" fill="url(#hazeGrad)" opacity="0.6" />

      {/* Lava glow at summit / शिखर पर लावा चमक */}
      <circle cx="720" cy="115" r="4" fill="rgba(255,80,50,0.7)">
        <animate attributeName="r" values="3;5;3" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="720" cy="115" r="12" fill="rgba(255,80,50,0.1)">
        <animate attributeName="r" values="10;16;10" dur="4s" repeatCount="indefinite" />
      </circle>
    </svg>
  </div>
);

// ─── SAKURA PETAL PARTICLE (चेरी ब्लॉसम पंखुड़ी कण) ─────────────────────────
// Wind-drifted rose-gold particles with CSS micro-animations
// हवा से बहती गुलाबी-सुनहरी पंखुड़ियाँ, CSS माइक्रो-एनिमेशन के साथ
const SakuraPetal: React.FC<{ delay: number; left: string; size: number }> = ({ delay, left, size }) => (
  <div
    className="absolute rounded-full opacity-0 animate-petal-fall pointer-events-none"
    style={{
      left,
      width: `${size}px`,
      height: `${size}px`,
      background: `radial-gradient(circle, rgba(255,182,193,0.8), rgba(255,105,135,0.3))`,
      animationDelay: `${delay}s`,
      animationDuration: `${8 + Math.random() * 6}s`,
      filter: `blur(${size > 6 ? 1 : 0}px)`,
      boxShadow: '0 0 6px rgba(255,150,180,0.4)',
    }}
  />
);

// ─── CHERRY BLOSSOM SVG BRANCH (सकुरा शाखा) ─────────────────────────────────
// Ambient vector branches framing left and right sides
// बाएँ और दाएँ किनारों पर सजावटी वेक्टर शाखाएँ
const SakuraBranch: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <div
    className={`absolute top-0 h-full w-[100px] md:w-[150px] z-[3] pointer-events-none opacity-75 animate-sakura-sway ${
      side === 'left' ? 'left-0' : 'right-0 scale-x-[-1]'
    }`}
    style={{ filter: 'drop-shadow(0 0 15px rgba(255,130,180,0.25))' }}
  >
    <svg viewBox="0 0 160 900" className="w-full h-full" fill="none">
      <path d="M20 0 C30 80, 60 160, 45 260 C30 360, 70 420, 55 520 C40 620, 80 700, 60 850"
        stroke="rgba(139,69,90,0.6)" strokeWidth="3" fill="none" />
      <path d="M45 260 C80 240, 110 220, 130 200" stroke="rgba(139,69,90,0.5)" strokeWidth="2" />
      <path d="M55 520 C90 500, 120 480, 140 460" stroke="rgba(139,69,90,0.4)" strokeWidth="1.5" />
      {[
        { cx: 130, cy: 200, r: 12 }, { cx: 120, cy: 210, r: 9 },
        { cx: 140, cy: 190, r: 8 }, { cx: 45, cy: 260, r: 10 },
        { cx: 55, cy: 250, r: 7 }, { cx: 60, cy: 270, r: 11 },
        { cx: 140, cy: 460, r: 10 }, { cx: 130, cy: 470, r: 8 },
        { cx: 150, cy: 450, r: 6 }, { cx: 55, cy: 520, r: 9 },
        { cx: 65, cy: 530, r: 7 }, { cx: 50, cy: 540, r: 11 },
        { cx: 35, cy: 380, r: 8 }, { cx: 45, cy: 370, r: 6 },
        { cx: 70, cy: 650, r: 9 }, { cx: 60, cy: 660, r: 7 },
        { cx: 80, cy: 640, r: 5 }, { cx: 30, cy: 140, r: 8 },
        { cx: 40, cy: 130, r: 6 }, { cx: 50, cy: 150, r: 10 },
      ].map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={`rgba(255,${150 + i * 4},${180 + i * 2},${0.35 + (i % 3) * 0.15})`}>
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur={`${3 + i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {[
        { cx: 125, cy: 195, r: 4 }, { cx: 50, cy: 255, r: 3.5 },
        { cx: 135, cy: 455, r: 4 }, { cx: 60, cy: 525, r: 3 },
        { cx: 35, cy: 135, r: 3 }, { cx: 65, cy: 645, r: 3.5 },
      ].map((p, i) => (
        <circle key={`c-${i}`} cx={p.cx} cy={p.cy} r={p.r} fill="rgba(255,215,0,0.5)">
          <animate attributeName="r" values={`${p.r};${p.r + 1.5};${p.r}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  </div>
);

// ─── LASER SCAN LINE (लेज़र स्कैन रेखा) ────────────────────────────────────
// Crimson/pink scanning line activated during security checks
// सुरक्षा जाँच के दौरान सक्रिय होने वाली गुलाबी स्कैनिंग रेखा
const LaserScan: React.FC<{ active: boolean }> = ({ active }) => (
  <div className={`absolute inset-0 overflow-hidden rounded-2xl pointer-events-none transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}>
    <div
      className="absolute left-0 w-full h-[2px] animate-laser-scan"
      style={{
        background: 'linear-gradient(90deg, transparent, rgba(255,80,120,0.8), rgba(255,50,100,1), rgba(255,80,120,0.8), transparent)',
        boxShadow: '0 0 15px rgba(255,50,100,0.6), 0 0 30px rgba(255,50,100,0.3)',
      }}
    />
  </div>
);

// ─── PIN DIGIT DISPLAY (पिन संकेतक बिंदु) ──────────────────────────────────
const PinDots: React.FC<{ filled: number }> = ({ filled }) => (
  <div className="flex gap-4 justify-center mb-8">
    {[0, 1, 2, 3].map((i) => (
      <div
        key={i}
        className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
          i < filled
            ? 'bg-rose-400 border-rose-300 shadow-[0_0_12px_rgba(255,100,150,0.6)]'
            : 'bg-transparent border-white/20'
        }`}
      />
    ))}
  </div>
);

// ─── HUD METRIC CARD (HUD मेट्रिक कार्ड) ───────────────────────────────────
const HudCard: React.FC<MetricCard & { delay: number }> = ({ label, value, icon, color, delay }) => (
  <div
    className="bg-slate-900/60 backdrop-blur-md border border-white/[0.08] rounded-xl p-4 opacity-0 animate-hud-card-in"
    style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
  >
    <div className="flex items-center gap-2 mb-2">
      <div className={`${color}`}>{icon}</div>
      <span className="text-[10px] uppercase tracking-[2px] text-white/40 font-mono">{label}</span>
    </div>
    <div className="text-xl font-bold text-white tracking-wide">{value}</div>
  </div>
);

// ─── SVG PERFORMANCE GRAPH (लाइव प्रदर्शन ग्राफ) ───────────────────────────
// Auto-refreshing SVG line chart with gradient fill
// ग्रेडिएंट भरण के साथ स्वचालित-रिफ्रेशिंग SVG लाइन चार्ट
const PerformanceGraph: React.FC = () => {
  const [points, setPoints] = useState<number[]>([]);

  useEffect(() => {
    const generate = () => {
      const pts: number[] = [];
      for (let i = 0; i < 24; i++) {
        pts.push(30 + Math.random() * 60);
      }
      setPoints(pts);
    };
    generate();
    const interval = setInterval(generate, 3000);
    return () => clearInterval(interval);
  }, []);

  const pathData = points.length > 0
    ? `M 0 ${100 - points[0]} ` + points.map((p, i) => `L ${(i / 23) * 100} ${100 - p}`).join(' ')
    : '';

  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-[2px] text-white/50 font-mono">Live Performance</span>
        </div>
        <div className="flex items-center gap-1">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="text-[10px] text-emerald-400 font-mono">STREAMING</span>
        </div>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-48" preserveAspectRatio="none">
        <defs>
          <linearGradient id="graphGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(6,182,212,0.3)" />
            <stop offset="100%" stopColor="rgba(6,182,212,0)" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" />
        ))}
        {pathData && (
          <>
            <path d={`${pathData} L 100 100 L 0 100 Z`} fill="url(#graphGrad)" className="transition-all duration-1000" />
            <path d={pathData} fill="none" stroke="url(#lineGrad)" strokeWidth="1.5" className="transition-all duration-1000" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
};

// ─── SECURITY LOG PANEL (सुरक्षा लॉग पैनल) ─────────────────────────────────
const SecurityLog: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messages: [string, LogEntry['level']][] = [
      ['Firewall sync complete — all sectors nominal', 'success'],
      ['Auth token refreshed: TTL 3600s', 'info'],
      ['Anomaly scan: 0 threats detected', 'success'],
      ['Rate limiter threshold: 847/1000 rps', 'warn'],
      ['Certificate rotation scheduled 00:00 UTC', 'info'],
      ['Geofence perimeter: ACTIVE', 'success'],
      ['DDoS mitigation layer: ENGAGED', 'info'],
      ['Intrusion detection: No anomalies', 'success'],
      ['Backup node failover: STANDBY', 'info'],
      ['Memory allocation optimized: 94.2% efficient', 'success'],
    ];

    const addLog = () => {
      const [message, level] = messages[Math.floor(Math.random() * messages.length)];
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setLogs((prev) => [...prev.slice(-8), { time, message, level }]);
    };

    addLog();
    const interval = setInterval(addLog, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const levelColor = { info: 'text-cyan-400', warn: 'text-amber-400', success: 'text-emerald-400' };

  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-rose-400" />
        <span className="text-xs uppercase tracking-[2px] text-white/50 font-mono">Security Logs</span>
      </div>
      <div ref={logRef} className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
        {logs.map((log, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] font-mono animate-fade-in">
            <span className="text-white/30 shrink-0">{log.time}</span>
            <span className={`${levelColor[log.level]}`}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── SERVER STATUS (सर्वर स्थिति पैनल) ──────────────────────────────────────
const ServerStatus: React.FC = () => {
  const servers = [
    { name: 'PRIMARY-A1', status: 'online', load: 34 },
    { name: 'REPLICA-B2', status: 'online', load: 67 },
    { name: 'EDGE-C3', status: 'online', load: 12 },
    { name: 'CACHE-D4', status: 'standby', load: 0 },
  ];

  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Server className="w-4 h-4 text-purple-400" />
        <span className="text-xs uppercase tracking-[2px] text-white/50 font-mono">Server Cluster</span>
      </div>
      <div className="space-y-3">
        {servers.map((srv) => (
          <div key={srv.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${srv.status === 'online' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-amber-400'}`} />
              <span className="text-[11px] font-mono text-white/60">{srv.name}</span>
            </div>
            {srv.status === 'online' && (
              <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${srv.load}%`,
                    background: `linear-gradient(90deg, ${srv.load > 50 ? '#f59e0b' : '#06b6d4'}, ${srv.load > 50 ? '#ef4444' : '#a855f7'})`,
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN PORTAL COMPONENT (मुख्य पोर्टल कॉम्पोनेंट) ─────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const GlassmorphicPortal: React.FC = () => {
  // Stage state — follows strict 6-step sequence
  // चरण स्थिति — सख्त 6-चरण अनुक्रम का पालन करता है
  const [stage, setStage] = useState<Stage>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [scanning, setScanning] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [biometricProgress, setBiometricProgress] = useState(0);

  // ─── STAGE 1: LOGIN HANDLER (लॉगिन हैंडलर) ────────────────────────────────
  // Validates credentials then moves to biometric handshake
  // क्रेडेंशियल्स सत्यापित करता है फिर बायोमेट्रिक हैंडशेक पर जाता है
  const handleLogin = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!username || !password) {
      setLoginError('Credentials required for authentication');
      return;
    }
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setStage('biometric');
    }, 1600);
  }, [username, password]);

  // ─── STAGE 2: BIOMETRIC HANDSHAKE (बायोमेट्रिक सत्यापन) ────────────────────
  // Fingerprint scan simulation with progress ring
  // प्रगति रिंग के साथ फिंगरप्रिंट स्कैन सिमुलेशन
  useEffect(() => {
    if (stage !== 'biometric') return;
    setBiometricProgress(0);
    const interval = setInterval(() => {
      setBiometricProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setStage('pin'), 600);
          return 100;
        }
        return prev + 2;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [stage]);

  // ─── STAGE 3: PIN ENTRY (पिन प्रविष्टि) ───────────────────────────────────
  // 4-digit secure access code with immediate visual feedback
  // तत्काल दृश्य प्रतिक्रिया के साथ 4-अंकीय सुरक्षित एक्सेस कोड
  const handlePinKey = useCallback((digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setPinError('');
    if (newPin.length === 4) {
      setTimeout(() => {
        if (newPin === '1234') {
          setStage('verification');
        } else {
          setPinError('Invalid PIN — Access Denied');
          setPin('');
        }
      }, 400);
    }
  }, [pin]);

  const handlePinClear = useCallback(() => { setPin(''); setPinError(''); }, []);

  // ─── STAGE 4: VERIFICATION (सत्यापन चरण) ──────────────────────────────────
  // System integrity scan before granting full access
  // पूर्ण पहुँच देने से पहले सिस्टम अखंडता स्कैन
  useEffect(() => {
    if (stage !== 'verification') return;
    setVerifyProgress(0);
    const interval = setInterval(() => {
      setVerifyProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setStage('hud'), 800);
          return 100;
        }
        return prev + 1.5;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [stage]);

  // ─── STAGE 5->6 TRANSITION (HUD से डैशबोर्ड संक्रमण) ─────────────────────
  // Auto-progress from telemetry HUD to director dashboard
  // टेलीमेट्री HUD से डायरेक्टर डैशबोर्ड तक स्वचालित प्रगति
  useEffect(() => {
    if (stage !== 'hud') return;
    const timer = setTimeout(() => setStage('dashboard'), 3500);
    return () => clearTimeout(timer);
  }, [stage]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RENDER: STAGE 1 — LOGIN (लॉगिन स्क्रीन) ─────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  const renderLogin = () => (
    <div className="relative z-10 w-[92%] max-w-[420px] animate-glass-appear">
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 24px 60px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.1)',
        }}
      >
        <LaserScan active={scanning} />

        <div className="p-10 md:p-12">
          {/* Portal identity — no bracketed placeholders / कोई ब्रैकेट प्लेसहोल्डर नहीं */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] mb-4">
              <Shield className="w-7 h-7 text-rose-300/80" style={{ filter: 'drop-shadow(0 0 8px rgba(255,150,180,0.3))' }} />
            </div>
            <h1 className="text-2xl font-extralight tracking-[8px] lowercase text-white/90">
              portal
            </h1>
            <p className="text-[11px] text-white/30 mt-2 tracking-[1px] font-mono">LEVEL-5 DIRECTOR ACCESS</p>
          </div>

          {/* Login form — clean inputs, no prompt leak / स्वच्छ इनपुट, कोई प्रॉम्प्ट लीक नहीं */}
          <form onSubmit={handleLogin} className="space-y-7">
            <div className="relative group">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent border-b border-white/15 pb-3 pt-5 text-white/90 text-sm font-light tracking-wide outline-none transition-all placeholder-transparent peer focus:border-transparent"
                placeholder="ID"
                id="dir-username"
                autoComplete="username"
              />
              <label htmlFor="dir-username" className="absolute left-0 top-5 text-white/25 text-sm font-light transition-all duration-300 peer-focus:top-0 peer-focus:text-[10px] peer-focus:text-rose-300/60 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:text-rose-300/60 tracking-wider uppercase">
                Director ID
              </label>
              <div className="absolute bottom-0 left-1/2 w-0 h-[2px] bg-gradient-to-r from-rose-400 to-pink-400 transition-all duration-400 group-focus-within:w-full group-focus-within:left-0" style={{ boxShadow: '0 0 8px rgba(255,100,150,0.4)' }} />
            </div>

            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border-b border-white/15 pb-3 pt-5 text-white/90 text-sm font-light tracking-wide outline-none transition-all placeholder-transparent peer focus:border-transparent pr-10"
                placeholder="PW"
                id="dir-password"
                autoComplete="current-password"
              />
              <label htmlFor="dir-password" className="absolute left-0 top-5 text-white/25 text-sm font-light transition-all duration-300 peer-focus:top-0 peer-focus:text-[10px] peer-focus:text-rose-300/60 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:text-rose-300/60 tracking-wider uppercase">
                Secure Passkey
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-5 text-white/25 hover:text-white/50 transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <div className="absolute bottom-0 left-1/2 w-0 h-[2px] bg-gradient-to-r from-rose-400 to-pink-400 transition-all duration-400 group-focus-within:w-full group-focus-within:left-0" style={{ boxShadow: '0 0 8px rgba(255,100,150,0.4)' }} />
            </div>

            {loginError && (
              <div className="text-center text-xs text-rose-300/80 bg-rose-500/10 border border-rose-500/20 rounded-lg py-2.5 backdrop-blur-sm">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={scanning}
              className="w-full py-4 rounded-xl text-white text-xs font-semibold uppercase tracking-[3px] relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #ec4899, #a855f7, #6366f1)',
                backgroundSize: '200% 200%',
                animation: 'gradShift 4s ease infinite',
                boxShadow: '0 6px 20px rgba(236,72,153,0.2), 0 2px 8px rgba(168,85,247,0.2)',
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {scanning ? <Activity className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {scanning ? 'Establishing Secure Link...' : 'Authenticate'}
              </span>
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[9px] text-white/15 font-mono tracking-wider">ENCRYPTED CHANNEL ACTIVE</p>
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RENDER: STAGE 2 — BIOMETRIC HANDSHAKE (बायोमेट्रिक हैंडशेक) ──────────
  // ═══════════════════════════════════════════════════════════════════════════════
  const renderBiometric = () => (
    <div className="relative z-10 w-[92%] max-w-[380px] animate-glass-appear">
      <div className="relative rounded-2xl overflow-hidden p-10 text-center"
        style={{
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 30px 70px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.08)',
        }}
      >
        <LaserScan active={biometricProgress < 100} />

        <h2 className="text-lg font-extralight tracking-[5px] text-white/85 uppercase mb-2">Biometric Handshake</h2>
        <p className="text-[10px] text-white/30 font-mono tracking-wider mb-8">IDENTITY VERIFICATION IN PROGRESS</p>

        {/* Concentric scanning rings / संकेंद्रित स्कैनिंग रिंग्स */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          <svg className="w-full h-full" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" stroke="rgba(255,255,255,0.05)" strokeWidth="2" fill="none" />
            <circle cx="60" cy="60" r="54" stroke="rgba(236,72,153,0.6)" strokeWidth="2.5" fill="none"
              strokeDasharray={`${biometricProgress * 3.39} 339`}
              strokeLinecap="round"
              className="transition-all duration-100"
              style={{ filter: 'drop-shadow(0 0 6px rgba(236,72,153,0.4))' }}
            />
            <circle cx="60" cy="60" r="44" stroke="rgba(255,255,255,0.03)" strokeWidth="1.5" fill="none" />
            <circle cx="60" cy="60" r="44" stroke="rgba(168,85,247,0.4)" strokeWidth="1.5" fill="none"
              strokeDasharray={`${Math.max(0, biometricProgress - 10) * 2.76} 276`}
              strokeLinecap="round"
            />
            <circle cx="60" cy="60" r="34" stroke="rgba(255,255,255,0.02)" strokeWidth="1" fill="none" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Fingerprint
              className={`w-10 h-10 transition-all duration-500 ${
                biometricProgress >= 100 ? 'text-emerald-400' : 'text-rose-300/70'
              }`}
              style={{ filter: biometricProgress >= 100 ? 'drop-shadow(0 0 12px rgba(52,211,153,0.5))' : 'drop-shadow(0 0 8px rgba(255,130,170,0.3))' }}
            />
          </div>
        </div>

        <div className="text-[11px] font-mono text-white/40 mb-3">
          {biometricProgress < 100 ? `Scanning... ${Math.round(biometricProgress)}%` : 'Identity Confirmed'}
        </div>

        {biometricProgress >= 100 && (
          <div className="flex items-center justify-center gap-2 text-emerald-400/80 animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-mono tracking-wider">HANDSHAKE COMPLETE</span>
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RENDER: STAGE 3 — PIN ENTRY (सुरक्षित पिन प्रविष्टि) ────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  const renderPin = () => (
    <div className="relative z-10 w-[92%] max-w-[380px] animate-glass-appear">
      <div className="relative rounded-2xl overflow-hidden p-10"
        style={{
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 30px 70px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.08)',
        }}
      >
        <LaserScan active={pin.length === 4} />

        <div className="text-center mb-8">
          <Lock className="w-8 h-8 text-rose-300/70 mx-auto mb-3" style={{ filter: 'drop-shadow(0 0 10px rgba(255,130,170,0.3))' }} />
          <h2 className="text-lg font-extralight tracking-[6px] text-white/85 uppercase">Secure PIN</h2>
          <p className="text-[10px] text-white/30 mt-2 font-mono tracking-wider">ENTER 4-DIGIT ACCESS CODE</p>
        </div>

        <PinDots filled={pin.length} />

        {pinError && (
          <div className="text-center text-xs text-rose-300 mb-4 animate-shake">{pinError}</div>
        )}

        <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key) => (
            <button
              key={key || 'empty'}
              onClick={() => key === '⌫' ? handlePinClear() : key && handlePinKey(key)}
              disabled={!key}
              className={`h-14 rounded-xl text-lg font-light transition-all duration-200 ${
                !key ? 'invisible' :
                key === '⌫'
                  ? 'bg-white/[0.03] border border-white/10 text-white/50 hover:bg-rose-500/10 hover:border-rose-400/30 hover:text-rose-300 active:scale-90'
                  : 'bg-white/[0.04] border border-white/[0.08] text-white/80 hover:bg-white/[0.08] hover:border-white/20 active:scale-90 active:bg-rose-500/10'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RENDER: STAGE 4 — VERIFICATION (सत्यापन) ────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  const renderVerification = () => {
    const checks = [
      { label: 'Credential Hash Match', threshold: 15 },
      { label: 'Biometric Signature Valid', threshold: 30 },
      { label: 'PIN Token Verified', threshold: 45 },
      { label: 'Session Encryption Active', threshold: 60 },
      { label: 'Firewall Clearance Granted', threshold: 75 },
      { label: 'Director Privileges Loaded', threshold: 90 },
    ];

    return (
      <div className="relative z-10 w-[92%] max-w-[440px] animate-glass-appear">
        <div className="relative rounded-2xl overflow-hidden p-10"
          style={{
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 30px 70px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.08)',
          }}
        >
          <LaserScan active={verifyProgress < 100} />

          <div className="text-center mb-8">
            <ScanLine className="w-8 h-8 text-cyan-400/70 mx-auto mb-3 animate-pulse" style={{ filter: 'drop-shadow(0 0 10px rgba(6,182,212,0.3))' }} />
            <h2 className="text-lg font-extralight tracking-[5px] text-white/85 uppercase">System Verification</h2>
            <p className="text-[10px] text-white/30 mt-2 font-mono tracking-wider">INTEGRITY SCAN IN PROGRESS</p>
          </div>

          {/* Progress bar / प्रगति पट्टी */}
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-6">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${verifyProgress}%`,
                background: 'linear-gradient(90deg, #06b6d4, #a855f7, #ec4899)',
                boxShadow: '0 0 10px rgba(6,182,212,0.4)',
              }}
            />
          </div>

          {/* Check items / जाँच सूची */}
          <div className="space-y-3">
            {checks.map((check) => (
              <div key={check.label} className="flex items-center gap-3">
                <div className={`w-4 h-4 flex items-center justify-center transition-all duration-300 ${
                  verifyProgress >= check.threshold ? 'text-emerald-400' : 'text-white/15'
                }`}>
                  {verifyProgress >= check.threshold ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <div className="w-2 h-2 rounded-full border border-current" />
                  )}
                </div>
                <span className={`text-[11px] font-mono transition-colors duration-300 ${
                  verifyProgress >= check.threshold ? 'text-white/70' : 'text-white/20'
                }`}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center text-[10px] font-mono text-white/25 tracking-wider">
            {verifyProgress < 100 ? `${Math.round(verifyProgress)}% COMPLETE` : 'ALL CHECKS PASSED'}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RENDER: STAGE 5 — ACCESS GRANTED TELEMETRY (पहुँच स्वीकृत HUD) ────────
  // ═══════════════════════════════════════════════════════════════════════════════
  const hudMetrics: MetricCard[] = [
    { label: 'Uptime', value: '99.97%', icon: <Clock className="w-4 h-4" />, color: 'text-emerald-400' },
    { label: 'Latency', value: '12ms', icon: <Zap className="w-4 h-4" />, color: 'text-cyan-400' },
    { label: 'Sector', value: 'A-7', icon: <Globe className="w-4 h-4" />, color: 'text-purple-400' },
    { label: 'Active Modes', value: '6/8', icon: <Layers className="w-4 h-4" />, color: 'text-amber-400' },
    { label: 'Threat Level', value: 'MINIMAL', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-emerald-400' },
    { label: 'Sync Status', value: 'LIVE', icon: <Wifi className="w-4 h-4" />, color: 'text-cyan-400' },
  ];

  const renderHud = () => (
    <div className="relative z-10 flex flex-col items-center justify-center animate-hud-appear w-[90%] max-w-[700px]">
      <div className="text-center mb-8">
        <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3" style={{ filter: 'drop-shadow(0 0 15px rgba(52,211,153,0.5))' }} />
        <h1 className="text-2xl font-extralight tracking-[6px] text-white/90">ACCESS GRANTED</h1>
        <p className="text-[10px] text-emerald-400/60 font-mono mt-2 tracking-wider">DIRECTOR CLEARANCE LEVEL-5 CONFIRMED</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
        {hudMetrics.map((m, i) => (
          <HudCard key={m.label} {...m} delay={i * 150} />
        ))}
      </div>

      <div className="mt-6 text-[10px] text-white/20 font-mono tracking-wider animate-pulse">
        INITIALIZING DIRECTOR WORKSTATION...
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RENDER: STAGE 6 — DIRECTOR DASHBOARD (निदेशक डैशबोर्ड) ────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  const renderDashboard = () => (
    <div className="relative z-10 w-full max-w-[1200px] mx-auto p-6 animate-dashboard-appear">
      {/* Top Bar / शीर्ष पट्टी */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-purple-500/20 border border-white/[0.08] flex items-center justify-center">
            <Cpu className="w-5 h-5 text-rose-300" />
          </div>
          <div>
            <h1 className="text-lg font-light text-white/90 tracking-wide">Director Control Center</h1>
            <p className="text-[10px] text-white/30 font-mono tracking-wider">EXECUTIVE WORKSTATION v4.2.1</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          <span className="text-[10px] font-mono text-emerald-400/70">SECURE SESSION</span>
        </div>
      </div>

      {/* Quick Stats / त्वरित आँकड़े */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <Database className="w-4 h-4" />, label: 'Data Nodes', value: '2,847', color: 'text-cyan-400' },
          { icon: <Network className="w-4 h-4" />, label: 'Connections', value: '1.2K', color: 'text-purple-400' },
          { icon: <Activity className="w-4 h-4" />, label: 'Throughput', value: '94.7%', color: 'text-emerald-400' },
          { icon: <Shield className="w-4 h-4" />, label: 'Shield Level', value: 'MAX', color: 'text-rose-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-slate-900/40 backdrop-blur-md border border-white/[0.06] rounded-xl p-4">
            <div className={`${stat.color} mb-2`}>{stat.icon}</div>
            <div className="text-xl font-bold text-white">{stat.value}</div>
            <div className="text-[10px] text-white/30 font-mono uppercase tracking-wider mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Main Grid / मुख्य ग्रिड */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerformanceGraph />
        <SecurityLog />
        <ServerStatus />
        <div className="bg-slate-900/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-amber-400" />
            <span className="text-xs uppercase tracking-[2px] text-white/50 font-mono">Active Sessions</span>
          </div>
          <div className="space-y-3">
            {[
              { region: 'US-EAST', sessions: 847, latency: '8ms' },
              { region: 'EU-WEST', sessions: 423, latency: '24ms' },
              { region: 'AP-SOUTH', sessions: 312, latency: '45ms' },
              { region: 'US-WEST', sessions: 196, latency: '12ms' },
            ].map((r) => (
              <div key={r.region} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-white/60">{r.region}</span>
                <div className="flex items-center gap-4">
                  <span className="text-cyan-400">{r.sessions}</span>
                  <span className="text-white/30">{r.latency}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── MAIN RENDER (मुख्य रेंडर) ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 overflow-hidden font-['Plus_Jakarta_Sans']"
      style={{ background: 'linear-gradient(180deg, #02020a 0%, #0d0415 20%, #1a0520 40%, #2d0a3e 60%, #4a1942 75%, #6b2150 88%, #892b5a 100%)' }}
    >
      {/* Dot-mesh alignment grid (डॉट-मेश अलाइनमेंट ग्रिड) */}
      <div className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,100,150,0.35) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Glowing volcanic peak at footer (फुटर पर चमकता ज्वालामुखी शिखर) */}
      <VolcanicPeak />

      {/* Cherry blossom branches (सकुरा शाखाएँ) */}
      <SakuraBranch side="left" />
      <SakuraBranch side="right" />

      {/* Rose-gold petal particles (गुलाबी-सुनहरी पंखुड़ी कण) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
        {Array.from({ length: 20 }).map((_, i) => (
          <SakuraPetal key={i} delay={i * 1.1} left={`${3 + Math.random() * 94}%`} size={4 + Math.random() * 6} />
        ))}
      </div>

      {/* Ambient crimson orbs / वातावरणीय गहरे गुलाबी ऑर्ब्स */}
      <div className="absolute top-[10%] left-[5%] w-[350px] h-[350px] rounded-full pointer-events-none z-[1] animate-orb-drift"
        style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />
      <div className="absolute bottom-[20%] right-[8%] w-[300px] h-[300px] rounded-full pointer-events-none z-[1] animate-orb-drift-reverse"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)', filter: 'blur(70px)' }}
      />
      <div className="absolute top-[50%] left-[40%] w-[250px] h-[250px] rounded-full pointer-events-none z-[1] animate-orb-drift"
        style={{ background: 'radial-gradient(circle, rgba(220,50,80,0.06) 0%, transparent 70%)', filter: 'blur(90px)', animationDelay: '3s' }}
      />

      {/* Stage content (चरण सामग्री) */}
      <div className={`relative z-10 w-full h-full flex items-center justify-center ${stage === 'dashboard' ? 'overflow-y-auto py-6' : ''}`}>
        {stage === 'login' && renderLogin()}
        {stage === 'biometric' && renderBiometric()}
        {stage === 'pin' && renderPin()}
        {stage === 'verification' && renderVerification()}
        {stage === 'hud' && renderHud()}
        {stage === 'dashboard' && renderDashboard()}
      </div>

      {/* ═══ CSS KEYFRAMES (एनिमेशन कीफ्रेम्स) ═══ */}
      <style>{`
        @keyframes gradShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes petal-fall {
          0% { transform: translateY(-20px) rotate(0deg) translateX(0); opacity: 0; }
          10% { opacity: 0.8; }
          50% { transform: translateY(50vh) rotate(180deg) translateX(30px); opacity: 0.6; }
          90% { opacity: 0.3; }
          100% { transform: translateY(105vh) rotate(360deg) translateX(-20px); opacity: 0; }
        }
        @keyframes sakura-sway {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-3px) rotate(0.3deg); }
          75% { transform: translateY(2px) rotate(-0.2deg); }
        }
        @keyframes laser-scan {
          0% { top: -2px; }
          100% { top: 100%; }
        }
        @keyframes orb-drift {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
          33% { transform: translate(15px, -20px) scale(1.08); opacity: 0.9; }
          66% { transform: translate(-10px, 12px) scale(0.95); opacity: 0.7; }
        }
        @keyframes orb-drift-reverse {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          50% { transform: translate(-20px, -15px) scale(1.1); opacity: 0.8; }
        }
        @keyframes glass-appear {
          0% { opacity: 0; transform: translateY(20px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes hud-appear {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes hud-card-in {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes dashboard-appear {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-petal-fall { animation: petal-fall linear infinite; }
        .animate-sakura-sway { animation: sakura-sway 8s ease-in-out infinite; }
        .animate-laser-scan { animation: laser-scan 2s linear infinite; }
        .animate-orb-drift { animation: orb-drift 12s ease-in-out infinite; }
        .animate-orb-drift-reverse { animation: orb-drift-reverse 10s ease-in-out infinite; }
        .animate-glass-appear { animation: glass-appear 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .animate-hud-appear { animation: hud-appear 0.6s ease-out forwards; }
        .animate-hud-card-in { animation: hud-card-in 0.5s ease-out; }
        .animate-dashboard-appear { animation: dashboard-appear 1s ease-out forwards; }
        .animate-ping-slow { animation: ping-slow 2.5s ease-out infinite; }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
        .animate-shake { animation: shake 0.4s ease-out; }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>
    </div>
  );
};

export default GlassmorphicPortal;
