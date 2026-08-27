const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content;

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const chatWindow = document.getElementById('chat-window');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    
    // Voice elements
    const toggleVoiceBtn = document.getElementById('toggle-voice-btn');
    const micBtn = document.getElementById('mic-btn');
    let isVoiceModeActive = false;
    let isRecording = false;

    // Games button (sidebar)
    const openGamesBtn = document.getElementById('open-games-btn');

    // Sidebar drawer elements — referenced from startNewChat/switchSession
    // below (called during initial boot) as well as from the toggle button's
    // own click handler further down, so this has to live up here rather
    // than next to that handler or the early callers hit the same
    // temporal-dead-zone trap documented right below.
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');

    // .collapsed means "shrunk to icon rail" on desktop but "open as an
    // off-canvas drawer" on mobile (see the 768px media query). Selecting
    // something from that drawer (a new chat, a game, a history entry)
    // used to leave it sitting open on top of the very content it just
    // revealed — on mobile that's not just visual clutter, the drawer's
    // fixed z-index physically covers the chat window, so newly-rendered
    // buttons (e.g. the game picker) were literally unclickable until the
    // user manually closed it again.
    function closeMobileSidebarDrawer() {
        if (!sidebar || !toggleSidebarBtn) return;
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile && sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            const icon = toggleSidebarBtn.querySelector('.material-icons');
            if (icon) icon.textContent = 'menu';
        }
    }

    // State used by functions that can run during initial boot (e.g. the
    // welcome message) or from an event listener fired before the rest of
    // this script has finished its first pass — must be declared up front,
    // not further down where they're conceptually grouped with the code
    // that uses them, or those references throw a temporal-dead-zone
    // ReferenceError and silently abort script execution.
    let lastBotMessageTime = Date.now();
    let idleTimer = null;
    let checkInCount = 0;
    let usedCheckInIndices = [];
    let isUserTyping = false;
    let typingTimeout = null;

    // =========================================================
    // MODULE 0: MEMORY SYSTEM (localStorage-persisted)
    // Stores: name, mood history, goals, past context
    // =========================================================
    const MEMORY_KEY = 'zyviora_memory';

    function loadMemory() {
        try { return JSON.parse(localStorage.getItem(MEMORY_KEY)) || {}; }
        catch { return {}; }
    }

    function saveMemory(updates) {
        const mem = loadMemory();
        Object.assign(mem, updates);
        localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
    }

    function getMemory(key) {
        return loadMemory()[key];
    }

    // =========================================================
    // MODULE 0.5: MULTI-SESSION CHAT HISTORY (localStorage)
    // =========================================================
    const CHAT_SESSIONS_KEY = 'zyviora_chat_sessions';
    let activeSessionId = localStorage.getItem('zyviora_active_session_id');

    function loadChatSessions() {
        try { return JSON.parse(localStorage.getItem(CHAT_SESSIONS_KEY)) || []; }
        catch { return []; }
    }

    function saveChatSessions(sessions) {
        localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
        renderSidebarHistory();
    }

    function startNewChat() {
        closeMobileSidebarDrawer();
        chatWindow.innerHTML = ''; // Clear UI
        activeSessionId = 'session_' + Date.now();
        localStorage.setItem('zyviora_active_session_id', activeSessionId);

        const sessions = loadChatSessions();
        sessions.unshift({ id: activeSessionId, title: 'New Chat', timestamp: Date.now(), messages: [] });
        saveChatSessions(sessions);
        updateChatHeader();
        
        // Time-aware greeting
        const ctx = getTimeContext();
        appendBotMessageTracked(timeGreetings[ctx], true);
    }

    function switchSession(sessionId) {
        closeMobileSidebarDrawer();
        activeSessionId = sessionId;
        localStorage.setItem('zyviora_active_session_id', activeSessionId);
        chatWindow.innerHTML = ''; // Clear UI
        restoreChatHistory();
        renderSidebarHistory();
        updateChatHeader();
    }

    function addMessageToHistory(text, sender, isHtml=false) {
        let sessions = loadChatSessions();
        let activeSession = sessions.find(s => s.id === activeSessionId);
        
        // Failsafe: if active session doesn't exist, create it
        if (!activeSession) {
            activeSessionId = 'session_' + Date.now();
            localStorage.setItem('zyviora_active_session_id', activeSessionId);
            activeSession = { id: activeSessionId, title: 'New Chat', timestamp: Date.now(), messages: [] };
            sessions.unshift(activeSession);
        }

        activeSession.messages.push({ text, sender, isHtml, ts: Date.now() });
        
        // Auto-generate title based on first user message
        if (sender === 'user' && activeSession.title === 'New Chat') {
            activeSession.title = text.length > 25 ? text.substring(0, 25) + '...' : text;
            updateChatHeader();
        }
        
        saveChatSessions(sessions);
    }

    function restoreChatHistory() {
        const sessions = loadChatSessions();
        const activeSession = sessions.find(s => s.id === activeSessionId);
        
        if (!activeSession || activeSession.messages.length === 0) return false;
        
        activeSession.messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${msg.sender}-message`;
            
            const avatar = document.createElement('div');
            avatar.className = `avatar ${msg.sender}-avatar`;
            avatar.innerHTML = msg.sender === 'user' 
                ? '<img src="/static/user_avatar.png" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />' 
                : '<img src="/static/bot_avatar.png" alt="Zyviora" />';
            
            const bubble = document.createElement('div');
            bubble.className = 'bubble glass-panel';
            if (msg.isHtml) bubble.innerHTML = msg.text;
            else bubble.textContent = msg.text;
            
            msgDiv.appendChild(avatar);
            msgDiv.appendChild(bubble);
            chatWindow.appendChild(msgDiv);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return true;
    }

    function updateChatHeader() {
        const titleEl = document.getElementById('current-chat-title');
        if (!titleEl) return;
        const sessions = loadChatSessions();
        const activeSession = sessions.find(s => s.id === activeSessionId);
        if (activeSession) {
            titleEl.textContent = activeSession.title;
        } else {
            titleEl.textContent = 'New Chat';
        }
    }

    function renameSession(sessionId, e) {
        e.stopPropagation();
        const sessions = loadChatSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;
        
        const newTitle = prompt("Enter new chat name:", session.title);
        if (newTitle && newTitle.trim() !== '') {
            session.title = newTitle.trim();
            saveChatSessions(sessions);
            if (sessionId === activeSessionId) updateChatHeader();
        }
    }

    function deleteSession(sessionId, e) {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this chat?")) return;
        
        let sessions = loadChatSessions();
        sessions = sessions.filter(s => s.id !== sessionId);
        saveChatSessions(sessions);
        
        if (sessionId === activeSessionId) {
            if (sessions.length > 0) {
                switchSession(sessions[0].id);
            } else {
                startNewChat();
            }
        }
    }

    function renderSidebarHistory() {
        const list = document.getElementById('chat-history-list');
        if (!list) return; // Might not exist on all pages
        
        const sessions = loadChatSessions();
        list.innerHTML = '';
        
        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'control-item';
            item.style.cursor = 'pointer';
            item.style.fontSize = '0.9rem';
            item.style.padding = '8px 12px';
            item.style.marginBottom = '4px';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.borderRadius = '10px';
            
            if (session.id === activeSessionId) {
                item.style.background = 'rgba(106, 0, 255, 0.1)';
                item.style.borderLeft = '3px solid var(--primary-color)';
                item.style.color = 'var(--primary-color)';
                item.style.fontWeight = '600';
            }
            
            const textSpan = document.createElement('span');
            textSpan.style.display = 'flex';
            textSpan.style.alignItems = 'center';
            textSpan.style.whiteSpace = 'nowrap';
            textSpan.style.overflow = 'hidden';
            textSpan.style.textOverflow = 'ellipsis';
            textSpan.innerHTML = `<span class="material-icons" style="font-size:16px; margin-right:8px; flex-shrink: 0;">chat_bubble_outline</span> <span style="overflow:hidden; text-overflow:ellipsis;">${session.title}</span>`;
            
            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '5px';
            actionsDiv.style.opacity = '0.6';
            actionsDiv.className = 'history-actions'; // For hover effects if needed
            
            const editBtn = document.createElement('span');
            editBtn.className = 'material-icons';
            editBtn.textContent = 'edit';
            editBtn.style.fontSize = '14px';
            editBtn.title = 'Rename Chat';
            editBtn.onclick = (e) => renameSession(session.id, e);
            
            const delBtn = document.createElement('span');
            delBtn.className = 'material-icons';
            delBtn.textContent = 'delete';
            delBtn.style.fontSize = '14px';
            delBtn.title = 'Delete Chat';
            delBtn.onclick = (e) => deleteSession(session.id, e);
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);
            
            item.appendChild(textSpan);
            item.appendChild(actionsDiv);
            
            item.addEventListener('click', () => switchSession(session.id));
            list.appendChild(item);
        });
    }

    // =========================================================
    // MODULE 5: CONTEXT AWARENESS (time of day)
    // =========================================================
    function getTimeContext() {
        const hour = new Date().getHours();
        if (hour >= 22 || hour < 5)  return 'late_night';
        if (hour >= 5  && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 22) return 'evening';
    }

    const timeGreetings = {
        late_night:  "It's pretty late — you should probably get some rest soon 😴. But I'm here if you need me.",
        morning:     "Good morning! ☀️ Hope you slept well. What are we going to conquer together today?",
        afternoon:   "Good afternoon! 🌤 How's your day going so far?",
        evening:     "Good evening! 🌙 How did your day treat you today?"
    };

    // =========================================================
    // MODULE 2: DAILY MOOD CHECK (once per day)
    // =========================================================
    const MOOD_KEY = 'zyviora_mood_log';

    function loadMoodLog() {
        try { return JSON.parse(localStorage.getItem(MOOD_KEY)) || []; }
        catch { return []; }
    }

    function logMood(mood) {
        const log = loadMoodLog();
        log.push({ mood, date: new Date().toDateString(), ts: Date.now() });
        // Keep only last 30 days
        if (log.length > 30) log.shift();
        localStorage.setItem(MOOD_KEY, JSON.stringify(log));
        saveMemory({ lastMoodDate: new Date().toDateString(), lastMood: mood });
    }

    function shouldAskDailyMood() {
        const lastDate = getMemory('lastMoodDate');
        return lastDate !== new Date().toDateString();
    }

    // Inject a clickable mood picker into the chat
    function showMoodPicker() {
        const moods = [
            { label: '😊 Great',  val: 'great'  },
            { label: '🙂 Good',   val: 'good'   },
            { label: '😐 Okay',   val: 'okay'   },
            { label: '😔 Low',    val: 'low'    },
            { label: '😢 Sad',    val: 'sad'    }
        ];

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';

        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';

        const question = document.createElement('p');
        question.textContent = "Hey! Before we dive in — how are you feeling today? 💙";
        bubble.appendChild(question);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';

        moods.forEach(m => {
            const btn = document.createElement('button');
            btn.textContent = m.label;
            btn.style.cssText = 'padding:8px 16px;border-radius:20px;border:1px solid rgba(0,0,0,0.1);background:rgba(255,255,255,0.9);color:#1a1a2e;cursor:pointer;font-size:0.9rem;font-weight:600;box-shadow:0 4px 10px rgba(0,0,0,0.05);transition:transform 0.2s;';
            btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
            btn.onmouseout = () => btn.style.transform = 'scale(1)';
            btn.addEventListener('click', () => {
                logMood(m.val);
                bubble.innerHTML = `Thanks for sharing! You're feeling <strong>${m.label}</strong> today. I'll keep that in mind. 💙`;
                generateMoodFollowUp(m.val);
                lastBotMessageTime = Date.now();
            });
            btnRow.appendChild(btn);
        });

        bubble.appendChild(btnRow);
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        lastBotMessageTime = Date.now();
    }

    function generateMoodFollowUp(mood) {
        const followUps = {
            great: "That's wonderful! 🌟 I love hearing that. What's been the highlight of your day?",
            good:  "Glad to hear it! 😊 Is there anything fun or productive you'd like to do today?",
            okay:  "I hear you — just 'okay' is still okay. 😊 Want to talk or try something fun together?",
            low:   "I'm sorry to hear that. I'm right here with you. Want to talk about what's going on? 💙",
            sad:   "I'm really glad you told me. You don't have to go through this alone. I'm here — always. What happened?"
        };
        setTimeout(() => appendBotMessageTracked(followUps[mood] || "Tell me more about how you're feeling!"), 800);
    }

    // =========================================================
    // MODULE 3: PERSONAL INSIGHTS (mood trend analysis)
    // =========================================================
    function getMoodInsight() {
        const log = loadMoodLog();
        if (log.length < 3) return null;

        const recent = log.slice(-5);
        const negCount = recent.filter(e => ['sad','low'].includes(e.mood)).length;
        const posCount = recent.filter(e => ['great','good'].includes(e.mood)).length;

        if (negCount >= 3) return "I've noticed you've been feeling a bit down lately. That's completely okay — but please know you can always talk to me about it. 💙";
        if (posCount >= 4) return "You've been in such a great mood recently! That makes me really happy. Keep it up! 🌟";
        return null;
    }

    // =========================================================
    // MODULE 4: GOAL / HABIT TRACKER
    // =========================================================
    const GOALS_KEY = 'zyviora_goals';

    function loadGoals() {
        try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || []; }
        catch { return []; }
    }

    function saveGoal(goal) {
        const goals = loadGoals();
        goals.push({ text: goal, createdAt: Date.now(), completedToday: false, lastCompleted: null });
        localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    }

    function tryHandleGoal(text) {
        // Detect "add goal: [text]" or "set goal: [text]" or "my goal is [text]"
        const addMatch = text.match(/(?:(?:add|set|track|new)\s+goal|my goal is)[:\s]+(.+)/i);
        const lastBotMsg = getLastBotMessage();
        const isGoalContext = /You haven't set any goals yet! Try saying:/i.test(lastBotMsg);

        if (addMatch) {
            const goal = addMatch[1].trim();
            saveGoal(goal);
            appendBotMessageTracked(`🎯 Goal added: "${goal}". I'll help you stay on track and remind you to celebrate every win!`);
            return true;
        } else if (isGoalContext && text.length > 3) {
            // Context-aware fallback: if bot just prompted for a goal, treat raw input as a goal
            saveGoal(text);
            appendBotMessageTracked(`🎯 Goal added: "${text}". I'll help you stay on track and remind you to celebrate every win!`);
            return true;
        }

        // Detect "I completed [goal]" or "done with [goal]" or "I finished [goal]"
        const doneMatch = text.match(/(?:i (?:completed|finished|done with)|completed|finished)[:\s]+(.+)/i);
        if (doneMatch) {
            const goalText = doneMatch[1].trim();
            const goals = loadGoals();
            const goal = goals.find(g => g.text.toLowerCase().includes(goalText.toLowerCase()));
            if (goal) {
                goal.completedToday = true;
                goal.lastCompleted = new Date().toDateString();
                localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
                appendBotMessageTracked(`🎉 You completed "${goal.text}" — I'm SO proud of you!! Every step counts, keep going! ⭐`);
                return true;
            }
        }

        // Detect "show my goals" or "what are my goals"
        if (/(?:show|list|what are)\s+my\s+goals/i.test(text)) {
            const goals = loadGoals();
            if (goals.length === 0) {
                appendBotMessageTracked("You haven't set any goals yet! Try saying: \"Add goal: Drink 8 glasses of water\"");
            } else {
                const list = goals.map((g, i) => `${i+1}. ${g.text}${g.lastCompleted === new Date().toDateString() ? ' ✅' : ''}`).join('\n');
                appendBotMessageTracked(`Here are your current goals:\n\n${list}\n\nYou've got this! 💪`);
            }
            return true;
        }

        return false;
    }

    // =========================================================
    // MODULE 6: PERSONALITY — Name Learning & Behavior Insights
    // =========================================================
    function tryLearnName(text) {
        const nameMatch = text.match(/(?:my name is|i(?:'m| am) called|call me)\s+([a-zA-Z]+)/i);
        if (nameMatch) {
            const name = nameMatch[1];
            saveMemory({ userName: name });
            setTimeout(() => appendBotMessageTracked(`${name}! That's a lovely name 😊 I'll remember it. Nice to officially meet you, ${name}!`), 400);
            return true;
        }
        return false;
    }

    function tryHandleLearningInsights(text) {
        try {
            // Track the current hour
            const hour = new Date().getHours();
            let insights = JSON.parse(localStorage.getItem('zyviora_learning')) || {};
            if (!insights.activeHours) insights.activeHours = {};
            if (!insights.topics) insights.topics = {};
            
            insights.activeHours[hour] = (insights.activeHours[hour] || 0) + 1;
            
            // Track common topics
            const lower = text.toLowerCase();
            const topics = ['study', 'work', 'games', 'music', 'stress', 'happy'];
            topics.forEach(t => {
                if(lower.includes(t)) {
                    insights.topics[t] = (insights.topics[t] || 0) + 1;
                }
            });
            
            localStorage.setItem('zyviora_learning', JSON.stringify(insights));
        } catch (e) {
            console.error("Error in tryHandleLearningInsights:", e);
        }
    }

    // =========================================================
    // MODULE 7.5: WOW FEATURE (DAILY AI REPORT)
    // =========================================================
    function tryHandleDailyReport(text) {
        if (/(?:show my daily report|daily summary|how am i doing today)/i.test(text)) {
            const lastMood = getMemory('lastMood') || "unknown";
            let rawGoals = localStorage.getItem('zyviora_goals');
            let completed = 0;
            if (rawGoals) {
                const goals = JSON.parse(rawGoals);
                goals.forEach(g => { if (g.completedToday) completed++; });
            }
            
            const message = `📊 **Your Daily Report**\n\n` + 
                            `• Mood today: ${lastMood.charAt(0).toUpperCase() + lastMood.slice(1)}\n` +
                            `• Goals completed: ${completed}\n\n` +
                            `Suggestion for tomorrow: Keep taking it one step at a time! I'm proud of you. 🌟`;
                            
            appendBotMessageTracked(message);
            return true;
        }
        return false;
    }

    // =========================================================
    // MODULE 7: SAFE EMOTIONAL SUPPORT LAYER (crisis detection)
    // =========================================================
    const CRISIS_KEYWORDS = ['tired of everything', 'give up', 'end it', 'no point', 'hopeless', 'worthless', 'hate myself'];

    function checkForCrisisSignals(text) {
        const lower = text.toLowerCase();
        if (CRISIS_KEYWORDS.some(kw => lower.includes(kw))) {
            appendBotMessageTracked(
                "I hear you, and I'm so glad you shared that with me. 💙 What you're feeling is real, and it matters. " +
                "Please don't carry this alone — I'm right here. Would you like to talk about what's going on?"
            );
            appendBotMessageTracked(
                "If things ever feel like too much to handle alone, please also consider reaching out to people trained to help, any time day or night:\n" +
                "• US: call or text 988 (Suicide & Crisis Lifeline)\n" +
                "• US/Canada: text HOME to 741741 (Crisis Text Line)\n" +
                "• Outside the US: findahelpline.com lists free, confidential helplines by country\n" +
                "You deserve support, and I'm still here too."
            );
            return true; // Suppress backend — response is handled here
        }
        return false;
    }

    // =========================================================
    // MODULE 5: FUN ENGAGEMENT (boredom busters)
    // =========================================================
    const funFacts = [
        "🐙 Did you know octopuses have three hearts? Two pump blood to the gills and one to the rest of the body!",
        "🌍 Honey never expires! Archaeologists found 3,000-year-old honey in Egyptian tombs — still perfectly edible.",
        "🧠 Your brain generates about 70,000 thoughts per day. That's a lot of thinking!",
        "🦋 Butterflies taste with their feet. Their taste sensors are on their legs!",
        "🌙 A day on Venus is longer than a year on Venus — it rotates so slowly that the sun rises only once every 243 Earth days."
    ];

    function tryHandleFunRequest(text) {
        const lower = text.toLowerCase().trim();

        // Context-aware game trigger:
        // When bored, lonely, or asking to play — offer the game picker 🎮
        if (/(?:i'?m bored|nothing to do|feeling lonely|so lonely|let'?s play|play a game|want to play|play something)/i.test(lower)) {
            appendBotMessageTracked("Oh, sounds like you need some fun! Let me pick something for us 🎮");
            setTimeout(() => showGamePicker(chatWindow, appendBotMessageTracked), 600);
            return true;
        }

        // Rematch / play again — re-open the game picker
        if (/^(?:rematch|play again|another round|another game|new game|try again|one more|start|start game|begin|let's go|go|lets go)$/i.test(lower)) {
            appendBotMessageTracked("Let's go! 🎮 Which game are we playing?");
            setTimeout(() => showGamePicker(chatWindow, appendBotMessageTracked), 400);
            return true;
        }

        // Short affirmatives ("ok", "sure", "yes", etc.)
        // Context-aware: if last bot msg offered a rematch/game, open picker
        if (/^(?:ok|okay|sure|yes|yeah|yep|alright|fine|got it|cool|great|nice|sounds good|k)$/i.test(lower)) {
            const lastBotMsg = getLastBotMessage();
            if (/rematch|play again|another game|pick a game|which game/i.test(lastBotMsg)) {
                appendBotMessageTracked("Let's go! 🎮 Which game are we playing?");
                setTimeout(() => showGamePicker(chatWindow, appendBotMessageTracked), 400);
                return true;
            }
            // Generic warm reply for other contexts
            const warmReplies = [
                "Great! 😊 What would you like to talk about or do next?",
                "Awesome! I'm listening — what's on your mind? 💙",
                "Perfect! Ready whenever you are 😊",
                "Got it! What would you like to do?"
            ];
            appendBotMessageTracked(warmReplies[Math.floor(Math.random() * warmReplies.length)]);
            return true;
        }

        // Fun fact request
        if (/(?:tell me something|fun fact|something interesting|entertain me)/i.test(lower)) {
            const fact = funFacts[Math.floor(Math.random() * funFacts.length)];
            appendBotMessageTracked(fact);
            setTimeout(() => appendBotMessageTracked("Want another one? Just say 'tell me something interesting'! 😊"), 1200);
            return true;
        }

        // Check if user is asking about their name
        if (/(?:what(?:'s| is) my name|do you know my name|you remember)/i.test(lower)) {
            const name = getMemory('userName');
            if (name) {
                appendBotMessageTracked(`Of course I remember! Your name is ${name} 😊 I never forget a friend.`);
            } else {
                appendBotMessageTracked("I don't know your name yet! You can tell me anytime — just say 'My name is...' and I'll remember it! 😊");
            }
            return true;
        }

        return false;
    }

    // =========================================================
    // MODULE 8: SYSTEM COMMANDS
    // =========================================================
    function tryHandleSystemCommand(text) {
        const lower = text.toLowerCase().trim();
        const cmdMatch = lower.match(/^open\s+(calculator|notepad|word|powerpoint|youtube|calendar)$/i);
        
        if (cmdMatch) {
            const appName = cmdMatch[1];
            const emojis = { calculator: "🧮", notepad: "📝", word: "📄", powerpoint: "📊", youtube: "🎬", calendar: "📅" };
            
            appendBotMessageTracked(`Opening ${appName.charAt(0).toUpperCase() + appName.slice(1)} for you ${emojis[appName]||'🚀'}...`);
            
            fetch('/open-app', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
                body: JSON.stringify({ app_name: appName })
            })
            .then(res => res.json().then(data => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok && data.message === 'Not logged in') {
                    appendBotMessageTracked("Opening apps on this device needs you to be logged in first — head to /login and try again 🔒");
                } else if (data.status !== 'success') {
                    appendBotMessageTracked("Hmm, I couldn't open that. Try again?");
                }
            })
            .catch(() => {
                appendBotMessageTracked("Hmm, I couldn't open that. Are we offline?");
            });
            
            return true;
        }
        return false;
    }

    // =========================================================
    // MODULE 9: TASK MANAGEMENT
    // =========================================================
    const TASKS_KEY = 'zyviora_tasks';

    function loadTasks() {
        try { return JSON.parse(localStorage.getItem(TASKS_KEY)) || []; }
        catch { return []; }
    }

    function saveTasks(tasks) {
        localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    }

    function tryHandleTasks(text) {
        const lower = text.toLowerCase().trim();
        
        // Relaxed regex to catch "add task foo", "add task: foo", "remind me to add task foo"
        const addMatch = text.match(/add task[:\s]+(.+)/i) || text.match(/remind me to add task[:\s]+(.+)/i);
        if (addMatch) {
            const tasks = loadTasks();
            tasks.push({ id: Date.now(), text: addMatch[1].trim(), status: 'pending', createdAt: Date.now() });
            saveTasks(tasks);
            appendBotMessageTracked(`Got it! I've added that to your tasks 😊`);
            return true;
        }

        if (/(?:show|list|what are).*my.*tasks/i.test(lower)) {
            const tasks = loadTasks();
            if (tasks.length === 0) {
                appendBotMessageTracked("You don't have any pending tasks right now. Try saying \"Add task: ...\"");
            } else {
                const pending = tasks.filter(t => t.status === 'pending');
                if(pending.length === 0) {
                    appendBotMessageTracked("All your tasks are complete! Great job! 🎉");
                } else {
                    let list = pending.map((t, i) => `${i+1}. ${t.text}`).join('\n');
                    appendBotMessageTracked(`Here are your pending tasks:\n\n${list}`);
                }
            }
            return true;
        }

        const markMatch = text.match(/mark task (\d+) as done/i);
        if (markMatch) {
            const index = parseInt(markMatch[1]) - 1;
            const tasks = loadTasks();
            const pending = tasks.filter(t => t.status === 'pending');
            if (index >= 0 && index < pending.length) {
                const targetTask = pending[index];
                const actualIndex = tasks.findIndex(t => t.id === targetTask.id);
                tasks[actualIndex].status = 'completed';
                saveTasks(tasks);
                appendBotMessageTracked(`Awesome! I've marked task "${targetTask.text}" as done 🌟`);
            } else {
                appendBotMessageTracked(`I couldn't find task number ${parseInt(markMatch[1])}. Try saying "Show my tasks".`);
            }
            return true;
        }

        return false;
    }

    // =========================================================
    // CORE: handleUserMessage (orchestrates all modules)
    // =========================================================
    function handleUserMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        appendMessage(text, 'user');
        userInput.value = '';
        resetIdleTimer();

        // --- Layer 1: Frontend-only intercepts (no backend round-trip needed) ---
        if (tryHandleSystemCommand(text)) return;
        if (tryHandleTasks(text))       return;
        if (tryHandleReminder(text))    return;
        if (tryHandleGoal(text))        return;
        if (tryHandleFunRequest(text))  return;
        if (tryHandleDailyReport(text)) return;

        // --- Layer 2: Safe Emotional Support (crisis detection) ---
        if (checkForCrisisSignals(text)) return;

        // --- Layer 3: Personality — silently learn user's name & gather insights ---
        tryLearnName(text);
        tryHandleLearningInsights(text);

        // Disable input while waiting for backend
        userInput.disabled = true;
        sendBtn.disabled = true;
        userInput.placeholder = "Zyviora is thinking...";

        // Create bot bubble with typing indicator
        const botMsgDiv = document.createElement('div');
        botMsgDiv.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar thinking';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';
        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';
        bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        botMsgDiv.appendChild(avatar);
        botMsgDiv.appendChild(bubble);
        chatWindow.appendChild(botMsgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // --- Layer 4: Enrich the message sent to backend with memory context ---
        const userName = getMemory('userName');
        const enrichedMessage = text;

        // Set a 30-second timeout so we never hang silently
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
            body: JSON.stringify({ message: enrichedMessage }),
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            return response.json();
        })
        .then(data => {
            let reply = data.error ? "Hmm, something went wrong on my end. Please try again!" : data.response;
            if (!reply || reply.trim() === '') {
                reply = "I seem to be having trouble forming a response. Could you rephrase that?";
            }

            // Personalise reply with user name occasionally
            if (userName && !reply.includes(userName) && Math.random() < 0.3) {
                reply = `${userName}, ${reply.charAt(0).toLowerCase()}${reply.slice(1)}`;
            }

            bubble.innerHTML = reply;
            addMessageToHistory(reply, 'bot', true);
            lastBotMessageTime = Date.now();
            speakText(reply);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        })
        .catch(err => {
            clearTimeout(timeoutId);
            console.error('Chat fetch error:', err);
            let errMsg = "";
            if (err.name === 'AbortError') {
                errMsg = "It seems like I took too long to respond. My AI brain might be a bit slow right now — please try again! ⏱️";
            } else {
                errMsg = "I couldn't reach my brain right now. Please check your connection and try again! 💙";
            }
            bubble.innerHTML = errMsg;
            addMessageToHistory(errMsg, 'bot', true);
        })
        .finally(() => {
            avatar.classList.remove('thinking');
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.placeholder = isVoiceModeActive ? "Click the mic icon to speak, or type..." : "Talk to Zyviora...";
            userInput.focus();
        });
    }


    // =========================================================
    // BOOT: Startup Sequence (runs once on page load)
    // =========================================================
    function bootZyviora() {
        renderSidebarHistory();
        
        const sessions = loadChatSessions();
        if (sessions.length === 0 || !activeSessionId) {
            // First time ever, or no active session selected: create new
            startNewChat();
        } else {
            // Restore current session
            const hasHistory = restoreChatHistory();
            updateChatHeader();
            if (!hasHistory) {
                const ctx = getTimeContext();
                setTimeout(() => appendBotMessageTracked(timeGreetings[ctx], true), 600);
            }
        }
        
        // For insights logic below, consider it hasHistory if there are messages
        const activeSession = loadChatSessions().find(s => s.id === activeSessionId);
        const hasHistory = activeSession && activeSession.messages.length > 0;

        // 2. Personal Insights (mood trend) — show if enough data
        const insight = getMoodInsight();
        if (insight && !hasHistory) {
            setTimeout(() => appendBotMessageTracked(insight, true), 1600);
        }

        // 3. Daily Mood Check — show once per day
        if (shouldAskDailyMood()) {
            setTimeout(() => showMoodPicker(), (insight && !hasHistory) ? 2600 : 1400);
        }
    }

    // Attach core listeners
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleUserMessage();
    });
    sendBtn.addEventListener('click', handleUserMessage);
    
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', startNewChat);
    }
    
    const toggleHistoryBtn = document.getElementById('toggle-history-btn');
    if (toggleHistoryBtn) {
        toggleHistoryBtn.addEventListener('click', () => {
            const list = document.getElementById('chat-history-list');
            const chevron = document.getElementById('history-chevron');
            if (list.style.display === 'none' || list.style.display === '') {
                list.style.display = 'flex';
                chevron.style.transform = 'rotate(180deg)';
            } else {
                list.style.display = 'none';
                chevron.style.transform = 'rotate(0deg)';
            }
        });
    }

    // ─── Login/Logout sidebar link ─────────────────────────
    // This was always a static "Login / Settings" link to /login regardless
    // of auth state — a logged-in user saw "Login" (confusing, they already
    // are) and had no way to actually log out from the chat page itself;
    // the only working logout button lived on the dashboard page.
    const loginLink = document.getElementById('login-link');
    if (loginLink && localStorage.getItem('zyviora_logged_in') === 'true') {
        const icon = loginLink.querySelector('.material-icons');
        if (icon) icon.textContent = 'logout';
        loginLink.lastChild.textContent = ' Logout';
        loginLink.removeAttribute('href');
        loginLink.style.cursor = 'pointer';
        loginLink.addEventListener('click', async (e) => {
            e.preventDefault();
            // Same sync-then-logout sequence as the dashboard's logout
            // button, so state isn't lost by logging out from chat instead.
            const localData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                localData[key] = localStorage.getItem(key);
            }
            try {
                await fetch('/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
                    body: JSON.stringify(localData)
                });
            } catch (err) { console.warn('Sync before logout failed:', err); }

            await fetch('/logout', { method: 'POST', headers: { 'X-CSRFToken': CSRF_TOKEN } });
            localStorage.removeItem('zyviora_logged_in');
            localStorage.removeItem('zyviora_username');
            window.location.href = '/login';
        });
    }

    // Boot on load
    bootZyviora();

    // Periodically sync localStorage state (goals, tasks, reminders, mood,
    // memory) to the server. Previously this only happened once, on logout
    // — so a crashed tab, a closed browser, or a session that never reaches
    // logout lost everything since the last successful sync. This narrows
    // that window without changing where the data actually lives.
    function syncLocalDataToServer() {
        if (localStorage.getItem('zyviora_logged_in') !== 'true') return;
        const localData = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            localData[key] = localStorage.getItem(key);
        }
        fetch('/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
            body: JSON.stringify(localData)
        }).catch(e => console.warn('Periodic sync failed:', e));
    }
    setInterval(syncLocalDataToServer, 2 * 60 * 1000);

    function appendMessage(text, sender, skipHistory = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        avatar.innerHTML = sender === 'user' 
            ? '<img src="/static/user_avatar.png" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />' 
            : '<img src="/static/bot_avatar.png" alt="Zyviora" />';
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';
        bubble.textContent = text;
        
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        if (!skipHistory) {
            addMessageToHistory(text, sender, false);
        }
    }

    // Internal helper: Inject a bot message and speak it aloud if Voice Mode is on
    function appendBotMessage(text, skipHistory = false) {
        appendMessage(text, 'bot', skipHistory);
        speakText(text);
    }

    function appendBotMessageTracked(text, skipHistory = false) {
        lastBotMessageTime = Date.now();
        appendBotMessage(text, skipHistory);
    }

    /**
     * Read the most recent bot bubble text from the DOM.
     * Used for context-aware replies (e.g. "sure" after a rematch offer).
     */
    function getLastBotMessage() {
        const bubbles = chatWindow.querySelectorAll('.bot-message .bubble');
        if (!bubbles.length) return '';
        return bubbles[bubbles.length - 1].textContent || '';
    }

    // =========================================================
    // MODULE 1: SMART REMINDER ENGINE (localStorage-persisted)
    // =========================================================
    const REMINDER_STORAGE_KEY = 'zyviora_reminders';

    /**
     * Parse a natural language reminder string.
     * Supports:
     *   "remind me to [task] in [N] minutes/hours/seconds"
     *   "remind me to [task] after [N] minutes/hours"
     * Returns { task, triggerAt } or null if no match.
     */
    function parseReminderInput(text) {
        // Support: "remind me to [task] in [N] mins" AND "remind me to [task] at [H:M AM/PM]"
        const inPattern = /remind\s+me\s+to\s+(.+?)\s+(?:in|after)\s+(\d+)\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs)/i;
        const atPattern = /remind\s+me\s+to\s+(.+?)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

        const inMatch = text.match(inPattern);
        if (inMatch) {
            const task = inMatch[1].trim();
            const amount = parseInt(inMatch[2], 10);
            const rawUnit = inMatch[3].toLowerCase();

            let ms;
            if (rawUnit.startsWith('sec')) ms = amount * 1000;
            else if (rawUnit.startsWith('min')) ms = amount * 60 * 1000;
            else ms = amount * 60 * 60 * 1000;

            return { task, triggerAt: Date.now() + ms, mode: 'in' };
        }

        const atMatch = text.match(atPattern);
        if (atMatch) {
            const task = atMatch[1].trim();
            let hours = parseInt(atMatch[2], 10);
            const mins = atMatch[3] ? parseInt(atMatch[3], 10) : 0;
            const period = atMatch[4].toLowerCase();

            if (period === 'pm' && hours !== 12) hours += 12;
            if (period === 'am' && hours === 12) hours = 0;

            const now = new Date();
            const target = new Date();
            target.setHours(hours, mins, 0, 0);

            // If time has already passed today, set for tomorrow
            if (target.getTime() <= now.getTime()) {
                target.setDate(target.getDate() + 1);
            }

            return { task, triggerAt: target.getTime(), mode: 'at', formattedTime: target.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
        }

        return null;
    }

    /**
     * Save a reminder object to localStorage.
     */
    function saveReminder(reminder) {
        const existing = loadReminders();
        existing.push(reminder);
        localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(existing));
    }

    /**
     * Load all stored reminders from localStorage.
     */
    function loadReminders() {
        try {
            return JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    /**
     * Remove a reminder from localStorage by its triggerAt timestamp.
     */
    function removeReminder(triggerAt) {
        const updated = loadReminders().filter(r => r.triggerAt !== triggerAt);
        localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(updated));
    }

    /**
     * Schedule a reminder using setTimeout. Handles recalculated remaining time.
     */
    function scheduleReminder(reminder) {
        const remaining = reminder.triggerAt - Date.now();
        if (remaining <= 0) {
            // Already overdue — fire immediately
            fireReminder(reminder);
            return;
        }
        setTimeout(() => fireReminder(reminder), remaining);
    }

    /**
     * Fire a reminder: show the message, speak it, then remove from storage.
     */
    function fireReminder(reminder) {
        appendBotMessageTracked(`Hey, reminder: ${reminder.task} 😊`);
        removeReminder(reminder.triggerAt);
    }

    /**
     * Entry point — try to intercept a reminder from user input.
     * Returns true if handled (caller should skip sending to backend).
     */
    function tryHandleReminder(text) {
        const parsed = parseReminderInput(text);
        if (!parsed) return false;

        if (parsed.mode === 'at') {
            appendBotMessageTracked(`Got it! ✅ I'll remind you to "${parsed.task}" at ${parsed.formattedTime}. I won't let you forget!`);
        } else {
            const timeLabel = (parsed.triggerAt - Date.now()) >= 60000 ? 
                              `${Math.round((parsed.triggerAt - Date.now()) / 60000)} minute(s)` : 
                              `${Math.round((parsed.triggerAt - Date.now()) / 1000)} second(s)`;
            appendBotMessageTracked(`Got it! ✅ I'll remind you to "${parsed.task}" in ${timeLabel}. I won't let you forget!`);
        }
        
        saveReminder(parsed);
        scheduleReminder(parsed);
        return true;
    }

    /**
     * On page load: restore and reschedule all pending reminders from localStorage.
     */
    function restorePendingReminders() {
        const reminders = loadReminders();
        if (reminders.length > 0) {
            reminders.forEach(r => scheduleReminder(r));
            appendBotMessageTracked(`👋 Welcome back! I've restored ${reminders.length} pending reminder(s) for you.`);
        }
    }

    // Restore reminders immediately on load
    restorePendingReminders();


    // ===========================================================
    // MODULE 2: PROACTIVE CHECK-IN SYSTEM (Idle Timer)
    // ===========================================================
    const MIN_IDLE_MS = 2 * 60 * 1000; // 2 minutes minimum idle
    const MAX_IDLE_MS = 5 * 60 * 1000; // 5 minutes maximum idle
    const MAX_CHECKINS_PER_SESSION = 2;  // Hard cap to avoid annoyance

    // 5 distinct, human-like, non-repetitive check-in messages
    const checkInMessages = [
        "Hey, just checking in on you 😊 How are you feeling right now?",
        "It's been a little quiet here... Are you doing okay? I'm always here to chat if you need me. 💙",
        "Quick reminder: Have you had some water recently? Taking care of yourself matters. 💧",
        "Just a gentle nudge — remember to take a short break and stretch if you've been sitting a while! 🌿",
        "I noticed you've been away. No worries, I'm right here whenever you want to talk or just hang out. ❤️"
    ];

    /**
     * Pick a unique random check-in message (does NOT repeat until all are used).
     */
    function getUniqueCheckIn() {
        if (usedCheckInIndices.length >= checkInMessages.length) {
            usedCheckInIndices = []; // Cycle through again after all used
        }
        let idx;
        do {
            idx = Math.floor(Math.random() * checkInMessages.length);
        } while (usedCheckInIndices.includes(idx));
        usedCheckInIndices.push(idx);
        return checkInMessages[idx];
    }

    /**
     * Fire a proactive check-in if conditions are met.
     * Conditions:
     *  - User is NOT actively typing
     *  - No bot message was sent in the last 30 seconds
     *  - Session check-in count has not exceeded MAX_CHECKINS_PER_SESSION
     */
    function triggerProactiveCheckIn() {
        if (isUserTyping) return; // Don't interrupt typing
        if (checkInCount >= MAX_CHECKINS_PER_SESSION) return; // Session cap hit
        if (Date.now() - lastBotMessageTime < 30000) return; // Bot spoke recently

        let msg = null;
        try {
            const tasks = JSON.parse(localStorage.getItem('zyviora_tasks')) || [];
            const pendingTasks = tasks.filter(t => t.status === 'pending');
            // 50% chance to suggest a task if any exist
            if (pendingTasks.length > 0 && Math.random() > 0.5) {
                msg = "You have pending tasks, want to tackle one? 😊";
            } else if (checkInCount === 1 && Math.random() > 0.5) {
                msg = "You've been working a lot, take a break? 🌿";
            }
        } catch(e) {}
        
        if (!msg) {
            msg = getUniqueCheckIn();
        }

        checkInCount++;
        appendBotMessageTracked(msg);

        // If cap not reached, schedule next check-in
        if (checkInCount < MAX_CHECKINS_PER_SESSION) {
            scheduleNextCheckIn();
        }
    }

    /**
     * Schedule the next idle check-in with a random delay between MIN and MAX.
     */
    function scheduleNextCheckIn() {
        if (idleTimer) clearTimeout(idleTimer);
        const delay = MIN_IDLE_MS + Math.random() * (MAX_IDLE_MS - MIN_IDLE_MS);
        idleTimer = setTimeout(triggerProactiveCheckIn, delay);
    }

    /**
     * Reset the idle timer on any meaningful user interaction.
     */
    function resetIdleTimer() {
        scheduleNextCheckIn();
    }

    // Detect when user starts/stops typing to avoid interruption
    userInput.addEventListener('keydown', () => {
        isUserTyping = true;
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { isUserTyping = false; }, 3000);
    });

    // Reset idle timer on any click or keypress globally
    document.addEventListener('click', resetIdleTimer);
    document.addEventListener('keypress', resetIdleTimer);

    // Kick off the first check-in timer on load
    scheduleNextCheckIn();


    // --- Native Browser Voice Integration (Web Speech API) ---
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = function() {
            isRecording = true;
            micBtn.classList.add('recording-active');
            userInput.placeholder = "Listening... speak now.";
        };

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            // Instantly fill the input and simulate sending
            userInput.value = transcript;
            handleUserMessage();
        };

        recognition.onerror = function(event) {
            console.error('Speech recognition error', event.error);
            stopRecordingUI();
            userInput.placeholder = "Error hearing you. Please try again.";
        };

        recognition.onend = function() {
            stopRecordingUI();
        };
    } else {
        console.warn("Speech Recognition API not supported in this browser.");
    }

    function stopRecordingUI() {
        isRecording = false;
        micBtn.classList.remove('recording-active');
        if (isVoiceModeActive) {
            userInput.placeholder = "Click the mic icon to speak, or type...";
        } else {
            userInput.placeholder = "Type your message to Zyviora...";
        }
    }
    
    toggleVoiceBtn.addEventListener('click', () => {
        closeMobileSidebarDrawer();
        isVoiceModeActive = !isVoiceModeActive;
        toggleVoiceBtn.classList.toggle('active');
        
        if (isVoiceModeActive) {
            micBtn.classList.remove('recording-hidden');
            userInput.placeholder = "Click the mic icon to speak, or type...";
            if (!SpeechRecognition) {
                userInput.placeholder = "Speech API not supported in your browser.";
            }
            // Prime speech synthesis on user interaction (resolves browser autoplay policy)
            if (window.speechSynthesis) window.speechSynthesis.getVoices();
        } else {
            micBtn.classList.add('recording-hidden');
            userInput.placeholder = "Type your message to Zyviora...";
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        }
    });

    micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isVoiceModeActive || !recognition) return;
        
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    // Native Text-to-Speech Engine
    function speakText(text) {
        if (!isVoiceModeActive || !window.speechSynthesis) return;

        // Strip simple html/markdown artifacts if any
        const cleanText = text.replace(/<[^>]*>?/gm, '');

        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        // Find a warm conversational voice
        const voices = window.speechSynthesis.getVoices();
        const idealVoice = voices.find(voice => 
            voice.name.includes('Female') || 
            voice.name.includes('Zira') || 
            voice.name.includes('Google US English')
        );
        if (idealVoice) {
            utterance.voice = idealVoice;
        }
        
        utterance.rate = 1.0;
        utterance.pitch = 1.1; // Slightly friendly tone
        
        window.speechSynthesis.speak(utterance);
    }

    // =========================================================
    // GAMES — Sidebar Button & Context Trigger
    // =========================================================

    // Sidebar "Play a Game" button
    openGamesBtn.addEventListener('click', () => {
        closeMobileSidebarDrawer();
        appendBotMessageTracked("Sure! Let's play something! 🎮 Pick a game:");
        setTimeout(() => showGamePicker(chatWindow, appendBotMessageTracked), 400);
    });

});

// =========================================================
// ADVANCED UI/UX REVAMP SCRIPTS (Cursor, Emotion Pills, Sidebar Toggle)
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cursor Glow Follower
    const cursorGlow = document.getElementById('cursor-glow');
    if (cursorGlow && window.matchMedia('(pointer: fine)').matches) {
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        
        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        // Request animation frame loop for lag-free cursor
        function updateCursor() {
            cursorGlow.style.left = mouseX + 'px';
            cursorGlow.style.top = mouseY + 'px';
            requestAnimationFrame(updateCursor);
        }
        updateCursor();

        // Magnetic hover effect
        const interactiveElements = document.querySelectorAll('button, a, .control-item, .emotion-pill, input');
        interactiveElements.forEach(el => {
            el.addEventListener('mouseenter', () => cursorGlow.classList.add('magnetic'));
            el.addEventListener('mouseleave', () => cursorGlow.classList.remove('magnetic'));
        });
    }

    // 2. Sidebar Toggle
    // This file has two independent DOMContentLoaded listeners (this is the
    // second one) — they don't share scope, so the toggleSidebarBtn/sidebar
    // consts declared near the top for closeMobileSidebarDrawer() aren't
    // visible here; re-fetching the same DOM elements locally is harmless.
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');

            // .collapsed means "shrunk to icon rail" on desktop but "open
            // as an off-canvas drawer" on mobile (see the 768px media
            // query) — so which icon reads as "sidebar is open" flips too.
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            const isCollapsed = sidebar.classList.contains('collapsed');
            const sidebarVisuallyOpen = isMobile ? isCollapsed : !isCollapsed;

            const icon = toggleSidebarBtn.querySelector('.material-icons');
            icon.textContent = sidebarVisuallyOpen ? 'menu_open' : 'menu';
        });
    }

    // 3. Emotion Selector Pills
    const emotionPills = document.querySelectorAll('.emotion-pill');
    emotionPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const emotion = pill.getAttribute('data-emotion');
            const userInput = document.getElementById('user-input');
            const sendBtn = document.getElementById('send-btn');
            
            userInput.value = 'I am feeling ' + emotion;
            // Instantly send it
            sendBtn.click();
        });
    });

    // 4. Input Focus Glow
    const userInput = document.getElementById('user-input');
    if (userInput) {
        const pillContainer = userInput.closest('.floating-input-pill');
        if (pillContainer) {
            userInput.addEventListener('focus', () => pillContainer.classList.add('focus-glow'));
            userInput.addEventListener('blur', () => pillContainer.classList.remove('focus-glow'));
        }
    }
    
    // 5. Placeholder Typewriter Animation
    const placeholders = [
        'Ask me anything...',
        'How are you feeling today?',
        'Need a productivity tip?',
        'Message Zyviora...'
    ];
    let pIdx = 0;
    
    // Periodically swap placeholder text if input is empty and not focused
    setInterval(() => {
        if (userInput && document.activeElement !== userInput && userInput.value === '' && !document.getElementById('mic-btn').classList.contains('recording-active')) {
            pIdx = (pIdx + 1) % placeholders.length;
            userInput.placeholder = placeholders[pIdx];
        }
    }, 4000);
});

