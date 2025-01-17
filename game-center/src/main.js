import './style.css';
import { Game } from './game.js';
import { GameCenter } from './admin/GameCenter.js';

const gameCenter = new GameCenter();
const game = new Game(gameCenter);
game.start();