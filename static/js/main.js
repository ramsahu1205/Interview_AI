document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startInterviewBtn = document.getElementById('startInterview');
    const interviewTypeSelect = document.getElementById('interviewType');
    const recordAudioBtn = document.getElementById('recordAudio');
    const toggleVoiceBtn = document.getElementById('toggleVoice');
    const chatHistory = document.getElementById('chatHistory');
    const userInput = document.getElementById('userInput');
    const sendMessageBtn = document.getElementById('sendMessage');
    const questionCountEl = document.getElementById('questionCount');
    const progressBar = document.querySelector('.progress');

    // State variables
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let voiceEnabled = true;
    let currentInterview = null;
    let questionCount = 0;
    let interviewContext = '';
    let maxQuestions = 10;
    let interviewCompleted = false;

    // Interview topics with starter questions
    const interviewStarters = {
        'general': 'Tell me a bit about yourself and your background.',
        'software': 'Can you describe your experience with software development and the technologies you\'re most comfortable with?',
        'management': 'What\'s your management style and how do you approach leading a team?',
        'marketing': 'What marketing campaigns or strategies have you worked on that you\'re particularly proud of?',
        'customer-service': 'How do you handle difficult customer situations?'
    };

    // Toggle voice output
    toggleVoiceBtn.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        toggleVoiceBtn.classList.toggle('active');
    });

    // Initialize audio recording
    const initAudioRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            // In main.js, modify the mediaRecorder.onstop handler
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioChunks = [];

                recordAudioBtn.disabled = true;
                recordAudioBtn.querySelector('.record-icon').textContent = '⏳';

                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.wav');

                try {
                    const response = await fetch('/api/speech-to-text', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (!response.ok || data.error || !data.text || data.text.startsWith("Error:")) {
                        addMessage(`Speech recognition failed: ${data.text || data.error || 'Unknown error'}`, false);
                    } else {
                        userInput.value = data.text;
                        sendMessage();
                    }
                } catch (error) {
                    addMessage(`Speech recognition error: ${error.message}`, false);
                }

                recordAudioBtn.disabled = false;
                recordAudioBtn.querySelector('.record-icon').textContent = '🎤';
            };

        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Error accessing microphone. Please ensure microphone permissions are enabled.');
            // Disable recording button if microphone access fails
            recordAudioBtn.disabled = true;
        }
    };

    // Initialize recording
    initAudioRecording();

    // Record audio button
    recordAudioBtn.addEventListener('click', () => {
        if (!mediaRecorder) {
            alert('Microphone access is required for recording. Please refresh the page and allow microphone access.');
            return;
        }

        if (isRecording) {
            // Stop recording
            mediaRecorder.stop();
            recordAudioBtn.classList.remove('recording');
            recordAudioBtn.querySelector('.record-icon').textContent = '🎤';
        } else {
            // Start recording
            audioChunks = [];
            mediaRecorder.start();
            recordAudioBtn.classList.add('recording');
            recordAudioBtn.querySelector('.record-icon').textContent = '⏹️';
        }

        isRecording = !isRecording;
    });

    // Add a message to the chat
    const addMessage = (content, isUser = false) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');

        if (isUser) {
            messageDiv.classList.add('user');
        }

        messageDiv.innerHTML = `
            <div class="avatar ${isUser ? 'user' : 'ai'}">${isUser ? 'You' : 'AI'}</div>
            <div class="message-content">${content}</div>
        `;

        chatHistory.appendChild(messageDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        // If AI message and voice is enabled, convert to speech
        if (!isUser && voiceEnabled) {
            textToSpeech(content);
        }
    };

    // Send a message to the AI
    const sendMessage = async () => {
        if (interviewCompleted) {
            addMessage("Interview completed. Please start a new interview for more questions.", false);
            return;
        }

        const message = userInput.value.trim();
        if (!message) return;

        addMessage(message, true);
        userInput.value = '';
        sendMessageBtn.disabled = true;
        sendMessageBtn.textContent = '...';

        try {
            const response = await fetch('/api/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: message, context: interviewContext })
            });

            const data = await response.json();
            if (data.response) {
                addMessage(data.response);
                interviewContext += `User: ${message}\nAI: ${data.response}\n`;
                questionCount++;
                questionCountEl.textContent = questionCount;
                const progress = Math.min(questionCount / maxQuestions * 100, 100);
                progressBar.style.width = `${progress}%`;

                // Check if interview is complete
                if (questionCount >= maxQuestions) {
                    interviewCompleted = true;
                    showScore(data.response);
                }
            }
        } catch (error) {
            addMessage('Error processing message', false);
        } finally {
            sendMessageBtn.disabled = false;
            sendMessageBtn.textContent = 'Send';
        }
    };

    const showScore = (lastResponse) => {
        const scoreMatch = lastResponse.match(/score.*?(\d+)\/10/i);
        if (scoreMatch) {
            const score = parseInt(scoreMatch[1]);
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'score-display';
            scoreDiv.innerHTML = `
                <h3>Interview Complete!</h3>
                <div class="score-circle" style="--score: ${score * 10}%">
                    <span>${score}/10</span>
                </div>
                <p>Your interview score</p>
            `;
            chatHistory.appendChild(scoreDiv);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    };

    // Convert text to speech
    const textToSpeech = async (text) => {
        try {
            const response = await fetch('/api/text-to-speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.audio) {
                // Play the audio
                const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
                audio.play().catch(e => console.error('Error playing audio:', e));
            }
        } catch (error) {
            console.error('Error converting text to speech:', error);
            // Silently fail for TTS errors (no need to show error to user)
            toggleVoiceBtn.classList.remove('active');
            voiceEnabled = false;
        }
    };

    // Start a new interview
    startInterviewBtn.addEventListener('click', () => {
        chatHistory.innerHTML = '';
        questionCount = 0;
        questionCountEl.textContent = questionCount;
        progressBar.style.width = '0%';
        interviewCompleted = false;
        const interviewType = interviewTypeSelect.value;
        const firstQuestion = interviewStarters[interviewType];
        interviewContext = `This is a ${interviewType} job interview.\n`;
        addMessage(firstQuestion);
        interviewContext += `AI: ${firstQuestion}\n`;
    });

    // Send message button click
    sendMessageBtn.addEventListener('click', sendMessage);

    // Send message on Enter key (but allow Shift+Enter for new lines)
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Start with a welcome message
    addMessage('Welcome to the AI Interview Assistant! Select an interview type and click "Start New Interview" to begin practicing.');
});