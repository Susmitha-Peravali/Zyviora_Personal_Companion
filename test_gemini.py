import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
try:
    genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
    with open("models.txt", "w", encoding="utf-8") as f:
        f.write("Available Gemini Models:\n")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                f.write(m.name + "\n")
except Exception as e:
    with open("models.txt", "w", encoding="utf-8") as f:
        f.write("Error listing models: " + str(e))
