'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { NeutronBackground } from '../components/NeutronBackground';
import { Radiation, FileText, Play, ShieldAlert, Radio, ShieldCheck } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [showRules, setShowRules] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [formData, setFormData] = useState({ name: '', school: '', teamName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [inLobby, setInLobby] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
  const [registrationLocked, setRegistrationLocked] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    fetch(`${host}/api/quiz-config`)
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch((err) => console.error("Could not fetch quiz configuration:", err));
  }, []);

  const connectLobbySocket = (token: string) => {
    const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const s = io(host, { auth: { token } });
    setSocket(s);

    s.on('match:sync-state', (match: any) => {
      if (match.status === 'WAITING_ROOM') {
        setInLobby(true);
        if (match.players) setLobbyPlayers(match.players);
      } else if (match.status === 'COUNTDOWN' || match.status === 'QUESTION') {
        router.push('/quiz');
      }
    });

    s.on('admin:player-update', (players: any[]) => {
      setLobbyPlayers(players);
    });

    s.on('registration:status-changed', (isLocked: boolean) => {
      setRegistrationLocked(isLocked);
    });

    s.on('player:kicked', () => {
      alert('You have been removed from the lobby.');
      localStorage.removeItem('nr_token');
      window.location.reload();
    });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setError('You must agree to the rules before joining.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server registration failure');

      localStorage.setItem('nr_token', data.token);
      localStorage.setItem('nr_user', JSON.stringify(data.user));
      connectLobbySocket(data.token);
      setInLobby(true);
    } catch (err: any) {
      setError(err.message || 'System connectivity issue.');
    } finally {
      setLoading(false);
    }
  };

  const hasAnyOptionalFields = config?.showSchool || config?.showTeamName;

  if (inLobby) {
    return (
      <main className="relative flex flex-col items-center justify-center min-h-screen p-4 text-white">
        <NeutronBackground />
        <div className="max-w-xl w-full bg-[#0d1e36]/90 border border-[#00f5ff]/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="p-4 bg-[#39ff14]/10 border border-[#39ff14] rounded-full animate-pulse">
              <Radio className="w-8 h-8 text-[#39ff14]" />
            </div>
            <h2 className="text-2xl font-black text-[#00f5ff] tracking-widest">TRANSMISSION ESTABLISHED</h2>
            <p className="text-sm text-gray-300">Waiting for Admin to Start the quiz...</p>
          </div>

          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="bg-[#071324] p-4 rounded-lg border border-[#00f5ff]/20 text-center">
              <span className="block mb-1 text-xs text-gray-400 uppercase">Players Connected</span>
              <span className="text-3xl font-black text-[#39ff14]">{lobbyPlayers.filter(p => p.online).length}</span>
            </div>
            <div className="bg-[#071324] p-4 rounded-lg border border-[#00f5ff]/20 text-center">
              <span className="block mb-1 text-xs font-bold text-gray-400 uppercase">Lobby Channel</span>
              <span className="flex items-center justify-center mt-2 text-xs font-bold text-green-400">
                <ShieldCheck className="w-4 h-4 mr-1" /> Active Link
              </span>
            </div>
          </div>

          <div className="bg-[#071324] p-4 rounded-lg border border-[#00f5ff]/10">
            <p className="text-xs text-[#00f5ff] uppercase font-bold tracking-wider mb-2">Connected Arena Lobbyists:</p>
            <div className="space-y-1 overflow-y-auto font-mono text-sm text-gray-300 max-h-28">
              {lobbyPlayers.map((p, idx) => (
                <div key={idx} className="flex justify-between pb-1 border-b border-gray-800">
                  <span className={p.online ? 'text-green-400' : 'text-gray-500'}>{p.name}</span>
                  <span className="text-[11px] text-gray-500">{p.playerId}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen p-4 text-white">
      <NeutronBackground />
      <div className="max-w-2xl w-full bg-[#0d1e36]/90 border border-[#00f5ff]/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col items-center mb-8 space-y-4 text-center">
          <div className="relative animate-spin-slow bg-[#0a192f] p-4 rounded-full border border-[#39ff14]/60">
            <Radiation className="w-12 h-12 text-[#39ff14]" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-wider text-[#00f5ff]">
            {config?.title || 'NEUTRON RUSH'}
          </h1>
          <p className="italic text-gray-300">"Think Fast. Answer Faster."</p>
        </div>

        {error && (
          <div className="flex items-center p-4 mb-6 space-x-2 text-red-300 border rounded-lg bg-red-950/80 border-red-500/50">
            <ShieldAlert className="flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!showRules ? (
          <div className="flex flex-col space-y-6">
            <p className="text-sm text-center text-gray-300 md:text-base">
              Synchronized Live Multiplayer Arena. Questions are pushed instantly by the admin. 
              Scoring rewards correctness and quick responses.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowRules(true)}
                className="flex items-center justify-center space-x-2 bg-[#003366] hover:bg-[#00f5ff]/20 text-white py-3 rounded-lg border border-[#00f5ff]/40 transition"
              >
                <FileText className="w-5 h-5 text-[#00f5ff]" />
                <span>Read Rules</span>
              </button>
              <button
                onClick={() => setShowRules(true)}
                className="flex items-center justify-center space-x-2 bg-[#39ff14] hover:bg-[#32d912] text-black py-3 rounded-lg font-bold transition"
              >
                <Play className="w-5 h-5" />
                <span>Begin Register</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-6">
            <div className="bg-[#071324] border border-[#00f5ff]/20 rounded-lg p-5 text-sm space-y-3 max-h-48 overflow-y-auto">
              <h3 className="font-bold text-[#00f5ff] uppercase">Championship Rules:</h3>
              <div className="font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-line md:text-sm">
                {config?.rulesText || "Loading rules parameters..."}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#00f5ff] uppercase mb-1">Full Name (Required)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Richard Feynman"
                  className="w-full bg-[#071324] border border-[#00f5ff]/30 rounded px-4 py-2 text-white outline-none focus:border-[#39ff14] transition text-sm"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              {hasAnyOptionalFields && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {config?.showSchool && (
                    <div>
                      <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">University/School</label>
                      <input
                        type="text"
                        placeholder="e.g. MIT"
                        className="w-full bg-[#071324] border border-[#00f5ff]/30 rounded px-4 py-2 text-white outline-none focus:border-[#00f5ff] transition text-sm"
                        value={formData.school}
                        onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                      />
                    </div>
                  )}
                  {config?.showTeamName && (
                    <div>
                      <label className="block mb-1 text-xs font-bold text-gray-400 uppercase">Team Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Quantum Force"
                        className="w-full bg-[#071324] border border-[#00f5ff]/30 rounded px-4 py-2 text-white outline-none focus:border-[#00f5ff] transition text-sm"
                        value={formData.teamName}
                        onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="agree"
                className="w-5 h-5 mt-1 accent-[#39ff14]"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <label htmlFor="agree" className="text-xs text-gray-300">
                I understand and agree to the tournament specifications. I will perform in an ethical, independent manner.
              </label>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="text-sm text-gray-400 hover:underline"
              >
                Back to overview
              </button>
              <button
                type="submit"
                disabled={loading || registrationLocked}
                className="bg-[#39ff14] hover:brightness-110 text-black font-bold px-8 py-3 rounded-lg transition disabled:bg-gray-700"
              >
                {registrationLocked ? 'Lobby Closed' : (loading ? 'Securing ID...' : 'Enter Waiting Room')}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}