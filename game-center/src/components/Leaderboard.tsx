import * as React from 'react';
import { Trophy } from 'lucide-react';
import type { Database } from '../lib/database.types';

type HighScore = Database['public']['Tables']['high_scores']['Row'];

interface LeaderboardProps {
  scores: HighScore[];
  isLoading: boolean;
}

export default function Leaderboard({ scores, isLoading }: LeaderboardProps) {
  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold text-gray-900">Loading scores...</h2>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold text-gray-900">No high scores yet!</h2>
        <p className="text-gray-600">Be the first to set a record!</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-6 h-6 text-yellow-500" />
        <h2 className="text-xl font-bold text-gray-900">Top Scores</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {scores.map((score, index) => (
          <div
            key={score.id}
            className="flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">#{index + 1}</span>
              <span className="font-medium text-gray-900">{score.username}</span>
            </div>
            <span className="font-bold text-blue-500">{score.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}