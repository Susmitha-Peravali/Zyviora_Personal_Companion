# Zyviora — AI Companion & Productivity Assistant

> A conversational AI assistant that combines deterministic Prolog rules, Google Gemini, and a rich browser-based UI to help you manage tasks, goals, mood, reminders, and learning — all in one place.

---

## Screenshots

| Chat Interface | Dashboard |
|---|---|
| ![Chat Interface](assets/screenshot_chat.png) | ![Dashboard](assets/screenshot_dashboard.png) |

> 📸 *Take screenshots of your running app and place them in an `assets/` folder in the project root.*

---

## Table of Contents

- [What is Zyviora?](#what-is-zyviora)
- [Live Demo](#live-demo)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [How the AI Works](#how-the-ai-works)
- [Project Structure](#project-structure)
- [Getting Started (Local)](#getting-started-local)
- [Environment Variables](#environment-variables)
- [Running with Docker](#running-with-docker)
- [Running Tests](#running-tests)
- [Deployment](#deployment)
- [Security](#security)
- [Known Limitations](#known-limitations)
- [Contributing](#contributing)

---

## What is Zyviora?

Zyviora is a full-stack AI companion web application. It is designed to be a personal assistant that:

- **Chats** with you using a hybrid AI system (rule-based Prolog + Google Gemini fallback)
- **Tracks** your tasks, goals, mood, and reminders
- **Teaches** you new topics by generating structured skill paths via Gemini and fetching real YouTube learning resources
- **Supports** you emotionally with empathetic responses, proactive check-ins, and crisis detection
- **Engages** you with built-in games (Word Guess, Tic Tac Toe, Quiz, Number Guess, Would You Rather)
- **Personalizes** over time by learning your name, chat patterns, and recurring topics

Everything is accessible through a single chat interface. No commands to memorise — just type naturally.

---

## Screenshots

| Chat Interface | Dashboard |
|---|---|
| ![Chat](assets/screenshot_chat.png) | ![Dashboard](assets/screenshot_dashboard.png) |

## Live Demo

🔗 **[your-live-url-here](https://zyviora-personal-companion.onrender.com/)**

> Replace the link above with your actual deployed URL after hosting the app (e.g. on Render, Railway, or any Docker-compatible host).

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 | Chat UI, localStorage management, voice |
| **Backend** | Python 3.12, Flask 3.0 | API routes, authentication, session management |
| **Rule Engine** | SWI-Prolog + PySwip 0.3.3 | Deterministic keyword-based chat responses |
| **Generative AI** | Google Gemini (`gemini-flash-lite-latest`) | Chat fallback + skill path generation |
| **Database (local)** | SQLite (via SQLAlchemy) | User accounts and synced data |
| **Database (production)** | PostgreSQL (via `DATABASE_URL` env var) | Same schema, production-grade persistence |
| **ORM** | Flask-SQLAlchemy 3.1 | Database abstraction |
| **Session Store** | Filesystem (default) / Redis (if `REDIS_URL` set) | Flask server-side sessions |
| **Rate Limiting** | Flask-Limiter 3.5 | Per-route request throttling |
| **CSRF Protection** | Flask-WTF 1.3 | Token-based CSRF for all POST routes |
| **Password Hashing** | Werkzeug | bcrypt-compatible hashing |
| **Web Server** | Gunicorn | Production WSGI server |
| **Containerisation** | Docker | Portable deployment |
| **Charts** | Chart.js (CDN) | Mood and goals visualisations on dashboard |
| **Voice** | Web Speech API (browser-native) | Speech recognition and text-to-speech |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
│                                                              │
│  chat.html / dashboard.html / login.html ...                 │
│  script.js  ──────────────────────────────────────────────── │
│  │  Layer 0: Guided sidebar actions (task/goal/reminder)     │
│  │  Layer 1: Frontend-only intercepts                        │
│  │    ├── tryHandleSystemCommand()   ← open apps (backend)   │
│  │    ├── tryHandleTasks()           ← localStorage          │
│  │    ├── tryHandleReminder()        ← localStorage + timer  │
│  │    ├── tryHandleGoal()            ← localStorage          │
│  │    ├── tryHandleFunRequest()      ← frontend only         │
│  │    ├── tryHandleDailyReport()     ← localStorage          │
│  │    ├── tryHandleWellnessRequest() ← frontend only         │
│  │    ├── tryHandleLearningResources() ← POST /api/...       │
│  │    └── tryHandleSkillPathList()   ← POST /api/skill-path  │
│  │  Layer 2: Crisis detection        ← keyword list          │
│  │  Layer 3: Personality learning    ← localStorage          │
│  │  Layer 4: POST /chat              ← Flask backend         │
│  │                                                           │
│  dashboard.js ─ reads localStorage, renders charts          │
│  games.js     ─ 5 inline games, stats in localStorage        │
│  Web Speech API ─ microphone input + TTS output             │
│  localStorage ─ tasks, goals, reminders, mood, chat history  │
└──────────────────────────────────────────────────────────────┘
                          │  HTTPS / fetch()
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    Flask Backend (app.py)                    │
│                                                              │
│  Routes:                                                     │
│  GET  /           → home page                                │
│  GET  /chat_ui    → chat interface (no login required)       │
│  GET  /dashboard  → dashboard (login required)               │
│  POST /login      → authenticate user                        │
│  POST /register   → create account                           │
│  GET  /verify-email → verify email token                     │
│  POST /forgot-password → send reset link                     │
│  POST /reset-password  → apply new password                  │
│  POST /logout     → clear session                            │
│  POST /sync       → save localStorage blob to DB             │
│  POST /chat       → Prolog → Gemini pipeline                 │
│  POST /api/learning-resources → YouTube Data API             │
│  POST /api/skill-path         → Gemini curriculum            │
│  POST /open-app   → subprocess (server-side only)            │
│  GET  /healthz    → health check                             │
└──────────────────────────────────────────────────────────────┘
          │                        │                  │
          ▼                        ▼                  ▼
┌──────────────┐      ┌────────────────────┐   ┌───────────────┐
│  SQLite /    │      │  SWI-Prolog        │   │  Google       │
│  PostgreSQL  │      │  (via PySwip)      │   │  Gemini API   │
│              │      │                   │   │               │
│  User table  │      │  conversation.pl  │   │  Chat fallback│
│  (1 model)   │      │  emotion.pl       │   │  Skill paths  │
│              │      │  productivity.pl  │   │               │
│  id          │      │  interview.pl     │   └───────────────┘
│  username    │      │  knowledge.pl     │
│  password_   │      │  decision_        │         │
│  hash        │      │  support.pl       │   ┌───────────────┐
│  email       │      │  wordle_game.pl   │   │ YouTube       │
│  full_name   │      │                   │   │ Data API v3   │
│  data (JSON) │      └────────────────────┘   │ (optional)    │
│  + auth cols │                               └───────────────┘
└──────────────┘
```

---

## Features

### 💬 Chat
- Natural language chat with no login required
- Typing indicator while waiting for a response
- 30-second request timeout with user-friendly error message
- Multiple named chat sessions, all persisted in localStorage
- Responses optionally personalised with the user's name

### 🧠 Hybrid AI (Prolog + Gemini)
- All messages go through SWI-Prolog first for fast, deterministic responses
- If Prolog cannot handle a message, Google Gemini (`gemini-flash-lite-latest`) is called as a fallback
- Context-aware: the last 3 conversation exchanges are sent to Gemini
- See [How the AI Works](#how-the-ai-works) for full details

### ✅ Tasks
- Add, complete, and delete tasks via chat or sidebar
- Tasks stored in `zyviora_tasks` localStorage key
- Pending task count shown in proactive check-in messages
- Full CRUD in the dashboard

### 🎯 Goals
- Add daily goals via chat (`"add a goal to exercise"`)
- Mark complete for the day, auto-resets next day
- Doughnut chart on dashboard shows completed vs pending
- Stored in `zyviora_goals` localStorage

### ⏰ Reminders
- Natural language: `"remind me to call mom in 20 minutes"` or `"remind me to submit report at 5pm"`
- Parses relative durations (`in N minutes/hours/seconds`) and absolute times (`at H:MM am/pm`)
- Fires via `setTimeout`; persists in `zyviora_reminders` localStorage so overdue reminders fire on page reload
- Guided flow via sidebar button

### 😊 Mood Tracking
- Daily mood check-in (once per day) with a 5-option picker: Great / Good / Okay / Low / Sad
- Last 7 days shown as a line chart on the dashboard
- Negative mood trend (3+ low days in 5) triggers a care recommendation
- Follow-up message if yesterday's mood was low

### 📚 Skill Paths
- Type `"create a skill path for machine learning"` or use sidebar
- Gemini generates a 5-step structured learning curriculum as JSON
- Each step has a `search_query` field; clicking a step lazily fetches YouTube videos for that query
- Progress tracked per step (completed/incomplete) in `zyviora_skill_paths` localStorage
- Dashboard shows progress bars for each active skill path

### 🎥 Learning Resources
- Type `"resources for Python"` or `"teach me React"`
- If `YOUTUBE_API_KEY` is configured: returns up to 5 real video results with thumbnails and titles
- If not configured: returns a clickable YouTube search link as fallback
- Results rendered as clickable cards in the chat

### 🎮 Games (5 total)
All games render inline in the chat window. Game stats (wins/losses/draws) saved in `zyviora_game_memory` localStorage.
- **Word Guess** — guess a hidden word letter by letter
- **Tic Tac Toe** — play against Zyviora
- **Quick Quiz** — multiple-choice trivia questions
- **Number Guess** — guess a number in a given range
- **Would You Rather** — fun choice prompts

### 🎙️ Voice Input & Text-to-Speech
- Uses the browser's native **Web Speech API** (`SpeechRecognition` + `SpeechSynthesis`)
- Toggle Voice Mode via the sidebar button
- Mic button starts/stops recording; transcript is injected into the chat input and sent automatically
- All bot responses are read aloud when Voice Mode is active
- Prefers a "Female", "Zira", or "Google US English" voice if available
- Works in Chromium-based browsers; not supported in Firefox

### 🤖 Proactive Check-ins
- Idle timer fires after a random delay (2–5 minutes of inactivity)
- Sends one of 5 non-repeating check-in messages
- Capped at 3 check-ins per session
- Suppressed if the user is actively typing

### 📊 Daily Briefing
- Once per day on first load, shows a status summary: pending tasks count, overdue reminders, upcoming goals
- Skipped if a mood follow-up was already shown
- Stored in `zyviora_memory` localStorage (keyed by `lastBriefingDate`)

### 🔒 Authentication
- Register with username, email, full name, and a strong password (8+ chars, 1+ digit)
- Email verification (link sent; without SMTP configured, link is logged to server console)
- Login with username + password; wrong password increments a counter
- **Account lockout**: 5 failed attempts → 15-minute lockout
- Password reset via tokenised email link (token stored as SHA-256 hash)
- Protected routes redirect to `/login`

### 🔄 Data Synchronisation
- When logged in, all localStorage data is synced to the server's database every **2 minutes** automatically
- Also synced on logout (from both chat page and dashboard)
- Stored as a single JSON blob in the `user.data` database column
- Payload capped at **256 KB**; oversized payloads are rejected with HTTP 413

### 🖥️ System Application Shortcuts
- Users can ask Zyviora to open apps: Calculator, Notepad, Microsoft Word, PowerPoint, YouTube, Calendar
- **Important**: this opens applications on the **server machine**, not the user's device
- Useful only when running locally; has no practical effect on a hosted deployment

---

## How the AI Works

Zyviora uses a **three-tier hybrid system**, not a single AI model.

### Tier 1 — Frontend JavaScript (deterministic, instant)

Before any message reaches the server, `handleUserMessage()` in `script.js` runs a series of pattern checks:

```
Message received
  │
  ├─ Guided sidebar action? (task / goal / reminder) → handle directly
  │
  ├─ tryHandleSystemCommand()    → "open calculator", "open notepad" etc.
  ├─ tryHandleTasks()            → "add task …", "show tasks", "complete task …"
  ├─ tryHandleReminder()         → "remind me to … in/at …"
  ├─ tryHandleGoal()             → "add goal …", "show goals"
  ├─ tryHandleFunRequest()       → "tell me a joke", "surprise me"
  ├─ tryHandleDailyReport()      → "my report", "how am I doing"
  ├─ tryHandleWellnessRequest()  → "breathing exercise", "calm me down"
  ├─ tryHandleLearningResources()→ "resources for X", "teach me X"
  ├─ tryHandleSkillPathList()    → "create skill path for X"
  ├─ tryHandleHelpRequest()      → "what can you do", "help"
  │
  ├─ checkForCrisisSignals()     → hardcoded crisis keyword list → emergency response
  │
  ├─ tryLearnName()              → "my name is …" → saves to localStorage
  ├─ tryHandleLearningInsights() → tracks message hour + topic keywords
  ├─ tryHandleEverydayDistress() → soft empathy for mild expressions
  │
  └─ None matched → POST /chat  ← goes to backend
```

### Tier 2 — SWI-Prolog (deterministic, rule-based)

The Flask `/chat` endpoint first preprocesses the message:
1. Strips punctuation, lowercases, removes English stopwords
2. Applies synonym normalisation (`depressed → sad`, `nervous → anxious`, `exhausted → tired`, etc.)
3. Passes the cleaned text to SWI-Prolog via PySwip: `handle_input('cleaned text', Response)`

Prolog uses `sub_atom/5` to check whether any keyword pattern matches across these modules:

| Module | File | Keywords/topics handled |
|---|---|---|
| Conversation | `conversation.pl` | hi/hello/hey, how are you, thank you, good/great/fine |
| Emotion | `emotion.pl` | sad, anxious, angry, lonely, tired, excited, grateful, overwhelmed, hopeful, bored |
| Productivity | `productivity.pl` | procrastinate, focus, deadline, morning routine, time management |
| Interview | `interview.pl` | interview tips, behavioral questions, technical interview, resume, coding interview |
| Knowledge | `knowledge.pl` | who are you, meaning of life, fun fact, what can you do |
| Decision Support | `decision_support.pl` | can't decide, pros and cons, make a decision |
| Wordle | `wordle_game.pl` | play wordle, guess |

**Prolog is purely deterministic.** It is not machine learning and does not generate text. It pattern-matches and returns a pre-written string.

### Tier 3 — Google Gemini (generative, fallback only)

If Prolog returns the literal string `[unhandled_intent]` (its final catch-all clause), and `GEMINI_API_KEY` is set:

- The last 3 conversation pairs (6 messages) are assembled as context
- Sent to `gemini-flash-lite-latest` with a max of 256 output tokens
- The response is returned to the user

If the API key is not set, the response is: *"I don't have a rule for that yet — but you can set up a Gemini API key to unlock smarter replies!"*

**Gemini is also used for skill path generation** (`/api/skill-path`) — it generates a 5-step JSON curriculum. Max 500 tokens.

---

## Project Structure

```
Project/
├── app.py                    # Flask application — all routes and logic
├── requirements.txt          # Python dependencies
├── Dockerfile                # Container build (python:3.12-slim + swi-prolog)
├── .env.example              # Template for environment variables
├── .env                      # Your local secrets (gitignored)
│
├── prolog/
│   ├── main.pl               # Loads all modules, defines handle_input/2
│   ├── conversation.pl       # Greetings and small talk
│   ├── emotion.pl            # 10 emotion categories
│   ├── productivity.pl       # Productivity tips
│   ├── interview.pl          # Interview preparation tips
│   ├── knowledge.pl          # Facts about Zyviora
│   ├── decision_support.pl   # Decision-making support
│   └── wordle_game.pl        # Wordle text triggers
│
├── static/
│   ├── js/
│   │   ├── script.js         # Main chat logic (2438 lines)
│   │   ├── dashboard.js      # Dashboard charts and data display
│   │   ├── games.js          # 5 inline games engine
│   │   └── cursor.js         # UI cursor effects
│   ├── css/
│   │   └── style.css         # Application styles
│   ├── bot_avatar.png
│   ├── user_avatar.png
│   └── logo_light.png
│
├── templates/
│   ├── chat.html             # Chat UI (CSRF meta tag, sidebar, chat window)
│   ├── dashboard.html        # Dashboard with charts and summaries
│   ├── index.html            # Landing/home page
│   ├── login.html
│   ├── register.html
│   ├── forgot_password.html
│   ├── reset_password.html
│   ├── verify_email.html
│   └── privacy.html
│
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_chat.py
│   ├── test_email_verification.py
│   ├── test_health.py
│   ├── test_learning_resources.py
│   ├── test_open_app.py
│   ├── test_password_reset.py
│   └── test_skill_path.py
│
└── instance/
    └── database.db           # SQLite database (created automatically on first run)
```

---

## Getting Started (Local)

### Prerequisites

- Python 3.12+
- [SWI-Prolog](https://www.swi-prolog.org/Download.html) installed and on your `PATH`
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free tier available)

### 1. Clone the repository

```bash
git clone https://github.com/Susmitha-Peravali/Zyviora_Personal_Companion.git
cd zyviora
```

### 2. Create a virtual environment

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
SECRET_KEY=any_random_secret_string_here
```

### 5. Run the application

```bash
python app.py
```

The app will be available at `http://localhost:5000`.

The SQLite database (`instance/database.db`) is created automatically on first run.

> **Note:** The app runs in single-threaded mode (`threaded=False`) because PySwip (the Python-Prolog bridge) is not thread-safe.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes (for AI) | — | Google Gemini API key. Without it, the chat fallback and skill paths are disabled. |
| `SECRET_KEY` | Yes (production) | Random (changes on restart) | Flask session and CSRF signing key. Must be stable in production. |
| `DATABASE_URL` | No | `sqlite:///database.db` | Full SQLAlchemy database URL. Set to a PostgreSQL URL for production (e.g. `postgresql://user:pass@host:5432/zyviora`). |
| `REDIS_URL` | No | — | Redis connection URL. If set, sessions and rate limiting use Redis instead of filesystem/memory. |
| `YOUTUBE_API_KEY` | No | — | YouTube Data API v3 key. Without it, learning resources degrade to a YouTube search link. |
| `SMTP_HOST` | No | — | SMTP server for sending emails (password reset, email verification). |
| `SMTP_PORT` | No | — | SMTP port (usually 587 for TLS). |
| `SMTP_USER` | No | — | SMTP login username. |
| `SMTP_PASSWORD` | No | — | SMTP login password. |
| `SMTP_FROM` | No | — | From address for outgoing emails. |
| `BEHIND_PROXY` | No | `false` | Set to `true` if running behind a TLS-terminating reverse proxy (e.g. Caddy, nginx). Enables ProxyFix. |
| `SESSION_COOKIE_SECURE` | No | `false` | Set to `true` only when behind HTTPS. |
| `FLASK_DEBUG` | No | `false` | Enable Flask debug mode. Never use in production. |
| `LOG_LEVEL` | No | `INFO` | Logging level: `DEBUG`, `INFO`, `WARNING`, `ERROR`. |

> **Note on SMTP:** If SMTP variables are not set, the application still works end-to-end for local development — password reset links and email verification links are printed to the server console instead of being emailed.

---

## Running with Docker

### Single container (SQLite, no Redis)

```bash
docker build -t zyviora .
docker run -p 5000:5000 \
  -e GEMINI_API_KEY=your_key \
  -e SECRET_KEY=your_secret \
  zyviora
```

### With PostgreSQL and Redis (docker-compose)

A `docker-compose.yml` is included in the repository. It starts three services:

| Service | Image | Purpose |
|---|---|---|
| `web` | Built from `Dockerfile` | Zyviora Flask app (4 Gunicorn workers) |
| `postgres` | `postgres:16-alpine` | PostgreSQL 16 database with health check |
| `redis` | `redis:7-alpine` | Redis 7 for sessions and rate limiting |

```bash
POSTGRES_PASSWORD=your_password docker compose up
```

The `web` service automatically receives:
- `DATABASE_URL=postgresql://zyviora:<password>@postgres:5432/zyviora`
- `REDIS_URL=redis://redis:6379/0`

All other variables (e.g. `GEMINI_API_KEY`, `SECRET_KEY`) are loaded from your `.env` file.

---

## Running Tests

The test suite uses `pytest` and covers authentication, chat routing, email verification, password reset, learning resources, skill paths, open-app, and health check.

```bash
cd tests
pip install pytest
pytest -v
```

Test highlights:
- CSRF enforcement: every POST without a valid CSRF token returns HTTP 400
- Account lockout: 5 wrong passwords → HTTP 403 with lockout message
- Prolog routing: emotion keywords confirmed to reach Prolog and return non-empty responses
- Gemini fallback: with no API key set, unrecognised input returns the "no key" message
- Sync payload cap: payloads over 256 KB return HTTP 413

---

## Deployment

The application is containerised and ready to deploy to any platform that supports Docker.

### Dockerfile summary

```dockerfile
FROM python:3.12-slim
RUN apt-get install -y swi-prolog    # SWI-Prolog is required
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "--preload", "--workers", "2", "--bind", "0.0.0.0:5000", "app:app"]
```

- **Web server:** Gunicorn with 2 workers
- **Port:** 5000
- **`--preload`:** Loads the application (including Prolog) once before forking workers
- **Worker count:** Keep at 2 or fewer — PySwip requires `--preload` and careful worker management

### Recommended production setup

| Concern | Recommendation |
|---|---|
| Database | Set `DATABASE_URL` to a managed PostgreSQL instance |
| Sessions | Set `REDIS_URL` to a managed Redis instance (sessions survive redeploys) |
| HTTPS | Put Gunicorn behind Caddy or nginx; set `BEHIND_PROXY=true` and `SESSION_COOKIE_SECURE=true` |
| Secrets | Use your platform's secrets manager (not `.env` files) |
| Email | Set `SMTP_*` variables using an app password from Gmail or a transactional email service |

### Important deployment limitation: open-app feature

The `/open-app` route launches system applications using `subprocess.Popen`. On a remote server, this opens applications **on the server machine**, not on the user's device. This feature is only useful when running Zyviora locally on your own machine.

---

## Security

| Mechanism | Implementation |
|---|---|
| Password hashing | Werkzeug `generate_password_hash` / `check_password_hash` |
| CSRF protection | `CSRFProtect(app)` from Flask-WTF; `X-CSRFToken` header required on all POST requests |
| Account lockout | 5 failed login attempts → 15-minute lockout stored in database |
| Rate limiting | Flask-Limiter: `/chat` 40/min, `/login` 10/min, `/forgot-password` 5/hr, etc. |
| Session management | Server-side sessions (Flask-Session); `HttpOnly=True`, `SameSite=Lax` |
| Reset tokens | Stored as SHA-256 hash only; raw token sent once by email and never stored |
| Input validation | `preprocess_text()` + `re.fullmatch(r"[\w\s]*")` guard before any Prolog query |
| SQL injection | SQLAlchemy ORM with parameterised queries throughout |
| Sync payload cap | 256 KB maximum; oversized payloads rejected with HTTP 413 |

---

## Data Storage

### What lives in the browser (localStorage)

| Key | What it stores |
|---|---|
| `zyviora_tasks` | Array of task objects `{id, text, status, createdAt}` |
| `zyviora_goals` | Array of goal objects `{text, createdAt, completedToday, lastCompleted}` |
| `zyviora_reminders` | Array of reminder objects `{task, triggerAt, mode}` |
| `zyviora_mood_log` | Array of mood entries `{mood, date, ts}`, max 30 entries |
| `zyviora_memory` | Object: `{userName, lastMoodDate, lastMood, lastBriefingDate, lastDistressCheckInTs, lastMoodFollowUpDate}` |
| `zyviora_chat_sessions` | Array of chat session objects, each with a messages array |
| `zyviora_active_session_id` | String ID of the currently active chat session |
| `zyviora_skill_paths` | Array of skill path objects, each with topic + steps array |
| `zyviora_learning` | Object: `{activeHours: {}, topics: {}}` — chat pattern tracking |
| `zyviora_game_memory` | Object: per-game `{wins, losses, draws, plays}` |
| `zyviora_logged_in` | `"true"` when a session is active |
| `zyviora_username` | Logged-in username string |
| `zyviora_fullname` | Logged-in user's full name |
| `zyviora_email_verified` | `"true"` or `"false"` |

### What lives in the database

One table: **`user`**

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | Auto-increment |
| `username` | String (unique) | Login name |
| `password_hash` | String | Werkzeug-hashed password |
| `email` | String (unique) | Email address |
| `full_name` | String | Display name |
| `failed_login_attempts` | Integer | Resets on successful login |
| `locked_until` | DateTime | Null if not locked |
| `reset_token_hash` | String | SHA-256 hash of password reset token |
| `reset_token_expires` | DateTime | Expiry of reset token |
| `email_verified` | Boolean | Default False |
| `email_verify_token_hash` | String | SHA-256 hash of verification token |
| `email_verify_token_expires` | DateTime | Expiry of verification token |
| `data` | Text | Full JSON blob of all localStorage data (written by `/sync`) |

### What lives in the Flask session

| Key | Value |
|---|---|
| `user_id` | Integer — database user ID |
| `username` | String |
| `chat_context` | List of up to 6 `(role, text)` tuples (3 exchanges) sent to Gemini |

---

## Known Limitations

- **Prolog is single-threaded:** `app.py` runs Flask with `threaded=False` because PySwip is not thread-safe. Gunicorn mitigates this with multiple workers, but a single worker processes one request at a time.
- **Data is primarily client-side:** All features work without an account. Data only reaches the server on login/logout sync or every 2 minutes. If a user never logs in, their data exists only in their browser.
- **Cross-device sync requires login:** localStorage is per-device and per-browser. Logging in and triggering a sync is the only way to move data between devices.
- **Voice requires Chromium:** The Web Speech API (`SpeechRecognition`) is not supported in Firefox. TTS (`SpeechSynthesis`) works in most browsers but voice quality varies.
- **SMTP not configured by default:** Email verification and password reset links are logged to the console when SMTP variables are not set. Emails are not sent in this state.
- **Open-app is server-side only:** The `/open-app` route opens applications on the server, not the user's device. Functionally useless in any hosted deployment.
- **Wordle in chat:** The Prolog `wordle_game.pl` module only handles entry-point triggers ("play wordle"). The full visual Wordle game is implemented entirely in `games.js` and runs in the chat window as an inline widget.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run the test suite: `cd tests && pytest -v`
5. Commit and push: `git push origin feature/your-feature`
6. Open a Pull Request

Please do not commit `.env` files or any file containing API keys or passwords.

---


