const EMOJIS = [
  "😀","🚀","🍎","🐶","🎮","🌈","🎲","⭐",
  "🍕","🎵","⚽","🦊","🍓","🐧","🧩","🌙",
  "🍀","🎁","✨","🏀","📚","🍩","🧸","🚲",
  "🌵","🍉","🎯","🪐","🎨","🍿","🥑","🧠",
];

const ELEMENTS = {
  menuScreen: document.getElementById('menu-screen'),
  gameScreen: document.getElementById('game-screen'),
  board: document.getElementById('board'),
  statusBar: document.getElementById('status-bar'),
  modeLabel: document.getElementById('mode-label'),
  turnLabel: document.getElementById('turn-label'),
  pairsLabel: document.getElementById('pairs-label'),
  player1Name: document.getElementById('player-1-name'),
  player2Name: document.getElementById('player-2-name'),
  player1Score: document.getElementById('player-1-score'),
  player2Score: document.getElementById('player-2-score'),
  overlay: document.getElementById('game-over-overlay'),
  overlaySummary: document.getElementById('game-over-summary'),
  overlayWinner: document.getElementById('overlay-winner'),
  overlayPlayer1Name: document.getElementById('overlay-player-1-name'),
  overlayPlayer1Score: document.getElementById('overlay-player-1-score'),
  overlayPlayer2Name: document.getElementById('overlay-player-2-name'),
  overlayPlayer2Score: document.getElementById('overlay-player-2-score'),
  btnHumanVsHuman: document.getElementById('btn-human-vs-human'),
  btnHumanVsComputer: document.getElementById('btn-human-vs-computer'),
  btnRestart: document.getElementById('btn-restart'),
  btnMainMenu: document.getElementById('btn-main-menu'),
  btnPlayAgain: document.getElementById('btn-play-again'),
  btnOverlayMainMenu: document.getElementById('btn-overlay-main-menu'),
  difficultyInputs: Array.from(document.querySelectorAll('input[name="difficulty"]')),
};

class Player {
  constructor(name, type = 'human') {
    this.name = name;
    this.type = type;
    this.score = 0;
  }

  reset() {
    this.score = 0;
  }
}

class BotPlayer extends Player {
  constructor(name, difficulty = 'medium') {
    super(name, 'bot');
    this.difficulty = difficulty;
    this.memory = new Map();
  }

  reset() {
    super.reset();
    this.memory.clear();
  }

  rememberCard(index, symbol) {
    if (this.memory.has(index)) {
      return;
    }
    this.memory.set(index, symbol);
  }

  forgetCard(index) {
    this.memory.delete(index);
  }

  forgetSymbol(symbol) {
    for (const [index, value] of this.memory.entries()) {
      if (value === symbol) {
        this.memory.delete(index);
      }
    }
  }

  findKnownPair(activeIndexes) {
    const seen = new Map();
    for (const [index, value] of this.memory.entries()) {
      if (!activeIndexes.includes(index)) {
        continue;
      }
      if (seen.has(value)) {
        return [seen.get(value), index];
      }
      seen.set(value, index);
    }
    return null;
  }

  chooseCardIndex(game, exclude = []) {
    const available = game.board
      .map((card, idx) => ({ card, idx }))
      .filter(({ card, idx }) => !card.matched && !card.faceUp && !exclude.includes(idx));

    if (!available.length) {
      return null;
    }

    if (this.difficulty === 'easy' && Math.random() < 0.35) {
      return available[Math.floor(Math.random() * available.length)].idx;
    }

    const knownPair = this.findKnownPair(available.map((item) => item.idx));
    if (knownPair && Math.random() > (this.difficulty === 'medium' ? 0.2 : 0.05)) {
      if (!exclude.includes(knownPair[0])) {
        return knownPair[0];
      }
      if (!exclude.includes(knownPair[1])) {
        return knownPair[1];
      }
    }

    return available[Math.floor(Math.random() * available.length)].idx;
  }

  chooseSecondCardIndex(game, firstIndex) {
    const firstSymbol = game.board[firstIndex].value;
    const candidates = [...this.memory.entries()]
      .filter(([idx, symbol]) => idx !== firstIndex && symbol === firstSymbol)
      .map(([idx]) => idx)
      .filter((idx) => !game.board[idx].matched && !game.board[idx].faceUp);

    if (candidates.length && Math.random() > (this.difficulty === 'easy' ? 0.3 : 0.1)) {
      return candidates[0];
    }

    return this.chooseCardIndex(game, [firstIndex]);
  }
}

class MemoryGame {
  constructor() {
    this.mode = 'human-vs-human';
    this.players = [];
    this.currentPlayerIndex = 0;
    this.board = [];
    this.selectedIndices = [];
    this.remainingPairs = 32;
    this.locked = false;
    this.botTimer = null;
    this.pendingMatchTimer = null;
    this.bindEvents();
    this.showMenu();
  }

  bindEvents() {
    ELEMENTS.btnHumanVsHuman.addEventListener('click', () => this.start('human-vs-human'));
    ELEMENTS.btnHumanVsComputer.addEventListener('click', () => this.start('human-vs-computer'));
    ELEMENTS.btnRestart.addEventListener('click', () => this.resetGame());
    ELEMENTS.btnMainMenu.addEventListener('click', () => this.returnToMenu());
    ELEMENTS.btnPlayAgain.addEventListener('click', () => this.resetGame());
    ELEMENTS.btnOverlayMainMenu.addEventListener('click', () => this.returnToMenu());
  }

  getSelectedDifficulty() {
    const chosen = ELEMENTS.difficultyInputs.find((input) => input.checked);
    return chosen ? chosen.value : 'medium';
  }

  start(mode) {
    this.mode = mode;
    this.players = [new Player('Player 1'), new Player(mode === 'human-vs-human' ? 'Player 2' : 'Computer')];
    if (mode === 'human-vs-computer') {
      this.players[1] = new BotPlayer('Computer', this.getSelectedDifficulty());
    }
    this.currentPlayerIndex = 0;
    this.initializeBoard();
    this.updateModeLabel();
    this.updatePlayerLabels();
    this.showGameScreen();
    this.setStatus("Pick two cards to find a match.");
    this.updateScoreboard();
    this.maybeStartBotTurn();
  }

  initializeBoard() {
    this.board = this.createShuffledLayout();
    this.selectedIndices = [];
    this.remainingPairs = 32;
    this.locked = false;
    this.clearTimers();
    this.players.forEach((player) => player.reset());
    this.renderBoard();
  }

  createShuffledLayout() {
    const pairSymbols = [...EMOJIS, ...EMOJIS];
    for (let i = pairSymbols.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairSymbols[i], pairSymbols[j]] = [pairSymbols[j], pairSymbols[i]];
    }
    return pairSymbols.map((symbol, index) => ({ index, value: symbol, faceUp: false, matched: false }));
  }

  renderBoard() {
    ELEMENTS.board.innerHTML = '';
    this.board.forEach((card, index) => {
      const button = document.createElement('button');
      button.className = 'card';
      button.type = 'button';
      button.dataset.index = index;
      button.tabIndex = card.matched ? -1 : 0;
      button.setAttribute('aria-label', `Card ${index + 1}`);
      button.setAttribute('aria-pressed', String(card.faceUp));
      button.setAttribute('aria-disabled', String(card.matched || this.locked));
      if (card.faceUp) {
        button.classList.add('flipped');
      }
      if (card.matched) {
        button.classList.add('matched');
      }

      const inner = document.createElement('div');
      inner.className = 'card-inner';

      const front = document.createElement('div');
      front.className = 'card-face front';
      front.innerHTML = '<span class="card-dot">?</span>';

      const back = document.createElement('div');
      back.className = 'card-face back';
      back.textContent = card.value;

      inner.appendChild(front);
      inner.appendChild(back);
      button.appendChild(inner);

      button.addEventListener('click', () => this.handleCardSelect(index));
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.handleCardSelect(index);
        }
      });

      ELEMENTS.board.appendChild(button);
    });
  }

  handleCardSelect(index, bypassLock = false) {
    if (this.locked && !bypassLock) {
      return;
    }
    const card = this.board[index];
    if (card.matched || card.faceUp) {
      return;
    }
    if (this.selectedIndices.length >= 2) {
      return;
    }
    this.revealCard(index);
    this.selectedIndices.push(index);
    this.updateBoardCard(index);
    this.rememberCard(index);

    if (this.selectedIndices.length === 2) {
      this.locked = true;
      this.evaluateSelection();
    }
  }

  revealCard(index) {
    this.board[index].faceUp = true;
  }

  hideCard(index) {
    this.board[index].faceUp = false;
  }

  updateBoardCard(index) {
    const button = ELEMENTS.board.querySelector(`[data-index="${index}"]`);
    if (!button) {
      return;
    }
    const card = this.board[index];
    button.classList.toggle('flipped', card.faceUp);
    button.setAttribute('aria-pressed', String(card.faceUp));
    button.setAttribute('aria-disabled', String(card.matched || this.locked));
    button.tabIndex = card.matched ? -1 : 0;
  }

  evaluateSelection() {
    const [firstIndex, secondIndex] = this.selectedIndices;
    const firstCard = this.board[firstIndex];
    const secondCard = this.board[secondIndex];

    if (firstCard.value === secondCard.value) {
      this.handleMatch(firstIndex, secondIndex);
    } else {
      this.handleMismatch(firstIndex, secondIndex);
    }
  }

  handleMatch(firstIndex, secondIndex) {
    this.setStatus('Match! Great job.');
    this.board[firstIndex].matched = true;
    this.board[secondIndex].matched = true;
    this.board[firstIndex].faceUp = true;
    this.board[secondIndex].faceUp = true;
    this.rememberMatch(firstIndex, secondIndex);
    this.players[this.currentPlayerIndex].score += 1;
    this.remainingPairs -= 1;
    this.updateScoreboard();
    this.updateBoardCard(firstIndex);
    this.updateBoardCard(secondIndex);
    this.flashMatchCards(firstIndex, secondIndex);
    this.pendingMatchTimer = window.setTimeout(() => {
      this.hideMatchedCards(firstIndex, secondIndex);
      this.advanceTurn();
      this.completeRound();
    }, 700);
  }

  handleMismatch(firstIndex, secondIndex) {
    this.setStatus('No match. Next player turn.');
    this.pendingMatchTimer = window.setTimeout(() => {
      this.hideCard(firstIndex);
      this.hideCard(secondIndex);
      this.updateBoardCard(firstIndex);
      this.updateBoardCard(secondIndex);
      this.advanceTurn();
      this.completeRound();
    }, 1000);
  }

  rememberCard(index) {
    if (this.mode !== 'human-vs-computer') {
      return;
    }
    const bot = this.players.find((player) => player.type === 'bot');
    if (!(bot instanceof BotPlayer)) {
      return;
    }
    const card = this.board[index];
    if (!card.matched) {
      bot.rememberCard(index, card.value);
    }
  }

  rememberMatch(firstIndex, secondIndex) {
    if (this.mode !== 'human-vs-computer') {
      return;
    }
    const bot = this.players.find((player) => player.type === 'bot');
    if (!(bot instanceof BotPlayer)) {
      return;
    }
    const symbol = this.board[firstIndex].value;
    bot.forgetSymbol(symbol);
    bot.forgetCard(firstIndex);
    bot.forgetCard(secondIndex);
  }

  flashMatchCards(firstIndex, secondIndex) {
    const firstButton = ELEMENTS.board.querySelector(`[data-index="${firstIndex}"]`);
    const secondButton = ELEMENTS.board.querySelector(`[data-index="${secondIndex}"]`);
    firstButton?.classList.add('matched');
    secondButton?.classList.add('matched');
    window.setTimeout(() => {
      firstButton?.classList.add('disappear');
      secondButton?.classList.add('disappear');
    }, 350);
  }

  hideMatchedCards(firstIndex, secondIndex) {
    const firstButton = ELEMENTS.board.querySelector(`[data-index="${firstIndex}"]`);
    const secondButton = ELEMENTS.board.querySelector(`[data-index="${secondIndex}"]`);
    firstButton?.setAttribute('aria-disabled', 'true');
    secondButton?.setAttribute('aria-disabled', 'true');
    firstButton?.classList.add('matched');
    secondButton?.classList.add('matched');
  }

  advanceTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  completeRound() {
    this.selectedIndices = [];
    this.locked = false;
    this.updateScoreboard();
    if (this.remainingPairs === 0) {
      this.finishGame();
      return;
    }
    this.maybeStartBotTurn();
  }

  maybeStartBotTurn() {
    const currentPlayer = this.players[this.currentPlayerIndex];
    this.updateTurnLabel();
    if (currentPlayer.type === 'bot') {
      this.setStatus('Computer is thinking...');
      this.locked = true;
      this.botTimer = window.setTimeout(() => this.takeBotTurn(), 900);
      return;
    }
    if (!this.locked) {
      this.setStatus(`${currentPlayer.name}'s turn. Pick two cards.`);
    }
  }

  takeBotTurn() {
    if (this.remainingPairs === 0) {
      return;
    }
    const bot = this.players[this.currentPlayerIndex];
    if (!(bot instanceof BotPlayer)) {
      return;
    }

    const firstIndex = bot.chooseCardIndex(this, []);
    if (firstIndex === null) {
      this.locked = false;
      return;
    }
    this.handleCardSelect(firstIndex, true);
    const secondIndex = bot.chooseSecondCardIndex(this, firstIndex);
    if (secondIndex === null) {
      this.locked = false;
      return;
    }
    this.botTimer = window.setTimeout(() => this.handleCardSelect(secondIndex, true), 900);
  }

  updateModeLabel() {
    ELEMENTS.modeLabel.textContent = this.mode === 'human-vs-human' ? 'Human vs Human' : 'Human vs Computer';
  }

  updatePlayerLabels() {
    ELEMENTS.player1Name.textContent = this.players[0].name;
    ELEMENTS.player2Name.textContent = this.players[1].name;
    ELEMENTS.overlayPlayer1Name.textContent = this.players[0].name;
    ELEMENTS.overlayPlayer2Name.textContent = this.players[1].name;
  }

  updateScoreboard() {
    ELEMENTS.player1Score.textContent = String(this.players[0].score);
    ELEMENTS.player2Score.textContent = String(this.players[1].score);
    ELEMENTS.pairsLabel.textContent = String(this.remainingPairs);
    this.updateTurnLabel();
  }

  updateTurnLabel() {
    const currentPlayer = this.players[this.currentPlayerIndex];
    ELEMENTS.turnLabel.textContent = currentPlayer.type === 'bot' ? 'Computer' : currentPlayer.name;
    const statusText = currentPlayer.type === 'bot' ? 'Computer is about to play.' : `${currentPlayer.name}'s turn.`;
    if (!this.locked) {
      this.setStatus(statusText);
    }
  }

  setStatus(message) {
    ELEMENTS.statusBar.textContent = message;
  }

  finishGame() {
    this.locked = true;
    const [player1, player2] = this.players;
    ELEMENTS.overlayPlayer1Score.textContent = String(player1.score);
    ELEMENTS.overlayPlayer2Score.textContent = String(player2.score);
    ELEMENTS.overlaySummary.textContent = 'The matching round is complete.';
    if (player1.score === player2.score) {
      ELEMENTS.overlayWinner.textContent = 'Tie Game';
    } else {
      const winner = player1.score > player2.score ? player1.name : player2.name;
      ELEMENTS.overlayWinner.textContent = `${winner} wins!`;
    }
    ELEMENTS.overlay.classList.remove('hidden');
  }

  resetGame() {
    ELEMENTS.overlay.classList.add('hidden');
    this.initializeBoard();
    this.updatePlayerLabels();
    this.updateScoreboard();
    this.setStatus('Pick two cards to find a match.');
    this.maybeStartBotTurn();
  }

  showMenu() {
    ELEMENTS.menuScreen.classList.remove('hidden');
    ELEMENTS.gameScreen.classList.add('hidden');
    ELEMENTS.overlay.classList.add('hidden');
    this.clearTimers();
  }

  showGameScreen() {
    ELEMENTS.menuScreen.classList.add('hidden');
    ELEMENTS.gameScreen.classList.remove('hidden');
    ELEMENTS.overlay.classList.add('hidden');
  }

  returnToMenu() {
    this.showMenu();
  }

  clearTimers() {
    if (this.botTimer) {
      window.clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.pendingMatchTimer) {
      window.clearTimeout(this.pendingMatchTimer);
      this.pendingMatchTimer = null;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MemoryGame();
});
