'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { NeutronBackground } from '../../components/NeutronBackground';
import { useQuizSecurity } from '../../components/useQuizSecurity';
import { AlertCircle, Zap, Clock, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Question {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  category: string;
}

export default function QuizInterface() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(15);
  const [securityLogs, setSecurityLogs] = useState<string[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  const logSecurityViolation = useCallback((msg: string) => {
    setSecurityLogs((prev) => [msg, ...prev]);
  }, []);

  useQuizSecurity(logSecurityViolation);

  useEffect(() => {
    const token = localStorage.getItem('nr_token');
    if (!token) {
      router.push('/');
      return;
    }

    const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const s = io(host, { auth: { token } });
    setSocket(s);

    fetch(`${host}/api/questions`)
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    s.on('quiz:ack', (ack: { score: number; isCorrect: boolean }) => {
      setScore(ack.score);
    });

    s.on('quiz:security-alert', (alert: { error: string }) => {
      logSecurityViolation(alert.error);
    });

    return () => {
      s.disconnect();
    };
  }, [router, logSecurityViolation]);

  useEffect(() => {
    if (socket && questions.length > 0 && currentIndex < questions.length) {
      socket.emit('quiz:request-question', { questionId: questions[currentIndex].id });
      setTimer(15);
      setSelectedOpt(null);
      setAnswered(false);
    }
  }, [socket, questions, currentIndex]);

  useEffect(() => {
    if (quizFinished || loading || questions.length === 0) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, quizFinished, loading, questions]);

  const handleAutoSubmit = () => {
    if (!answered) {
      submitAnswer(null);
    }
  };

  const submitAnswer = (option: string | null) => {
    if (answered || !socket || questions.length === 0) return;
    setSelectedOpt(option);
    setAnswered(true);

    socket.emit('quiz:submit-answer', {
      questionId: questions[currentIndex].id,
      selectedAnswer: option,
    });

    setTimeout(() => {
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setQuizFinished(true);
      }
    }, 450);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a192f] flex flex-col justify-center items-center text-white">
        <div className="w-16 h-16 border-4 border-t-[#39ff14] border-[#00f5ff]/20 rounded-full animate-spin mb-4" />
        <p className="text-[#00f5ff] tracking-widest text-xs uppercase">Establishing Nuclear Link...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a192f] flex justify-center items-center text-white p-4">
        <div className="text-center p-8 border border-red-500/30 rounded-xl bg-red-950/20 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-sm">No questions loaded. Contact your system admin.</p>
        </div>
      </div>
    );
  }

  if (quizFinished) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <NeutronBackground />
        <div className="max-w-md w-full bg-[#0d1e36]/90 border border-[#39ff14]/30 rounded-xl p-8 text-center backdrop-blur-md text-white">
          <Trophy className="w-16 h-16 text-[#39ff14] mx-auto mb-4" />
          <h2 className="text-3xl font-extrabold text-[#39ff14] mb-2">Quiz Complete!</h2>
          <div className="bg-[#071324] border border-[#00f5ff]/20 rounded p-4 mb-6 mt-4">
            <span className="text-xs uppercase text-[#00f5ff] tracking-widest block mb-1">Your Score</span>
            <span className="text-5xl font-black text-white">{score} Pts</span>
          </div>
          <button
            onClick={() => router.push('/leaderboard')}
            className="w-full bg-[#00f5ff] text-black font-bold py-3 rounded-lg"
          >
            Go to Live Leaderboard
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <main className="relative min-h-screen p-4 text-white flex flex-col justify-between">
      <NeutronBackground />
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between bg-[#0d1e36]/80 border border-[#00f5ff]/20 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="bg-[#39ff14]/10 border border-[#39ff14] p-2 rounded">
            <Zap className="w-5 h-5 text-[#39ff14]" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Score Tracker</p>
            <p className="text-lg font-bold text-white">{score} <span className="text-xs font-normal text-[#39ff14]">pts</span></p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <p className="text-xs text-[#00f5ff] font-bold">Progress</p>
          <p className="text-lg font-extrabold">{currentIndex + 1} / {questions.length}</p>
        </div>
      </header>

      <div className="w-full max-w-2xl mx-auto my-6 flex-grow flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.25 }}
            className="bg-[#0d1e36]/90 border border-[#00f5ff]/30 rounded-2xl p-6 md:p-8 backdrop-blur-md relative"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-[#0a192f] rounded-t-2xl overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#39ff14] to-red-500"
                initial={{ width: '100%' }}
                animate={{ width: `${(timer / 15) * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>

            <div className="flex items-center justify-between mb-6">
              <span className="bg-[#00f5ff]/10 text-[#00f5ff] text-xs font-semibold px-2.5 py-1 rounded border border-[#00f5ff]/20">
                {currentQuestion.category}
              </span>
              <div className="flex items-center space-x-1.5 text-orange-400 font-mono">
                <Clock className="w-4 h-4 animate-pulse" />
                <span className="text-sm font-bold">{timer}s</span>
              </div>
            </div>

            <h2 className="text-xl md:text-2xl font-bold mb-8 text-white leading-relaxed">
              {currentQuestion.question}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                { key: 'A', val: currentQuestion.optionA },
                { key: 'B', val: currentQuestion.optionB },
                { key: 'C', val: currentQuestion.optionC },
                { key: 'D', val: currentQuestion.optionD },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  disabled={answered}
                  onClick={() => submitAnswer(opt.key)}
                  className={`flex items-center text-left p-4 rounded-xl border transition-all text-sm group ${
                    selectedOpt === opt.key
                      ? 'bg-[#39ff14]/15 border-[#39ff14] text-white shadow-lg shadow-[#39ff14]/10'
                      : 'bg-[#071324]/80 border-[#00f5ff]/20 hover:border-[#00f5ff] text-gray-300'
                  }`}
                >
                  <span className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold mr-3 text-xs transition ${
                    selectedOpt === opt.key
                      ? 'bg-[#39ff14] text-black'
                      : 'bg-[#00f5ff]/10 text-[#00f5ff] group-hover:bg-[#00f5ff] group-hover:text-black'
                  }`}>
                    {opt.key}
                  </span>
                  <span className="flex-grow">{opt.val}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mt-8 pt-4 border-t border-[#00f5ff]/10">
              <button
                disabled={answered}
                onClick={() => submitAnswer(null)}
                className="text-xs font-bold text-gray-400 hover:text-white transition"
              >
                Skip Question
              </button>
              <span className="text-xs text-[#00f5ff] italic">
                System Active
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {securityLogs.length > 0 && (
        <div className="fixed bottom-4 right-4 max-w-sm w-full bg-red-950/90 border border-red-500/50 p-4 rounded-xl shadow-2xl backdrop-blur-md">
          <p className="text-xs font-bold text-red-400 flex items-center mb-1 uppercase tracking-wider">
            <AlertCircle className="w-4 h-4 mr-1" /> Warnings ({securityLogs.length})
          </p>
          <div className="max-h-20 overflow-y-auto text-[10px] font-mono text-red-200 space-y-1">
            {securityLogs.map((log, i) => (
              <p key={i} className="border-b border-red-900/40 pb-1">{log}</p>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}