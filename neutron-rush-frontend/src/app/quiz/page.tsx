'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { NeutronBackground } from '../../components/NeutronBackground';
import { useQuizSecurity } from '../../components/useQuizSecurity';
import { AlertCircle, Zap, Clock, ShieldAlert, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SynchronizedQuiz() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  
  const [matchState, setMatchState] = useState('DRAFT'); 
  const [countdown, setCountdown] = useState(3);
  const [question, setQuestion] = useState<any>(null);
  const [timer, setTimer] = useState(15);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [securityLogs, setSecurityLogs] = useState<string[]>([]);
  const [quizPaused, setQuizPaused] = useState(false);
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
      setQuizPaused(match.paused);
      if (match.status === 'QUESTION' && match.currentQuestion) {
        setQuestion(match.currentQuestion);
        setTimer(match.timerSeconds || 15);
        setSelectedOpt(null);
        setAnswered(false);
        setCorrectAnswer(null);
      } else if (match.status === 'COUNTDOWN') {
        setCountdown(match.countdownSeconds || 3);
        runCountdownSequence(match.countdownSeconds || 3);
      } else if (match.status === 'ENDED' && match.analytics) {
        setAnalytics(match.analytics);
      }
    });

    s.on('match:paused', () => {
      setQuizPaused(true);
    });

    s.on('match:resumed', (data: { remainingSeconds: number }) => {
      setQuizPaused(false);
      setTimer(Math.ceil(data.remainingSeconds));
    });

    s.on('quiz:reveal-answer', (data: { correctAnswer: string }) => {
      setMatchState('REVEAL_ANSWER');
      setCorrectAnswer(data.correctAnswer);
    });

    return () => {
      s.disconnect();
    };
  }, [router]);

  const runCountdownSequence = (startVal: number) => {
    setCountdown(startVal);
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

  useEffect(() => {
    if (matchState !== 'QUESTION' || quizPaused) return;
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
  }, [matchState, quizPaused]);

  const submitAnswer = (option: string) => {
    if (answered || !socket || matchState !== 'QUESTION' || quizPaused) return;
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

  if (matchState === 'EMERGENCY_STOP') {
    return (
      <main className="relative flex items-center justify-center min-h-screen p-4">
        <NeutronBackground />
        <div className="w-full max-w-md p-8 text-center text-white border border-red-500 bg-red-950/90 rounded-xl">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-500 animate-bounce" />
          <h2 className="text-3xl font-extrabold text-red-400 uppercase">Match Suspended</h2>
          <p className="mt-3 text-sm text-red-200">The administrator has executed an Emergency Stop. Standby for sync.</p>
        </div>
      </main>
    );
  }

  if (matchState === 'COUNTDOWN') {
    return (
      <main className="relative flex items-center justify-center min-h-screen p-4">
        <NeutronBackground />
        <div className="text-center text-white">
          <p className="text-xs uppercase tracking-widest text-[#00f5ff] mb-2 animate-pulse">Get Ready</p>
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
        
        {quizPaused ? (
          <span className="text-xs uppercase bg-orange-950/40 border border-orange-500/40 text-orange-400 px-3 py-1.5 rounded font-bold animate-pulse">
            Session Paused
          </span>
        ) : (
          <div className="flex items-center space-x-1.5 text-orange-400 font-mono">
            <Clock className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-bold">{timer}s</span>
          </div>
        )}
      </header>

      {/* PAUSED MASK SCREEN */}
      <AnimatePresence>
        {quizPaused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center text-white bg-black/70 backdrop-blur-md"
          >
            <ShieldAlert className="w-16 h-16 mb-3 text-orange-400 animate-pulse" />
            <h2 className="text-2xl font-black text-orange-400 uppercase">Match Paused</h2>
            <p className="mt-1 text-xs text-gray-400">Please wait for the administrator to resume the session.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col justify-center flex-grow w-full max-w-2xl mx-auto my-6">
        <div className="bg-[#0d1e36]/90 border border-[#00f5ff]/30 rounded-2xl p-6 md:p-8 backdrop-blur-md relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#0a192f] rounded-t-2xl overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#39ff14] to-red-500"
              initial={{ width: '100%' }}
              animate={{ width: quizPaused ? `${(timer / 15) * 100}%` : `${(timer / 15) * 100}%` }}
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
                  disabled={answered || matchState === 'REVEAL_ANSWER' || quizPaused}
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
      <Award className="w-16 h-16 text-[#39ff14] mx-auto mb-4" />
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