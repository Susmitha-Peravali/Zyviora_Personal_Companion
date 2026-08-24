from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_session import Session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from pyswip import Prolog
from functools import wraps
from datetime import datetime, timedelta, timezone
import logging
import os
import re
import secrets
import subprocess
import webbrowser
import google.generativeai as genai
from dotenv import load_dotenv

try:
    import redis as redis_lib
except ImportError:
    redis_lib = None

# Load environment variables
load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("zyviora")

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY and GEMINI_API_KEY != "INSERT_YOUR_API_KEY_HERE":
    genai.configure(api_key=GEMINI_API_KEY)

FLASK_DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"

app = Flask(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_hex(32)
    logger.warning("SECRET_KEY not set in environment — using a random ephemeral key. "
                    "Sessions/CSRF tokens will not survive a restart. Set SECRET_KEY in .env for production.")
app.config['SECRET_KEY'] = SECRET_KEY

# DATABASE_URL lets you point at Postgres (or anything SQLAlchemy supports) in
# a real deployment; unset, it falls back to the local SQLite file used today.
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///database.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# BEHIND_PROXY: set this when a reverse proxy (Caddy/nginx/Traefik — see
# deploy/Caddyfile.example) terminates TLS in front of this app. Without it,
# Flask sees the proxy's own IP/scheme on every request instead of the real
# client's, which breaks IP-based rate limiting and makes the app think every
# request arrived over plain HTTP even when the proxy served it over HTTPS.
BEHIND_PROXY = os.getenv("BEHIND_PROXY", "false").lower() == "true"
if BEHIND_PROXY:
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# Only enable once TLS is actually terminated in front of the app (i.e. once
# BEHIND_PROXY is true and the proxy is serving HTTPS) — a Secure cookie is
# never sent back by the browser over plain HTTP, which would silently break
# every login on a plain local/docker-compose setup like the one used to
# develop and test this app so far.
app.config['SESSION_COOKIE_SECURE'] = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"

# Session setup — REDIS_URL switches from per-container filesystem sessions
# (broken once you run more than one worker/replica) to shared Redis sessions.
REDIS_URL = os.getenv('REDIS_URL')
if REDIS_URL and redis_lib:
    app.config['SESSION_TYPE'] = 'redis'
    app.config['SESSION_REDIS'] = redis_lib.from_url(REDIS_URL)
else:
    app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

# CSRF protection for all state-changing requests
csrf = CSRFProtect(app)

# Limit setup — same REDIS_URL gives rate limits a shared store across
# workers/replicas instead of each process counting in its own memory.
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri=REDIS_URL if REDIS_URL else "memory://"
)

db = SQLAlchemy(app)


def login_required(view):
    """Guards HTML page routes that require an authenticated session."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return view(*args, **kwargs)
    return wrapped


def api_login_required(view):
    """Guards JSON API routes: returns 401 instead of redirecting."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'status': 'error', 'message': 'Not logged in'}), 401
        return view(*args, **kwargs)
    return wrapped

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    full_name = db.Column(db.String(120), nullable=True)
    failed_login_attempts = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    # Storing frontend data as JSON text for easy syncing
    data = db.Column(db.Text, default='{}')

with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        # Multiple Gunicorn workers/replicas can race to create the schema on
        # first boot against a shared DB; a losing IntegrityError here is
        # benign as long as another worker won the race. Gunicorn's --preload
        # flag avoids the race within a single container (schema is created
        # once in the master before forking workers); this is a fallback for
        # multi-container/replica deployments.
        logger.warning("db.create_all() warning (likely a benign create-table race): %s", e)

    # db.create_all() only creates missing tables — it never alters an
    # existing one, so adding a column to this model does nothing for a
    # database that already has a "user" table from before. Add any missing
    # columns by hand so existing accounts survive. Columns stay nullable so
    # old rows (which predate email/full_name) don't break; /register still
    # requires both for new signups.
    #
    # "user" is quoted throughout — it's a reserved word in PostgreSQL, and an
    # unquoted ALTER TABLE user ... fails there with a syntax error.
    from sqlalchemy import inspect, text
    existing_columns = {c["name"] for c in inspect(db.engine).get_columns("user")}
    missing_columns = (
        ("email", "VARCHAR(120)"),
        ("full_name", "VARCHAR(120)"),
        ("failed_login_attempts", "INTEGER NOT NULL DEFAULT 0"),
        ("locked_until", "TIMESTAMP"),
    )
    for column_name, ddl_type in missing_columns:
        if column_name in existing_columns:
            continue
        try:
            db.session.execute(text(f'ALTER TABLE "user" ADD COLUMN {column_name} {ddl_type}'))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            # A losing race against another worker adding the same column
            # concurrently is genuinely benign; anything else (bad DDL syntax,
            # permissions, a typo) is a real migration failure and must not be
            # swallowed silently, or the app keeps running against a schema
            # that doesn't match its models.
            if column_name in {c["name"] for c in inspect(db.engine).get_columns("user")}:
                logger.info("Column %s already present (likely a concurrent-worker race): %s", column_name, e)
            else:
                logger.error('Failed to add column %s to "user": %s', column_name, e)
                raise

# --- Prolog Setup ---
prolog = Prolog()
# base_dir = os.path.dirname(os.path.abspath(__name__))
base_dir = os.path.dirname(os.path.abspath(__file__))
prolog_main_path = os.path.join(base_dir, "prolog", "main.pl")

try:
    prolog_file_str = prolog_main_path.replace("\\", "/")
    prolog.consult(prolog_file_str)
    logger.info("Successfully consulted %s", prolog_file_str)
except Exception as e:
    logger.error("Could not consult main.pl automatically. Ensure paths are correct. Error: %s", e)

# --- Helper Functions ---
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)


def utcnow():
    # datetime.utcnow() is deprecated; this stays naive (rather than
    # timezone-aware) to match what SQLite/plain-TIMESTAMP columns actually
    # round-trip, avoiding aware-vs-naive comparison errors on read-back.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_password_strong(password):
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Za-z]', password):
        return False, "Password must contain at least one letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    return True, None


def preprocess_text(text):
    """
    Cleans text before sending to Prolog.
    Removes punctuation, lowers case, and filters basic stopwords.
    """
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text) # Strip punctuation
    words = text.split()
    
    stop_words = {"the", "a", "an", "is", "are", "to", "in", "on", "at", "it", "very", "so", "much", "too"}
    synonyms = {
        "depressed": "sad", "unhappy": "sad",
        "nervous": "anxious", "panic": "anxious",
        "exhausted": "tired", "sleepy": "tired"
    }

    processed_words = []
    for w in words:
        if w not in stop_words:
            # Swap for synonym if available
            processed_words.append(synonyms.get(w, w))
            
    return " ".join(processed_words)

# --- Routes ---

@app.route('/healthz')
@limiter.exempt
def healthz():
    """Lightweight liveness endpoint for load balancers/orchestrators
    (Render, etc). Deliberately exempt from rate limiting — a health checker
    polling every few seconds would otherwise trip the global default_limits
    and get 429'd, which is exactly what happened when default_limits was
    first added: Render's own health check against '/' got rate-limited,
    repeatedly cycling the instance as "unhealthy"."""
    return jsonify({'status': 'ok'})

@app.route('/')
@limiter.exempt
def home():
    return render_template('index.html')

@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

@app.route('/chat_ui')
def chat_ui():
    return render_template('chat.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/login', methods=['GET', 'POST'])
@limiter.limit("10 per minute", methods=["POST"])
def login():
    if request.method == 'GET':
        return render_template('login.html')
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()

    # Per-account lockout: the IP-based rate limit above only slows down a
    # single attacker hammering one IP — it does nothing against a
    # distributed attack aimed at one specific account.
    if user and user.locked_until and user.locked_until > utcnow():
        remaining_minutes = max(1, int((user.locked_until - utcnow()).total_seconds() // 60) + 1)
        return jsonify({
            'status': 'error',
            'message': f'Too many failed attempts. Try again in {remaining_minutes} minute(s).'
        }), 403

    if user and check_password_hash(user.password_hash, data.get('password')):
        user.failed_login_attempts = 0
        user.locked_until = None
        db.session.commit()
        session['user_id'] = user.id
        session['username'] = user.username
        session['chat_context'] = []
        logger.info("Login success: user_id=%s", user.id)
        return jsonify({
            'status': 'success',
            'message': 'Logged in successfully',
            'userData': user.data,
            'fullName': user.full_name,
        })

    if user:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = utcnow() + LOCKOUT_DURATION
            logger.warning("Account locked after repeated failed logins: user_id=%s", user.id)
        db.session.commit()
        logger.info("Login failed (bad password): user_id=%s attempt=%d", user.id, user.failed_login_attempts)
    else:
        logger.info("Login failed (unknown username)")

    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

@app.route('/register', methods=['GET', 'POST'])
@limiter.limit("10 per minute", methods=["POST"])
def register():
    if request.method == 'GET':
        return render_template('register.html')
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    full_name = data.get('fullname')

    if not username or not password or not email or not full_name:
        return jsonify({'status': 'error', 'message': 'username, password, email, and fullname are all required'}), 400
    password_ok, password_error = is_password_strong(password)
    if not password_ok:
        return jsonify({'status': 'error', 'message': password_error}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'status': 'error', 'message': 'User already exists'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'status': 'error', 'message': 'An account with that email already exists'}), 400

    new_user = User(
        username=username,
        password_hash=generate_password_hash(password),
        email=email,
        full_name=full_name
    )
    db.session.add(new_user)
    db.session.commit()
    logger.info("New registration: user_id=%s", new_user.id)
    return jsonify({'status': 'success', 'message': 'Registered successfully'})

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('chat_context', None)
    return jsonify({'status': 'success'})

MAX_SYNC_PAYLOAD_BYTES = 256 * 1024  # generous for goals/tasks/reminders/mood history, not unbounded


@app.route('/sync', methods=['POST'])
@api_login_required
def sync_data():
    """Sync frontend local data to backend"""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'status': 'error', 'message': 'Expected a JSON object'}), 400

    import json
    serialized = json.dumps(data)
    if len(serialized.encode('utf-8')) > MAX_SYNC_PAYLOAD_BYTES:
        return jsonify({'status': 'error', 'message': 'Sync payload too large'}), 413

    user = db.session.get(User, session['user_id'])
    if user:
        user.data = serialized
        db.session.commit()
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error'}), 404

@app.route('/chat', methods=['POST'])
@limiter.limit("40 per minute")
def chat():
    """Text chat endpoint with context and preprocessing."""
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'Invalid request Format'}), 400
    
    raw_message = data.get('message', '').strip()
    safe_message = preprocess_text(raw_message).replace("'", "\\'")

    # Belt-and-suspenders guard: preprocess_text() already strips everything but
    # word characters/whitespace, but we assert it explicitly right before this
    # string is interpolated into a Prolog query, so the query is never built
    # from unvalidated input even if preprocessing changes later.
    if not re.fullmatch(r"[\w\s]*", safe_message):
        return jsonify({'error': 'Invalid characters in message'}), 400

    # Init context history if missing
    if 'chat_context' not in session:
        session['chat_context'] = []
    
    response_text = "I'm not sure how to respond to that yet."
    
    try:
        # Prolog query
        query = f"handle_input('{safe_message}', Response)"
        results = list(prolog.query(query))
        
        if results:
            response_text = results[0]["Response"]
            if isinstance(response_text, bytes):
                response_text = response_text.decode('utf-8')
                
            # Fallback to Gemini
            if response_text == '[unhandled_intent]':
                if GEMINI_API_KEY and GEMINI_API_KEY != "INSERT_YOUR_API_KEY_HERE":
                    try:
                        # Construct prompt with context
                        history_str = "\n".join([f"{u}: {a}" for u, a in session['chat_context']])
                        
                        llm_prompt = (
                            f"You are Zyviora, a friendly and helpful assistant.\n"
                            f"- Be natural and conversational\n"
                            f"- Use empathy only when needed and keep it short\n"
                            f"- Focus on useful and practical responses\n"
                            f"- Avoid repeating phrases\n"
                            f"- Keep responses concise and engaging\n"
                            f"- If user expresses emotion, acknowledge briefly and then help constructively\n\n"
                            f"Here is recent context:\n{history_str}\n"
                            f"User says: '{raw_message}'\n"
                        )
                        
                        model = genai.GenerativeModel('gemini-flash-lite-latest')
                        llm_response = model.generate_content(
                            llm_prompt,
                            generation_config=genai.GenerationConfig(max_output_tokens=256)
                        )
                        response_text = llm_response.text if llm_response.text else "I'm here! Could you tell me more?"
                    except Exception as llm_error:
                        logger.error("Gemini API error: %s", llm_error)
                        response_text = "I'm still learning and don't quite know how to respond to that, but know I'm here for you! (API error)"
                else:
                    response_text = "I don't have a rule for that yet! Please add a Gemini API key to .env for dynamic answers."
        else:
            response_text = f"I heard you say: {raw_message}. (No pattern matched)"
            
    except Exception as e:
        logger.error("Prolog query error: %s", e)
        response_text = "I'm having a little trouble thinking straight right now. (Logic engine error)"
        
    # Append to context
    context = session['chat_context']
    context.append(("User", raw_message))
    context.append(("Zyviora", response_text))
    # Keep last 3 exchanges (6 messages total: 3 pairs)
    if len(context) > 6:
        context = context[-6:]
    session['chat_context'] = context
    
    return jsonify({'response': response_text})

@app.route('/open-app', methods=['POST'])
@api_login_required
@limiter.limit("10 per minute")
def open_app():
    """Launches a desktop app on the SERVER's machine. Only makes sense for a
    single-user local install (e.g. this container run on your own PC) — on a
    real multi-tenant deployment this opens apps on the host, not the caller's
    device. Login-gated to keep it from being a public unauthenticated
    process-launcher; still not safe to expose to untrusted multi-tenant users."""
    data = request.get_json()
    if not data or 'app_name' not in data:
        return jsonify({'status': 'error', 'message': 'No app_name provided'}), 400
        
    app_name = data.get('app_name', '').lower()
    
    try:
        if app_name == 'calculator':
            subprocess.Popen("calc.exe")
        elif app_name == 'notepad':
            subprocess.Popen("notepad.exe")
        elif app_name == 'word':
            subprocess.Popen("start winword", shell=True)
        elif app_name == 'powerpoint':
            subprocess.Popen("start powerpnt", shell=True)
        elif app_name == 'youtube':
            webbrowser.open("https://youtube.com")
        elif app_name == 'calendar':
            webbrowser.open("https://calendar.google.com")
        else:
            return jsonify({'status': 'error', 'message': 'Unknown application'}), 400
            
        return jsonify({'status': 'success', 'message': f'Opened {app_name}'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=FLASK_DEBUG, host='0.0.0.0', port=5000, threaded=False, use_reloader=False)
