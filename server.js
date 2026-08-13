const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const pino = require('pino');
require('dotenv').config();

const db = require('./db');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure Uploads Directory Exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, './')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Dynamic Multi-Groq API Key Pool
function getGroqKeyPool() {
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5
  ].filter(k => k && k.trim().length > 0);

  return [...new Set(keys)];
}

let currentKeyIndex = 0;

async function callGroqAI(prompt, systemPrompt) {
  const keyPool = getGroqKeyPool();
  if (keyPool.length === 0) return 'Hello! Your message has been received by City Hospital.';

  for (let attempt = 0; attempt < keyPool.length; attempt++) {
    const apiKey = keyPool[(currentKeyIndex + attempt) % keyPool.length];
    try {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: messages,
          temperature: 0.3,
          max_tokens: 400
        })
      });

      if (response.ok) {
        currentKeyIndex = (currentKeyIndex + attempt + 1) % keyPool.length;
        const data = await response.json();
        return data.choices[0]?.message?.content || 'Message received.';
      }
    } catch (e) {}
  }
  return 'Thank you for messaging City Hospital. Our team is at your service.';
}

// Spintax Message Variation (Prevents Exact Duplicate Text Spam Fingerprinting)
function processSpintax(text) {
  return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
    const options = choices.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

// ==================== ANTI-BAN CAMPAIGN QUEUE ENGINE ====================
let campaignQueue = [];
let isCampaignRunning = false;
let campaignStats = { total: 0, sent: 0, failed: 0, status: 'idle', currentBatch: 0 };

async function processAntiBanCampaignQueue() {
  if (isCampaignRunning || campaignQueue.length === 0) return;
  isCampaignRunning = true;
  campaignStats.status = 'running';

  console.log(`🛡️ Anti-Ban Engine: Starting campaign broadcast for ${campaignQueue.length} patients...`);

  let batchCounter = 0;

  while (campaignQueue.length > 0) {
    const item = campaignQueue.shift();
    batchCounter++;
    campaignStats.currentBatch = batchCounter;

    try {
      if (!waSocket || waConnectionState.status !== 'connected') {
        console.warn('WhatsApp disconnected during campaign. Pausing queue...');
        campaignQueue.unshift(item);
        campaignStats.status = 'paused_disconnected';
        break;
      }

      // Format Spintax text variation
      const variedText = processSpintax(item.text);

      if (item.hasPhoto && item.photoPath) {
        await waSocket.sendMessage(item.jid, { image: { url: item.photoPath }, caption: variedText });
      } else {
        await waSocket.sendMessage(item.jid, { text: variedText });
      }

      campaignStats.sent++;
      console.log(`[Anti-Ban Queue] (${campaignStats.sent}/${campaignStats.total}) Delivered to ${item.phone}`);
    } catch (e) {
      campaignStats.failed++;
      console.error(`[Anti-Ban Queue] Failed for ${item.phone}:`, e.message);
    }

    // 1. HUMAN-LIKE RANDOM DELAY (Between 5 to 12 seconds per message)
    const randomDelay = Math.floor(Math.random() * (12000 - 5000 + 1)) + 5000;
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    // 2. BATCH COOLDOWN PAUSE (Every 25 messages, rest for 2.5 minutes / 150 seconds)
    if (batchCounter % 25 === 0 && campaignQueue.length > 0) {
      console.log(`⏸️ Anti-Ban Cooldown: Resting for 150s after 25 messages to keep number safe...`);
      campaignStats.status = 'cooldown_resting';
      await new Promise(resolve => setTimeout(resolve, 150000));
      campaignStats.status = 'running';
    }
  }

  isCampaignRunning = false;
  if (campaignQueue.length === 0) campaignStats.status = 'completed';
  console.log('🎉 Anti-Ban Campaign Processing Finished!');
}

// Baileys WhatsApp Engine
let waSocket = null;
let waConnectionState = { status: 'disconnected', qrCodeDataUrl: null, user: null };

async function connectToWhatsApp() {
  try {
    const authPath = path.join(__dirname, 'baileys_auth_info');
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    waConnectionState.status = 'connecting';

    waSocket = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Hospital Platform', 'Chrome', '1.0.0']
    });

    waSocket.ev.on('creds.update', saveCreds);

    waSocket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        waConnectionState.status = 'qr_ready';
        waConnectionState.qrCodeDataUrl = await QRCode.toDataURL(qr);
      }
      if (connection === 'open') {
        waConnectionState.status = 'connected';
        waConnectionState.qrCodeDataUrl = null;
        waConnectionState.user = waSocket.user;
      }
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        waConnectionState.status = 'disconnected';
        waConnectionState.qrCodeDataUrl = null;
        if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
      }
    });

    waSocket.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe) {
            const senderJid = msg.key.remoteJid;
            const phone = '+' + senderJid.split('@')[0];
            const textMsg = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();

            // Auto-Unsubscribe / Opt-out Guard
            if (textMsg.toUpperCase() === 'STOP' || textMsg.toUpperCase() === 'UNSUBSCRIBE') {
              db.addPatient({ phone, consent: 'Opted Out' });
              await waSocket.sendMessage(senderJid, { text: 'You have been unsubscribed from WhatsApp broadcasts.' });
              continue;
            }
          }
        }
      }
    });

  } catch (err) {
    console.error('Failed Baileys connection:', err.message);
  }
}

connectToWhatsApp();

// ==================== REST API ENDPOINTS ====================

app.get('/api/db', (req, res) => res.json(db.readDB()));

app.get('/api/available-slots', (req, res) => {
  const { doctorId, date } = req.query;
  res.json({ doctorId, date, availableSlots: db.getAvailableSlots(doctorId, date) });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl, filename: req.file.filename, path: req.file.path });
});

// Safe Anti-Ban Bulk Campaign Endpoint
app.post('/api/campaigns/send-safe', upload.single('image'), async (req, res) => {
  try {
    const { title, text, segment } = req.body;
    let photoPath = req.file ? req.file.path : null;

    const allPatients = db.getPatients();
    // Exclude Opted Out Patients automatically
    const eligiblePatients = allPatients.filter(p => p.consent !== 'Opted Out');

    if (eligiblePatients.length === 0) {
      return res.status(400).json({ error: 'No eligible opted-in patients found.' });
    }

    campaignQueue = eligiblePatients.map(p => ({
      jid: p.phone.replace(/\D/g, '') + '@s.whatsapp.net',
      phone: p.phone,
      text: text.replace('{{patient_name}}', p.name),
      hasPhoto: !!photoPath,
      photoPath: photoPath
    }));

    campaignStats = {
      total: campaignQueue.length,
      sent: 0,
      failed: 0,
      status: 'queued',
      currentBatch: 0
    };

    // Start Anti-Ban Queue Processing in Background
    processAntiBanCampaignQueue();

    res.json({
      success: true,
      message: `Anti-Ban Protected Campaign "${title}" Queued for ${eligiblePatients.length} Patients!`,
      stats: campaignStats
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to queue campaign', details: err.message });
  }
});

app.get('/api/campaigns/status', (req, res) => {
  res.json({ stats: campaignStats, remaining: campaignQueue.length });
});

app.post('/message/sendText', async (req, res) => {
  try {
    const { number, text } = req.body;
    if (!waSocket || waConnectionState.status !== 'connected') return res.status(400).json({ error: 'WhatsApp is not connected.' });
    const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';
    const sent = await waSocket.sendMessage(formattedNumber, { text: processSpintax(text) });
    res.json({ status: 'SUCCESS', sent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

app.post('/api/chat', async (req, res) => res.json({ reply: await callGroqAI(req.body.prompt, req.body.systemPrompt) }));
app.get('/instance/connect', (req, res) => res.json({ instance: 'Hospital-Demo', status: waConnectionState.status, qrCode: waConnectionState.qrCodeDataUrl, user: waConnectionState.user }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`🚀 Anti-Ban Engine & Hospital Server running on port ${PORT}`));
