import requests
import base64
import tempfile
import os
import time
from utils.config import WHISPER_API_KEY

# In audio_service.py
def speech_to_text(audio_file):
    url = "https://api.openai.com/v1/audio/transcriptions"
    
    # Save audio file with explicit .wav extension
    temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    temp_path = temp_file.name
    
    # Read the raw audio data and write it
    audio_data = audio_file.read()
    with open(temp_path, 'wb') as f:
        f.write(audio_data)
    
    try:
        headers = {
            "Authorization": f"Bearer {WHISPER_API_KEY}"
        }
        
        # Explicitly specify audio/wav content type
        with open(temp_path, 'rb') as audio:
            files = {
                "file": ("recording.wav", audio, "audio/wav")
            }
            data = {
                "model": "whisper-1",
                "response_format": "json"
            }
            
            response = requests.post(url, headers=headers, files=files, data=data)
            
            if response.status_code != 200:
                print(f"API Error: {response.status_code} - {response.text}")
                return f"Error: Unable to transcribe audio (Status: {response.status_code})"
            
            result = response.json()
            text = result.get("text", "")
            if not text:
                return "Error: No text detected in audio"
            return text
            
    except Exception as e:
        print(f"Speech-to-text error: {str(e)}")
        return f"Error: Failed to process audio - {str(e)}"
    
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except:
            print(f"Warning: Could not delete temp file {temp_path}")

def text_to_speech(text):
    """
    Convert text to speech audio using Whisper API
    
    Args:
        text (str): The text to convert to speech
    
    Returns:
        str: Base64-encoded audio data
    """
    # OpenAI TTS API endpoint
    url = "https://api.openai.com/v1/audio/speech"
    
    # Prepare headers with API key
    headers = {
        "Authorization": f"Bearer {WHISPER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Prepare the request payload
    payload = {
        "model": "tts-1",
        "input": text,
        "voice": "alloy"  # Options: alloy, echo, fable, onyx, nova, shimmer
    }
    
    try:
        # Make the API request
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code != 200:
            print(f"TTS API Error: {response.status_code} - {response.text}")
            return None
        
        # Convert binary audio data to base64
        audio_base64 = base64.b64encode(response.content).decode('utf-8')
        
        return audio_base64
    
    except requests.exceptions.RequestException as e:
        print(f"Error calling OpenAI API for text-to-speech: {e}")
        return None