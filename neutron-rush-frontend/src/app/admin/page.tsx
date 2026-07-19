'use client';

import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Play, Square, Settings, Upload, Database, Users, AlertTriangle, Save } from 'lucide-react';

export default function AdminConsole() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [quizStatus, setQuizStatus] = useState('DRAFT');
  const [rawJson, setRawJson] = useState('');
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [playersCount, setPlayersCount] = useState(0);

  const [rulesForm, setRulesForm] = useState({
    title: 'Neutron Rush Championship',
    timerSeconds: 15,
    rulesText: '',
    totalQuestions: 10,
    positiveMarks: 10,
    negativeMarks: 0,
    allowBacktracking: false,
    autoSubmit: true,
    showSchool: true,
    showTeamName: true,
  });

  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('nr_token') || '';
    const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const s = io(host, { auth: { token } });
    setSocket(s);

    fetch(`${host}/api/quiz-config`)
      .then((res) => res.json())
      .then((data) => {
        setRulesForm({
          title: data.title || 'Neutron Rush Championship',
          timerSeconds: data.timerSeconds || 15,
          rulesText: data.rulesText || '',
          totalQuestions: data.totalQuestions || 10,
          positiveMarks: data.positiveMarks || 10,
          negativeMarks: data.negativeMarks || 0,
          allowBacktracking: data.allowBacktracking || false,
          autoSubmit: data.autoSubmit || true,
          showSchool: data.showSchool !== undefined ? data.showSchool : true,
          showTeamName: data.showTeamName !== undefined ? data.showTeamName : true,
        });
      })
      .catch((err) => console.error("Failed to load initial settings:", err));

    s.on('quiz:status-changed', (status: string) => {
      setQuizStatus(status);
      addLog(`Status changed to: ${status}`);
    });

    s.on('leaderboard:update', (data: any[]) => {
      setPlayersCount(data.length);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const addLog = (msg: string) => {
    setSystemLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const changeQuizState = (targetStatus: string) => {
    if (socket) {
      socket.emit('admin:update-status', targetStatus);
    }
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRules(true);
    try {
      const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${host}/api/admin/quiz-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulesForm),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update configurations');

      addLog('Quiz configuration parameters successfully modified.');
      alert('Configurations saved successfully!');
    } catch (err: any) {
      alert(`Error saving configurations: ${err.message}`);
    } finally {
      setSavingRules(false);
    }
  };

  const handleBulkImport = async () => {
    try {
      const questionsParsed = JSON.parse(rawJson);
      if (!Array.isArray(questionsParsed)) {
        alert('Data packet must be formatted as a standard JSON array.');
        return;
      }

      const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${host}/api/admin/questions-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questionsParsed }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      addLog(`Ingested ${questionsParsed.length} new questions.`);
      setRawJson('');
      alert('Questions imported successfully.');
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-[#070c14] text-white p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col justify-between pb-4 border-b border-gray-800 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-black tracking-wider text-[#00f5ff]">ADMIN PANEL</h1>
          </div>
        </div>

        {/* Info Blocks */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-[#0d1e36] p-4 rounded-xl border border-gray-800 flex items-center space-x-4">
            <Users className="w-8 h-8 text-[#00f5ff]" />
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Total Enrolled</p>
              <p className="text-2xl font-bold">{playersCount}</p>
            </div>
          </div>
          <div className="bg-[#0d1e36] p-4 rounded-xl border border-gray-800 flex items-center space-x-4">
            <Settings className="w-8 h-8 text-[#39ff14]" />
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Session State</p>
              <p className="text-2xl font-bold text-[#39ff14]">{quizStatus}</p>
            </div>
          </div>
          <div className="bg-[#0d1e36] p-4 rounded-xl border border-gray-800 flex items-center space-x-4">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Health status</p>
              <p className="text-2xl font-bold text-orange-500">Nominal</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            
            {/* Quick Engine Controls */}
            <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800">
              <h2 className="flex items-center mb-4 space-x-2 text-lg font-bold">
                <Database className="w-5 h-5 text-[#39ff14]" />
                <span>Controls Console</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <button
                  onClick={() => changeQuizState('ACTIVE')}
                  className="flex flex-col items-center justify-center p-3 text-green-400 border border-gray-700 rounded-lg bg-green-950/20 hover:bg-green-900/30"
                >
                  <Play className="w-5 h-5 mb-1" />
                  <span className="text-xs font-bold">Start Round</span>
                </button>
                <button
                  onClick={() => changeQuizState('FROZEN')}
                  className="flex flex-col items-center justify-center p-3 border border-gray-700 rounded-lg bg-sky-950/20 hover:bg-sky-900/30 text-sky-400"
                >
                  <Square className="w-5 h-5 mb-1" />
                  <span className="text-xs font-bold">Freeze Scores</span>
                </button>
                <button
                  onClick={() => changeQuizState('ENDED')}
                  className="flex flex-col items-center justify-center p-3 text-red-400 border border-gray-700 rounded-lg bg-red-950/20 hover:bg-red-900/30"
                >
                  <Square className="w-5 h-5 mb-1" />
                  <span className="text-xs font-bold">End Session</span>
                </button>
                <button
                  onClick={() => changeQuizState('DRAFT')}
                  className="flex flex-col items-center justify-center p-3 border border-gray-700 rounded-lg bg-zinc-950/20 hover:bg-zinc-900/30 text-zinc-400"
                >
                  <Settings className="w-5 h-5 mb-1" />
                  <span className="text-xs font-bold">Reset / Draft</span>
                </button>
              </div>
            </div>

            {/* DYNAMIC RULES CONFIGURATION PANEL */}
            <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800">
              <h2 className="text-lg font-bold mb-4 flex items-center space-x-2 text-[#00f5ff]">
                <Settings className="w-5 h-5 text-[#00f5ff]" />
                <span>Quiz Config & Rules Customizer</span>
              </h2>
              <form onSubmit={handleSaveRules} className="space-y-4 text-sm">
                <div>
                  <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">Championship Title</label>
                  <input
                    type="text"
                    value={rulesForm.title}
                    onChange={(e) => setRulesForm({ ...rulesForm, title: e.target.value })}
                    className="w-full bg-[#071324] border border-gray-700 rounded p-2.5 outline-none focus:border-[#00f5ff]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">Timer (Seconds)</label>
                    <input
                      type="number"
                      value={rulesForm.timerSeconds}
                      onChange={(e) => setRulesForm({ ...rulesForm, timerSeconds: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#071324] border border-gray-700 rounded p-2.5 outline-none focus:border-[#00f5ff]"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">Total Questions</label>
                    <input
                      type="number"
                      value={rulesForm.totalQuestions}
                      onChange={(e) => setRulesForm({ ...rulesForm, totalQuestions: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#071324] border border-gray-700 rounded p-2.5 outline-none focus:border-[#00f5ff]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">Positive Marks (Correct)</label>
                    <input
                      type="number"
                      value={rulesForm.positiveMarks}
                      onChange={(e) => setRulesForm({ ...rulesForm, positiveMarks: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#071324] border border-gray-700 rounded p-2.5 outline-none focus:border-[#00f5ff]"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">Negative Marks (Incorrect)</label>
                    <input
                      type="number"
                      value={rulesForm.negativeMarks}
                      onChange={(e) => setRulesForm({ ...rulesForm, negativeMarks: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#071324] border border-gray-700 rounded p-2.5 outline-none focus:border-[#00f5ff]"
                    />
                  </div>
                </div>

                {/* FIELD TOGGLE SWITCHES */}
                <div className="bg-[#071324] p-3.5 rounded border border-gray-800 space-y-3">
                  <span className="block mb-1 text-xs font-bold text-gray-400 uppercase">Active Registration Fields</span>
                  <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-6">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="showSchool"
                        checked={rulesForm.showSchool}
                        onChange={(e) => setRulesForm({ ...rulesForm, showSchool: e.target.checked })}
                        className="w-4 h-4 accent-[#39ff14] cursor-pointer"
                      />
                      <label htmlFor="showSchool" className="text-xs text-gray-300 cursor-pointer select-none">
                        Enable University/School Field
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="showTeamName"
                        checked={rulesForm.showTeamName}
                        onChange={(e) => setRulesForm({ ...rulesForm, showTeamName: e.target.checked })}
                        className="w-4 h-4 accent-[#39ff14] cursor-pointer"
                      />
                      <label htmlFor="showTeamName" className="text-xs text-gray-300 cursor-pointer select-none">
                        Enable Team Name Field
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">Display Rules Statement (One rule per line)</label>
                  <textarea
                    rows={4}
                    value={rulesForm.rulesText}
                    onChange={(e) => setRulesForm({ ...rulesForm, rulesText: e.target.value })}
                    placeholder="Total questions: 10&#10;Time per question: 15 seconds&#10;Positive marking: +10&#10;Negative marking: 0"
                    className="w-full bg-[#071324] border border-gray-700 rounded p-2.5 outline-none focus:border-[#00f5ff] font-sans text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingRules}
                  className="w-full bg-[#39ff14] hover:bg-[#32d912] text-black font-bold py-2.5 rounded flex items-center justify-center space-x-2 text-sm transition"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingRules ? 'Updating settings...' : 'Save Rules Configuration'}</span>
                </button>
              </form>
            </div>

            {/* Questions Upload */}
            <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800">
              <h2 className="flex items-center mb-4 space-x-2 text-lg font-bold">
                <Upload className="w-5 h-5 text-[#00f5ff]" />
                <span>Import Ingestion Panel</span>
              </h2>
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                rows={6}
                placeholder={`[
  {
    "question": "What is the speed of light?",
    "optionA": "299,792,458 m/s",
    "optionB": "150,000 m/s",
    "optionC": "300,000,000 m/s",
    "optionD": "None",
    "correct": "A"
  }
]`}
                className="w-full bg-[#071324] border border-gray-700 rounded p-3 font-mono text-xs text-[#00f5ff] placeholder-gray-600 outline-none focus:border-[#00f5ff]"
              />
              <button
                onClick={handleBulkImport}
                className="mt-4 w-full bg-[#00f5ff] text-black font-bold py-2.5 rounded text-sm"
              >
                Ingest Questions
              </button>
            </div>
          </div>

          <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800 flex flex-col h-full">
            <h2 className="mb-4 text-lg font-bold">Diagnostics</h2>
            <div className="flex-grow bg-[#071324] border border-gray-800 rounded p-3 font-mono text-xs space-y-2 max-h-96 overflow-y-auto">
              {systemLogs.length === 0 ? (
                <p className="italic text-gray-600">No events recorded during active sessions...</p>
              ) : (
                systemLogs.map((log, index) => (
                  <p key={index} className="pb-1 text-gray-300 border-b border-gray-900">{log}</p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}