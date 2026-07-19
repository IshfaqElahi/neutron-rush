'use client';

import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Play, Square, Settings, Upload, Database, Users, FastForward, CheckSquare, LogOut } from 'lucide-react';

export default function AdminConsole() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [matchState, setMatchState] = useState('DRAFT');
  const [players, setPlayers] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);

  // Real-time Live Stats States
  const [stats, setStats] = useState<any>({
    distribution: { A: 0, B: 0, C: 0, D: 0, total: 0 },
    fastest: []
  });

  const [rawJson, setRawJson] = useState('');

  useEffect(() => {
    const authStatus = sessionStorage.getItem('nr_admin_authorized');
    if (authStatus === 'true') {
      setIsAdminAuth(true);
    }
  }, []);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'rush123') {
      sessionStorage.setItem('nr_admin_authorized', 'true');
      setIsAdminAuth(true);
      setLoginError('');
    } else {
      setLoginError('Incorrect credentials.');
    }
  };

  useEffect(() => {
    if (!isAdminAuth) return;

    const token = localStorage.getItem('nr_token') || '';
    const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const s = io(host, { auth: { token } });
    setSocket(s);

    s.on('match:sync-state', (match: any) => {
      setMatchState(match.status);
      if (match.players) setPlayers(match.players);
    });

    s.on('admin:player-update', (players: any[]) => {
      setPlayers(players);
    });

    s.on('admin:live-stats', (data: any) => {
      setStats(data);
    });

    return () => {
      s.disconnect();
    };
  }, [isAdminAuth]);

  const addLog = (msg: string) => {
    setSystemLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const executeControl = (action: string) => {
    if (!socket) return;
    socket.emit(action);
    addLog(`Executed: ${action}`);
  };

  const handleBulkImport = async () => {
    try {
      const parsed = JSON.parse(rawJson);
      const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${host}/api/admin/questions-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: parsed }),
      });
      if (!response.ok) throw new Error('Upload error');
      addLog('Successfully ingested question pool.');
      setRawJson('');
      alert('Questions imported.');
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    }
  };

  if (!isAdminAuth) {
    return (
      <main className="min-h-screen bg-[#070c14] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0d1e36]/90 border border-[#00f5ff]/30 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-black text-center uppercase mb-4 text-[#00f5ff]">Admin Access</h2>
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-sm">
            <input
              type="password"
              required
              placeholder="Password"
              className="w-full bg-[#071324] border border-[#00f5ff]/30 rounded px-4 py-2 text-white outline-none text-center tracking-widest"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
            {loginError && <p className="text-xs text-center text-red-400">{loginError}</p>}
            <button type="submit" className="w-full bg-[#39ff14] text-black font-bold py-2 rounded">Authorize</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070c14] text-white p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <h1 className="text-2xl font-black text-[#00f5ff]">CHAMPIONSHIP RADAR CONSOLE</h1>
          <button
            onClick={() => {
              sessionStorage.removeItem('nr_admin_authorized');
              window.location.reload();
            }}
            className="flex items-center space-x-1.5 bg-red-950/40 border border-red-500/30 text-red-400 px-3 py-1.5 rounded text-xs"
          >
            <LogOut className="w-4 h-4" />
            <span>Lock</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            
            {/* Control Deck */}
            <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800">
              <h2 className="text-md font-bold mb-4 uppercase tracking-wider text-[#39ff14]">Match Orchestrator</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <button
                  onClick={() => executeControl('admin:open-lobby')}
                  className="flex flex-col items-center p-3 text-indigo-400 border rounded-lg bg-indigo-950/20 hover:bg-indigo-900/30 border-indigo-500/30"
                >
                  <Users className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-bold">1. Open Lobby</span>
                </button>
                <button
                  onClick={() => executeControl('admin:start-quiz')}
                  className="flex flex-col items-center p-3 border rounded-lg bg-emerald-950/20 hover:bg-emerald-900/30 border-emerald-500/30 text-emerald-400"
                >
                  <Play className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-bold">2. Trigger Sync</span>
                </button>
                <button
                  onClick={() => executeControl('admin:next-question')}
                  className="flex flex-col items-center p-3 border rounded-lg bg-cyan-950/20 hover:bg-cyan-900/30 border-cyan-500/30 text-cyan-400"
                >
                  <FastForward className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-bold">3. Next Random</span>
                </button>
                <button
                  onClick={() => executeControl('admin:end-question')}
                  className="flex flex-col items-center p-3 text-red-400 border rounded-lg bg-red-950/20 hover:bg-red-900/30 border-red-500/30"
                >
                  <CheckSquare className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-bold">4. Reveal Answer</span>
                </button>
              </div>

              <button
                onClick={() => executeControl('admin:end-quiz')}
                className="w-full py-2 mt-4 text-xs font-bold text-white uppercase bg-red-600 rounded-lg hover:bg-red-700"
              >
                Finish Quiz Session
              </button>
            </div>

            {/* LIVE STATISTICS */}
            {matchState === 'QUESTION' && (
              <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800 space-y-6">
                <div>
                  <h3 className="text-xs uppercase text-[#00f5ff] font-bold tracking-wider mb-2">Live Response Ingestion</h3>
                  <p className="font-mono text-xl font-bold">{stats.distribution.total} / {players.length} answered</p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs uppercase text-[#39ff14] font-bold tracking-wider">Answer Distribution Matrix</h3>
                  {['A', 'B', 'C', 'D'].map((opt) => {
                    const count = stats.distribution[opt] || 0;
                    const percent = stats.distribution.total > 0 ? (count / stats.distribution.total) * 100 : 0;
                    return (
                      <div key={opt} className="flex items-center space-x-3 text-sm">
                        <span className="w-4 font-bold">{opt}:</span>
                        <div className="flex-grow h-3 overflow-hidden border border-gray-800 rounded-full bg-black/40">
                          <div className="h-full bg-[#00f5ff]" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="w-8 font-mono text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <h3 className="text-xs uppercase text-[#00f5ff] font-bold tracking-wider mb-2">Fastest Correct Responders</h3>
                  <div className="space-y-1 font-mono text-xs">
                    {stats.fastest.length > 0 ? (
                      stats.fastest.map((f: any, i: number) => (
                        <p key={i}>{i+1}. {f.name} - <span className="text-[#39ff14]">{f.time}s</span></p>
                      ))
                    ) : (
                      <p className="italic text-gray-500">Waiting for correct submissions...</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Questions Upload */}
            <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800">
              <h2 className="mb-4 font-bold tracking-wider uppercase text-md">Ingest Questions Pack</h2>
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                rows={4}
                placeholder="Paste array payload..."
                className="w-full bg-[#071324] border border-gray-700 rounded p-3 font-mono text-xs text-[#00f5ff] placeholder-gray-600 outline-none"
              />
              <button onClick={handleBulkImport} className="mt-4 w-full bg-[#00f5ff] text-black font-bold py-2 text-xs uppercase rounded">Import Packet</button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800 flex flex-col h-72">
              <h2 className="text-xs uppercase font-bold tracking-wider mb-3 text-[#00f5ff]">Lobby Players ({players.length})</h2>
              <div className="flex-grow bg-[#071324] border border-gray-800 rounded p-3 font-mono text-xs space-y-1 overflow-y-auto">
                {players.map((p, idx) => (
                  <div key={idx} className="flex justify-between pb-1 border-b border-gray-900">
                    <span className={p.online ? 'text-green-400' : 'text-gray-500'}>{p.name}</span>
                    <button
                      onClick={() => socket?.emit('admin:kick-player', { userId: p.socketId })}
                      className="text-red-500 hover:underline text-[10px]"
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0d1e36] p-6 rounded-xl border border-gray-800 flex flex-col h-72">
              <h2 className="mb-3 text-xs font-bold tracking-wider text-orange-400 uppercase">System Logs</h2>
              <div className="flex-grow bg-[#071324] border border-gray-800 rounded p-3 font-mono text-[10px] space-y-1 overflow-y-auto">
                {systemLogs.map((log, index) => (
                  <p key={index} className="pb-1 text-gray-300 border-b border-gray-900">{log}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}