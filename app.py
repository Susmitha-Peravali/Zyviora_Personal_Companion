from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_session import Session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pyswip import Prolog
import os
import re
import subprocess
import webbrowser
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY and GEMINI_API_KEY != "INSERT_YOUR_API_KEY_HERE":
    genai.configure(api_key=GEMINI_API_KEY)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'zyviora-super-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Session setup
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

# Limit setup
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

db = SQLAlchemy(app)

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    # Storing frontend data as JSON text for easy syncing
    data = db.Column(db.Text, default='{}')

with app.app_context():
    db.create_all()

# --- Prolog Setup ---
prolog = Prolog()
base_dir = os.path.dirname(os.path.abspath(__name__))
prolog_main_path = os.path.join(base_dir, "prolog", "main.pl")

try:
    prolog_file_str = prolog_main_path.replace("\\", "/")
    prolog.consult(prolog_file_str)
    print(f"Successfully consulted {prolog_file_str}")
except Exception as e:
    print(f"Warning: Could not consult main.pl automatically. Ensure paths are correct. Error: {e}")

# --- Helper Functions ---
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

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/chat_ui')
def chat_ui():
    return render_template('chat.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()
    if user and check_password_hash(user.password_hash, data.get('password')):
        session['user_id'] = user.id
        session['username'] = user.username
        session['chat_context'] = []
        return jsonify({'status': 'success', 'message': 'Logged in successfully', 'userData': user.data})
    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template('register.html')
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if User.query.filter_by(username=username).first():
        return jsonify({'status': 'error', 'message': 'User already exists'}), 400
    
    new_user = User(
        username=username,
        password_hash=generate_password_hash(password)
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Registered successfully'})

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('chat_context', None)
    return jsonify({'status': 'success'})

@app.route('/sync', methods=['POST'])
def sync_data():
    """Sync frontend local data to backend"""
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'Not logged in'}), 401
    
    data = request.get_json()
    user = db.session.get(User, session['user_id'])
    if user:
        import json
        user.data = json.dumps(data)
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
                        print(f"Gemini API Error: {llm_error}")
                        response_text = "I'm still learning and don't quite know how to respond to that, but know I'm here for you! (API error)"
                else:
                    response_text = "I don't have a rule for that yet! Please add a Gemini API key to .env for dynamic answers."
        else:
            response_text = f"I heard you say: {raw_message}. (No pattern matched)"
            
    except Exception as e:
        print(f"Prolog Query Error: {e}")
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
def open_app():
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
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=False, use_reloader=False)
