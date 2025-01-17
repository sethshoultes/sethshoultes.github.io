import * as React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { Login } from './Login';
import { Settings } from './Settings';
import { Header } from './Header';

type Game = Database['public']['Tables']['games']['Row'];
type GameSetting = Database['public']['Tables']['game_settings']['Row'];

export function GameCenter() {
  const [user, setUser] = useState<any>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [settings, setSettings] = useState<GameSetting[]>([]);

  useEffect(() => {
    checkUser();
    loadGames();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function loadGames() {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error loading games:', error);
      return;
    }
    
    setGames(data);
  }

  async function loadGameSettings(gameSlug: string) {
    const { data, error } = await supabase
      .from('game_settings')
      .select(`
        *,
        games!inner(*)
      `)
      .eq('games.slug', gameSlug);
    
    if (error) {
      console.error('Error loading settings:', error);
      return;
    }
    
    setSettings(data);
  }

  async function handleGameChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const gameSlug = e.target.value;
    setSelectedGame(gameSlug);
    if (gameSlug) {
      await loadGameSettings(gameSlug);
    } else {
      setSettings([]);
    }
  }

  async function handleSettingUpdate(gameId: string, key: string, value: any) {
    const { error } = await supabase
      .from('game_settings')
      .update({ 
        value: JSON.stringify(value),
        version: settings.find(s => s.key === key)?.version! + 1
      })
      .eq('game_id', gameId)
      .eq('key', key);

    if (error) {
      console.error('Error updating setting:', error);
      return;
    }

    await loadGameSettings(selectedGame);
  }

  if (!user) {
    return <Login onLogin={checkUser} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={async () => {
        await supabase.auth.signOut();
        setUser(null);
      }} />
      
      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <select
            value={selectedGame}
            onChange={handleGameChange}
            className="w-full p-2 border rounded-lg bg-white shadow-sm"
          >
            <option value="">Select a game...</option>
            {games.map(game => (
              <option key={game.id} value={game.slug}>{game.name}</option>
            ))}
          </select>
        </div>

        {settings.length > 0 && (
          <Settings 
            settings={settings}
            onUpdate={handleSettingUpdate}
          />
        )}
      </main>
    </div>
  );
}