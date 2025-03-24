// Global variables
let currentQuestion = null;
let currentQuestionId = null;
let sessionId = generateSessionId();
let questionsData = [];
let currentQuestionIndex = 0;
let audioQueue = [];
let processingAudio = false;
let autoProgressTimer = null;
let audioCache = {}; // Cache for TTS responses

// DOM Elements
const recordingOnBtn = document.getElementById('recording-on');
const recordingOffBtn = document.getElementById('recording-off');
const videoOnBtn = document.getElementById('video-on');
const videoOffBtn = document.getElementById('video-off');
const vidElement = document.getElementById('vid');
const robotElement = document.getElementById('robot-p');
const robotLoadingElement = document.getElementById('robot-loading');
const loadingTextElement = document.getElementById('loading-text');
const statusMessageElement = document.getElementById('status-message');
const interviewProgressElement = document.getElementById('interview-progress');
const progressFillElement = document.getElementById('progress-fill');
const progressMessageElement = document.getElementById('progress-message');

// Audio recording setup
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Auto progress timeout (ms)
const AUTO_PROGRESS_TIMEOUT = 8000; // 8 seconds
const TTS_TIMEOUT = 10000; // 10 seconds timeout for TTS requests

// Generate a random session ID
function generateSessionId() {
    return 'interview-' + Math.random().toString(36).substring(2, 15);
}

// Display a status message
function showStatus(message, duration = 3000) {
    statusMessageElement.textContent = message;
    statusMessageElement.classList.remove('hide');
    statusMessageElement.classList.add('fade-in');
    
    setTimeout(() => {
        statusMessageElement.classList.remove('fade-in');
        statusMessageElement.classList.add('fade-out');
        
        setTimeout(() => {
            statusMessageElement.classList.add('hide');
            statusMessageElement.classList.remove('fade-out');
        }, 500);
    }, duration);
}

// Show loading on robot
function showRobotLoading(message = "Processing...") {
    loadingTextElement.textContent = message;
    robotLoadingElement.classList.remove('hide');
    robotElement.classList.add('robot_thinking');
}

// Hide loading on robot
function hideRobotLoading() {
    robotLoadingElement.classList.add('hide');
    robotElement.classList.remove('robot_thinking');
}

// Show progress indicator for transition
function showProgressIndicator(message = "Moving to next question...", duration = 3000) {
    progressMessageElement.textContent = message;
    interviewProgressElement.classList.remove('hide');
    
    // Animate progress bar
    progressFillElement.style.width = '0%';
    setTimeout(() => {
        progressFillElement.style.width = '100%';
    }, 100);
    
    setTimeout(() => {
        interviewProgressElement.classList.add('hide');
    }, duration);
}

// Initialize video
async function initVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });
        vidElement.srcObject = stream;
        vidElement.play();
        videoOnBtn.classList.remove('hide');
        videoOffBtn.classList.add('hide');
    } catch (err) {
        console.error('Error accessing camera:', err);
        videoOnBtn.classList.add('hide');
        videoOffBtn.classList.remove('hide');
        showStatus('Camera access denied or not available');
    }
}

// Toggle video
function toggleVideo() {
    const stream = vidElement.srcObject;
    if (stream) {
        const tracks = stream.getTracks();
        
        if (videoOnBtn.classList.contains('hide')) {
            // Turn video on
            tracks.forEach(track => track.enabled = true);
            videoOnBtn.classList.remove('hide');
            videoOffBtn.classList.add('hide');
        } else {
            // Turn video off
            tracks.forEach(track => track.enabled = false);
            videoOnBtn.classList.add('hide');
            videoOffBtn.classList.remove('hide');
        }
    } else {
        initVideo();
    }
}

// Initialize audio recording
async function initAudioRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            audioChunks = [];
            await processRecording(audioBlob);
        };

    } catch (error) {
        console.error('Error accessing microphone:', error);
        showStatus('Microphone access denied or not available');
        recordingOnBtn.disabled = true;
    }
}

// Process the recorded audio via Whisper API
async function processRecording(audioBlob) {
    try {
        showRobotLoading("Processing your response...");
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');

        const response = await fetch('/api/speech-to-text', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok || data.error || !data.text || data.text.startsWith("Error:")) {
            hideRobotLoading();
            showStatus(`Speech recognition failed: ${data.text || data.error || 'Unknown error'}`);
            return;
        }

        const userResponse = data.text;
        console.log("Transcribed speech:", userResponse);
        
        if (userResponse.trim() === "") {
            hideRobotLoading();
            showStatus("No speech detected. Please try again.");
            return;
        }
        
        if (currentQuestion) {
            // Simply store the response without evaluation
            await storeResponse(currentQuestion, userResponse, currentQuestionId);
            
            // Show transition to next question
            showProgressIndicator();
            
            // Move to next question after a short delay
            setTimeout(() => {
                moveToNextQuestion();
            }, 1500); // Shorter delay since we're skipping evaluation
        }
        
    } catch (error) {
        console.error('Error processing recording:', error);
        hideRobotLoading();
        showStatus('Error processing recording');
    }
}

// Start recording
function startRecording() {
    if (!mediaRecorder) {
        initAudioRecording().then(() => {
            startRecordingProcess();
        });
    } else {
        startRecordingProcess();
    }
}

function startRecordingProcess() {
    if (isRecording) return;
    
    audioChunks = [];
    mediaRecorder.start();
    isRecording = true;
    
    recordingOnBtn.classList.add('recording-start');
    recordingOffBtn.classList.remove('hide');
    recordingOnBtn.classList.remove('hide');
    
    showStatus('Recording started');
}

// Stop recording
function stopRecording() {
    if (!isRecording) return;
    
    mediaRecorder.stop();
    isRecording = false;
    
    recordingOffBtn.classList.add('hide');
    recordingOnBtn.classList.remove('recording-start');
    
    showStatus('Processing your response...');
}

// TTS with caching
async function getTextToSpeech(text) {
    // Check if this text is already in cache
    if (audioCache[text]) {
        console.log("Using cached audio for:", text.substring(0, 30) + "...");
        return audioCache[text];
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT);
        
        const response = await fetch('/api/text-to-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (data.audio) {
            // Cache the audio data
            audioCache[text] = data.audio;
            return data.audio;
        } else {
            throw new Error('No audio data received');
        }
    } catch (error) {
        console.error('Error with TTS:', error);
        if (error.name === 'AbortError') {
            console.log('TTS request timed out, using fallback');
            showStatus('Speech generation timed out, using fallback');
            
            // Return null to indicate need for fallback
            return null;
        }
        throw error;
    }
}

// Speak text with fallback to browser synthesis if needed
async function speakText(text) {
    try {
        showRobotLoading("Generating speech...");
        robotElement.classList.add('robot_speaking');
        
        const audioData = await getTextToSpeech(text);
        
        hideRobotLoading();
        
        if (audioData) {
            // Play using Whisper API audio
            const audio = new Audio(`data:audio/mp3;base64,${audioData}`);
            
            return new Promise((resolve) => {
                audio.onended = () => {
                    robotElement.classList.remove('robot_speaking');
                    resolve();
                };
                
                audio.onerror = () => {
                    console.error('Error playing audio, using fallback');
                    robotElement.classList.remove('robot_speaking');
                    resolve();
                };
                
                audio.play().catch(e => {
                    console.error('Error playing audio:', e);
                    robotElement.classList.remove('robot_speaking');
                    resolve();
                });
            });
        } else {
            // Fallback to browser speech synthesis
            console.log("Using browser speech synthesis fallback");
            
            return new Promise((resolve) => {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.onend = () => {
                    robotElement.classList.remove('robot_speaking');
                    resolve();
                };
                
                utterance.onerror = () => {
                    robotElement.classList.remove('robot_speaking');
                    resolve();
                };
                
                speechSynthesis.speak(utterance);
            });
        }
    } catch (error) {
        console.error('Error in speech process:', error);
        hideRobotLoading();
        robotElement.classList.remove('robot_speaking');
        showStatus('Error generating speech');
    }
}

// Process audio queue to ensure sequential playback
async function processAudioQueue() {
    if (processingAudio || audioQueue.length === 0) return;
    
    processingAudio = true;
    const nextAudio = audioQueue.shift();
    
    await speakText(nextAudio);
    
    processingAudio = false;
    processAudioQueue(); // Process next in queue
}

// Add text to the speech queue
function queueSpeech(text) {
    audioQueue.push(text);
    if (!processingAudio) {
        processAudioQueue();
    }
}

// Evaluate user response using backend
async function storeResponse(question, response, questionId) {
    try {
        await fetch('/api/store-response', {  
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: sessionId,
                questionId: questionId,
                question: question,
                response: response
            })
        });
    } catch (error) {
        console.error('Error storing response:', error);
    }
}

// Functions to handle question display and audio
async function moveToNextQuestion() {
    currentQuestionIndex++;
    
    if (currentQuestionIndex < questionsData.length) {
        const questionData = questionsData[currentQuestionIndex];
        currentQuestion = questionData.Question;
        currentQuestionId = currentQuestionIndex;
        
        await processNextQuestion(questionData);
    } else {
        // End of interview
        await endInterview();
    }
}

// End the interview and show results
async function endInterview() {
    try {
        // Queue conclusion text
        queueSpeech("That concludes our interview session. Thank you for your participation. You can now view your overall results.");
        
        // Get results
        const result = await fetch(`/api/results/${sessionId}`);
        const data = await result.json();
        
        // Queue results text
        queueSpeech(`Your overall interview score is ${data.averageScore} out of 10. If you'd like to improve, consider practicing more interview questions.`);
        
        showStatus("Interview completed!");
    } catch (error) {
        console.error('Error in end interview:', error);
        showStatus('Error retrieving interview results');
    }
}

// Initialize audio for questions
async function processFirstQuestion(questionData) {
    try {
        // Queue introduction text
        queueSpeech("Hello. I am Alison. I am Taking Your Interview. Your First Question is.");
        
        const imgElement = document.getElementById('q-img');
        
        robotElement.classList.add('center-to-top');
        
        if (questionData.img_url) {
            imgElement.classList.remove('hide');
            imgElement.src = "https://stem.varoshakart.in/QNA" + questionData.img_url;
            
            // Queue question with image reference
            queueSpeech(questionData.Question + ". Please find the image.");
        } else {
            imgElement.classList.add('hide');
            
            // Queue just the question
            queueSpeech(questionData.Question);
        }
    } catch (error) {
        console.error('Error processing first question:', error);
        showStatus('Error presenting question');
    }
}

// Process subsequent questions
async function processNextQuestion(questionData) {
    try {
        // Queue transition text
        queueSpeech("Your Next Question is.");
        
        const imgElement = document.getElementById('q-img');
        
        if (questionData.img_url) {
            imgElement.classList.remove('hide');
            imgElement.src = "https://stem.varoshakart.in/QNA" + questionData.img_url;
            robotElement.classList.add('center-to-top');
            
            // Queue question with image
            queueSpeech(questionData.Question + ". Please find the image.");
        } else {
            imgElement.classList.add('hide');
            robotElement.classList.remove('center-to-top');
            
            // Queue just the question
            queueSpeech(questionData.Question);
        }
    } catch (error) {
        console.error('Error processing next question:', error);
        showStatus('Error presenting question');
    }
}

// Pre-cache common phrases
async function preCacheCommonPhrases() {
    try {
        // Pre-fetch and cache common phrases
        await getTextToSpeech("Your Next Question is.");
        await getTextToSpeech("Thanks for your response. Let me evaluate it...");
        await getTextToSpeech("That concludes our interview session. Thank you for your participation.");
    } catch (error) {
        console.error('Error pre-caching phrases:', error);
    }
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Show welcome message
    showStatus('Welcome to the AI Interview! Click the microphone when ready to respond.', 5000);
    
    // Initialize recording and video
    initAudioRecording();
    initVideo();
    
    // Pre-cache common phrases
    preCacheCommonPhrases();
    
    // Setup event listeners
    videoOnBtn.addEventListener('click', toggleVideo);
    videoOffBtn.addEventListener('click', toggleVideo);
    recordingOnBtn.addEventListener('click', startRecording);
    recordingOffBtn.addEventListener('click', stopRecording);
    
    // Load questions data and start interview
    loadData()
        .then(({status, data}) => {
            if (status && data && data.length > 0) {
                questionsData = data;
                currentQuestion = data[0].Question;
                currentQuestionId = 0;
                
                // Start with the first question
                processFirstQuestion(data[0]);
            } else {
                showStatus('Error loading questions');
            }
        })
        .catch(err => {
            console.error('Error loading questions:', err);
            showStatus('Error loading interview questions');
        });
});