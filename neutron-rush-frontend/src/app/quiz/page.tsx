'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { NeutronBackground } from '../../components/NeutronBackground';
import { useQuizSecurity } from '../../components/useQuizSecurity';
import { AlertCircle, Zap, Clock, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SynchronizedQuiz() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Dynamic Synchronous Match States
  const [matchState, setMatchState] = useState('DRAFT'); // WAITING_ROOM, COUNTDOWN, QUESTION, REVEAL_ANSWER, ENDED
  const [countdown, setCountdown] = useState(3);
  const [question, setQuestion] = useState<any>(null);
  const [timer, setTimer] = useState(15);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [securityLogs, setSecurityLogs] = useState<string[]>([]);
  
  // Analytics end summary
  const [analytics, setAnalytics] = useState<any>(null);

  useQuizSecurity((msg) => setSecurityLogs((prev) => [msg, ...prev]));

  useEffect(() => {
    const token = localStorage.getItem('nr_token');
    if (!token) {
      router.push('/');
      return;
    }

    const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const s = io(host, { auth: { token } });
    setSocket(s);

    s.on('match:sync-state', (match: any) => {
      setMatchState(match.status);
      if (match.status === 'QUESTION' && match.currentQuestion) {
        setQuestion(match.currentQuestion);
        setTimer(15);
        setSelectedOpt(null);
        setAnswered(false);
        setCorrectAnswer(null);
      } else if (match.status === 'COUNTDOWN') {
        runCountdownSequence();
      } else if (match.status === 'ENDED' && match.analytics) {
        setAnalytics(match.analytics);
      }
    });

    s.on('quiz:reveal-answer', (data: { correctAnswer: string; explanation?: string }) => {
      setMatchState('REVEAL_ANSWER');
      setCorrectAnswer(data.correctAnswer);
    });

    return () => {
      s.disconnect();
    };
  }, [router]);

  const runCountdownSequence = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Question Timer Countdown
  useEffect(() => {
    if (matchState !== 'QUESTION') return;
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [matchState]);

  const submitAnswer = (option: string) => {
    if (answered || !socket || matchState !== 'QUESTION') return;
    setSelectedOpt(option);
    setAnswered(true);

    socket.emit('quiz:submit-answer', {
      questionId: question.id,
      selectedAnswer: option,
    });
  };

  if (matchState === 'DRAFT' || matchState === 'WAITING_ROOM') {
    return (
      <div className="min-h-screen bg-[#0a192f] flex flex-col justify-center items-center text-white">
        <div className="w-16 h-16 border-4 border-t-[#39ff14] border-[#00f5ff]/20 rounded-full animate-spin mb-4" />
        <p className="text-[#00f5ff] tracking-widest text-xs uppercase">Connecting to Arena Sync Stream...</p>
      </div>
    );
  }

  if (matchState === 'COUNTDOWN') {
    return (
      <main className="relative flex items-center justify-center min-h-screen p-4">
        <NeutronBackground />
        <div className="text-center text-white">
          <p className="text-xs uppercase tracking-widest text-[#00f5ff] mb-2 animate-pulse">Synchronizing Competitors</p>
          <motion.h2 
            key={countdown}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 1 }}
            className="text-8xl font-black text-[#39ff14] shadow-neon"
          >
            {countdown}
          </motion.h2>
        </div>
      </main>
    );
  }

  if (matchState === 'ENDED') {
    return (
      <main className="relative flex items-center justify-center min-h-screen p-4">
        <NeutronBackground />
        <div className="max-w-md w-full bg-[#0d1e36]/90 border border-[#39ff14]/30 rounded-xl p-8 text-center backdrop-blur-md text-white">
          <TrophyBanner analytics={analytics} />
          <button
            onClick={() => router.push('/leaderboard')}
            className="w-full bg-[#00f5ff] text-black font-bold py-3 rounded-lg mt-6"
          >
            Go to Live Standings
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex flex-col justify-between min-h-screen p-4 text-white">
      <NeutronBackground />
      
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between bg-[#0d1e36]/80 border border-[#00f5ff]/20 rounded-xl p-4 backdrop-blur-sm">
        <span className="bg-[#00f5ff]/10 text-[#00f5ff] text-xs font-semibold px-2.5 py-1 rounded border border-[#00f5ff]/20">
          {question?.category || 'General'}
        </span>
        <div className="flex items-center space-x-1.5 text-orange-400 font-mono">
          <Clock className="w-4 h-4 animate-pulse" />
          <span className="text-sm font-bold">{timer}s</span>
        </div>
      </header>

      <div className="flex flex-col justify-center flex-grow w-full max-w-2xl mx-auto my-6">
        <div className="bg-[#0d1e36]/90 border border-[#00f5ff]/30 rounded-2xl p-6 md:p-8 backdrop-blur-md relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#0a192f] rounded-t-2xl overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#39ff14] to-red-500"
              initial={{ width: '100%' }}
              animate={{ width: `${(timer / 15) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </div>

          <h2 className="mb-8 text-xl font-bold leading-relaxed text-white md:text-2xl">
            {question?.question}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {([
              { key: 'A', val: question?.optionA },
              { key: 'B', val: question?.optionB },
              { key: 'C', val: question?.optionC },
              { key: 'D', val: question?.optionD },
            ] as const).map((opt) => {
              const isSelected = selectedOpt === opt.key;
              const isCorrect = correctAnswer === opt.key;
              const isWrongAndSelected = correctAnswer && isSelected && correctAnswer !== opt.key;
              
              let buttonStyle = 'bg-[#071324]/80 border-[#00f5ff]/20 hover:border-[#00f5ff] text-gray-300';
              if (isSelected) buttonStyle = 'bg-[#39ff14]/15 border-[#39ff14] text-white';
              if (correctAnswer) {
                if (isCorrect) buttonStyle = 'bg-green-950/40 border-green-500 text-green-300';
                if (isWrongAndSelected) buttonStyle = 'bg-red-950/40 border-red-500 text-red-300';
              }

              return (
                <button
                  key={opt.key}
                  disabled={answered || matchState === 'REVEAL_ANSWER'}
                  onClick={() => submitAnswer(opt.key)}
                  className={`flex items-center text-left p-4 rounded-xl border transition-all text-sm group ${buttonStyle}`}
                >
                  <span className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold mr-3 text-xs transition ${
                    isSelected ? 'bg-[#39ff14] text-black' : 'bg-[#00f5ff]/10 text-[#00f5ff]'
                  }`}>
                    {opt.key}
                  </span>
                  <span className="flex-grow">{opt.val}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {securityLogs.length > 0 && (
        <div className="fixed bottom-4 right-4 max-w-sm w-full bg-red-950/90 border border-red-500/50 p-4 rounded-xl shadow-2xl backdrop-blur-md text-[10px] font-mono">
          <p className="flex items-center mb-1 text-xs font-bold tracking-wider text-red-400 uppercase">
            <AlertCircle className="w-4 h-4 mr-1" /> Warnings ({securityLogs.length})
          </p>
          {securityLogs.map((log, i) => (
            <p key={i} className="pb-1 border-b border-red-900/40">{log}</p>
          ))}
        </div>
      )}
    </main>
  );
}

function TrophyBanner({ analytics }: { analytics: any }) {
  if (!analytics) return null;
  return (
    <div className="space-y-4">
      <TrophyIcon className="w-16 h-16 text-[#39ff14] mx-auto mb-4" />
      <h2 className="text-3xl font-extrabold text-[#39ff14]">MATCH CONCLUDED</h2>
      <div className="bg-[#071324] border border-[#00f5ff]/20 rounded-lg p-4 space-y-2 mt-4 text-left font-mono text-xs">
        <p><span className="text-gray-400">Total Correct Options Selected:</span> {analytics.totalCorrect}</p>
        <p><span className="text-gray-400">Average Response Time:</span> {analytics.averageResponseTime}s</p>
        {analytics.fastestAnswer && (
          <p><span className="text-gray-400">Fastest Competitor Answer:</span> {analytics.fastestAnswer.name} ({analytics.fastestAnswer.time}s)</p>
        )}
      </div>
    </div>
  );
}

function TrophyIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
      <path d="M12 2a6 6 0 0 1 6 6v3.5c0 1.66-1.34 3-3 3H9c-1.66 0-3-1.34-3-3V8a6 6 0 0 1 6-6z" />
    </svg>
  );
}