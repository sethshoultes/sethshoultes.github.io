// Game images from WordPress localized script
const gridSizes = {
  '4x4': 8,  // 16 cards total (8 pairs)
  '4x5': 10, // 20 cards total (10 pairs)
  '5x6': 15  // 30 cards total (15 pairs)
};

// Get number of pairs based on grid size
const gridSize = wpMemoryGame.options.grid_size || '4x4';
const numPairs = gridSizes[gridSize];

// Take only the required number of images for the grid size
const cardImages = wpMemoryGame.images
  .slice(0, numPairs)
  .flatMap(img => [img, img]); // Create pairs
const STORAGE_KEY = 'wpMemoryGameHighScore';

const gameOptions = wpMemoryGame.options;
const isCountdown = gameOptions.timer_type === 'countdown';

let moves = 0;
let timer = isCountdown ? gameOptions.timer_value : 0;
let timerInterval;
let flippedCards = [];
let matchedPairs = 0;
let highScore = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) || Infinity : Infinity;
  } catch (e) {
    return Infinity;
  }
})();
let isPaused = false;

// Debounce timer updates
const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
};

const updateTimerDisplay = debounce((value) => {
  document.getElementById('timer').textContent = value;
}, 100);

// Update timer label based on type
function updateTimerLabel() {
  const label = document.getElementById('timer-label');
  label.textContent = isCountdown ? 'Time Left:' : 'Time:';
}

// Update high score display
function updateHighScore() {
  const highScoreElement = document.getElementById('high-score');
  highScoreElement.textContent = highScore === Infinity ? '-' : highScore;
}

// Shuffle array using Fisher-Yates algorithm
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Create game board
function createBoard() {
  const gameBoard = document.getElementById('game-board');
  
  // Set grid size CSS
  const [rows, cols] = gridSize.split('x').map(Number);
  gameBoard.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  gameBoard.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  // Create array of objects with images and names, preserving pairs
  const cards = [];
  for (let i = 0; i < cardImages.length; i += 2) {
    const originalIndex = Math.floor(i / 2);
    // Add pair of cards with same image and name
    cards.push(
      { image: cardImages[i], name: wpMemoryGame.imageNames[originalIndex] },
      { image: cardImages[i + 1], name: wpMemoryGame.imageNames[originalIndex] }
    );
  }
  
  const shuffledCards = shuffle([...cards]);
  
  gameBoard.innerHTML = '';
  shuffledCards.forEach((cardData, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-number', index + 1);
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Memory card ${index + 1}`);
    
    const image = document.createElement('img');
    image.src = cardData.image;
    image.setAttribute('loading', 'lazy');
    image.setAttribute('alt', '');
    card.appendChild(image);
    
    const text = document.createElement('div');
    text.className = 'card-text';
    text.textContent = DOMPurify.sanitize(cardData.name);
    card.appendChild(text);
    
    card.addEventListener('click', flipCard);
    card.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        flipCard.call(card, e);
      }
    });
    gameBoard.appendChild(card);
  });
}

// Handle card flip
function flipCard() {
  if (
    isPaused ||
    flippedCards.length === 2 || 
    this.classList.contains('flipped') ||
    this.classList.contains('matched')
  ) return;

  this.classList.add('flipped');
  flippedCards.push(this);

  if (flippedCards.length === 2) {
    moves++;
    document.getElementById('moves').textContent = moves;
    checkMatch();
  }
}

// Check if flipped cards match
function checkMatch() {
  const [card1, card2] = flippedCards;
  const match = card1.querySelector('img').src === card2.querySelector('img').src;

  if (match) {
    card1.classList.add('matched');
    card2.classList.add('matched');
    matchedPairs++;
    
    if (matchedPairs === cardImages.length / 2) {
      endGame();
    }
  } else {
    setTimeout(() => {
      card1.classList.remove('flipped');
      card2.classList.remove('flipped');
    }, 1000);
  }

  flippedCards = [];
}

// Start timer
function startTimer() {
  timerInterval = setInterval(() => {
    if (isPaused) return;
    timer = isCountdown ? timer - 1 : timer + 1;
    document.getElementById('timer').textContent = timer;
    if ((isCountdown && timer <= 0) || (!isCountdown && timer >= gameOptions.timer_value)) {
      showGameOver();
    }
  }, 1000);
}

// Show game over screen
function showGameOver() {
  clearInterval(timerInterval);
  const gameOver = document.getElementById('game-over');
  const finalMoves = document.getElementById('final-moves');
  const finalPairs = document.getElementById('final-pairs');
  const finalHighScore = document.getElementById('final-high-score');
  
  finalMoves.textContent = moves;
  finalPairs.textContent = matchedPairs;
  finalHighScore.textContent = highScore === Infinity ? '-' : highScore;
  
  gameOver.classList.add('show');
}

// End game
function endGame() {
  clearInterval(timerInterval);
  if (moves < highScore) {
    highScore = moves;
    localStorage.setItem('wpMemoryGameHighScore', highScore);
    updateHighScore();
    alert(`New High Score! You completed the game in ${moves} moves!`);
  }
  showGameOver();
}

// Reset game
function resetGame() {
  clearInterval(timerInterval);
  moves = 0;
  timer = isCountdown ? gameOptions.timer_value : 0;
  flippedCards = [];
  matchedPairs = 0;
  
  document.getElementById('moves').textContent = moves;
  document.getElementById('timer').textContent = timer;
  document.getElementById('game-over').classList.remove('show');
  updateTimerLabel();
  
  createBoard();
  startTimer();
}

// Pause game
function pauseGame() {
  isPaused = true;
  document.getElementById('pause-overlay').classList.add('show');
}

// Resume game
function resumeGame() {
  isPaused = false;
  document.getElementById('pause-overlay').classList.remove('show');
}

// Handle ESC key
function handleKeyPress(event) {
  if (event.key === 'Escape') {
    if (isPaused) {
      resumeGame();
    } else {
      pauseGame();
    }
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Only initialize if game board exists
  if (document.getElementById('game-board')) {
    document.getElementById('restart').addEventListener('click', resetGame);
    document.getElementById('play-again').addEventListener('click', resetGame);
    document.getElementById('pause').addEventListener('click', pauseGame);
    document.getElementById('resume').addEventListener('click', resumeGame);
    document.addEventListener('keydown', handleKeyPress);

    updateHighScore();
    resetGame();
  }
});