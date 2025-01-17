import { GameCenter } from './GameCenter.js';

class AdminUI {
  constructor() {
    this.gameCenter = new GameCenter();
    this.user = null;
    this.currentGame = null;
    this.settings = {};
    
    this.init();
  }

  async init() {
    try {
      this.user = await this.gameCenter.getCurrentUser();
      if (this.user) {
        this.showAdminPanel();
      } else {
        this.showLoginForm();
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      this.showLoginForm();
    }
  }

  showLoginForm() {
    const container = document.getElementById('adminContainer');
    container.innerHTML = `
      <div class="max-w-md mx-auto mt-8 bg-white p-8 rounded-lg shadow">
        <h2 class="text-2xl font-bold mb-6">Admin Login</h2>
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700">Email</label>
            <input type="email" id="email" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Password</label>
            <input type="password" id="password" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
          </div>
          <button type="submit" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            Sign In
          </button>
        </form>
      </div>
    `;

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      try {
        await this.gameCenter.signIn(email, password);
        this.user = await this.gameCenter.getCurrentUser();
        this.showAdminPanel();
      } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
      }
    });
  }

  showAdminPanel() {
    const container = document.getElementById('adminContainer');
    container.innerHTML = `
      <nav class="bg-white shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16">
            <div class="flex">
              <div class="flex-shrink-0 flex items-center">
                <h1 class="text-xl font-bold text-gray-900">Game Center Admin</h1>
              </div>
            </div>
            <div class="flex items-center">
              <span class="text-sm text-gray-500 mr-4">${this.user.email}</span>
              <button id="signOutButton" class="text-sm text-gray-500 hover:text-gray-700">Sign Out</button>
            </div>
          </div>
        </div>
      </nav>

      <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div class="px-4 sm:px-0">
          <select id="gameSelect" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
            <option value="">Select a game...</option>
          </select>
        </div>

        <div id="settingsForm" class="hidden mt-6 bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
          <div class="md:grid md:grid-cols-3 md:gap-6">
            <div class="md:col-span-1">
              <h3 class="text-lg font-medium leading-6 text-gray-900">Game Settings</h3>
              <p class="mt-1 text-sm text-gray-500">
                Customize the game parameters and appearance.
              </p>
            </div>
            <div class="mt-5 md:mt-0 md:col-span-2">
              <div class="grid grid-cols-6 gap-6" id="settingsContainer">
              </div>
            </div>
          </div>
          <div class="mt-5 flex justify-end">
            <button type="button" id="saveButton" class="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    this.loadGames();
  }

  async setupEventListeners() {
    document.getElementById('gameSelect').addEventListener('change', (e) => {
      this.loadGameSettings(e.target.value);
    });

    document.getElementById('saveButton').addEventListener('click', () => {
      this.saveSettings();
    });
    
    document.getElementById('signOutButton').addEventListener('click', async () => {
      try {
        await this.gameCenter.signOut();
        this.user = null;
        this.showLoginForm();
      } catch (error) {
        console.error('Sign out error:', error);
        alert('Failed to sign out');
      }
    });
  }

  async loadGames() {
    try {
      const games = await this.gameCenter.getGames();
      const select = document.getElementById('gameSelect');
      
      games.forEach(game => {
        const option = document.createElement('option');
        option.value = game.slug;
        option.textContent = game.name;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading games:', error);
      alert('Failed to load games');
    }
  }

  async loadGameSettings(gameSlug) {
    if (!gameSlug) {
      document.getElementById('settingsForm').classList.add('hidden');
      return;
    }

    try {
      const settings = await this.gameCenter.getGameSettings(gameSlug);
      this.currentGame = settings[0]?.games;
      this.renderSettings(settings);
      document.getElementById('settingsForm').classList.remove('hidden');
    } catch (error) {
      console.error('Error loading settings:', error);
      alert('Failed to load game settings');
    }
  }

  renderSettings(settings) {
    const container = document.getElementById('settingsContainer');
    container.innerHTML = '';

    settings.forEach(setting => {
      const { key, value, description } = setting;
      const m = JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
      
      const o = document.createElement('div');
      o.className = 'col-span-6 sm:col-span-3';
      
      const a = document.createElement('label');
      a.className = 'block text-sm font-medium text-gray-700';
      a.textContent = key;
      
      const d = this.createInput(m);
      d.id = key;
      
      const r = document.createElement('p');
      r.className = 'mt-1 text-sm text-gray-500';
      r.textContent = description;
      
      o.appendChild(a);
      o.appendChild(d);
      o.appendChild(r);
      container.appendChild(o);
    });
  }

  createInput(setting) {
    let input;
    
    switch (setting.type) {
      case 'color':
        input = document.createElement('input');
        input.type = 'color';
        input.value = setting.value;
        input.className = 'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';
        break;
        
      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        input.value = setting.value;
        input.min = setting.min;
        input.max = setting.max;
        input.step = setting.step || 1;
        input.className = 'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';
        break;
        
      default:
        input = document.createElement('input');
        input.type = 'text';
        input.value = setting.value;
        input.className = 'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';
    }
    
    return input;
  }

  async saveSettings() {
    if (!this.currentGame) return;

    const e = {};
    document.querySelectorAll('#settingsContainer input').forEach(s => {
      e[s.id] = {
        type: s.type === 'number' ? 'number' : 'color',
        value: s.type === 'number' ? parseFloat(s.value) : s.value
      };
    });

    try {
      await this.gameCenter.updateGameSettings(this.currentGame.id, e);
      alert('Settings saved successfully!');
    } catch (s) {
      console.error('Error saving settings:', s);
      alert('Failed to save settings');
    }
  }
}

// Initialize the admin UI
new AdminUI();