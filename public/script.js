// ===== CONFIGURATION =====
const CONFIG = {
    BACKEND_URL: window.location.origin,
    REFRESH_INTERVAL: 2000,
    TYPING_TIMEOUT: 3000,
    MAX_MESSAGE_LENGTH: 500,
    VOICE_MAX_DURATION: 120000 // 2 minutes
};

// ===== STATE MANAGEMENT =====
let state = {
    currentUser: null,
    isAdmin: false,
    messages: [],
    typingUsers: new Set(),
    isTyping: false,
    lastTypingTime: 0,
    selectedMessage: null,
    theme: localStorage.getItem('theme') || 'dark',
    background: localStorage.getItem('background') || 'gradient',
    autoScroll: true,
    connectionStatus: 'disconnected',
    onlineUsers: new Set(),
    audioContext: null,
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    recordingStartTime: 0,
    currentThread: null,
    pushSubscription: null
};

// ===== DOM ELEMENTS =====
const elements = {
    // Screens
    loadingScreen: document.getElementById('loadingScreen'),
    authScreen: document.getElementById('authScreen'),
    chatScreen: document.getElementById('chatScreen'),
    blockedScreen: document.getElementById('blockedScreen'),
    
    // Auth Screen
    nameInput: document.getElementById('nameInput'),
    adminPasswordGroup: document.getElementById('adminPasswordGroup'),
    adminPassword: document.getElementById('adminPassword'),
    continueBtn: document.getElementById('continueBtn'),
    
    // Chat Screen
    backBtn: document.getElementById('backBtn'),
    themeToggle: document.getElementById('themeToggle'),
    adminBadge: document.getElementById('adminBadge'),
    onlineStatus: document.getElementById('onlineStatus'),
    messagesContainer: document.getElementById('messagesContainer'),
    messagesList: document.getElementById('messagesList'),
    typingIndicator: document.getElementById('typingIndicator'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    charCount: document.getElementById('charCount'),
    
    // Voice Recording
    voiceRecorder: document.getElementById('voiceRecorder'),
    recordBtn: document.getElementById('recordBtn'),
    cancelRecord: document.getElementById('cancelRecord'),
    voiceBtn: document.getElementById('voiceBtn'),
    
    // Modals & Menus
    contextMenu: document.getElementById('contextMenu'),
    adminModal: document.getElementById('adminModal'),
    modalAdminPassword: document.getElementById('modalAdminPassword'),
    confirmAdmin: document.getElementById('confirmAdmin'),
    cancelAdmin: document.getElementById('cancelAdmin'),
    pollModal: document.getElementById('pollModal'),
    
    // Search & Settings
    searchBtn: document.getElementById('searchBtn'),
    searchOverlay: document.getElementById('searchOverlay'),
    searchInput: document.getElementById('searchInput'),
    closeSearch: document.getElementById('closeSearch'),
    searchResults: document.getElementById('searchResults'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    closeSettings: document.getElementById('closeSettings'),
    
    // Status
    connectionStatus: document.getElementById('connectionStatus'),
    
    // Reaction Picker
    reactionPicker: document.getElementById('reactionPicker'),
    emojiBtn: document.getElementById('emojiBtn')
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
    setupEventListeners();
    applyTheme(state.theme);
    applyBackground(state.background);
    setupServiceWorker();
    setupMobileKeyboard();
});

async function initializeApp() {
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check server health
    await checkServerHealth();
    
    hideLoadingScreen();
    showAuthScreen();
    
    // Check for existing session
    const savedName = localStorage.getItem('chatSphere_userName');
    if (savedName) {
        elements.nameInput.value = savedName;
        handleNameInput();
    }
}

function setupEventListeners() {
    // Auth Screen
    elements.nameInput.addEventListener('input', handleNameInput);
    elements.continueBtn.addEventListener('click', handleAuth);
    elements.nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
    });
    
    // Chat Screen
    elements.backBtn.addEventListener('click', handleBack);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.messageInput.addEventListener('input', handleMessageInput);
    elements.messageInput.addEventListener('keydown', handleMessageKeydown);
    elements.messageInput.addEventListener('focus', handleInputFocus);
    elements.messageInput.addEventListener('blur', handleInputBlur);
    elements.sendBtn.addEventListener('click', sendMessage);
    
    // Voice Recording
    elements.voiceBtn.addEventListener('click', toggleVoiceRecording);
    elements.recordBtn.addEventListener('click', toggleRecording);
    elements.cancelRecord.addEventListener('click', cancelRecording);
    
    // Search & Settings
    elements.searchBtn.addEventListener('click', showSearchOverlay);
    elements.closeSearch.addEventListener('click', hideSearchOverlay);
    elements.searchInput.addEventListener('input', handleSearch);
    elements.settingsBtn.addEventListener('click', toggleSettingsPanel);
    elements.closeSettings.addEventListener('click', hideSettingsPanel);
    
    // Context Menu
    document.addEventListener('click', hideContextMenu);
    elements.contextMenu.addEventListener('click', handleContextMenuAction);
    
    // Admin Modal
    elements.confirmAdmin.addEventListener('click', handleAdminAuth);
    elements.cancelAdmin.addEventListener('click', hideAdminModal);
    elements.modalAdminPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminAuth();
    });
    
    // Reaction Picker
    elements.emojiBtn.addEventListener('click', toggleReactionPicker);
    elements.reactionPicker.addEventListener('click', handleReactionSelect);
    
    // Window events
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Messages container scroll
    elements.messagesList.addEventListener('scroll', handleMessagesScroll);
    
    // Touch events for mobile
    setupTouchEvents();
    
    // Background selection
    setupBackgroundSelection();
}

function setupMobileKeyboard() {
    // Fix for mobile keyboard covering input
    if ('visualViewport' in window) {
        const viewport = window.visualViewport;
        viewport.addEventListener('resize', () => {
            if (viewport.height < window.innerHeight) {
                elements.chatInputContainer.style.paddingBottom = 'env(safe-area-inset-bottom)';
            }
        });
    }
}

function setupTouchEvents() {
    // Long press for context menu on mobile
    let touchTimer;
    document.addEventListener('touchstart', (e) => {
        const messageElement = e.target.closest('.message');
        if (messageElement && (state.isAdmin || messageElement.dataset.sender === state.currentUser)) {
            touchTimer = setTimeout(() => {
                const touch = e.touches[0];
                showContextMenu(
                    messageElement.dataset.messageId,
                    touch.clientX,
                    touch.clientY
                );
                e.preventDefault();
            }, 500);
        }
    });

    document.addEventListener('touchend', () => {
        clearTimeout(touchTimer);
    });

    document.addEventListener('touchmove', () => {
        clearTimeout(touchTimer);
    });
}

function setupBackgroundSelection() {
    const backgroundOptions = document.querySelectorAll('.background-option');
    backgroundOptions.forEach(option => {
        option.addEventListener('click', () => {
            const bg = option.dataset.bg;
            applyBackground(bg);
            localStorage.setItem('background', bg);
            
            // Update selected state
            backgroundOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
    });
}

// ===== SERVICE WORKER & PUSH NOTIFICATIONS =====
async function setupServiceWorker() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('ServiceWorker registered');
            
            // Request notification permission
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await subscribeToPushNotifications(registration);
            }
        } catch (error) {
            console.log('ServiceWorker registration failed:', error);
        }
    }
}

async function subscribeToPushNotifications(registration) {
    try {
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array('YOUR_VAPID_PUBLIC_KEY')
        });
        
        state.pushSubscription = subscription;
        
        // Send subscription to server
        await fetch(`${CONFIG.BACKEND_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: subscription,
                userIp: await getClientIP()
            })
        });
    } catch (error) {
        console.log('Push subscription failed:', error);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// ===== SCREEN MANAGEMENT =====
function hideLoadingScreen() {
    elements.loadingScreen.style.opacity = '0';
    setTimeout(() => {
        elements.loadingScreen.classList.add('hidden');
    }, 500);
}

function showAuthScreen() {
    elements.authScreen.classList.remove('hidden');
}

function showChatScreen() {
    elements.authScreen.classList.add('hidden');
    elements.chatScreen.classList.remove('hidden');
    elements.messageInput.focus();
    startMessagePolling();
}

function showBlockedScreen() {
    elements.loadingScreen.classList.add('hidden');
    elements.authScreen.classList.add('hidden');
    elements.chatScreen.classList.add('hidden');
    elements.blockedScreen.classList.remove('hidden');
}

function showSearchOverlay() {
    elements.searchOverlay.classList.remove('hidden');
    elements.searchInput.focus();
}

function hideSearchOverlay() {
    elements.searchOverlay.classList.add('hidden');
    elements.searchInput.value = '';
}

function toggleSettingsPanel() {
    elements.settingsPanel.classList.toggle('open');
}

function hideSettingsPanel() {
    elements.settingsPanel.classList.remove('open');
}

// ===== THEME & BACKGROUND MANAGEMENT =====
function toggleTheme() {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    state.theme = newTheme;
    localStorage.setItem('theme', newTheme);
    
    // Update theme toggle icon
    const themeIcon = elements.themeToggle.querySelector('.theme-icon');
    themeIcon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function applyBackground(background) {
    document.documentElement.setAttribute('data-background', background);
    state.background = background;
    
    // Update selected background in settings
    const backgroundOptions = document.querySelectorAll('.background-option');
    backgroundOptions.forEach(option => {
        option.classList.toggle('selected', option.dataset.bg === background);
    });
}

// ===== AUTHENTICATION =====
function handleNameInput() {
    const name = elements.nameInput.value.trim();
    const isAdmin = name.toLowerCase() === 'admin';
    
    elements.adminPasswordGroup.classList.toggle('hidden', !isAdmin);
    
    // Add magnetic effect to button when name is entered
    if (name.length > 0) {
        elements.continueBtn.classList.add('magnetic-active');
    } else {
        elements.continueBtn.classList.remove('magnetic-active');
    }
}

async function handleAuth() {
    const name = elements.nameInput.value.trim();
    const password = elements.adminPassword.value;
    
    if (!name) {
        showError('Please enter your name');
        return;
    }
    
    if (name.toLowerCase() === 'admin' && !password) {
        showAdminModal();
        return;
    }
    
    await authenticateUser(name, password);
}

async function authenticateUser(name, password) {
    try {
        showLoadingState();
        
        const response = await fetch(`${CONFIG.BACKEND_URL}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.currentUser = name;
            state.isAdmin = data.isAdmin || false;
            
            localStorage.setItem('chatSphere_userName', name);
            
            if (state.isAdmin) {
                elements.adminBadge.classList.remove('hidden');
                showSuccess('Admin access granted!');
                
                // Award admin achievement
                awardAchievement('admin_access');
            }
            
            showChatScreen();
            loadMessages();
            
            // Award first login achievement
            if (!localStorage.getItem('chatSphere_firstLogin')) {
                awardAchievement('first_login');
                localStorage.setItem('chatSphere_firstLogin', 'true');
            }
            
        } else {
            if (data.error === 'ADMIN_PASSWORD_REQUIRED') {
                showAdminModal();
            } else if (data.error === 'INVALID_ADMIN_PASSWORD') {
                showError('Invalid admin password');
                elements.adminPassword.value = '';
                elements.adminPassword.focus();
            } else if (data.error === 'ACCESS_DENIED') {
                showBlockedScreen();
            } else {
                showError(data.error || 'Authentication failed');
            }
        }
        
    } catch (error) {
        showError('Network error. Please check your connection.');
    } finally {
        hideLoadingState();
    }
}

function showAdminModal() {
    elements.adminModal.classList.remove('hidden');
    elements.modalAdminPassword.focus();
}

function hideAdminModal() {
    elements.adminModal.classList.add('hidden');
    elements.modalAdminPassword.value = '';
}

async function handleAdminAuth() {
    const password = elements.modalAdminPassword.value.trim();
    
    if (!password) {
        showError('Please enter admin password');
        return;
    }
    
    await authenticateUser('admin', password);
    hideAdminModal();
}

// ===== MESSAGE MANAGEMENT =====
async function loadMessages() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/messages`);
        const data = await response.json();
        
        if (data.success) {
            if (JSON.stringify(state.messages) !== JSON.stringify(data.messages)) {
                state.messages = data.messages;
                renderMessages();
                
                if (state.autoScroll) {
                    scrollToBottom();
                }
            }
        }
    } catch (error) {
        console.error('Failed to load messages:', error);
        updateConnectionStatus('disconnected');
    }
}

function renderMessages() {
    const messagesHTML = state.messages.map(message => createMessageElement(message)).join('');
    elements.messagesList.innerHTML = messagesHTML;
    
    // Add context menu listeners
    document.querySelectorAll('.message').forEach(messageEl => {
        messageEl.addEventListener('contextmenu', handleMessageRightClick);
        
        // Add reaction listeners
        const reactions = messageEl.querySelectorAll('.reaction');
        reactions.forEach(reaction => {
            reaction.addEventListener('click', handleReactionClick);
        });
        
        // Add thread click listeners
        const threadIndicator = messageEl.querySelector('.thread-indicator');
        if (threadIndicator) {
            threadIndicator.addEventListener('click', handleThreadClick);
        }
    });
}

function createMessageElement(message) {
    const isSent = message.name === state.currentUser;
    const isSystem = message.type === 'system';
    const isAdminMessage = message.type === 'admin';
    const hasReplies = message.replyCount > 0;
    
    const messageClass = isSent ? 'sent' : isSystem ? 'system' : isAdminMessage ? 'admin' : 'received';
    
    const time = new Date(message.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Thread indicator for messages with replies
    const threadIndicator = hasReplies ? `
        <div class="thread-indicator" data-message-id="${message.id}">
            <span>↳</span>
            <span>${message.replyCount} ${message.replyCount === 1 ? 'reply' : 'replies'}</span>
        </div>
    ` : '';
    
    // Voice message element
    const voiceMessageHTML = message.voiceNote ? createVoiceMessageElement(message.voiceNote) : '';
    
    // Poll element
    const pollHTML = message.type === 'poll' ? createPollElement(message) : '';
    
    // Reactions
    const reactionsHTML = message.reactions ? renderReactions(message.reactions, message.id) : '';
    
    return `
        <div class="message message-${messageClass}" data-message-id="${message.id}" data-sender="${message.name}">
            ${threadIndicator}
            <div class="message-bubble">
                ${!isSent && !isSystem ? `
                    <div class="message-header">
                        <span class="message-sender">${escapeHtml(message.name)}</span>
                        <span class="message-time">${time}</span>
                    </div>
                ` : ''}
                
                <div class="message-content">
                    ${escapeHtml(message.message)}
                </div>
                
                ${voiceMessageHTML}
                ${pollHTML}
                ${reactionsHTML}
                
                ${isSent || isSystem ? `
                    <div class="message-time" style="text-align: right; margin-top: 0.25rem;">
                        ${time}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function createVoiceMessageElement(voiceNote) {
    return `
        <div class="voice-message" data-voice-id="${voiceNote.id}">
            <button class="voice-play-btn" onclick="playVoiceMessage('${voiceNote.id}')">
                <span>▶️</span>
            </button>
            <div class="voice-waveform">
                <div class="voice-progress" style="width: 0%"></div>
            </div>
            <div class="voice-duration">${formatTime(voiceNote.duration || 0)}</div>
        </div>
    `;
}

function createPollElement(poll) {
    const totalVotes = poll.totalVotes || 0;
    const hasVoted = poll.options.some(opt => opt.voters.includes(state.currentUser));
    
    return `
        <div class="poll-container" data-poll-id="${poll.id}">
            <div class="poll-question">${escapeHtml(poll.question)}</div>
            <div class="poll-options">
                ${poll.options.map(option => {
                    const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
                    const isSelected = option.voters.includes(state.currentUser);
                    
                    return `
                        <div class="poll-option ${isSelected ? 'selected' : ''}" 
                             data-option-id="${option.id}"
                             onclick="voteInPoll('${poll.id}', '${option.id}')">
                            <div class="poll-bar" style="width: ${percentage}%"></div>
                            <div class="poll-text">
                                <span>${escapeHtml(option.text)}</span>
                                <span class="poll-percentage">${Math.round(percentage)}%</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="poll-stats">
                ${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}
                ${poll.settings.anonymous ? '• Anonymous' : ''}
                ${poll.settings.multiple ? '• Multiple choices' : ''}
            </div>
        </div>
    `;
}

function renderReactions(reactions, messageId) {
    const reactionEntries = Object.entries(reactions);
    if (reactionEntries.length === 0) return '';
    
    return `
        <div class="message-reactions">
            ${reactionEntries.map(([emoji, users]) => {
                const userArray = Array.isArray(users) ? users : [];
                const hasReacted = userArray.includes(state.currentUser);
                const count = userArray.length;
                
                return `
                    <span class="reaction ${hasReacted ? 'active' : ''}" 
                          data-emoji="${emoji}" 
                          data-message-id="${messageId}">
                        ${emoji} 
                        <span class="reaction-count">${count}</span>
                    </span>
                `;
            }).join('')}
        </div>
    `;
}

async function sendMessage() {
    const message = elements.messageInput.value.trim();
    
    if (!message) {
        showError('Please enter a message');
        return;
    }
    
    if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
        showError(`Message too long (max ${CONFIG.MAX_MESSAGE_LENGTH} characters)`);
        return;
    }
    
    try {
        // Optimistic update
        const tempMessage = {
            id: 'temp-' + Date.now(),
            name: state.currentUser,
            message: message,
            timestamp: new Date().toISOString(),
            type: state.isAdmin ? 'admin' : 'user'
        };
        
        state.messages.push(tempMessage);
        renderMessages();
        scrollToBottom();
        
        // Clear input
        elements.messageInput.value = '';
        updateCharCount();
        resetTyping();
        
        // Send to server
        const response = await fetch(`${CONFIG.BACKEND_URL}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: state.currentUser,
                message: message,
                isAdmin: state.isAdmin
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            showError('Failed to send message');
            // Remove optimistic message
            state.messages = state.messages.filter(m => m.id !== tempMessage.id);
            renderMessages();
        } else {
            // Reload messages to get proper ID
            loadMessages();
            
            // Award message count achievements
            const messageCount = state.messages.filter(m => m.name === state.currentUser).length;
            if (messageCount === 1) {
                awardAchievement('first_message');
            } else if (messageCount === 10) {
                awardAchievement('active_user');
            } else if (messageCount === 50) {
                awardAchievement('chatty');
            }
        }
        
    } catch (error) {
        showError('Network error. Message not sent.');
        // Remove optimistic message
        state.messages = state.messages.filter(m => m.id !== tempMessage.id);
        renderMessages();
    }
}

// ===== VOICE MESSAGES =====
async function toggleVoiceRecording() {
    if (state.isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];
        
        state.mediaRecorder.ondataavailable = (event) => {
            state.audioChunks.push(event.data);
        };
        
        state.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
            await sendVoiceMessage(audioBlob);
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };
        
        state.mediaRecorder.start();
        state.isRecording = true;
        state.recordingStartTime = Date.now();
        
        // Show voice recorder UI
        elements.voiceRecorder.classList.remove('hidden');
        updateRecordingTimer();
        
        // Add recording class to button
        elements.recordBtn.classList.add('recording');
        
    } catch (error) {
        showError('Microphone access denied or not available');
        console.error('Recording failed:', error);
    }
}

function stopRecording() {
    if (state.mediaRecorder && state.isRecording) {
        state.mediaRecorder.stop();
        state.isRecording = false;
        
        // Hide voice recorder UI
        elements.voiceRecorder.classList.add('hidden');
        elements.recordBtn.classList.remove('recording');
    }
}

function cancelRecording() {
    if (state.mediaRecorder && state.isRecording) {
        state.mediaRecorder.stop();
        state.isRecording = false;
        
        // Stop all tracks
        if (state.mediaRecorder.stream) {
            state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        // Hide voice recorder UI
        elements.voiceRecorder.classList.add('hidden');
        elements.recordBtn.classList.remove('recording');
    }
}

function updateRecordingTimer() {
    if (!state.isRecording) return;
    
    const elapsed = Date.now() - state.recordingStartTime;
    const timerElement = elements.voiceRecorder.querySelector('.record-timer');
    
    if (timerElement) {
        timerElement.textContent = formatTime(elapsed);
    }
    
    // Auto-stop after max duration
    if (elapsed >= CONFIG.VOICE_MAX_DURATION) {
        stopRecording();
        return;
    }
    
    requestAnimationFrame(updateRecordingTimer);
}

async function sendVoiceMessage(audioBlob) {
    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.webm');
        formData.append('duration', Date.now() - state.recordingStartTime);
        
        const response = await fetch(`${CONFIG.BACKEND_URL}/upload-voice`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Send message with voice note
            const messageResponse = await fetch(`${CONFIG.BACKEND_URL}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: state.currentUser,
                    message: 'Voice message',
                    isAdmin: state.isAdmin,
                    voiceNote: {
                        id: data.voiceId,
                        duration: data.duration
                    }
                })
            });
            
            if (messageResponse.ok) {
                loadMessages();
                awardAchievement('voice_message');
            }
        }
    } catch (error) {
        showError('Failed to send voice message');
    }
}

function playVoiceMessage(voiceId) {
    // This would play the voice message
    // In a real implementation, you'd fetch the audio from server
    showSuccess('Voice message playback would start here');
}

// ===== REACTIONS SYSTEM =====
function toggleReactionPicker() {
    elements.reactionPicker.classList.toggle('hidden');
    
    if (!elements.reactionPicker.classList.contains('hidden')) {
        // Position near the emoji button
        const rect = elements.emojiBtn.getBoundingClientRect();
        elements.reactionPicker.style.top = `${rect.top - 200}px`;
        elements.reactionPicker.style.left = `${rect.left}px`;
    }
}

function handleReactionSelect(event) {
    const emoji = event.target.dataset.emoji;
    if (emoji && state.selectedMessage) {
        addReaction(state.selectedMessage, emoji);
        elements.reactionPicker.classList.add('hidden');
    }
}

async function addReaction(messageId, emoji) {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emoji: emoji,
                userId: state.currentUser
            })
        });
        
        if (response.ok) {
            loadMessages();
        }
    } catch (error) {
        showError('Failed to add reaction');
    }
}

function handleReactionClick(event) {
    const reaction = event.currentTarget;
    const emoji = reaction.dataset.emoji;
    const messageId = reaction.dataset.messageId;
    
    if (reaction.classList.contains('active')) {
        // Remove reaction
        removeReaction(messageId, emoji);
    } else {
        // Add reaction
        addReaction(messageId, emoji);
    }
}

async function removeReaction(messageId, emoji) {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/messages/${messageId}/reactions/${emoji}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: state.currentUser
            })
        });
        
        if (response.ok) {
            loadMessages();
        }
    } catch (error) {
        showError('Failed to remove reaction');
    }
}

// ===== POLL SYSTEM =====
async function voteInPoll(pollId, optionId) {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/polls/${pollId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                optionId: optionId,
                voterId: state.currentUser
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadMessages();
            awardAchievement('voter');
        } else {
            showError('Failed to vote');
        }
    } catch (error) {
        showError('Network error');
    }
}

// ===== SEARCH FUNCTIONALITY =====
async function handleSearch() {
    const query = elements.searchInput.value.trim();
    
    if (query.length < 2) {
        elements.searchResults.innerHTML = '<div class="search-result">Enter at least 2 characters to search</div>';
        return;
    }
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.success) {
            displaySearchResults(data.results, query);
        } else {
            elements.searchResults.innerHTML = '<div class="search-result">Search failed</div>';
        }
    } catch (error) {
        elements.searchResults.innerHTML = '<div class="search-result">Network error</div>';
    }
}

function displaySearchResults(results, query) {
    if (results.length === 0) {
        elements.searchResults.innerHTML = '<div class="search-result">No results found</div>';
        return;
    }
    
    const resultsHTML = results.map(message => `
        <div class="search-result" onclick="scrollToMessage('${message.id}')">
            <div class="message-sender">${escapeHtml(message.name)}</div>
            <div class="message-preview">${highlightText(message.message, query)}</div>
            <div class="message-time">${new Date(message.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
    
    elements.searchResults.innerHTML = resultsHTML;
}

function highlightText(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function scrollToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.style.animation = 'pulse 2s';
        hideSearchOverlay();
    }
}

// ===== THREAD SYSTEM =====
function handleThreadClick(event) {
    const messageId = event.currentTarget.dataset.messageId;
    showThread(messageId);
}

function showThread(messageId) {
    // This would show a thread view
    // For now, just highlight the message
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.style.background = 'var(--primary)';
        messageElement.style.color = 'white';
        setTimeout(() => {
            messageElement.style.background = '';
            messageElement.style.color = '';
        }, 2000);
    }
}

// ===== CONTEXT MENU =====
function handleMessageRightClick(e) {
    e.preventDefault();
    const messageElement = e.target.closest('.message');
    if (messageElement) {
        const canModify = state.isAdmin || messageElement.dataset.sender === state.currentUser;
        
        showContextMenu(
            messageElement.dataset.messageId,
            e.clientX,
            e.clientY,
            canModify
        );
    }
}

function showContextMenu(messageId, x, y, canModify = false) {
    state.selectedMessage = messageId;
    
    // Show/hide menu items based on permissions
    const deleteItem = elements.contextMenu.querySelector('[data-action="delete"]');
    const blockItem = elements.contextMenu.querySelector('[data-action="block"]');
    
    deleteItem.style.display = canModify ? 'flex' : 'none';
    blockItem.style.display = state.isAdmin ? 'flex' : 'none';
    
    elements.contextMenu.style.left = x + 'px';
    elements.contextMenu.style.top = y + 'px';
    elements.contextMenu.classList.remove('hidden');
    
    // Adjust position if menu goes off-screen
    const rect = elements.contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        elements.contextMenu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        elements.contextMenu.style.top = (y - rect.height) + 'px';
    }
}

function hideContextMenu() {
    elements.contextMenu.classList.add('hidden');
    state.selectedMessage = null;
}

async function handleContextMenuAction(e) {
    e.stopPropagation();
    
    const action = e.target.closest('.menu-item')?.dataset.action;
    if (!action || !state.selectedMessage) return;
    
    hideContextMenu();
    
    switch (action) {
        case 'reply':
            await replyToMessage(state.selectedMessage);
            break;
        case 'react':
            showReactionPickerForMessage(state.selectedMessage);
            break;
        case 'delete':
            await deleteMessage(state.selectedMessage);
            break;
        case 'block':
            await blockUser(state.selectedMessage);
            break;
        case 'cancel':
            // Do nothing
            break;
    }
}

function showReactionPickerForMessage(messageId) {
    state.selectedMessage = messageId;
    toggleReactionPicker();
}

async function replyToMessage(messageId) {
    const message = state.messages.find(m => m.id === messageId);
    if (message) {
        elements.messageInput.value = `@${message.name} `;
        elements.messageInput.focus();
        showSuccess(`Replying to ${message.name}`);
    }
}

async function deleteMessage(messageId) {
    if (!state.isAdmin) return;
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/message/${messageId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adminPassword: 'admin123'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Message deleted');
            loadMessages();
        } else {
            showError('Failed to delete message');
        }
    } catch (error) {
        showError('Network error');
    }
}

async function blockUser(messageId) {
    if (!state.isAdmin) return;
    
    const message = state.messages.find(m => m.id === messageId);
    if (!message) {
        showError('Message not found');
        return;
    }
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/block-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ip: message.ip || 'unknown',
                reason: 'Admin action',
                adminPassword: 'admin123'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('User blocked successfully');
        } else {
            showError('Failed to block user');
        }
    } catch (error) {
        showError('Network error');
    }
}

// ===== TYPING INDICATORS =====
function handleMessageInput() {
    updateCharCount();
    
    if (!state.isTyping) {
        state.isTyping = true;
        // In a real app, you'd send typing start to server
    }
    
    state.lastTypingTime = Date.now();
    
    // Reset typing after timeout
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(resetTyping, CONFIG.TYPING_TIMEOUT);
}

function resetTyping() {
    state.isTyping = false;
    state.lastTypingTime = 0;
    // In a real app, you'd send typing stop to server
}

function updateTypingIndicator() {
    // This would be populated from server in real implementation
    if (state.typingUsers.size > 0) {
        const typingList = Array.from(state.typingUsers).slice(0, 3);
        let typingText = '';
        
        if (typingList.length === 1) {
            typingText = `${typingList[0]} is typing`;
        } else if (typingList.length === 2) {
            typingText = `${typingList[0]} and ${typingList[1]} are typing`;
        } else {
            typingText = `${typingList[0]}, ${typingList[1]} and others are typing`;
        }
        
        elements.typingIndicator.querySelector('.typing-text').textContent = typingText;
        elements.typingIndicator.classList.remove('hidden');
    } else {
        elements.typingIndicator.classList.add('hidden');
    }
}

// ===== ACHIEVEMENTS SYSTEM =====
function awardAchievement(achievementId) {
    const achievements = {
        first_login: { name: 'Welcome!', icon: '👋', description: 'First time logging in' },
        first_message: { name: 'Chatterbox', icon: '💬', description: 'Sent your first message' },
        active_user: { name: 'Active User', icon: '🔥', description: 'Sent 10 messages' },
        chatty: { name: 'Chatty', icon: '🗣️', description: 'Sent 50 messages' },
        voice_message: { name: 'Voice Actor', icon: '🎤', description: 'Sent a voice message' },
        voter: { name: 'Opinionated', icon: '🗳️', description: 'Voted in a poll' },
        admin_access: { name: 'Administrator', icon: '👑', description: 'Gained admin access' }
    };
    
    const achievement = achievements[achievementId];
    if (achievement && !localStorage.getItem(`achievement_${achievementId}`)) {
        showAchievement(achievement);
        localStorage.setItem(`achievement_${achievementId}`, 'true');
    }
}

function showAchievement(achievement) {
    const popup = document.getElementById('achievementPopup');
    const icon = popup.querySelector('#achievementIcon');
    const name = popup.querySelector('#achievementName');
    
    icon.textContent = achievement.icon;
    name.textContent = achievement.name;
    
    popup.classList.remove('hidden');
    
    setTimeout(() => {
        popup.classList.add('hidden');
    }, 3000);
}

// ===== CONNECTION MANAGEMENT =====
async function checkServerHealth() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/health`);
        if (response.ok) {
            updateConnectionStatus('connected');
            return true;
        }
    } catch (error) {
        console.error('Health check failed:', error);
    }
    updateConnectionStatus('disconnected');
    return false;
}

function updateConnectionStatus(status) {
    state.connectionStatus = status;
    const statusEl = elements.connectionStatus;
    const onlineStatus = elements.onlineStatus.querySelector('.status-text');
    
    if (status === 'connected') {
        statusEl.textContent = '🟢 Connected';
        statusEl.className = 'connection-status connected';
        onlineStatus.textContent = 'Connected • Live';
    } else {
        statusEl.textContent = '🔴 Disconnected';
        statusEl.className = 'connection-status disconnected';
        onlineStatus.textContent = 'Connecting...';
    }
}

// ===== POLLING =====
function startMessagePolling() {
    // Initial load
    loadMessages();
    checkServerHealth();
    
    // Set up interval
    setInterval(() => {
        loadMessages();
        checkServerHealth();
        updateTypingIndicator();
    }, CONFIG.REFRESH_INTERVAL);
}

// ===== EVENT HANDLERS =====
function handleBack() {
    if (confirm('Are you sure you want to leave the chat?')) {
        state.currentUser = null;
        state.isAdmin = false;
        state.messages = [];
        
        elements.chatScreen.classList.add('hidden');
        elements.authScreen.classList.remove('hidden');
        elements.adminBadge.classList.add('hidden');
        
        // Reset admin password field
        elements.adminPassword.value = '';
        elements.adminPasswordGroup.classList.add('hidden');
    }
}

function handleWindowResize() {
    // Adjust UI for mobile keyboard
    if (state.autoScroll) {
        setTimeout(scrollToBottom, 100);
    }
}

function handleBeforeUnload(e) {
    // Optional: Add confirmation for unsent messages
    if (elements.messageInput.value.trim()) {
        e.preventDefault();
        e.returnValue = 'You have unsent messages. Are you sure you want to leave?';
    }
}

function handleMessagesScroll() {
    const { scrollTop, scrollHeight, clientHeight } = elements.messagesList;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    state.autoScroll = isNearBottom;
}

function scrollToBottom() {
    elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
}

// ===== UTILITY FUNCTIONS =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showLoadingState() {
    elements.continueBtn.disabled = true;
    elements.continueBtn.querySelector('.btn-text').textContent = 'Connecting...';
}

function hideLoadingState() {
    elements.continueBtn.disabled = false;
    elements.continueBtn.querySelector('.btn-text').textContent = 'Continue to Chat';
}

function updateCharCount() {
    const length = elements.messageInput.value.length;
    elements.charCount.textContent = `${length}/${CONFIG.MAX_MESSAGE_LENGTH}`;
    
    if (length > CONFIG.MAX_MESSAGE_LENGTH * 0.9) {
        elements.charCount.style.color = 'var(--danger)';
    } else if (length > CONFIG.MAX_MESSAGE_LENGTH * 0.7) {
        elements.charCount.style.color = 'var(--accent)';
    } else {
        elements.charCount.style.color = 'var(--text-muted)';
    }
}

function showError(message) {
    // Create temporary error message
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    errorEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--danger);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: var(--radius-lg);
        z-index: 1000;
        animation: slideDown 0.3s ease;
        box-shadow: var(--shadow-lg);
    `;
    
    document.body.appendChild(errorEl);
    
    setTimeout(() => {
        errorEl.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(errorEl);
        }, 300);
    }, 3000);
}

function showSuccess(message) {
    // Create temporary success message
    const successEl = document.createElement('div');
    successEl.className = 'success-message';
    successEl.textContent = message;
    successEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--secondary);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: var(--radius-lg);
        z-index: 1000;
        animation: slideDown 0.3s ease;
        box-shadow: var(--shadow-lg);
    `;
    
    document.body.appendChild(successEl);
    
    setTimeout(() => {
        successEl.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(successEl);
        }, 300);
    }, 2000);
}

function getClientIP() {
    // This would get the client IP in a real implementation
    return 'user-' + Math.random().toString(36).substr(2, 9);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    @keyframes slideUp {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
    }
    
    .magnetic-active {
        animation: pulse 2s infinite;
    }
    
    mark {
        background: var(--accent);
        color: inherit;
    }
`;
document.head.appendChild(style);

console.log('🚀 ChatSphere v3.0 Frontend Loaded Successfully!');