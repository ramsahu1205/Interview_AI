from flask import Flask, jsonify, request, render_template, Response
import json
import os
import requests
from dotenv import load_dotenv
import logging
from werkzeug.exceptions import HTTPException
from io import BytesIO
from elevenlabs.client import ElevenLabs

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Path to the JSON file with questions and answers
QUESTIONS_FILE = 'questions.json'

# Groq API key
GROQ_API_KEY = os.getenv('GROQ_API_KEY')
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# ElevenLabs API key
ELEVENLABS_API_KEY = os.getenv('ELEVENLABS_API_KEY')
elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY) if ELEVENLABS_API_KEY else None

# Load questions from JSON file
def load_questions():
    try:
        with open(QUESTIONS_FILE, 'r') as file:
            data = json.load(file)
            return data.get('questions', [])
    except FileNotFoundError:
        logger.error(f"Questions file not found: {QUESTIONS_FILE}")
        return []
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON format in questions file: {QUESTIONS_FILE}")
        return []

# Route to serve the main HTML page
@app.route('/')
 def index():
 
     return render_template('index.html')

# API route to get questions
@app.route('/api/questions', methods=['GET'])
def get_questions():
    questions = load_questions()
    # Remove the answers from the response to prevent cheating
    for question in questions:
        if 'answers' in question:
            del question['answers']
    
    return jsonify(questions)

# Function to analyze answer using Groq LLM API
def analyze_answer_with_groq(question, user_answer, reference_answers):
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set. Skipping LLM analysis.")
        return None
    
    try:
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Format reference answers for the prompt
        reference_answers_text = "\n".join([
            f"Reference Answer {i+1} (Score: {ans.get('score', 0)}%): {ans.get('text', '')}"
            for i, ans in enumerate(reference_answers)
        ])
        
        # Create the prompt for Groq
        prompt = f"""
        You are an expert interview evaluator. Analyze the following answer to an interview question.
        
        Question: {question}
        
        User's Answer: {user_answer}
        
        Reference Answers for Comparison:
        {reference_answers_text}
        
        Please evaluate the user's answer based on the following criteria:
        1. Accuracy - How factually correct is the answer?
        2. Completeness - Does it cover all important points?
        3. Clarity - Is the answer clear and well-articulated?
        4. Relevance - How well does it address the question?
        
        Format your response as JSON with the following fields:
        - score (integer between 0-100)
        - feedback (constructive feedback about the answer)
        
        Provide only the JSON object, no other text.
        """
        
        payload = {
            "model": "llama3-70b-8192",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 1000
        }
        
        response = requests.post(GROQ_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        
        # Parse the response
        result = response.json()
        content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
        
        # Extract JSON from content (in case there's additional text)
        import re
        json_match = re.search(r'({.*})', content, re.DOTALL)
        if json_match:
            analysis_json = json.loads(json_match.group(1))
            return analysis_json
        else:
            # Try to parse the entire content as JSON
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                logger.error(f"Could not parse LLM response as JSON: {content}")
                return None
        
    except requests.RequestException as e:
        logger.error(f"Error calling Groq API: {str(e)}")
        return None
    except json.JSONDecodeError:
        logger.error("Failed to decode JSON from Groq API response")
        return None
    except Exception as e:
        logger.error(f"Unexpected error in analyze_answer_with_groq: {str(e)}")
        return None

# Function to calculate score based on text similarity
def calculate_similarity_score(answer, reference_answers):
    # This is a simple implementation. In a production system,
    # you might use more sophisticated NLP techniques
    answer_lower = answer.lower()
    
    max_score = 0
    best_match_feedback = ""
    
    for ref_answer in reference_answers:
        ref_text = ref_answer.get('text', '').lower()
        ref_score = ref_answer.get('score', 0)
        ref_feedback = ref_answer.get('feedback', '')
        
        # Simple word overlap calculation
        answer_words = set(answer_lower.split())
        ref_words = set(ref_text.split())
        
        if len(ref_words) == 0:
            continue
        
        # Calculate overlap
        overlap = len(answer_words.intersection(ref_words)) / len(ref_words)
        calculated_score = int(overlap * ref_score)
        
        # Keep the highest score
        if calculated_score > max_score:
            max_score = calculated_score
            best_match_feedback = ref_feedback
    
    return max_score, best_match_feedback

# API route to submit answers and get feedback
@app.route('/api/submit', methods=['POST'])
def submit_interview():
    data = request.json
    user_answers = data.get('answers', [])
    
    if not user_answers:
        return jsonify({"error": "No answers provided"}), 400
    
    # Load questions with reference answers
    all_questions = load_questions()
    
    # Create a lookup dictionary for questions by ID
    questions_dict = {q['id']: q for q in all_questions}
    
    total_score = 0
    feedback_items = []
    
    for i, user_answer_item in enumerate(user_answers):
        question_id = user_answer_item.get('question_id')
        user_answer = user_answer_item.get('answer', '')
        
        if not question_id in questions_dict:
            continue
        
        question_data = questions_dict[question_id]
        question_text = question_data.get('question', '')
        reference_answers = question_data.get('answers', [])
        
        # Get AI analysis if Groq API key is available
        ai_analysis = analyze_answer_with_groq(question_text, user_answer, reference_answers)
        
        if ai_analysis:
            score = ai_analysis.get('score', 0)
            feedback = ai_analysis.get('feedback', '')
        else:
            # Fallback to similarity-based scoring
            score, feedback = calculate_similarity_score(user_answer, reference_answers)
            if not feedback:
                feedback = "Your answer was evaluated based on similarity to reference answers."
        
        # Add to total score
        total_score += score
        
        # Add feedback item
        feedback_items.append({
            "question_number": i + 1,
            "question": question_text,
            "user_answer": user_answer,
            "score": score,
            "feedback": feedback
        })
    
    # Calculate average score
    avg_score = total_score // len(user_answers) if user_answers else 0
    
    # Return the results
    return jsonify({
        "total_score": avg_score,
        "feedback": feedback_items
    })

# Route for text-to-speech conversion
@app.route('/api/text-to-speech', methods=['POST'])
def text_to_speech():
    data = request.json
    text = data.get('text', '')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    if not elevenlabs_client:
        return jsonify({"error": "ElevenLabs API key not configured"}), 500
    
    try:
        # Use ElevenLabs to convert text to speech
        audio = elevenlabs_client.text_to_speech.convert(
            text=text,
            voice_id="JBFqnCBsd6RMkjVDRZzb",  # Default voice ID
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        
        # Return audio file as response
        return Response(audio, mimetype='audio/mpeg')
    
    except Exception as e:
        logger.error(f"Error in text-to-speech conversion: {str(e)}")
        return jsonify({"error": "Failed to convert text to speech"}), 500

# Route for speech-to-text conversion
@app.route('/api/speech-to-text', methods=['POST'])
def speech_to_text():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    
    if not elevenlabs_client:
        return jsonify({"error": "ElevenLabs API key not configured"}), 500
    
    try:
        # Convert audio to bytes for ElevenLabs
        audio_data = BytesIO(audio_file.read())
        
        # Use ElevenLabs to convert speech to text
        transcription = elevenlabs_client.speech_to_text.convert(
            file=audio_data,
            model_id="scribe_v1",
        )
        
        return jsonify({"transcription": transcription})
    
    except Exception as e:
        logger.error(f"Error in speech-to-text conversion: {str(e)}")
        return jsonify({"error": "Failed to convert speech to text"}), 500

# Error handling
@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        return jsonify({"error": e.description}), e.code
    
    # For non-HTTP exceptions, log it and return a 500 error
    logger.error(f"Unhandled exception: {str(e)}")
    return jsonify({"error": "An unexpected error occurred"}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)