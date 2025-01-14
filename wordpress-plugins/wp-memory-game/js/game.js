// Game images from WordPress localized script
const cardImages = wpMemoryGame.images.flatMap(img => [img, img]); // Duplicate each image

const gameOptions = wpMemoryGame.options;
const isCountdown = gameOptions.timer_type === 'countdown';

let moves = 0;
let timer = isCountdown ? gameOptions.timer_value : 0;
let timerInterval;
let flippedCards = [];
let matchedPairs = 0;
let highScore = localStorage.getItem('wpMemoryGameHighScore') || Infinity;
let isPaused = false;

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
  shuffledCards.forEach((cardData) => {
    const card = document.createElement('div');
    card.className = 'card';
    
    const image = document.createElement('img');
    image.src = cardData.image;
    card.appendChild(image);
    
    const text = document.createElement('div');
    text.className = 'card-text';
    text.textContent = cardData.name;
    card.appendChild(text);
    
    card.addEventListener('click', flipCard);
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