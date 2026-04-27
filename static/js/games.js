/**
 * games.js — Zyviora Companion Games Engine
 * 5 games: Word Guess, Tic Tac Toe, Quiz, Number Guess, Would You Rather
 * All render inline in the chat window. Game memory stored in localStorage.
 */

// ============================================================
// GAME MEMORY SYSTEM
// ============================================================
const GAME_MEMORY_KEY = 'zyviora_game_memory';

function loadGameMemory() {
    try { return JSON.parse(localStorage.getItem(GAME_MEMORY_KEY)) || {}; }
    catch { return {}; }
}

function saveGameStat(game, result) {
    const mem = loadGameMemory();
    if (!mem[game]) mem[game] = { wins: 0, losses: 0, draws: 0, plays: 0 };
    mem[game].plays++;
    if (result === 'win')  mem[game].wins++;
    if (result === 'loss') mem[game].losses++;
    if (result === 'draw') mem[game].draws++;
    localStorage.setItem(GAME_MEMORY_KEY, JSON.stringify(mem));
}

function getGameStat(game) {
    const mem = loadGameMemory();
    return mem[game] || { wins: 0, losses: 0, draws: 0, plays: 0 };
}

function gameWinQuip(game) {
    const stat = getGameStat(game);
    if (stat.wins === 1) return "That's your first win! 🎉 We're off to a great start!";
    if (stat.wins >= 5)  return `Wow, ${stat.wins} wins already! You're on a roll! 🔥`;
    return `${stat.wins} wins now — you're getting good at this! 😄`;
}

function gameLossQuip(game) {
    const stat = getGameStat(game);
    if (stat.losses === 1) return "Don't worry, first rounds are always warm-ups! Try again? 😄";
    if (stat.wins > stat.losses) return "You still have more wins than losses — I'll try harder this time! 😉";
    return "Practice makes perfect! Want to go again? 💪";
}

// ============================================================
// GAME LAUNCHER (Game Picker Menu)
// ============================================================
function showGamePicker(chatWindow, appendBotMessageTracked) {
    // Remove any existing game picker
    const existing = document.getElementById('zyviora-game-picker');
    if (existing) existing.remove();

    const games = [
        { id: 'word',     icon: '🔤', label: 'Word Guess' },
        { id: 'tictactoe',icon: '⭕', label: 'Tic Tac Toe' },
        { id: 'quiz',     icon: '🧠', label: 'Quick Quiz' },
        { id: 'numguess', icon: '🔢', label: 'Number Guess' },
        { id: 'wyr',      icon: '🎲', label: 'Would You Rather' },
    ];

    const msgDiv = document.createElement('div');
    msgDiv.id = 'zyviora-game-picker';
    msgDiv.className = 'message bot-message';

    const avatar = document.createElement('div');
    avatar.className = 'avatar bot-avatar';
    avatar.textContent = 'Z';

    const bubble = document.createElement('div');
    bubble.className = 'bubble glass-panel';
    bubble.style.maxWidth = '380px';

    bubble.innerHTML = `<p style="margin-bottom:12px">Pick a game! Which one are we playing? 🎮</p>`;

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

    games.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'game-pick-btn';
        btn.innerHTML = `${g.icon} ${g.label}`;
        btn.addEventListener('click', () => {
            msgDiv.remove();
            startGame(g.id, chatWindow, appendBotMessageTracked);
        });
        grid.appendChild(btn);
    });

    bubble.appendChild(grid);
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ============================================================
// GAME ROUTER
// ============================================================
function startGame(gameId, chatWindow, appendBotMessageTracked) {
    switch (gameId) {
        case 'word':     startWordGuess(chatWindow, appendBotMessageTracked); break;
        case 'tictactoe':startTicTacToe(chatWindow, appendBotMessageTracked); break;
        case 'quiz':     startQuiz(chatWindow, appendBotMessageTracked);      break;
        case 'numguess': startNumberGuess(chatWindow, appendBotMessageTracked); break;
        case 'wyr':      startWouldYouRather(chatWindow, appendBotMessageTracked); break;
    }
}

// ============================================================
// GAME 1: WORD GUESS (Wordle-like, 5 letters, 6 attempts)
// ============================================================
const WORD_LIST = [
    'CRANE', 'SHOUT', 'BLAZE', 'FROST', 'GRAPE', 'STOVE', 'PLUMB', 'CRISP',
    'FLUTE', 'GLOOM', 'BRAVE', 'QUIRK', 'SHELF', 'TIGER', 'PRIME', 'SWAMP',
    'CLOAK', 'DRINK', 'EMBER', 'FABLE', 'GRIND', 'HASTE', 'IVORY', 'JOUST',
    'KNACK', 'LOFTY', 'MIRTH', 'NOBLE', 'OCEAN', 'PIVOT', 'QUEST', 'RIVAL',
    'SCOUT', 'TAUNT', 'UMBRA', 'VIVID', 'WRATH', 'XEROX', 'YIELD', 'ZONAL',
    'FLINT', 'BRAND', 'CLASH', 'DAWN', 'ELBOW', 'FANCY', 'GIANT', 'HOVER'
];

function startWordGuess(chatWindow, appendBotMessageTracked) {
    const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    let attempts = [];
    const maxAttempts = 6;

    const container = document.createElement('div');
    container.className = 'message bot-message';
    container.style.maxWidth = '100%';

    const avatar = document.createElement('div');
    avatar.className = 'avatar bot-avatar';
    avatar.textContent = 'Z';

    const bubble = document.createElement('div');
    bubble.className = 'bubble glass-panel';
    bubble.style.cssText = 'max-width:360px;';

    bubble.innerHTML = `
        <p style="font-weight:600;margin-bottom:8px;color:#1a1a2e;">🔤 Word Guess!</p>
        <p style="font-size:13px;color:#6b7280;margin-bottom:14px">I've picked a 5-letter word. You have 6 tries. Green = right position, Yellow = wrong position, Gray = not in word.</p>
        <div id="wg-grid" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px"></div>
        <div style="display:flex;gap:8px;align-items:center">
            <input id="wg-input" maxlength="5" placeholder="5-letter word..." style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.15);background:rgba(255,255,255,0.6);color:#1a1a2e;font-size:15px;font-family:Inter,sans-serif;outline:none;text-transform:uppercase">
            <button id="wg-btn" style="padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#6a00ff,#a64aff);color:white;border:none;cursor:pointer;font-size:14px">Guess</button>
        </div>
        <p id="wg-msg" style="margin-top:10px;font-size:13px;color:#6a00ff;min-height:18px"></p>
    `;

    container.appendChild(avatar);
    container.appendChild(bubble);
    chatWindow.appendChild(container);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    const grid = bubble.querySelector('#wg-grid');
    const input = bubble.querySelector('#wg-input');
    const btn   = bubble.querySelector('#wg-btn');
    const msg   = bubble.querySelector('#wg-msg');

    function renderRow(guess, target) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;justify-content:flex-start';
        for (let i = 0; i < 5; i++) {
            const cell = document.createElement('div');
            cell.textContent = guess[i];
            let color = '#6b7280'; // gray - not in word
            if (guess[i] === target[i])              color = '#538d4e'; // green
            else if (target.includes(guess[i]))      color = '#b59f3b'; // yellow
            cell.style.cssText = `width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;border-radius:6px;background:${color};border:1px solid rgba(0,0,0,0.1);color:white;`;
            row.appendChild(cell);
        }
        grid.appendChild(row);
    }

    function makeGuess() {
        const guess = input.value.trim().toUpperCase();
        if (guess.length !== 5) { msg.textContent = 'Please enter a 5-letter word!'; return; }
        input.value = '';
        attempts.push(guess);
        renderRow(guess, word);

        if (guess === word) {
            msg.textContent = `🎉 You got it! The word was ${word}!`;
            input.disabled = true; btn.disabled = true;
            saveGameStat('word', 'win');
            setTimeout(() => appendBotMessageTracked(`Amazing! You guessed "${word}" correctly! ${gameWinQuip('word')}`), 500);
        } else if (attempts.length >= maxAttempts) {
            msg.textContent = `Game over! The word was: ${word}`;
            input.disabled = true; btn.disabled = true;
            saveGameStat('word', 'loss');
            setTimeout(() => appendBotMessageTracked(`So close! The word was "${word}". ${gameLossQuip('word')}`), 500);
        } else {
            msg.textContent = `${maxAttempts - attempts.length} attempt(s) left.`;
        }
    }

    btn.addEventListener('click', makeGuess);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') makeGuess(); });
    setTimeout(() => input.focus(), 100);
}

// ============================================================
// GAME 2: TIC TAC TOE (User = X, Zyviora = O)
// ============================================================
function startTicTacToe(chatWindow, appendBotMessageTracked) {
    let board = Array(9).fill('');
    let gameActive = true;

    const container = document.createElement('div');
    container.className = 'message bot-message';
    const avatar = document.createElement('div');
    avatar.className = 'avatar bot-avatar';
    avatar.textContent = 'Z';

    const bubble = document.createElement('div');
    bubble.className = 'bubble glass-panel';
    bubble.style.maxWidth = '300px';

    const status = document.createElement('p');
    status.style.cssText = 'margin-bottom:12px;font-size:14px;color:#6a00ff;font-weight:500;';
    status.textContent = 'You are X. Your turn!';

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;';

    bubble.innerHTML = `<p style="font-weight:600;margin-bottom:10px;color:#1a1a2e;">⭕ Tic Tac Toe vs Zyviora</p>`;
    bubble.appendChild(status);
    bubble.appendChild(grid);

    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('button');
        cell.style.cssText = 'width:70px;height:70px;font-size:28px;font-weight:700;border-radius:8px;border:1px solid rgba(0,0,0,0.15);background:rgba(255,255,255,0.7);color:#1a1a2e;cursor:pointer;transition:background 0.2s;box-shadow:inset 2px 2px 5px rgba(255,255,255,1), inset -2px -2px 5px rgba(0,0,0,0.05);';
        cell.dataset.index = i;
        cell.addEventListener('mouseenter', () => { if (!cell.textContent) cell.style.background = 'rgba(255,255,255,1)'; });
        cell.addEventListener('mouseleave', () => { if (!cell.textContent) cell.style.background = 'rgba(255,255,255,0.7)'; });
        cell.addEventListener('click', () => playerMove(i, cell));
        grid.appendChild(cell);
    }

    container.appendChild(avatar);
    container.appendChild(bubble);
    chatWindow.appendChild(container);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    function checkWinner(b, mark) {
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        return wins.some(([a,c,d]) => b[a] === mark && b[c] === mark && b[d] === mark);
    }

    function aiMove() {
        // Try to win, then block, then prefer center, then random
        const empty = board.map((v,i) => v === '' ? i : null).filter(v => v !== null);
        if (!empty.length) return;

        // Try winning move first
        for (const i of empty) {
            const test = [...board]; test[i] = 'O';
            if (checkWinner(test, 'O')) { makeMove(i, 'O'); return; }
        }
        // Block player
        for (const i of empty) {
            const test = [...board]; test[i] = 'X';
            if (checkWinner(test, 'X')) { makeMove(i, 'O'); return; }
        }
        // Center
        if (board[4] === '') { makeMove(4, 'O'); return; }
        // Random
        makeMove(empty[Math.floor(Math.random() * empty.length)], 'O');
    }

    function makeMove(idx, mark) {
        board[idx] = mark;
        const cell = grid.children[idx];
        cell.textContent = mark;
        cell.style.color = mark === 'X' ? '#6a00ff' : '#ff6b6b';
        cell.disabled = true;
    }

    function playerMove(idx, cell) {
        if (!gameActive || board[idx]) return;
        makeMove(idx, 'X');
        cell.disabled = true;

        if (checkWinner(board, 'X')) {
            status.textContent = 'You win! 🎉';
            gameActive = false;
            saveGameStat('tictactoe', 'win');
            setTimeout(() => appendBotMessageTracked(`You beat me! 😲 ${gameWinQuip('tictactoe')}`), 400);
            return;
        }
        if (board.every(c => c)) {
            status.textContent = "It's a draw! 🤝";
            gameActive = false;
            saveGameStat('tictactoe', 'draw');
            setTimeout(() => appendBotMessageTracked("It's a draw! We're perfectly matched! Rematch? 🤝"), 400);
            return;
        }
        status.textContent = "Zyviora's turn...";
        setTimeout(() => {
            aiMove();
            if (checkWinner(board, 'O')) {
                status.textContent = 'Zyviora wins! 😄';
                gameActive = false;
                saveGameStat('tictactoe', 'loss');
                setTimeout(() => appendBotMessageTracked(`I won this round! 😄 ${gameLossQuip('tictactoe')}`), 400);
                return;
            }
            if (board.every(c => c)) {
                status.textContent = "It's a draw! 🤝";
                gameActive = false;
                saveGameStat('tictactoe', 'draw');
                return;
            }
            status.textContent = 'Your turn! (X)';
        }, 600);
    }
}

// ============================================================
// GAME 3: QUICK QUIZ (10 random questions from 20)
// ============================================================
const QUIZ_BANK = [
    { q: 'What is the capital of France?', a: 'Paris', opts: ['Berlin','Paris','Madrid','Rome'] },
    { q: 'How many planets are in our solar system?', a: '8', opts: ['7','8','9','10'] },
    { q: 'What gas do plants absorb from the atmosphere?', a: 'Carbon dioxide', opts: ['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'] },
    { q: 'Who wrote Romeo and Juliet?', a: 'Shakespeare', opts: ['Dickens','Shakespeare','Hemingway','Tolstoy'] },
    { q: 'What is the speed of light (approx)?', a: '3×10⁸ m/s', opts: ['3×10⁶ m/s','3×10⁷ m/s','3×10⁸ m/s','3×10⁹ m/s'] },
    { q: 'How many sides does a hexagon have?', a: '6', opts: ['5','6','7','8'] },
    { q: 'What is the largest ocean on Earth?', a: 'Pacific', opts: ['Atlantic','Indian','Pacific','Arctic'] },
    { q: 'Which element has the symbol Au?', a: 'Gold', opts: ['Silver','Copper','Gold','Iron'] },
    { q: 'What year did World War II end?', a: '1945', opts: ['1943','1944','1945','1946'] },
    { q: 'What is the longest river in the world?', a: 'Nile', opts: ['Amazon','Nile','Yangtze','Mississippi'] },
    { q: 'How many bones are in the adult human body?', a: '206', opts: ['196','206','216','226'] },
    { q: 'What is the smallest planet in our solar system?', a: 'Mercury', opts: ['Mars','Pluto','Mercury','Venus'] },
    { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', opts: ['Picasso','Michelangelo','Leonardo da Vinci','Raphael'] },
    { q: 'What is the powerhouse of the cell?', a: 'Mitochondria', opts: ['Nucleus','Ribosome','Mitochondria','Golgi'] },
    { q: 'In what continent is the Sahara Desert?', a: 'Africa', opts: ['Asia','Australia','Africa','South America'] },
    { q: 'What language has the most native speakers?', a: 'Mandarin Chinese', opts: ['English','Spanish','Mandarin Chinese','Hindi'] },
    { q: 'What is 12 × 12?', a: '144', opts: ['132','140','144','148'] },
    { q: 'Which planet is known as the Red Planet?', a: 'Mars', opts: ['Venus','Mars','Jupiter','Saturn'] },
    { q: 'What is the main ingredient in glass?', a: 'Sand', opts: ['Clay','Sand','Salt','Limestone'] },
    { q: 'How many strings does a standard guitar have?', a: '6', opts: ['4','5','6','7'] },
];

function startQuiz(chatWindow, appendBotMessageTracked) {
    const questions = [...QUIZ_BANK].sort(() => 0.5 - Math.random()).slice(0, 5);
    let current = 0, score = 0;

    const container = document.createElement('div');
    container.className = 'message bot-message';
    const avatar = document.createElement('div');
    avatar.className = 'avatar bot-avatar';
    avatar.textContent = 'Z';

    const bubble = document.createElement('div');
    bubble.className = 'bubble glass-panel';
    bubble.style.maxWidth = '380px';

    container.appendChild(avatar);
    container.appendChild(bubble);
    chatWindow.appendChild(container);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    function renderQuestion() {
        if (current >= questions.length) {
            const pct = Math.round((score / questions.length) * 100);
            bubble.innerHTML = `
                <p style="font-weight:600;margin-bottom:8px;color:#1a1a2e;">🧠 Quiz Complete!</p>
                <p style="font-size:18px;margin-bottom:8px;color:#1a1a2e;">Score: <strong>${score}/${questions.length}</strong> (${pct}%)</p>
                <p style="color:#6a00ff;font-size:14px;font-weight:500;">${pct === 100 ? 'Perfect score! 🌟' : pct >= 60 ? 'Well done! 😊' : 'Keep practising! 💪'}</p>
            `;
            saveGameStat('quiz', score >= 3 ? 'win' : 'loss');
            setTimeout(() => appendBotMessageTracked(
                score >= 4 ? `${score}/5 — that's brilliant! 🌟 ${gameWinQuip('quiz')}` :
                score >= 2 ? `${score}/5 — solid effort! Want to try again? 😊` :
                `${score}/5 this time. ${gameLossQuip('quiz')}`
            ), 500);
            return;
        }

        const q = questions[current];
        const shuffled = [...q.opts].sort(() => 0.5 - Math.random());

        bubble.innerHTML = `
            <p style="font-size:12px;color:#6b7280;margin-bottom:6px;font-weight:500;">Question ${current+1} of ${questions.length} · Score: ${score}</p>
            <p style="font-weight:600;margin-bottom:14px;color:#1a1a2e;">${q.q}</p>
            <div id="quiz-opts" style="display:flex;flex-direction:column;gap:7px"></div>
            <p id="quiz-fb" style="margin-top:10px;font-size:13px;min-height:18px;font-weight:500;"></p>
        `;

        const opts = bubble.querySelector('#quiz-opts');
        const fb   = bubble.querySelector('#quiz-fb');

        shuffled.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.style.cssText = 'padding:10px 14px;border-radius:8px;border:1px solid rgba(0,0,0,0.1);background:rgba(255,255,255,0.7);color:#1a1a2e;cursor:pointer;font-size:14px;text-align:left;transition:background 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.02);';
            btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.background = 'rgba(255,255,255,1)'; });
            btn.addEventListener('mouseleave', () => { if (!btn.disabled) btn.style.background = 'rgba(255,255,255,0.7)'; });
            btn.addEventListener('click', () => {
                opts.querySelectorAll('button').forEach(b => b.disabled = true);
                if (opt === q.a) {
                    btn.style.background = 'rgba(83,141,78,0.4)';
                    fb.textContent = '✅ Correct!';
                    fb.style.color = '#4caf50';
                    score++;
                } else {
                    btn.style.background = 'rgba(255,80,80,0.3)';
                    fb.textContent = `❌ Answer: ${q.a}`;
                    fb.style.color = '#ff6b6b';
                }
                current++;
                setTimeout(renderQuestion, 1200);
            });
            opts.appendChild(btn);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    bubble.innerHTML = '<p style="font-weight:600;margin-bottom:8px">🧠 Quick Quiz! Ready?</p><p style="font-size:13px;color:#8a9ba8">5 questions. Let\'s test that brain! 💪</p>';
    setTimeout(renderQuestion, 800);
}

// ============================================================
// GAME 4: NUMBER GUESSING GAME (1–50)
// ============================================================
function startNumberGuess(chatWindow, appendBotMessageTracked) {
    const target = Math.floor(Math.random() * 50) + 1;
    let attempts = 0;
    const maxAttempts = 7;

    const container = document.createElement('div');
    container.className = 'message bot-message';
    const avatar = document.createElement('div');
    avatar.className = 'avatar bot-avatar';
    avatar.textContent = 'Z';

    const bubble = document.createElement('div');
    bubble.className = 'bubble glass-panel';
    bubble.style.maxWidth = '300px';
    bubble.innerHTML = `
        <p style="font-weight:600;margin-bottom:8px;color:#1a1a2e;">🔢 Number Guess!</p>
        <p style="font-size:13px;color:#6b7280;margin-bottom:12px">I'm thinking of a number between 1 and 50. You have ${maxAttempts} tries!</p>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
            <input id="ng-input" type="number" min="1" max="50" placeholder="Your guess..." style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.15);background:rgba(255,255,255,0.6);color:#1a1a2e;font-size:15px;font-family:Inter,sans-serif;outline:none;">
            <button id="ng-btn" style="padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#6a00ff,#a64aff);color:white;border:none;cursor:pointer;font-size:14px">Guess</button>
        </div>
        <p id="ng-msg" style="font-size:13px;color:#6a00ff;min-height:18px;font-weight:500;"></p>
        <p id="ng-attempts" style="font-size:12px;color:#6b7280;margin-top:4px">${maxAttempts} attempts left</p>
    `;

    container.appendChild(avatar);
    container.appendChild(bubble);
    chatWindow.appendChild(container);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    const input = bubble.querySelector('#ng-input');
    const btn   = bubble.querySelector('#ng-btn');
    const msgEl = bubble.querySelector('#ng-msg');
    const attemEl = bubble.querySelector('#ng-attempts');

    function doGuess() {
        const val = parseInt(input.value);
        if (isNaN(val) || val < 1 || val > 50) { msgEl.textContent = 'Enter a number between 1 and 50!'; return; }
        input.value = '';
        attempts++;
        const left = maxAttempts - attempts;

        if (val === target) {
            msgEl.textContent = `🎉 Correct! It was ${target}!`;
            msgEl.style.color = '#4caf50';
            input.disabled = true; btn.disabled = true;
            attemEl.textContent = `Got it in ${attempts} attempt(s)!`;
            saveGameStat('numguess', 'win');
            setTimeout(() => appendBotMessageTracked(`You guessed it in ${attempts} tries! ${gameWinQuip('numguess')}`), 500);
        } else if (left <= 0) {
            msgEl.textContent = `Game over! It was ${target}.`;
            msgEl.style.color = '#ff6b6b';
            input.disabled = true; btn.disabled = true;
            saveGameStat('numguess', 'loss');
            setTimeout(() => appendBotMessageTracked(`The number was ${target}! ${gameLossQuip('numguess')}`), 500);
        } else {
            msgEl.textContent = val < target ? '📈 Too low! Go higher.' : '📉 Too high! Go lower.';
            msgEl.style.color = '#6a00ff'; /* Changed from cyan to purple for contrast */
            attemEl.textContent = `${left} attempt(s) left`;
        }
    }

    btn.addEventListener('click', doGuess);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') doGuess(); });
    setTimeout(() => input.focus(), 100);
}

// ============================================================
// GAME 5: WOULD YOU RATHER
// ============================================================
const WYR_QUESTIONS = [
    ['Travel the world with no money', 'Stay home with unlimited money'],
    ['Be able to fly', 'Be able to become invisible'],
    ['Have a pet dragon', 'Be able to speak to animals'],
    ['Live 100 years in the past', 'Live 100 years in the future'],
    ['Only eat your favourite food forever', 'Never eat your favourite food again'],
    ['Be famous but lonely', 'Be unknown but surrounded by loved ones'],
    ['Have perfect memory', 'Be able to erase any memory you choose'],
    ['Always be 10 minutes late', 'Always be 20 minutes early'],
    ['Never use social media again', 'Never watch TV or movies again'],
    ['Have super strength', 'Have super speed'],
    ['Be able to talk to plants', 'Be able to talk to machines'],
    ['Live in the mountains', 'Live by the ocean'],
    ['Never feel cold', 'Never feel hot'],
    ['Read every book ever written', 'Listen to every song ever recorded'],
    ['Always know when someone is lying', 'Get away with lying once a week'],
];

function startWouldYouRather(chatWindow, appendBotMessageTracked) {
    const usedIndices = [];

    function pickQuestion() {
        if (usedIndices.length >= WYR_QUESTIONS.length) usedIndices.length = 0;
        let idx;
        do { idx = Math.floor(Math.random() * WYR_QUESTIONS.length); } while (usedIndices.includes(idx));
        usedIndices.push(idx);
        return WYR_QUESTIONS[idx];
    }

    function renderWYR() {
        const [optA, optB] = pickQuestion();

        const container = document.createElement('div');
        container.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.textContent = 'Z';

        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';
        bubble.style.maxWidth = '380px';
        bubble.innerHTML = `<p style="font-weight:600;margin-bottom:12px">🎲 Would You Rather...?</p>`;

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

        [[optA, 'A'], [optB, 'B']].forEach(([opt, label]) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<strong>${label}.</strong> ${opt}`;
            btn.style.cssText = 'padding:12px 16px;border-radius:10px;border:1px solid rgba(0,0,0,0.1);background:rgba(255,255,255,0.6);color:#1a1a2e;cursor:pointer;font-size:14px;text-align:left;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.02);';
            btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,1)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255,255,255,0.6)');
            btn.addEventListener('click', () => {
                bubble.querySelectorAll('button').forEach(b => b.disabled = true);
                const zyResponse = Math.random() < 0.5 ? optA : optB;
                setTimeout(() => {
                    appendBotMessageTracked(`Interesting choice! 😊 I'd go with: "${zyResponse}" — what made you pick yours?`);
                    setTimeout(() => {
                        const next = document.createElement('button');
                        next.textContent = '🎲 Another one!';
                        next.style.cssText = 'margin-top:10px;padding:7px 14px;border-radius:20px;background:rgba(106,0,255,0.3);color:white;border:1px solid rgba(106,0,255,0.5);cursor:pointer;font-size:13px;';
                        next.addEventListener('click', () => { next.remove(); renderWYR(); });
                        bubble.appendChild(next);
                        chatWindow.scrollTop = chatWindow.scrollHeight;
                    }, 600);
                }, 600);
            });
            btnRow.appendChild(btn);
        });

        bubble.appendChild(btnRow);
        container.appendChild(avatar);
        container.appendChild(bubble);
        chatWindow.appendChild(container);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    renderWYR();
}
