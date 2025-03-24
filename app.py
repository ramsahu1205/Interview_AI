from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import traceback
from services.llm_service import evaluate_response
from services.audio_service import speech_to_text

app = Flask(__name__)

# Track questions and responses for the session
interview_data = {}

@app.route('/')
def index():
    return render_template('interview.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/api/speech-to-text', methods=['POST'])
def handle_speech_to_text():
    """API endpoint for converting speech to text using Whisper API"""
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        
        if not audio_file or not audio_file.filename:
            return jsonify({'error': 'Invalid audio file'}), 400
        
        # Convert speech to text using Whisper
        text = speech_to_text(audio_file)
        
        return jsonify({'text': text})
    except Exception as e:
        print(f"Error in handle_speech_to_text: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': 'Server error processing speech'}), 500

@app.route('/api/text-to-speech', methods=['POST'])
def handle_text_to_speech():
    """API endpoint for converting text to speech using Whisper API"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
            
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        # Limit text length to prevent very large audio files
        if len(text) > 1000:
            text = text[:1000] + "..."
        
        # Import the text_to_speech function from audio_service
        from services.audio_service import text_to_speech
        
        # Convert text to speech using OpenAI's TTS API
        audio_data = text_to_speech(text)
        
        if not audio_data:
            return jsonify({'error': 'Failed to generate speech'}), 500
        
        return jsonify({'audio': audio_data})
    except Exception as e:
        print(f"Error in handle_text_to_speech: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': 'Server error generating speech'}), 500

@app.route('/api/results/<session_id>', methods=['GET'])
def get_results(session_id):
    """API endpoint for getting overall interview results"""
    if session_id not in interview_data:
        return jsonify({'error': 'Session not found'}), 404
    
    session = interview_data[session_id]
    results = []
    
    total_score = 0
    count = 0
    
    for question_id, data in session.items():
        if 'evaluation' in data:
            results.append({
                'questionId': question_id,
                'question': data['question'],
                'response': data['response'],
                'evaluation': data['evaluation']
            })
            total_score += data['evaluation'].get('score', 0)
            count += 1
    
    average_score = total_score / count if count > 0 else 0
    
    return jsonify({
        'sessionId': session_id,
        'averageScore': round(average_score, 1),
        'questionCount': count,
        'results': results
    })

@app.route('/api/store-response', methods=['POST'])
def store_response():
    """API endpoint for storing user responses without evaluation"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
            
        session_id = data.get('sessionId', 'default')
        question_id = data.get('questionId')
        question = data.get('question', '')
        response = data.get('response', '')
        
        if not question or not response:
            return jsonify({'error': 'Question and response are required'}), 400
        
        # Store the question and response without evaluation
        if session_id not in interview_data:
            interview_data[session_id] = {}
        
        interview_data[session_id][question_id] = {
            'question': question,
            'response': response
            # No evaluation stored
        }
        
        return jsonify({'status': 'success'})
        
    except Exception as e:
        print(f"Error in store_response: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': 'Server error storing response'}), 500

if __name__ == '__main__':
    # Make sure the utils directory exists
    os.makedirs('utils', exist_ok=True)
    
    # Make sure the services directory exists
    os.makedirs('services', exist_ok=True)
    
    # Create __init__.py files to make directories proper Python packages
    open(os.path.join('utils', '__init__.py'), 'a').close()
    open(os.path.join('services', '__init__.py'), 'a').close()
    
    # Get port from environment variable for Render deployment
    port = int(os.getenv('PORT', 5000))
    # Run the app on host 0.0.0.0 to make it accessible externally
    app.run(host='0.0.0.0', port=port)