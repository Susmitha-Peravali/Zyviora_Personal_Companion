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
    // Learning-resources/help buttons (sidebar) — explicit, clickable entry
    // points for capabilities that otherwise only worked if a user
    // happened to type the right phrase, with no way to discover they
    // existed at all (the exact gap "Play a Game" already avoided by
    // having a real button instead of relying only on "I'm bored").
    const openLearnBtn = document.getElementById('open-learn-btn');
    const openHelpBtn = document.getElementById('open-help-btn');
    // When true, the next message the user sends is treated as a raw
    // learning topic directly (searchLearningResources), bypassing
    // extractLearningTopic's phrase-matching entirely — so clicking the
    // button and then typing literally anything ("cooking", "how planes
    // fly") works, no specific wording required.
    let awaitingLearningTopic = false;

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
    // These three were declared down in the "PROACTIVE CHECK-IN SYSTEM"
    // section, but resetIdleTimer() -> scheduleNextCheckIn() (which needs
    // them) runs from handleUserMessage() on every message send — reachable
    // the instant a user types something, well before the script has
    // finished its first synchronous pass. Same trap as above: silently
    // aborted handleUserMessage() entirely (not just the idle timer) for
    // anyone fast enough to send a message right after page load. Found by
    // the same class of bug hitting REMINDER_STORAGE_KEY below, where a
    // try/catch happened to swallow the ReferenceError instead of
    // surfacing it — this one had no such catch.
    const MIN_IDLE_MS = 2 * 60 * 1000; // 2 minutes minimum idle
    const MAX_IDLE_MS = 5 * 60 * 1000; // 5 minutes maximum idle
    const MAX_CHECKINS_PER_SESSION = 2;  // Hard cap to avoid annoyance
    // Likewise: getStatusBriefing() (called synchronously from
    // bootZyviora(), itself called during the script's first pass) reads
    // this via loadReminders() — declared up here for the same reason.
    const REMINDER_STORAGE_KEY = 'zyviora_reminders';

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
        const isFirstEverSession = sessions.length === 0;
        sessions.unshift({ id: activeSessionId, title: 'New Chat', timestamp: Date.now(), messages: [] });
        saveChatSessions(sessions);
        updateChatHeader();

        // Time-aware greeting
        const ctx = getTimeContext();
        appendBotMessageTracked(timeGreetings[ctx], true);

        // First session ever — most of the sidebar's capabilities aren't
        // obvious on sight, and previously there was no way to discover
        // them short of guessing the right phrase to type.
        if (isFirstEverSession) {
            setTimeout(() => appendBotMessageTracked(
                'New here? Click "What Can I Do?" in the sidebar any time to see everything I can help with 💙', true
            ), 900);
        }
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

        // negative: true routes the caller to an actionable care
        // recommendation (see showCareRecommendation) instead of a passive
        // observation that names the problem and then goes nowhere.
        if (negCount >= 3) return { negative: true, text: "I've noticed you've been feeling a bit down lately. That's completely okay — but please know you can always talk to me about it. 💙" };
        if (posCount >= 4) return { negative: false, text: "You've been in such a great mood recently! That makes me really happy. Keep it up! 🌟" };
        return null;
    }

    // =========================================================
    // MODULE 3B: PROACTIVE CARE (Baymax-style wellbeing check-ins)
    // Distinct from the severe CRISIS_KEYWORDS safety net (Layer 2 in
    // handleUserMessage, which hijacks the whole response with hotline
    // info) — this catches everyday stress language during normal
    // conversation, lets the AI reply as usual, and layers a caring,
    // actionable follow-up on top shortly after. Rate-limited so it
    // doesn't repeat on every message that happens to mention "tired".
    // =========================================================
    const EVERYDAY_DISTRESS_KEYWORDS = [
        'stressed', 'stressed out', 'so anxious', 'anxious', 'anxiety',
        'overwhelmed', 'exhausted', 'burnt out', 'burned out',
        "can't sleep", 'cant sleep', 'panic attack', 'panicking',
        'rough day', 'terrible day', 'awful day', 'bad day', 'i feel awful',
        'feeling awful', 'so much pressure', "can't cope", 'cant cope'
    ];
    const DISTRESS_CHECKIN_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes

    function tryHandleEverydayDistress(text) {
        const lower = text.toLowerCase();
        if (!EVERYDAY_DISTRESS_KEYWORDS.some(kw => lower.includes(kw))) return;

        const lastTs = getMemory('lastDistressCheckInTs') || 0;
        if (Date.now() - lastTs < DISTRESS_CHECKIN_COOLDOWN_MS) return; // don't pile on

        saveMemory({ lastDistressCheckInTs: Date.now() });
        // Let the normal AI reply land first, then layer the proactive care
        // on top rather than competing with it for the same moment.
        setTimeout(() => showCareRecommendation('distress'), 2200);
    }

    /**
     * A Baymax-style caring follow-up with concrete next steps, rather than
     * just naming the problem and going nowhere. Reused both for
     * in-conversation distress language and for a declining mood trend
     * detected on boot.
     */
    function showCareRecommendation(reason) {
        const openers = {
            distress: "I noticed that sounded like a lot to carry. 💙 I'm here — want to do one of these?",
            trend: "I've noticed you've been feeling a bit down lately. That's completely okay — but let's do something about it together. 💙"
        };

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';

        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';

        const question = document.createElement('p');
        question.textContent = openers[reason] || openers.distress;
        bubble.appendChild(question);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;';

        const options = [
            { label: "Let's talk about it 💬", action: () => {
                bubble.querySelectorAll('button').forEach(b => b.disabled = true);
                appendBotMessageTracked("I'm listening — go ahead, tell me what's going on. Take your time.");
            }},
            { label: 'Try a breathing exercise 🌬️', action: () => {
                bubble.querySelectorAll('button').forEach(b => b.disabled = true);
                startBreathingExercise();
            }},
            { label: "I'm okay, just needed to vent 👍", action: () => {
                bubble.querySelectorAll('button').forEach(b => b.disabled = true);
                appendBotMessageTracked("I'm glad you told me anyway — that matters. I'm always here if that changes. 💙");
            }}
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt.label;
            btn.style.cssText = 'padding:8px 16px;border-radius:20px;border:1px solid rgba(0,0,0,0.1);background:rgba(255,255,255,0.9);color:#1a1a2e;cursor:pointer;font-size:0.85rem;font-weight:600;box-shadow:0 4px 10px rgba(0,0,0,0.05);transition:transform 0.2s;';
            btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
            btn.onmouseout = () => btn.style.transform = 'scale(1)';
            btn.addEventListener('click', opt.action);
            btnRow.appendChild(btn);
        });

        bubble.appendChild(btnRow);
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        lastBotMessageTime = Date.now();
    }

    /**
     * Guided breathing exercise: a Baymax-style calming tool, not a game —
     * no win/lose, just a slow inhale/hold/exhale cycle with a visual
     * pace-setter, since "just calm down" rarely works but something to
     * actually follow along with does.
     */
    function startBreathingExercise() {
        const TOTAL_CYCLES = 4;
        const PHASES = [
            { name: 'inhale', label: 'Breathe in...', ms: 4000 },
            { name: 'hold',   label: 'Hold...',        ms: 4000 },
            { name: 'exhale', label: 'Breathe out...', ms: 4000 }
        ];

        const container = document.createElement('div');
        container.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';

        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';
        bubble.innerHTML = `
            <p style="font-weight:600;margin-bottom:4px;color:#1a1a2e;">🌬️ Let's breathe together</p>
            <div class="breathing-circle-wrap">
                <div class="breathing-progress" id="breath-progress">Cycle 1 of ${TOTAL_CYCLES}</div>
                <div class="breathing-circle" id="breath-circle"></div>
                <div class="breathing-text" id="breath-text">Get comfortable...</div>
                <button class="breathing-skip-btn" id="breath-skip">I'm done, thanks</button>
            </div>
        `;
        container.appendChild(avatar);
        container.appendChild(bubble);
        chatWindow.appendChild(container);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        const circle = bubble.querySelector('#breath-circle');
        const textEl = bubble.querySelector('#breath-text');
        const progressEl = bubble.querySelector('#breath-progress');
        const skipBtn = bubble.querySelector('#breath-skip');

        let cycle = 0, phaseIdx = 0, stepTimer = null, stopped = false;

        function finish(early) {
            stopped = true;
            if (stepTimer) clearTimeout(stepTimer);
            skipBtn.disabled = true;
            textEl.textContent = early ? 'No worries — take care of yourself. 💙' : 'Well done! 🌟';
            setTimeout(() => appendBotMessageTracked(
                early
                    ? "That's okay, even a few breaths help. I'm still here whenever you need me. 💙"
                    : "Great job sticking with that! I hope that helped even a little. How are you feeling now? 💙"
            ), 600);
        }

        skipBtn.addEventListener('click', () => finish(true));

        function step() {
            if (stopped) return;
            if (cycle >= TOTAL_CYCLES) { finish(false); return; }

            const phase = PHASES[phaseIdx];
            circle.className = 'breathing-circle ' + phase.name;
            textEl.textContent = phase.label;
            progressEl.textContent = `Cycle ${cycle + 1} of ${TOTAL_CYCLES}`;
            chatWindow.scrollTop = chatWindow.scrollHeight;

            stepTimer = setTimeout(() => {
                phaseIdx++;
                if (phaseIdx >= PHASES.length) {
                    phaseIdx = 0;
                    cycle++;
                }
                step();
            }, phase.ms);
        }

        setTimeout(step, 800);
        lastBotMessageTime = Date.now();
    }

    // =========================================================
    // MODULE 3C: PROACTIVE STATUS BRIEFING (Jarvis-style)
    // Surfaces what actually matters right now when you open chat, instead
    // of making you go check the dashboard for it. Gated to once per day
    // (like the mood check) so it's a useful heads-up, not a nag.
    // =========================================================
    function shouldShowDailyBriefing() {
        return getMemory('lastBriefingDate') !== new Date().toDateString();
    }

    function getStatusBriefing() {
        const pendingTasks = loadTasks().filter(t => t.status === 'pending');
        const reminders = loadReminders();
        const parts = [];
        if (pendingTasks.length > 0) {
            parts.push(`${pendingTasks.length} pending task${pendingTasks.length === 1 ? '' : 's'}`);
        }
        if (reminders.length > 0) {
            parts.push(`${reminders.length} active reminder${reminders.length === 1 ? '' : 's'}`);
        }
        if (parts.length === 0) return null; // nothing to report — stay quiet

        let msg = `📋 Quick briefing: you have ${parts.join(' and ')}.`;
        if (reminders.length > 0) {
            const nearest = reminders.reduce((a, b) => a.triggerAt < b.triggerAt ? a : b);
            const mins = Math.round((nearest.triggerAt - Date.now()) / 60000);
            if (mins > 0 && mins < 180) {
                msg += ` Next up: "${nearest.task}" in about ${mins} minute${mins === 1 ? '' : 's'}.`;
            }
        }
        return msg;
    }

    /**
     * If the most recent mood log entry is from a prior day (not today) and
     * was low/sad, and we haven't already followed up on it today, this is
     * Baymax's "I will not stop caring" trait: check back in rather than
     * asking the exact same daily-mood question again as if nothing had
     * been said.
     */
    function getYesterdaysLowFollowUp() {
        const log = loadMoodLog();
        if (log.length === 0) return null;
        const last = log[log.length - 1];
        const today = new Date().toDateString();
        if (last.date === today) return null; // already logged today
        if (!['low', 'sad'].includes(last.mood)) return null;

        const lastFollowUpDate = getMemory('lastMoodFollowUpDate');
        if (lastFollowUpDate === today) return null; // already followed up today

        return last;
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
    // MODULE 7.6: WELLNESS — direct request for the breathing exercise
    // (the same tool showCareRecommendation's button leads to, but
    // reachable without waiting for Zyviora to notice something first)
    // =========================================================
    function tryHandleWellnessRequest(text) {
        if (/(?:breathing exercise|help me (?:relax|breathe|calm down)|calm me down|calm down|need to relax|de-?stress me?)/i.test(text)) {
            appendBotMessageTracked("Of course — let's slow things down together. 💙");
            setTimeout(() => startBreathingExercise(), 500);
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
    // MODULE 10: CURATED LEARNING RESOURCES
    // Deliberately backed by a real search (YouTube Data API, see
    // /api/learning-resources in app.py) rather than asking Gemini to name
    // videos itself — an LLM has no way to know a title/link it invents
    // actually exists, and a "helpful" dead link is worse than none.
    // =========================================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * A plain-language reference for every capability that only worked if
     * a user happened to type the right phrase — tasks, reminders, goals,
     * wellness, and learning all fall into this category (games and voice
     * mode already have their own sidebar buttons, so they're mentioned
     * only briefly). Triggered by the "What Can I Do?" sidebar button, and
     * also directly by typing a help request, so it's reachable either way.
     */
    function showCapabilitiesHelp() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';
        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';
        bubble.innerHTML = `
            <p style="font-weight:600;margin-bottom:10px;">Here's everything I can help with 💙</p>
            <ul style="padding-left:0;list-style:none;display:flex;flex-direction:column;gap:10px;font-size:0.88rem;line-height:1.5;">
                <li>📚 <strong>Learn something</strong> — click "Learn Something" in the sidebar, or just say what you want to learn (e.g. "I want to learn photography"). I'll find real videos, and can build you a step-by-step Skill Path.</li>
                <li>🎯 <strong>Tasks</strong> — "add task: buy groceries", "show my tasks", "mark task 1 as done".</li>
                <li>⏰ <strong>Reminders</strong> — "remind me to call mom in 20 minutes" or "...at 5pm".</li>
                <li>🌱 <strong>Goals</strong> — "my goal is to exercise daily", then "I completed exercise daily" when you do it.</li>
                <li>🌬️ <strong>Feeling stressed?</strong> — say "I need to relax" anytime for a guided breathing exercise, or I'll gently offer one if I notice you seem overwhelmed.</li>
                <li>🎮 <strong>Games</strong> — click "Play a Game" in the sidebar, or say "I'm bored".</li>
                <li>🎤 <strong>Voice Mode</strong> — click it in the sidebar to talk instead of type.</li>
                <li>📊 <strong>Dashboard</strong> — click it in the sidebar to see your mood history, goals, tasks, reminders, and skill paths all in one place.</li>
            </ul>
        `;
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        addMessageToHistory(bubble.innerHTML, 'bot', true);
        lastBotMessageTime = Date.now();
    }

    function tryHandleHelpRequest(text) {
        if (/^(?:help|what can (?:you|i) do|what can zyviora do|show (?:me )?(?:your |the )?(?:features|capabilities|commands))\??$/i.test(text.trim())) {
            showCapabilitiesHelp();
            return true;
        }
        return false;
    }

    function extractLearningTopic(text) {
        // Verb-first phrasings ("teach me X") capture the topic as
        // everything AFTER the trigger phrase.
        const verbFirstPatterns = [
            /^teach me(?: about)?\s+(.+)/i,
            /^i want to learn(?: about)?\s+(.+)/i,
            /^how (?:do|can) i learn\s+(.+)/i,
            /^help me learn\s+(.+)/i,
            /^resources (?:for|on|about)\s+(.+)/i,
            /^learning resources (?:for|on|about)\s+(.+)/i,
            /^where can i learn\s+(.+)/i,
            /^how to learn\s+(.+)/i,
            /^find (?:me )?(?:some )?(?:videos|tutorials) (?:for|on|about)\s+(.+)/i,
            /^(?:show|find|get) me\s+(.+?)\s+(?:videos|tutorials)$/i,
        ];
        for (const re of verbFirstPatterns) {
            const m = text.match(re);
            if (m && m[1]) {
                const topic = m[1].trim().replace(/[?.!]+$/, '');
                if (topic.length > 0 && topic.length <= 200) return topic;
            }
        }

        // Topic-first phrasings ("guitar on youtube", "python tutorial") —
        // just as natural a way to ask, especially as a quick follow-up to
        // an earlier request, but structurally the reverse of the above:
        // the topic comes BEFORE the trigger phrase, not after.
        const topicFirstPatterns = [
            /^(.+?)\s+on youtube$/i,
            /^(.+?)\s+tutorials?$/i,
            /^(.+?)\s+videos? on youtube$/i,
        ];
        for (const re of topicFirstPatterns) {
            const m = text.match(re);
            if (m && m[1]) {
                const topic = m[1].trim().replace(/[?.!]+$/, '');
                if (topic.length > 0 && topic.length <= 200) return topic;
            }
        }
        return null;
    }

    function renderResourceCards(bubble, topic, videos) {
        const safeTopic = escapeHtml(topic);
        let html = `<p style="margin-bottom:10px;">📚 Here's what I found on "<strong>${safeTopic}</strong>":</p>`;
        html += '<div style="display:flex;flex-direction:column;gap:10px;">';
        videos.forEach(v => {
            const safeTitle = escapeHtml(v.title || 'Untitled');
            const safeChannel = escapeHtml(v.channel || '');
            const safeUrl = escapeHtml(v.url || '#');
            const thumb = v.thumbnail ? escapeHtml(v.thumbnail) : '';
            html += `
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:flex;gap:10px;text-decoration:none;color:inherit;background:rgba(255,255,255,0.6);border-radius:14px;padding:8px;border:1px solid rgba(0,0,0,0.06);transition:transform 0.15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    ${thumb ? `<img src="${thumb}" alt="" style="width:100px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0;">` : ''}
                    <div style="min-width:0;">
                        <div style="font-weight:600;font-size:0.88rem;color:#1a1a2e;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${safeTitle}</div>
                        <div style="font-size:0.76rem;color:#6b7280;margin-top:2px;">${safeChannel}</div>
                    </div>
                </a>`;
        });
        html += '</div>';
        bubble.innerHTML = html;

        // Offer to turn this into a structured, trackable Skill Path
        // rather than a one-off video list — the confidence-building part
        // of "help people learn things" needs visible progress, not just
        // a link.
        const offerRow = document.createElement('div');
        offerRow.style.cssText = 'margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
        const offerText = document.createElement('span');
        offerText.style.cssText = 'font-size:0.78rem;color:#6b7280;';
        offerText.textContent = 'Want a structured path to actually learn this?';
        const offerBtn = document.createElement('button');
        offerBtn.textContent = '🎯 Turn this into a Skill Path';
        offerBtn.style.cssText = 'padding:6px 14px;border-radius:16px;border:1px solid rgba(106,0,255,0.2);background:rgba(106,0,255,0.08);color:var(--primary-color);cursor:pointer;font-size:0.78rem;font-weight:600;';
        offerBtn.addEventListener('click', () => {
            offerRow.remove();
            startSkillPath(topic);
        });
        offerRow.appendChild(offerText);
        offerRow.appendChild(offerBtn);
        bubble.appendChild(offerRow);
    }

    // =========================================================
    // MODULE 11: SKILL PATHS (structured, trackable learning journeys)
    // A curated resource list answers "show me something" — this answers
    // "help me actually get good at this": an ordered sequence of steps
    // (from Gemini, which is reliable at structuring a curriculum) with a
    // real resource per step (from the YouTube search above, fetched
    // lazily per step rather than all 5 upfront) and visible progress.
    // =========================================================
    const SKILL_PATHS_KEY = 'zyviora_skill_paths';

    function loadSkillPaths() {
        try { return JSON.parse(localStorage.getItem(SKILL_PATHS_KEY)) || []; }
        catch { return []; }
    }

    function saveSkillPaths(paths) {
        localStorage.setItem(SKILL_PATHS_KEY, JSON.stringify(paths));
    }

    function startSkillPath(topic) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar thinking';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';
        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';
        bubble.innerHTML = `<p>🎯 Building a learning path for "${escapeHtml(topic)}"...</p><div class="typing-dots"><span></span><span></span><span></span></div>`;
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        fetch('/api/skill-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
            body: JSON.stringify({ topic })
        })
        .then(r => r.json())
        .then(data => {
            avatar.classList.remove('thinking');
            if (data.status === 'success' && data.steps && data.steps.length > 0) {
                const path = {
                    id: 'path_' + Date.now(),
                    topic,
                    createdAt: Date.now(),
                    steps: data.steps.map(s => ({
                        title: s.title,
                        searchQuery: s.search_query,
                        completed: false,
                        resource: null // fetched lazily when the step is opened
                    }))
                };
                const paths = loadSkillPaths();
                paths.push(path);
                saveSkillPaths(paths);
                renderSkillPathChecklist(bubble, path.id);
                addMessageToHistory(bubble.innerHTML, 'bot', true);
            } else if (data.status === 'unconfigured') {
                bubble.innerHTML = `I'd love to build you a full path, but that needs my AI connection configured, which isn't set up yet. The video list above is still a solid start though! 💙`;
                addMessageToHistory(bubble.innerHTML, 'bot', true);
            } else {
                bubble.innerHTML = `I couldn't put a learning path together right now. Want to try again in a moment?`;
                addMessageToHistory(bubble.innerHTML, 'bot', true);
            }
            lastBotMessageTime = Date.now();
            chatWindow.scrollTop = chatWindow.scrollHeight;
        })
        .catch(() => {
            avatar.classList.remove('thinking');
            bubble.innerHTML = `I couldn't reach my planning brain right now. Please try again in a moment.`;
            addMessageToHistory(bubble.innerHTML, 'bot', true);
        });
    }

    /**
     * Renders the checklist UI for a skill path into an existing bubble.
     * Re-callable (e.g. after marking a step complete) since it always
     * re-reads the current path state from storage rather than trusting a
     * stale closure over the steps array.
     */
    function renderSkillPathChecklist(bubble, pathId) {
        const paths = loadSkillPaths();
        const path = paths.find(p => p.id === pathId);
        if (!path) return;

        const doneCount = path.steps.filter(s => s.completed).length;
        const pct = Math.round((doneCount / path.steps.length) * 100);

        let html = `<p style="font-weight:600;margin-bottom:4px;color:#1a1a2e;">🎯 ${escapeHtml(path.topic)}</p>`;
        html += `<div style="height:6px;background:rgba(0,0,0,0.08);border-radius:3px;margin-bottom:4px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--primary-gradient);transition:width 0.4s;"></div></div>`;
        html += `<p style="font-size:0.75rem;color:#6b7280;margin-bottom:10px;">${doneCount} of ${path.steps.length} steps complete</p>`;
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';

        path.steps.forEach((step, i) => {
            const checkColor = step.completed ? '#00b894' : 'rgba(0,0,0,0.2)';
            html += `
                <div class="skill-step" data-step-index="${i}" style="border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,0.55);">
                    <div class="skill-step-header" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <span class="material-icons" style="color:${checkColor};font-size:20px;">${step.completed ? 'check_circle' : 'radio_button_unchecked'}</span>
                        <span style="flex:1;min-width:0;font-size:0.88rem;font-weight:600;color:#1a1a2e;${step.completed ? 'text-decoration:line-through;opacity:0.65;' : ''}">${i + 1}. ${escapeHtml(step.title)}</span>
                        <span class="material-icons skill-step-chevron" style="font-size:18px;color:#6b7280;">expand_more</span>
                    </div>
                    <div class="skill-step-body" style="display:none;margin-top:8px;padding-left:30px;"></div>
                </div>`;
        });
        html += '</div>';
        bubble.innerHTML = html;

        bubble.querySelectorAll('.skill-step').forEach(stepEl => {
            const idx = parseInt(stepEl.getAttribute('data-step-index'), 10);
            const header = stepEl.querySelector('.skill-step-header');
            const body = stepEl.querySelector('.skill-step-body');
            const chevron = stepEl.querySelector('.skill-step-chevron');

            header.addEventListener('click', () => {
                const isOpen = body.style.display !== 'none';
                if (isOpen) {
                    body.style.display = 'none';
                    chevron.textContent = 'expand_more';
                    return;
                }
                body.style.display = 'block';
                chevron.textContent = 'expand_less';
                chatWindow.scrollTop = chatWindow.scrollHeight;
                loadOrShowStepResource(bubble, pathId, idx, body);
            });
        });
    }

    function loadOrShowStepResource(bubble, pathId, stepIndex, bodyEl) {
        const paths = loadSkillPaths();
        const path = paths.find(p => p.id === pathId);
        if (!path) return;
        const step = path.steps[stepIndex];

        function renderStepBody() {
            const resourceHtml = step.resource
                ? `<a href="${escapeHtml(step.resource.url)}" target="_blank" rel="noopener noreferrer" style="display:flex;gap:8px;text-decoration:none;color:inherit;background:rgba(255,255,255,0.7);border-radius:10px;padding:6px;">
                        ${step.resource.thumbnail ? `<img src="${escapeHtml(step.resource.thumbnail)}" alt="" style="width:80px;height:45px;object-fit:cover;border-radius:6px;flex-shrink:0;">` : ''}
                        <div style="min-width:0;"><div style="font-size:0.8rem;font-weight:600;color:#1a1a2e;">${escapeHtml(step.resource.title)}</div><div style="font-size:0.72rem;color:#6b7280;">${escapeHtml(step.resource.channel)}</div></div>
                   </a>`
                : '<p style="font-size:0.8rem;color:#6b7280;">No video found for this step — try searching it directly.</p>';

            const completeLabel = step.completed ? '↺ Mark as not done' : '✓ Mark step complete';
            bodyEl.innerHTML = `${resourceHtml}<button class="skill-step-toggle" style="margin-top:8px;padding:5px 12px;border-radius:14px;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#1a1a2e;cursor:pointer;font-size:0.76rem;">${completeLabel}</button>`;
            bodyEl.querySelector('.skill-step-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSkillStep(pathId, stepIndex);
                renderSkillPathChecklist(bubble, pathId);
                addMessageToHistory(bubble.innerHTML, 'bot', true);
            });
        }

        if (step.resource !== null) {
            renderStepBody();
            return;
        }

        bodyEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        fetch('/api/learning-resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
            body: JSON.stringify({ topic: step.searchQuery })
        })
        .then(r => r.json())
        .then(data => {
            const freshPaths = loadSkillPaths();
            const freshPath = freshPaths.find(p => p.id === pathId);
            if (!freshPath) return;
            const freshStep = freshPath.steps[stepIndex];
            freshStep.resource = (data.status === 'success' && data.videos && data.videos[0]) ? data.videos[0] : { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(step.searchQuery)}`, title: 'Search on YouTube', channel: '', thumbnail: '' };
            saveSkillPaths(freshPaths);
            step.resource = freshStep.resource;
            renderStepBody();
        })
        .catch(() => {
            bodyEl.innerHTML = '<p style="font-size:0.8rem;color:#6b7280;">Couldn\'t load a resource for this step right now.</p>';
        });
    }

    function tryHandleSkillPathList(text) {
        const trimmed = text.trim();
        const skillPathPatterns = [
            /^(?:show|list|view|see)\s+my\s+(?:skill paths|learning paths|skills)\b/i,
            /^(?:show|list|view|see)\s+(?:skill paths|learning paths|skills)\b/i,
            /^my\s+(?:skill paths|learning paths)\b/i,
        ];
        if (!skillPathPatterns.some(re => re.test(trimmed))) return false;

        const paths = loadSkillPaths();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';
        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';

        if (paths.length === 0) {
            bubble.innerHTML = `You don't have any skill paths yet — try "I want to learn [something]" and I'll offer to build one! 🎯`;
        } else {
            let listHtml = '<p style="font-weight:600;margin-bottom:8px;">🎯 Your skill paths:</p><div style="display:flex;flex-direction:column;gap:6px;">';
            paths.forEach(p => {
                const done = p.steps.filter(s => s.completed).length;
                listHtml += `<button class="skill-path-open" data-path-id="${p.id}" style="text-align:left;padding:8px 12px;border-radius:10px;border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.6);cursor:pointer;font-size:0.85rem;color:#1a1a2e;">${escapeHtml(p.topic)} — ${done}/${p.steps.length} steps</button>`;
            });
            listHtml += '</div>';
            bubble.innerHTML = listHtml;
        }

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        bubble.querySelectorAll('.skill-path-open').forEach(btn => {
            btn.addEventListener('click', () => {
                renderSkillPathChecklist(bubble, btn.getAttribute('data-path-id'));
                addMessageToHistory(bubble.innerHTML, 'bot', true);
            });
        });

        addMessageToHistory(bubble.innerHTML, 'bot', true);
        lastBotMessageTime = Date.now();
        return true;
    }

    function toggleSkillStep(pathId, stepIndex) {
        const paths = loadSkillPaths();
        const path = paths.find(p => p.id === pathId);
        if (!path) return;
        const step = path.steps[stepIndex];
        step.completed = !step.completed;
        saveSkillPaths(paths);
        if (step.completed) {
            const doneCount = path.steps.filter(s => s.completed).length;
            if (doneCount === path.steps.length) {
                setTimeout(() => appendBotMessageTracked(`🎉 You completed the entire "${path.topic}" path! That's real progress — I'm proud of you.`), 400);
            }
        }
    }

    function tryHandleLearningResources(text) {
        const topic = extractLearningTopic(text);
        if (!topic) return false;
        searchLearningResources(topic);
        return true;
    }

    /**
     * Runs the actual search for a given topic, no phrase-matching
     * involved — used both by tryHandleLearningResources (once a trigger
     * phrase is recognized) and directly by the "Learn Something" sidebar
     * button, so a user doesn't need to know or guess any specific wording
     * to use this feature at all.
     */
    function searchLearningResources(topic) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot-message';
        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar thinking';
        avatar.innerHTML = '<img src="/static/bot_avatar.png" alt="Zyviora" />';
        const bubble = document.createElement('div');
        bubble.className = 'bubble glass-panel';
        bubble.innerHTML = `<p style="margin-bottom:8px;">🔎 Looking up good resources on "${escapeHtml(topic)}"...</p><div class="typing-dots"><span></span><span></span><span></span></div>`;
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        const searchLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}`;

        fetch('/api/learning-resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
            body: JSON.stringify({ topic })
        })
        .then(r => r.json())
        .then(data => {
            avatar.classList.remove('thinking');
            if (data.status === 'success' && data.videos && data.videos.length > 0) {
                renderResourceCards(bubble, topic, data.videos);
            } else if (data.status === 'unconfigured') {
                bubble.innerHTML = `I'd love to pull up real videos on that, but my learning-resources connection isn't set up yet. You can search directly here for now: <a href="${searchLink}" target="_blank" rel="noopener noreferrer">${escapeHtml(topic)} on YouTube</a>`;
            } else {
                bubble.innerHTML = `Hmm, I couldn't find resources for that right now. Want to try a different topic, or <a href="${searchLink}" target="_blank" rel="noopener noreferrer">search directly on YouTube</a>?`;
            }
            addMessageToHistory(bubble.innerHTML, 'bot', true);
            lastBotMessageTime = Date.now();
            chatWindow.scrollTop = chatWindow.scrollHeight;
        })
        .catch(() => {
            avatar.classList.remove('thinking');
            bubble.innerHTML = `I couldn't reach my resource search right now. Please try again in a moment, or <a href="${searchLink}" target="_blank" rel="noopener noreferrer">search directly on YouTube</a>.`;
            addMessageToHistory(bubble.innerHTML, 'bot', true);
        });
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

        // Layer 0: pending guided input from a sidebar button (see
        // "Learn Something") — takes priority over every phrase-matching
        // layer below since the user already told us their intent by
        // clicking; whatever they type next IS the topic, not something
        // that needs to look like a specific command.
        if (awaitingLearningTopic) {
            awaitingLearningTopic = false;
            searchLearningResources(text);
            return;
        }

        // --- Layer 1: Frontend-only intercepts (no backend round-trip needed) ---
        if (tryHandleSystemCommand(text)) return;
        if (tryHandleTasks(text))       return;
        if (tryHandleReminder(text))    return;
        if (tryHandleGoal(text))        return;
        if (tryHandleFunRequest(text))  return;
        if (tryHandleDailyReport(text)) return;
        if (tryHandleWellnessRequest(text)) return;
        if (tryHandleLearningResources(text)) return;
        if (tryHandleSkillPathList(text)) return;
        if (tryHandleHelpRequest(text)) return;

        // --- Layer 2: Safe Emotional Support (crisis detection) ---
        if (checkForCrisisSignals(text)) return;

        // --- Layer 3: Personality — silently learn user's name & gather insights ---
        tryLearnName(text);
        tryHandleLearningInsights(text);
        tryHandleEverydayDistress(text);

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
        const today = new Date().toDateString();

        // Baymax's "I will not stop caring" trait: if last time we talked
        // you were low, check back in rather than asking the identical
        // daily-mood question again as if nothing had been said. This (and
        // the briefing/insight below) is gated purely by DATE, not by
        // whether the current session happens to already have messages in
        // it — a returning user's active session almost always still has
        // old messages from days ago, so history-gating these would mean
        // they silently never fire for the single most common case:
        // someone reopening the app after time away, exactly who Baymax
        // and Jarvis are supposed to proactively greet in the first place.
        const lowFollowUp = getYesterdaysLowFollowUp();
        const followUpAlreadyShownToday = getMemory('lastMoodFollowUpDate') === today;
        let suppressMoodPicker = false;

        if (sessions.length === 0 || !activeSessionId) {
            // First time ever, or no active session selected: create new
            startNewChat();
        } else {
            // Restore current session
            const hasHistory = restoreChatHistory();
            updateChatHeader();
            if (!hasHistory) {
                if (lowFollowUp && !followUpAlreadyShownToday) {
                    saveMemory({ lastMoodFollowUpDate: today });
                    suppressMoodPicker = true;
                    setTimeout(() => appendBotMessageTracked(
                        "Hey — last time we talked, you mentioned feeling a bit low. I've been thinking about you. How are you doing today? 💙", true
                    ), 600);
                } else {
                    const ctx = getTimeContext();
                    setTimeout(() => appendBotMessageTracked(timeGreetings[ctx], true), 600);
                }
            } else if (lowFollowUp && !followUpAlreadyShownToday) {
                // Returning to an ongoing conversation from a prior day —
                // there's no greeting to fold this into, so it's its own
                // gentle nudge instead.
                saveMemory({ lastMoodFollowUpDate: today });
                suppressMoodPicker = true;
                setTimeout(() => appendBotMessageTracked(
                    "Before we continue — last time we talked, you mentioned feeling a bit low. How are you doing today? 💙", true
                ), 900);
            }
        }

        const activeSession = loadChatSessions().find(s => s.id === activeSessionId);
        const hasHistory = activeSession && activeSession.messages.length > 0;
        const justShowedLowFollowUp = lowFollowUp && !followUpAlreadyShownToday;

        // 1.5 Proactive Status Briefing (Jarvis-style) — what needs
        // attention right now, surfaced without being asked, once per day
        // regardless of whether this session is brand new or weeks old.
        // Skipped alongside the mood-trend insight when we already led
        // with the more personal "you were low" follow-up above — someone
        // who just said they're feeling low doesn't need a task list too.
        if (!justShowedLowFollowUp && shouldShowDailyBriefing()) {
            const briefing = getStatusBriefing();
            if (briefing) {
                saveMemory({ lastBriefingDate: today });
                setTimeout(() => appendBotMessageTracked(briefing, true), hasHistory ? 1400 : 1150);
            }
        }

        // 2. Personal Insights (mood trend) — once per day, same reasoning
        // as the briefing above: gated by date, not by session content.
        const insight = getMoodInsight();
        const insightAlreadyShownToday = getMemory('lastInsightShownDate') === today;
        if (insight && !justShowedLowFollowUp && !insightAlreadyShownToday) {
            saveMemory({ lastInsightShownDate: today });
            const delay = hasHistory ? 1700 : 1900;
            if (insight.negative) {
                setTimeout(() => showCareRecommendation('trend'), delay);
            } else {
                setTimeout(() => appendBotMessageTracked(insight.text, true), delay);
            }
        }

        // 3. Daily Mood Check — show once per day (skipped if we already
        // asked via the warmer "how are you doing today" follow-up above)
        if (shouldAskDailyMood() && !suppressMoodPicker) {
            setTimeout(() => showMoodPicker(), (insight && !hasHistory) ? 2900 : 1500);
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
    // (MIN_IDLE_MS, MAX_IDLE_MS, MAX_CHECKINS_PER_SESSION declared near the
    // top of this closure — see comment there)

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

    // Sidebar "Learn Something" button — no phrase to guess, just click and
    // type whatever topic comes to mind.
    if (openLearnBtn) {
        openLearnBtn.addEventListener('click', () => {
            closeMobileSidebarDrawer();
            awaitingLearningTopic = true;
            appendBotMessageTracked("What would you like to learn? Type any topic and I'll find real resources for it 📚");
            userInput.focus();
        });
    }

    // Sidebar "What Can I Do?" button — a plain-language reference for
    // every capability that otherwise only worked if you happened to type
    // the right phrase, with no in-app way to know it existed.
    if (openHelpBtn) {
        openHelpBtn.addEventListener('click', () => {
            closeMobileSidebarDrawer();
            showCapabilitiesHelp();
        });
    }

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

