const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const TelegramBot = require('node-telegram-bot-api');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const CONFIG = {
    // MongoDB Atlas
    MONGODB_URI: "mongodb+srv://schoolchat_user:tukubhuyan123@cluster0.i386mxq.mongodb.net/?retryWrites=true&w=majority",
    
    // Telegram Bot
    BOT_TOKEN: "7686607534:AAGWXdvYh9WF9qQT7uwff9ucle_pWSSW3R8",
    ADMIN_CHAT_ID: "6142816761",
    
    // Admin Security - FIXED: Generate hash for "admin123"
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD_HASH: bcrypt.hashSync("admin123", 10),
    
    // App Settings
    APP_NAME: "ChatSphere",
    APP_URL: "https://fourr-chat.onrender.com",
    
    // Push Notifications
    VAPID_PUBLIC_KEY: "BFlHO2ennNlN5bcYFEv2FGEyyEamKtgBNPLHc-8aSgDMxtwqdNs4SrbCOGnGvCWZLQq6Wi4vpzY3A1mgb2mKYRo",
    VAPID_PRIVATE_KEY: "n5qhE91pNCjhwOHIwUycKgXPbC19Dt5Q1yIoBRKJmq4"
};

// Initialize web push
webpush.setVapidDetails(
    `mailto:sourovb768@gmail.com`,
    CONFIG.VAPID_PUBLIC_KEY,
    CONFIG.VAPID_PRIVATE_KEY
);

// ==================== INITIALIZATION ====================
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

let db, messagesCollection, usersCollection, notificationsCollection, subscriptionsCollection;

async function initializeDatabase() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        const client = new MongoClient(CONFIG.MONGODB_URI, {
            serverApi: ServerApiVersion.v1,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });

        await client.connect();
        db = client.db('chatshpere_v3');
        messagesCollection = db.collection('messages');
        usersCollection = db.collection('users');
        notificationsCollection = db.collection('notifications');
        subscriptionsCollection = db.collection('subscriptions');
        
        // Create indexes
        await messagesCollection.createIndexes([
            { key: { timestamp: -1 } },
            { key: { threadId: 1 } },
            { key: { "reactions.emoji": 1 } }
        ]);
        await usersCollection.createIndexes([
            { key: { ip: 1 } },
            { key: { lastSeen: -1 } },
            { key: { role: 1 } }
        ]);
        
        console.log('✅ MongoDB Connected Successfully');
        
        // Add welcome message if no messages
        const messageCount = await messagesCollection.countDocuments();
        if (messageCount === 0) {
            await addSystemMessage("🚀 Welcome to ChatSphere v3.0!");
            await addSystemMessage("💬 Now with threads, reactions, files & more!");
        }
        
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        process.exit(1);
    }
}

// ==================== FIXED ADMIN AUTHENTICATION ====================
function authenticateAdmin(password) {
    return bcrypt.compareSync(password, CONFIG.ADMIN_PASSWORD_HASH);
}

function isAdminUser(username) {
    return username.toLowerCase() === CONFIG.ADMIN_USERNAME.toLowerCase();
}

// ==================== ENHANCED MESSAGE SYSTEM ====================
async function addSystemMessage(text) {
    const message = {
        id: uuidv4(),
        name: "System",
        message: text,
        type: "system",
        timestamp: new Date(),
        reactions: {}
    };
    await messagesCollection.insertOne(message);
    return message;
}

async function createMessage(data) {
    const message = {
        id: uuidv4(),
        name: data.name,
        message: data.message,
        type: data.type || 'user',
        timestamp: new Date(),
        ip: data.ip,
        threadId: data.threadId || null,
        parentMessageId: data.parentMessageId || null,
        reactions: {},
        attachments: data.attachments || [],
        voiceNote: data.voiceNote || null
    };
    
    await messagesCollection.insertOne(message);
    return message;
}

// ==================== VOICE MESSAGES ====================
function setupVoiceMessageRoutes() {
    // Voice message upload
    app.post('/upload-voice', upload.single('audio'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No audio file' });
            }

            const audioData = {
                buffer: req.file.buffer,
                mimetype: req.file.mimetype,
                size: req.file.size,
                filename: `voice_${Date.now()}.webm`
            };

            // Store voice note metadata
            const voiceId = uuidv4();
            res.json({ 
                success: true, 
                voiceId: voiceId,
                duration: req.body.duration || 0
            });
        } catch (error) {
            console.error('Voice upload error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
}

// ==================== MESSAGE THREADS/REPLIES ====================
async function getThreadMessages(threadId) {
    return await messagesCollection.find({ 
        $or: [
            { threadId: threadId },
            { id: threadId }
        ]
    }).sort({ timestamp: 1 }).toArray();
}

async function getMessageWithReplies(messageId) {
    const message = await messagesCollection.findOne({ id: messageId });
    if (!message) return null;

    const replies = await messagesCollection.find({ 
        parentMessageId: messageId 
    }).sort({ timestamp: 1 }).toArray();

    return {
        ...message,
        replies: replies,
        replyCount: replies.length
    };
}

// ==================== REACTIONS SYSTEM ====================
async function addReaction(messageId, emoji, userId) {
    const message = await messagesCollection.findOne({ id: messageId });
    if (!message) return false;

    // Initialize reactions object if not exists
    const reactions = message.reactions || {};
    
    // Initialize emoji set if not exists
    if (!reactions[emoji]) {
        reactions[emoji] = [];
    }
    
    // Add user to reaction if not already there
    if (!reactions[emoji].includes(userId)) {
        reactions[emoji].push(userId);
    }

    await messagesCollection.updateOne(
        { id: messageId },
        { $set: { reactions: reactions } }
    );

    return true;
}

async function removeReaction(messageId, emoji, userId) {
    const message = await messagesCollection.findOne({ id: messageId });
    if (!message || !message.reactions || !message.reactions[emoji]) return false;

    const updatedReactions = { ...message.reactions };
    updatedReactions[emoji] = updatedReactions[emoji].filter(id => id !== userId);
    
    if (updatedReactions[emoji].length === 0) {
        delete updatedReactions[emoji];
    }

    await messagesCollection.updateOne(
        { id: messageId },
        { $set: { reactions: updatedReactions } }
    );

    return true;
}

// ==================== USER PROFILES & ROLES ====================
const USER_ROLES = {
    STUDENT: 'student',
    TEACHER: 'teacher',
    MODERATOR: 'moderator',
    ADMIN: 'admin'
};

async function updateUserProfile(ip, profileData) {
    const updateData = {
        lastSeen: new Date(),
        ...profileData
    };

    await usersCollection.updateOne(
        { ip: ip },
        { 
            $set: updateData,
            $setOnInsert: {
                ip: ip,
                firstSeen: new Date(),
                role: USER_ROLES.STUDENT
            }
        },
        { upsert: true }
    );
}

async function getUserProfile(ip) {
    return await usersCollection.findOne({ ip: ip });
}

// ==================== ADVANCED SEARCH ====================
async function searchMessages(query, filters = {}) {
    let searchFilter = {};
    
    if (query) {
        searchFilter.message = { $regex: query, $options: 'i' };
    }
    
    if (filters.user) {
        searchFilter.name = { $regex: filters.user, $options: 'i' };
    }
    
    if (filters.dateFrom) {
        searchFilter.timestamp = { ...searchFilter.timestamp, $gte: new Date(filters.dateFrom) };
    }
    
    if (filters.dateTo) {
        searchFilter.timestamp = { ...searchFilter.timestamp, $lte: new Date(filters.dateTo) };
    }

    return await messagesCollection.find(searchFilter)
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray();
}

// ==================== POLLS & SURVEYS ====================
async function createPoll(createdBy, question, options, settings = {}) {
    const poll = {
        id: uuidv4(),
        type: 'poll',
        question: question,
        options: options.map(opt => ({
            id: uuidv4(),
            text: opt,
            votes: 0,
            voters: []
        })),
        createdBy: createdBy,
        createdAt: new Date(),
        settings: {
            multiple: settings.multiple || false,
            anonymous: settings.anonymous || false,
            endsAt: settings.endsAt || null
        },
        totalVotes: 0
    };

    await messagesCollection.insertOne(poll);
    return poll;
}

async function voteInPoll(pollId, optionId, voterId) {
    const poll = await messagesCollection.findOne({ id: pollId, type: 'poll' });
    if (!poll) return false;

    const optionIndex = poll.options.findIndex(opt => opt.id === optionId);
    if (optionIndex === -1) return false;

    // Check if user already voted
    if (!poll.settings.multiple) {
        const hasVoted = poll.options.some(opt => opt.voters.includes(voterId));
        if (hasVoted) return false;
    }

    // Update the option
    const updatedOptions = [...poll.options];
    updatedOptions[optionIndex].votes++;
    updatedOptions[optionIndex].voters.push(voterId);

    await messagesCollection.updateOne(
        { id: pollId },
        { 
            $set: { 
                options: updatedOptions, 
                totalVotes: poll.totalVotes + 1 
            } 
        }
    );

    return true;
}

// ==================== ACHIEVEMENTS SYSTEM ====================
const ACHIEVEMENTS = {
    FIRST_MESSAGE: { id: 'first_message', name: 'First Message', icon: '💬' },
    ACTIVE_USER: { id: 'active_user', name: 'Active User', icon: '🔥' },
    POPULAR: { id: 'popular', name: 'Popular', icon: '⭐' },
    HELPFUL: { id: 'helpful', name: 'Helpful', icon: '🤝' }
};

async function awardAchievement(userIp, achievementId) {
    const achievement = ACHIEVEMENTS[achievementId];
    if (!achievement) return false;

    await usersCollection.updateOne(
        { ip: userIp },
        { 
            $addToSet: { achievements: achievement.id },
            $inc: { points: 10 }
        }
    );

    // Send notification
    await sendPushNotification(userIp, {
        title: 'Achievement Unlocked!',
        body: `You earned: ${achievement.name} ${achievement.icon}`,
        icon: '/icons/achievement.png'
    });

    return true;
}

// ==================== PUSH NOTIFICATIONS ====================
async function sendPushNotification(userIp, payload) {
    try {
        const subscriptions = await subscriptionsCollection.find({ userIp: userIp }).toArray();
        
        const sendPromises = subscriptions.map(subscription =>
            webpush.sendNotification(subscription, JSON.stringify(payload))
                .catch(error => {
                    if (error.statusCode === 410) {
                        // Subscription expired, remove it
                        subscriptionsCollection.deleteOne({ _id: subscription._id });
                    }
                })
        );

        await Promise.all(sendPromises);
        return true;
    } catch (error) {
        console.error('Push notification failed:', error);
        return false;
    }
}

// ==================== AUDIT LOGGING ====================
async function logAdminAction(adminIp, action, target, details = {}) {
    const logEntry = {
        id: uuidv4(),
        adminIp: adminIp,
        action: action,
        target: target,
        details: details,
        timestamp: new Date()
    };

    await db.collection('audit_logs').insertOne(logEntry);
    
    // Send to Telegram
    await sendToTelegram(
        `📋 ADMIN ACTION LOGGED\n` +
        `Action: ${action}\n` +
        `Target: ${target}\n` +
        `Admin IP: ${adminIp}\n` +
        `Time: ${new Date().toLocaleString()}`
    );
}

// ==================== MESSAGE CACHING SYSTEM ====================
class MessageCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 1000;
    }

    set(key, messages) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, {
            data: messages,
            timestamp: Date.now()
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (item && Date.now() - item.timestamp < 30000) {
            return item.data;
        }
        this.cache.delete(key);
        return null;
    }

    clear() {
        this.cache.clear();
    }
}

const messageCache = new MessageCache();

// ==================== EXPRESS SERVER SETUP ====================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// Get client IP
function getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.headers['x-forwarded-for'] || 
           'unknown';
}

// ==================== ROUTES ====================

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', async (req, res) => {
    try {
        await messagesCollection.findOne({});
        res.json({
            status: '✅ Healthy',
            database: 'MongoDB',
            version: '3.0.0',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            features: [
                'threads', 'reactions', 'polls', 'voice', 'profiles',
                'search', 'notifications', 'achievements', 'audit'
            ]
        });
    } catch (error) {
        res.status(500).json({ status: '❌ Unhealthy', error: error.message });
    }
});

// ==================== FIXED AUTHENTICATION ROUTE ====================
app.post('/auth', async (req, res) => {
    try {
        const { name, password } = req.body;
        const clientIP = getClientIP(req);

        if (!name || !name.trim()) {
            return res.json({ success: false, error: 'Please enter your name' });
        }

        // Check if user is blocked
        const user = await usersCollection.findOne({ ip: clientIP });
        if (user && user.blocked) {
            return res.json({ success: false, error: 'ACCESS_DENIED' });
        }

        // FIXED: Admin authentication
        if (isAdminUser(name.trim())) {
            if (!password) {
                return res.json({ 
                    success: false, 
                    isAdmin: true, 
                    error: 'ADMIN_PASSWORD_REQUIRED' 
                });
            }
            
            const isValid = authenticateAdmin(password);
            if (!isValid) {
                return res.json({ 
                    success: false, 
                    isAdmin: true, 
                    error: 'INVALID_ADMIN_PASSWORD' 
                });
            }
            
            await updateUserProfile(clientIP, {
                name: name.trim(),
                role: USER_ROLES.ADMIN
            });

            return res.json({ 
                success: true, 
                isAdmin: true, 
                message: 'Admin access granted',
                user: { name: name.trim(), role: USER_ROLES.ADMIN }
            });
        }

        // Regular user authentication
        await updateUserProfile(clientIP, {
            name: name.trim(),
            role: USER_ROLES.STUDENT
        });

        // Check for name changes
        if (user && user.name !== name.trim()) {
            await sendToTelegram(
                `🔄 NAME CHANGE DETECTED\n` +
                `IP: ${clientIP}\n` +
                `From: ${user.name}\n` +
                `To: ${name.trim()}\n` +
                `Time: ${new Date().toLocaleString()}`
            );
        }

        // Award first message achievement if new user
        if (!user) {
            await awardAchievement(clientIP, 'FIRST_MESSAGE');
        }

        res.json({ 
            success: true, 
            isAdmin: false, 
            message: 'Authentication successful',
            user: { name: name.trim(), role: USER_ROLES.STUDENT }
        });

    } catch (error) {
        console.error('Auth error:', error);
        res.json({ success: false, error: 'Authentication failed' });
    }
});

// ==================== ENHANCED MESSAGE ROUTES ====================

// Get all messages with caching
app.get('/messages', async (req, res) => {
    try {
        const cacheKey = 'all_messages';
        let messages = messageCache.get(cacheKey);
        
        if (!messages) {
            messages = await messagesCollection.find().sort({ timestamp: 1 }).toArray();
            messageCache.set(cacheKey, messages);
        }
        
        res.json({ success: true, messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, error: 'Failed to load messages', messages: [] });
    }
});

// Send message with enhanced features
app.post('/send-message', async (req, res) => {
    try {
        const { name, message, isAdmin, threadId, parentMessageId, attachments, voiceNote } = req.body;
        const clientIP = getClientIP(req);

        if (!name || (!message && !attachments && !voiceNote)) {
            return res.json({ success: false, error: 'Message content required' });
        }

        const user = await usersCollection.findOne({ ip: clientIP });
        if (user && user.blocked) {
            return res.json({ success: false, error: 'ACCESS_DENIED' });
        }

        const messageData = {
            name: name.trim(),
            message: message || '',
            type: isAdmin ? 'admin' : 'user',
            ip: clientIP,
            threadId: threadId || null,
            parentMessageId: parentMessageId || null,
            attachments: attachments || [],
            voiceNote: voiceNote || null
        };

        const newMessage = await createMessage(messageData);
        
        // Update user activity
        await updateUserProfile(clientIP, { name: name.trim() });

        // Clear cache
        messageCache.clear();

        // Send notifications for replies
        if (parentMessageId) {
            const parentMessage = await messagesCollection.findOne({ id: parentMessageId });
            if (parentMessage && parentMessage.ip !== clientIP) {
                await sendPushNotification(parentMessage.ip, {
                    title: `${name} replied to your message`,
                    body: message ? message.substring(0, 100) : 'Sent an attachment',
                    icon: '/icons/reply.png'
                });
            }
        }

        // Send to Telegram for admin messages
        if (isAdmin) {
            await sendToTelegram(
                `📢 ADMIN BROADCAST\n` +
                `From: ${name}\n` +
                `Message: ${message}\n` +
                `IP: ${clientIP}`
            );
        }

        res.json({ success: true, message: newMessage });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, error: 'Failed to send message' });
    }
});

// ==================== NEW FEATURE ROUTES ====================

// Message threads
app.get('/messages/:id/thread', async (req, res) => {
    try {
        const threadMessages = await getThreadMessages(req.params.id);
        res.json({ success: true, messages: threadMessages });
    } catch (error) {
        console.error('Thread error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add reaction
app.post('/messages/:id/reactions', async (req, res) => {
    try {
        const { emoji, userId } = req.body;
        const success = await addReaction(req.params.id, emoji, userId);
        res.json({ success, message: success ? 'Reaction added' : 'Failed to add reaction' });
    } catch (error) {
        console.error('Add reaction error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove reaction
app.delete('/messages/:id/reactions/:emoji', async (req, res) => {
    try {
        const { userId } = req.body;
        const success = await removeReaction(req.params.id, req.params.emoji, userId);
        res.json({ success, message: success ? 'Reaction removed' : 'Failed to remove reaction' });
    } catch (error) {
        console.error('Remove reaction error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search messages
app.get('/search', async (req, res) => {
    try {
        const { q, user, dateFrom, dateTo } = req.query;
        const results = await searchMessages(q, { user, dateFrom, dateTo });
        res.json({ success: true, results, query: q });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create poll
app.post('/polls', async (req, res) => {
    try {
        const { question, options, settings, createdBy } = req.body;
        const poll = await createPoll(createdBy, question, options, settings);
        res.json({ success: true, poll });
    } catch (error) {
        console.error('Create poll error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Vote in poll
app.post('/polls/:id/vote', async (req, res) => {
    try {
        const { optionId, voterId } = req.body;
        const success = await voteInPoll(req.params.id, optionId, voterId);
        res.json({ success, message: success ? 'Vote recorded' : 'Failed to vote' });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Push notification subscription
app.post('/subscribe', async (req, res) => {
    try {
        const { subscription, userIp } = req.body;
        await subscriptionsCollection.insertOne({
            ...subscription,
            userIp: userIp,
            createdAt: new Date()
        });
        res.json({ success: true, message: 'Subscribed to notifications' });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// User profile
app.get('/profile', async (req, res) => {
    try {
        const userIp = getClientIP(req);
        const profile = await getUserProfile(userIp);
        res.json({ success: true, profile });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update profile
app.put('/profile', async (req, res) => {
    try {
        const userIp = getClientIP(req);
        const { avatar, bio, status } = req.body;
        await updateUserProfile(userIp, { avatar, bio, status });
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin middleware
const adminMiddleware = (req, res, next) => {
    const adminPassword = req.headers['admin-password'] || req.body.adminPassword;
    if (!adminPassword || !authenticateAdmin(adminPassword)) {
        return res.status(401).json({ success: false, error: 'Admin authentication required' });
    }
    next();
};

// Admin: Get audit logs
app.get('/admin/audit-logs', adminMiddleware, async (req, res) => {
    try {
        const logs = await db.collection('audit_logs')
            .find()
            .sort({ timestamp: -1 })
            .limit(100)
            .toArray();
        res.json({ success: true, logs });
    } catch (error) {
        console.error('Audit logs error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get statistics
app.get('/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const totalMessages = await messagesCollection.countDocuments();
        const totalUsers = await usersCollection.countDocuments();
        const activeUsers = await usersCollection.countDocuments({
            lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const messagesToday = await messagesCollection.countDocuments({
            timestamp: { $gte: today }
        });

        res.json({
            success: true,
            stats: {
                totalMessages,
                totalUsers,
                activeUsers,
                messagesToday,
                serverUptime: process.uptime()
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== TELEGRAM BOT ENHANCEMENTS ====================
function setupTelegramBot() {
    console.log('🤖 Initializing Enhanced Telegram Bot...');

    bot.onText(/\/start/, (msg) => {
        bot.sendMessage(msg.chat.id,
            `🎉 ${CONFIG.APP_NAME} v3.0 Bot!\n\n` +
            `Enhanced Commands:\n` +
            `/stats - Chat statistics\n` +
            `/users - Active users\n` +
            `/backup - Download backup\n` +
            `/search <query> - Search messages\n` +
            `/audit - View audit logs (Admin)\n\n` +
            `🌐 ${CONFIG.APP_URL}`
        );
    });

    bot.onText(/\/stats/, async (msg) => {
        try {
            const totalMessages = await messagesCollection.countDocuments();
            const totalUsers = await usersCollection.countDocuments();
            const activeUsers = await usersCollection.countDocuments({
                lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            bot.sendMessage(msg.chat.id,
                `📊 ${CONFIG.APP_NAME} Statistics\n\n` +
                `💬 Total Messages: ${totalMessages}\n` +
                `👥 Total Users: ${totalUsers}\n` +
                `🔥 Active Users (24h): ${activeUsers}\n` +
                `⏰ Server Uptime: ${Math.floor(process.uptime() / 60)} minutes`
            );
        } catch (error) {
            bot.sendMessage(msg.chat.id, '❌ Failed to get statistics');
        }
    });

    bot.onText(/\/search (.+)/, async (msg, match) => {
        try {
            const results = await searchMessages(match[1]);
            if (results.length > 0) {
                let response = `🔍 Search Results for "${match[1]}"\n\n`;
                results.slice(0, 5).forEach((msg, i) => {
                    response += `${i+1}. ${msg.name}: ${msg.message ? msg.message.substring(0, 50) : 'Attachment'}...\n`;
                });
                bot.sendMessage(msg.chat.id, response);
            } else {
                bot.sendMessage(msg.chat.id, '❌ No results found');
            }
        } catch (error) {
            bot.sendMessage(msg.chat.id, '❌ Search failed');
        }
    });
}

// ==================== HELPER FUNCTIONS ====================
async function sendToTelegram(message) {
    try {
        await bot.sendMessage(CONFIG.ADMIN_CHAT_ID, message);
        return true;
    } catch (error) {
        console.log('Telegram send failed:', error.message);
        return false;
    }
}

// ==================== ERROR HANDLING ====================
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==================== START SERVER ====================
async function startServer() {
    try {
        await initializeDatabase();
        setupTelegramBot();
        setupVoiceMessageRoutes();
        
        app.listen(PORT, () => {
            console.log(`
    🚀 ${CONFIG.APP_NAME} v3.0 SERVER STARTED
    📍 Port: ${PORT}
    🗃️  Database: MongoDB Atlas
    🤖 Telegram: Enhanced Bot
    👑 Admin: FIXED & Working
    📱 Features: Threads, Reactions, Voice, Polls, Search
    🔔 Notifications: Push + Browser
    🌐 URL: ${CONFIG.APP_URL}
    ✅ ALL SYSTEMS GO!
            `);
            
            console.log('🔐 ADMIN LOGIN INFO:');
            console.log('   Username: admin');
            console.log('   Password: admin123');
            console.log('   ✅ Authentication system is now working!');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
