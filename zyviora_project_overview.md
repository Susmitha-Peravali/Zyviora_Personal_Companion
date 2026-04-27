# 🤖 Zyviora — Full Project Overview

> A Hybrid AI Personal Companion built with Prolog logic, Google Gemini AI, and a rich frontend.

---

## 🏗️ Architecture Overview

Zyviora is a **Hybrid AI System** — it blends two distinct AI approaches into one seamless experience:

```
User Input
    │
    ▼
┌─────────────────────────────────┐
│  Frontend (Browser / JS)        │  ← Handles reminders, memory, mood, goals
│  Intercepts before backend      │     fun facts, crisis support — all local
└──────────────┬──────────────────┘
               │ (if not handled locally)
               ▼
┌─────────────────────────────────┐
│  Flask Backend (Python)         │  ← Routes messages, manages API keys
└──────────────┬──────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌──────────────┐  ┌──────────────────────┐
│ Prolog Engine│  │  Google Gemini AI    │
│  (Local AI)  │  │  (Cloud Fallback)    │
│  0ms latency │  │ Used only when Prolog│
│  No internet │  │ can't match anything │
└──────────────┘  └──────────────────────┘
```

### Why Hybrid?
- **Prolog** handles structured, deterministic logic — emotional support, greetings, productivity. Responds instantly with zero internet requirement.
- **Gemini AI** handles anything unscripted — general questions, creative topics. Responds dynamically via the cloud.

---

## 📁 Project File Structure

```
Project/
├── app.py                    # Flask backend — routes /chat requests
├── .env                      # Your secret Gemini API key (never share this!)
├── requirements.txt          # Python dependencies
│
├── prolog/
│   ├── main.pl               # Router — tries each module in priority order
│   ├── emotion.pl            # Emotional support (10 categories, 3 replies each)
│   ├── conversation.pl       # Greetings, small talk, thank-you responses
│   ├── decision_support.pl   # Helps users make tough decisions
│   ├── interview.pl          # Interview preparation tips
│   ├── productivity.pl       # Time management and focus tips
│   ├── knowledge.pl          # General knowledge/fun facts (Prolog-native)
│   └── wordle_game.pl        # Wordle game support logic
│
├── templates/
│   └── index.html            # Main UI — sidebar, chat window, input bar
│
└── static/
    ├── css/
    │   └── style.css         # All visual design — glassmorphism, animations
    └── js/
        └── script.js         # All frontend intelligence (8 companion modules)
```

---

## 🧠 Prolog Knowledge Base (Backend AI)

The Prolog engine is the **core AI brain** of Zyviora. It processes user text using **keyword pattern matching** via `sub_atom/5`.

### Routing Priority (`main.pl`)
When a message arrives, Prolog tries each module in this order:
1. `respond_emotion` → Emotional support
2. `greet` → Conversation / small talk
3. `productivity_tip` → Productivity advice
4. `provide_interview_tip` → Interview prep
5. `fact` → General knowledge
6. `decide_support` → Decision making help
7. `wordle_support` → Wordle game
8. **`[unhandled_intent]`** → Falls back to Gemini AI

### Emotion Module (`emotion.pl`) — 10 Categories
| Category | Detected Keywords | Variations |
|---|---|---|
| Sadness | sad, down, depress, unhappy | 3 |
| Anxiety | anxious, panic, nervous, worry | 3 |
| Stress | stress, overwhelm, burnout | 3 |
| Happiness | happy, joy, excited, amazing | 3 |
| Anger | angry, mad, frustrated, annoyed | 3 |
| Loneliness | lonely, alone, no friends, isolated | 3 |
| Introversion | introvert, social anxiety, drained | 3 |
| Headache | headache, migraine, head hurts | 3 |
| Sickness | sick, fever, pain, cold | 3 |
| Exhaustion | tired, sleepy, exhausted, fatigue | 3 |

---

## 🌐 Frontend Intelligence (`script.js`) — 8 Modules

The JavaScript frontend acts as a **smart pre-processor** that intercepts many requests before they even reach Python — making responses feel instant.

### Module 0: 🧠 Memory System
- Stores: user's name, last mood, mood date
- Storage: `localStorage` → **persists between browser sessions**
- When user says `"My name is Tejas"` → remembers forever
- Occasionally personalises replies using the stored name

### Module 0.5: 📜 Chat History Engine
- Keeps track of all conversation bubbles (both user and bot)
- Limits to the 50 most recent messages to save memory
- **Automatically restores** the UI state seamlessly on page refresh
- Bypasses repetitive greetings if returning to an active session

### Module 1: ⏰ Smart Reminder Engine
- Parses natural language: `"Remind me to drink water in 2 minutes"` or `"Remind me at 5:30 PM"`
- Supports standard precise absolute timestamps (AM/PM handling)
- **Persists in localStorage** → survives page refresh with correct remaining time
- Reflected in real-time on the Dashboard UI under "Active Reminders"

### Module 2: 📅 Daily Mood Check
- Runs **once per day** (resets at midnight based on date)
- Shows 5 clickable emoji buttons: 😊 😐 😔 😢 🙂
- Logs mood with timestamp to `localStorage`
- Generates a personalised follow-up message based on the selected mood

### Module 3: 📊 Personal Insights
- Analyses the last 5 mood log entries on each startup
- If 3+ are sad/low → *"I've noticed you've been a bit down lately..."*
- If 4+ are great/good → *"You've been in such a great mood recently!"*

### Module 4: 🎯 Goal / Habit Tracker
Commands recognised:
- `"Add goal: Study 1 hour"` → saves goal
- `"Set goal: Drink 8 glasses of water"` → saves goal
- `"I completed Study 1 hour"` → marks as done, gives celebration 🎉
- `"Show my goals"` → lists all goals with completion status

### Module 5: 🌤 Context Awareness (Time of Day)
On every page load, Zyviora greets differently:
- **5am – 12pm**: *"Good morning! ☀️ Hope you slept well."*
- **12pm – 5pm**: *"Good afternoon! 🌤 How's your day going?"*
- **5pm – 10pm**: *"Good evening! 🌙 How did your day treat you?"*
- **10pm – 5am**: *"It's pretty late — you should probably rest soon 😴."*

### Module 5b: 🎲 Fun Engagement
- Triggered by: `"Tell me something interesting"`, `"I'm bored"`, `"Fun fact"`
- Returns a random science/nature fact from a built-in bank
- Prompts user to ask for more

### Module 6: 💙 Proactive Check-In System
- Fires after **2–5 minutes of idle** (random to feel natural)
- **Guards:** Does NOT fire if user is typing or bot spoke recently (30s window)
- **Hard cap: 2 check-ins per session** — never annoying
- 5 unique messages, never repeat in a row

### Module 7: 🔒 Safe Emotional Support Layer
- Monitors for crisis signals: `"hopeless"`, `"give up"`, `"tired of everything"`, etc.
- Immediately responds with a warm, non-alarming supportive message
- **Does NOT send to Gemini** — handled entirely client-side for speed

### Module 8: 💻 System App Shortcuts
- Recognises queries like `"open calculator"`, `"open youtube"`, `"open calendar"`
- Intercepts and fires a `fetch('/open-app', ...)` request to the Flask backend
- The backend relies on low-level Python modules (`subprocess`, `webbrowser`) to physically launch desktop OS interfaces.

### Module 9: 🗂️ Task Management System
- Adds scalable productivity features over natural language: `"Add task finish my homework"`
- Understands `"Show my tasks"` and `"Mark task 1 as done"`
- Automatically syncs to a central array array across the ecosystem
- Fully integrated onto the dynamic `/dashboard` UI in real-time

---

## 🗣️ Voice Mode (Web Speech API)
- **Speech-to-Text:** Click mic → browser listens → auto-transcribes and fires your message
- **Text-to-Speech:** Every bot reply is spoken aloud (when Voice Mode is on)
- Uses Chrome/Edge's built-in AI engine — **no API key required, no quota limits**
- Selects a warm, female-toned voice automatically if available

---

## 🤖 Google Gemini AI Fallback
- Activated only when Prolog returns `[unhandled_intent]`
- Currently using model: `gemini-flash-lite-latest`
- Zyviora's personality prompt is injected: *"You are Zyviora, an empathetic, friendly digital companion..."*
- Error-handled gracefully — server never crashes even if API fails

---

## 🔑 How To Run

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Add your Gemini API key to .env
GEMINI_API_KEY="your_key_here"

# 3. Start the server
python app.py

# 4. Open browser
http://localhost:5000
```

---

## ➕ How To Extend The Project

### Adding a new Prolog topic:
1. Open any `.pl` file (or create `prolog/newmodule.pl`)
2. Add a rule: `my_predicate(Input, 'Response here') :- sub_atom(Input, _, _, _, 'keyword'), !.`
3. Register it in `main.pl` → `handle_input(Input, Response) :- my_predicate(Input, Response), !.`
4. Restart `python app.py`

### Adding a new frontend feature:
1. Open `static/js/script.js`
2. Create a new `function tryHandleX(text)` that returns `true` if handled
3. Call it inside `handleUserMessage()` under the "Layer 1: Frontend intercepts" section

### Adding a new Gemini model:
- Edit `app.py` line with `genai.GenerativeModel('...')`
- Run `python test_quota.py` first to check which models work on your API key

---

## 📊 Technology Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML + CSS + Vanilla JS | UI, animations, all companion modules |
| Backend | Python Flask | HTTP server, routing, API integration |
| Core AI | SWI-Prolog (via PySwip) | Deterministic rule-based responses |
| Fallback AI | Google Gemini API | Generative responses for unknown inputs |
| Voice STT | Web Speech API (Chrome) | Microphone → text transcription |
| Voice TTS | SpeechSynthesis API | Text → spoken audio |
| Memory | Browser localStorage | Reminders, goals, mood, name — persistent |
