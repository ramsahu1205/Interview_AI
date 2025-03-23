import requests
import json
from utils.config import GROQ_API_KEY

def evaluate_response(question, response):
    """
    Evaluate user's interview response using Llama3 LLM
    
    Args:
        question (str): The interview question posed to the user
        response (str): The user's response to evaluate
    
    Returns:
        dict: Evaluation results including score and feedback
    """
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    system_prompt = """You are an AI interview evaluator. Evaluate the candidate's response to the given interview question.
    Provide:
    1. A score from 1-10
    2. Brief feedback (2-3 sentences max)
    3. One short suggestion for improvement
    
    Focus on:
    - Relevance to the question (40%)
    - Clarity and articulation (30%)
    - Content and substance (30%)
    
    Format your response as JSON with keys: 'score', 'feedback', and 'suggestion'.
    """
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Question: {question}\n\nCandidate's Response: {response}"}
    ]
    
    payload = {
        "model": "llama3-8b-8192",
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 300,
        "response_format": {"type": "json_object"}
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        
        # Extract and parse the JSON response
        llm_response = result["choices"][0]["message"]["content"]
        evaluation = json.loads(llm_response)
        
        return {
            "score": evaluation.get("score", 5),
            "feedback": evaluation.get("feedback", "No feedback provided."),
            "suggestion": evaluation.get("suggestion", "No suggestion provided.")
        }
    except Exception as e:
        print(f"Error calling Groq API: {e}")
        return {
            "score": 5,
            "feedback": "Unable to evaluate response due to technical error.",
            "suggestion": "Please try again later."
        }