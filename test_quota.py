import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

models_to_test = ['gemini-flash-lite-latest', 'gemma-3-12b-it', 'gemini-pro-latest']

with open("test_quota_output.txt", "w", encoding="utf-8") as f:
    for m in models_to_test:
        f.write(f"\n--- Testing {m} ---\n")
        try:
            model = genai.GenerativeModel(m)
            r = model.generate_content("Say hi")
            f.write(f"SUCCESS! Output length: {len(r.text)}\n")
        except Exception as e:
            f.write(f"FAILED: {str(e).split(']')[0]}\n")
