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

// Dynamic Multi-Groq API Key Pool from Environment Variables
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

// Multi-Key Failover AI Call Function
async function callGroqAI(prompt, systemPrompt) {
  const keyPool = getGroqKeyPool();
  if (keyPool.length === 0) {
    return 'Hello! Your message has been received by City Hospital.';
  }

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
          temperature: 0.7,
          max_tokens: 400
        })
      });

      if (response.ok) {
        currentKeyIndex = (currentKeyIndex + attempt + 1) % keyPool.length;
        const data = await response.json();
        return data.choices[0]?.message?.content || 'Message received.';
      } else {
        console.warn(`[Groq Multi-API] Key attempt #${attempt} failed status ${response.status}. Trying next key in pool...`);
      }
    } catch (e) {
      console.warn(`[Groq Multi-API] Exception key attempt #${attempt}:`, e.message);
    }
  }

  return 'Thank you for messaging City Hospital. Our team is at your service.';
}

// Baileys WhatsApp Engine
let waSocket = null;
let waConnectionState = {
  status: 'disconnected',
  qrCodeDataUrl: null,
  user: null,
  lastError: null
};

async function connectToWhatsApp() {
  try {
    const authPath = path.join(__dirname, 'baileys_auth_info');
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

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
        console.log('⚡ Baileys WhatsApp QR Code generated');
      }

      if (connection === 'open') {
        waConnectionState.status = 'connected';
        waConnectionState.qrCodeDataUrl = null;
        waConnectionState.user = waSocket.user;
        console.log('✅ WhatsApp Connected:', waSocket.user?.id);
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
            const senderPhone = '+' + senderJid.split('@')[0];
            const textMsg = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
            const isImage = !!msg.message?.imageMessage;

            if (isImage) {
              await waSocket.sendMessage(senderJid, { text: '🩺 Thank you! We received your prescription photo. Setting up your automated follow-up...' });
              
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 7);
              const dateStr = dueDate.toISOString().split('T')[0];

              db.addFollowup({
                patientName: 'WhatsApp Patient (' + senderPhone + ')',
                phone: senderPhone,
                doctor: 'Dr. Sarah Smith',
                reason: 'Prescription Follow-up (Auto Extracted)',
                dueDate: dateStr,
                status: 'Pending',
                autoReminder: true,
                source: 'WhatsApp Prescription Bot'
              });

              await waSocket.sendMessage(senderJid, {
                text: `✅ Prescription Processed!\n\n📅 Automated Follow-up Scheduled:\nDate: ${dateStr}\nDoctor: Dr. Sarah Smith\n\nWe will send a WhatsApp reminder 24h prior.`
              });
            } else if (textMsg) {
              const aiReply = await callGroqAI(textMsg, 'You are a professional, calm receptionist for City Hospital. Provide helpful, concise responses.');
              await waSocket.sendMessage(senderJid, { text: aiReply });
            }
          }
        }
      }
    });

  } catch (err) {
    console.error('Failed Baileys connection:', err.message);
    waConnectionState.status = 'disconnected';
  }
}

connectToWhatsApp();

// ==================== REST API ENDPOINTS ====================

app.get('/api/db', (req, res) => {
  res.json(db.readDB());
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

app.post('/api/patients', (req, res) => {
  const item = db.addPatient(req.body);
  res.json({ success: true, patient: item });
});

app.post('/api/doctors', (req, res) => {
  const item = db.addDoctor(req.body);
  res.json({ success: true, doctor: item });
});

app.post('/api/appointments', (req, res) => {
  const item = db.addAppointment(req.body);
  res.json({ success: true, appointment: item });
});

app.post('/api/followups', (req, res) => {
  const item = db.addFollowup(req.body);
  res.json({ success: true, followup: item });
});

app.post('/api/upload-prescription', upload.single('prescription'), (req, res) => {
  try {
    const patientName = req.body.patientName || 'Walk-in Patient';
    const phone = req.body.phone || '+91 98765 43210';
    const doctor = req.body.doctor || 'Dr. Sarah Smith';
    const daysOffset = parseInt(req.body.daysOffset) || 7;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysOffset);
    const dateStr = dueDate.toISOString().split('T')[0];

    const followup = db.addFollowup({
      patientName,
      phone,
      doctor,
      reason: `Prescription Follow-up (${req.body.notes || 'Medication Review'})`,
      dueDate: dateStr,
      status: 'Pending',
      autoReminder: true,
      source: 'Prescription Photo Scanner'
    });

    res.json({ success: true, followup });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process prescription' });
  }
});

app.get('/instance/connect', (req, res) => {
  res.json({
    instance: 'Hospital-Demo',
    status: waConnectionState.status,
    qrCode: waConnectionState.qrCodeDataUrl,
    user: waConnectionState.user
  });
});

app.post('/message/sendText', async (req, res) => {
  try {
    const { number, text } = req.body;
    if (!waSocket || waConnectionState.status !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp is not connected.' });
    }
    const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';
    const sent = await waSocket.sendMessage(formattedNumber, { text });
    res.json({ status: 'SUCCESS', sent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const reply = await callGroqAI(req.body.prompt, req.body.systemPrompt);
  res.json({ reply });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Hospital Server with Multi-Groq API Pool running on port ${PORT}`);
});
