import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

# Load the API key from the .env file
load_dotenv()

app = Flask(__name__)
# Enable CORS so frontend HTML file can talk to this local server
CORS(app)

# Configure the Gemini client 
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("WARNING: GEMINI_API_KEY is not set in the .env file.")
genai.configure(api_key=api_key)

# The system prompt that forces Gemini to return the exact JSON forma
system_instruction = """
You are ScamShield AI, an expert cybersecurity threat analyst specializing in detecting phishing, scams, and fraudulent messages.
Analyze the message the user provides and assess how likely it is to be a scam. Base your judgment on real cybersecurity red flags.
If the message looks legitimate, assign a low risk_score and say so plainly.

Respond with ONLY a raw JSON object (no markdown, no code fences) matching exactly this shape:
{
  "risk_score": 0-100 integer,
  "threat_level": one of "Low", "Medium", "High", "Critical",
  "scam_type": short label for the type of scam, or "Not a Scam",
  "flags": array of short strings, each one specific suspicious indicator found (empty array if none),
  "recommendation": one or two sentences of clear, actionable advice
}
"""

# Define the model to strictly output JSON
generation_config = {
    "temperature": 0.3,
    "response_mime_type": "application/json",
}

model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    generation_config=generation_config,
    system_instruction=system_instruction
)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    # 1. Grab the text sent from script.js
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' in request body"}), 400

    message = data['text']

    try:
        # 2. Ask Gemini to analyze the text
        prompt = f'Analyze the following message:\n\n"""\n{message}\n"""'
        response = model.generate_content(prompt)
        
        # 3. Parse Gemini's JSON response and send it back t the frontend
        result = json.loads(response.text)
        return jsonify(result)
        
    except Exception as e:
        # If anything s wrong, send a clen error back to the frontend
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    
    app.run(port=5000, debug=True)
