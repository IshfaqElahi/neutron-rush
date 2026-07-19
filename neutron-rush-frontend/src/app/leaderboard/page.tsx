'use client';

import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { NeutronBackground } from '../../components/NeutronBackground';
import { Trophy, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface RankRow {
  userId: string;
  name: string;
  playerId: string;
  score: number;
  accuracy: number;
  totalTimeMs: number;
  movement: number; // Positive values mean up, negative values mean down
}

export default function LiveLeaderboard() {
  const [board, setBoard] = useState<RankRow[]>([]);

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(host, { auth: { token: localStorage.getItem('nr_token') || '' } });

    socket.on('leaderboard:update', (data: RankRow[]) => {
      setBoard(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const podium = board.slice(0, 3);
  const secondaryRanks = board.slice(3, 10);

  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen p-4 text-white">
      <NeutronBackground />
      <div className="max-w-4xl w-full bg-[#0d1e36]/90 border border-[#00f5ff]/30 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        
        <div className="flex items-center justify-between mb-8 border-b border-[#00f5ff]/20 pb-4">
          <div className="flex items-center space-x-3">
            <Trophy className="w-8 h-8 text-[#39ff14]" />
            <h1 className="text-2xl font-black tracking-widest text-white uppercase">Dynamic Standings</h1>
          </div>
          <span className="text-xs bg-[#39ff14]/10 border border-[#39ff14]/30 text-[#39ff14] px-3 py-1 rounded font-mono animate-pulse">
            Live Stream Connected
          </span>
        </div>

        {podium.length > 0 && (
          <div className="grid items-end max-w-xl grid-cols-3 gap-3 pt-4 mx-auto mb-10 text-center">
            {podium[1] ? (
              <div>
                <span className="block mb-1 text-xs font-bold truncate">{podium[1].name}</span>
                <div className="bg-[#0a192f] border border-[#00f5ff]/30 h-24 flex flex-col items-center justify-center rounded-t-xl relative">
                  <span className="text-2xl">🥈</span>
                  <span className="mt-1 text-xs font-bold text-white">{podium[1].score} pts</span>
                  <MovementBadge value={podium[1].movement} />
                </div>
              </div>
            ) : <div className="h-24 bg-[#0a192f]/20 border border-dashed border-[#00f5ff]/10 rounded-t-xl" />}

            {podium[0] ? (
              <div className="scale-105">
                <span className="text-xs font-bold text-[#39ff14] truncate block mb-1">{podium[0].name}</span>
                <div className="bg-[#071324] border border-[#39ff14]/50 h-28 flex flex-col items-center justify-center rounded-t-xl relative">
                  <span className="text-3xl">🥇</span>
                  <span className="mt-1 text-sm font-bold text-white">{podium[0].score} pts</span>
                  <MovementBadge value={podium[0].movement} />
                </div>
              </div>
            ) : <div className="h-28 bg-[#0a192f]/20 border border-dashed border-[#39ff14]/10 rounded-t-xl" />}

            {podium[2] ? (
              <div>
                <span className="block mb-1 text-xs font-bold truncate">{podium[2].name}</span>
                <div className="bg-[#0a192f] border border-[#00f5ff]/30 h-20 flex flex-col items-center justify-center rounded-t-xl relative">
                  <span className="text-xl">🥉</span>
                  <span className="mt-1 text-xs font-bold text-white">{podium[2].score} pts</span>
                  <MovementBadge value={podium[2].movement} />
                </div>
              </div>
            ) : <div className="h-20 bg-[#0a192f]/20 border border-dashed border-[#00f5ff]/10 rounded-t-xl" />}
          </div>
        )}

        <div className="border border-[#00f5ff]/20 rounded-xl overflow-hidden bg-[#071324]/55 text-sm">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-[#0a192f] text-xs font-bold uppercase tracking-wider text-[#00f5ff] border-b border-[#00f5ff]/20">
            <span className="col-span-1 text-center">Rank</span>
            <span className="col-span-5">Player</span>
            <span className="col-span-2 text-right">Score</span>
            <span className="col-span-2 text-center">Movement</span>
            <span className="col-span-2 text-right">Time</span>
          </div>
          <div className="divide-y divide-[#00f5ff]/10">
            {secondaryRanks.length > 0 ? (
              secondaryRanks.map((item, idx) => (
                <div key={item.userId} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[#00f5ff]/5 transition duration-150">
                  <span className="col-span-1 font-bold text-center text-gray-400">{idx + 4}</span>
                  <div className="flex flex-col col-span-5">
                    <span className="font-bold">{item.name}</span>
                    <span className="text-[10px] text-gray-400">{item.playerId}</span>
                  </div>
                  <span className="col-span-2 text-right font-mono font-bold text-[#39ff14]">{item.score} pts</span>
                  <span className="flex justify-center col-span-2 text-center">
                    <MovementBadge value={item.movement} />
                  </span>
                  <span className="col-span-2 font-mono text-xs text-right text-gray-400">{(item.totalTimeMs / 1000).toFixed(2)}s</span>
                </div>
              ))
            ) : (
              <div className="p-8 text-xs text-center text-gray-400">
                Awaiting active tournament records...
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function MovementBadge({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="text-green-400 text-xs font-bold flex items-center justify-center space-x-0.5">
        <ArrowUp className="w-3.5 h-3.5" />
        <span>+{value}</span>
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="text-red-400 text-xs font-bold flex items-center justify-center space-x-0.5">
        <ArrowDown className="w-3.5 h-3.5" />
        <span>{value}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center text-gray-500">
      <Minus className="w-3.5 h-3.5" />
    </span>
  );
}