import { createClient } from '@supabase/supabase-js';

export class GameCenter {
  #supabase;

  constructor() {
    this.#supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    );
  }

  async signIn(email, password) {
    console.log('Attempting to sign in with email:', email);
    const { data, error } = await this.#supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      console.error('Sign in error:', error);
      throw error;
    }
    console.log('Sign in successful:', data);
    return data;
  }

  async signOut() {
    const { error } = await this.#supabase.auth.signOut();
    if (error) throw error;
  }

  async getCurrentUser() {
    console.log('Getting current user');
    const { data: { user }, error } = await this.#supabase.auth.getUser();
    if (error) {
      console.error('Get user error:', error);
      throw error;
    }
    console.log('Current user:', user);
    return user;
  }

  async getGames() {
    const { data, error } = await this.#supabase
      .from('games')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data;
  }

  async getGameSettings(gameSlug) {
    console.log('Getting game settings for slug:', gameSlug);
    const { data, error } = await this.#supabase
      .from('game_settings')
      .select(`
        *,
        games!inner(*)
      `)
      .eq('games.slug', gameSlug);
    
    if (error) {
      console.error('Supabase error getting game settings:', error);
      throw error;
    }
    console.log('Game settings data:', data);
    return data;
  }

  async updateGameSettings(gameId, settings) {
    // Update each setting individually
    for (const [key, value] of Object.entries(settings)) {
      const { error } = await this.#supabase
        .from('game_settings')
        .update({ value: JSON.stringify(value) })
        .eq('game_id', gameId)
        .eq('key', key);
      
      if (error) throw error;
    }
  }
}