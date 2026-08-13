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

async function extractPatientDetailsFromText(userText) {
  const systemPrompt = `You are a medical data extraction bot. Return STRICT JSON ONLY: {"name": "Name or Unknown", "age": "Age or Unknown", "gender": "Male/Female or Unknown"}`;
  try {
    const rawReply = await callGroqAI(userText, systemPrompt);
    const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return { name: userText, age: 'Unknown', gender: 'Unknown' };
}

const patientSessions = {};

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
            const isImage = !!msg.message?.imageMessage;

            if (!patientSessions[phone]) {
              patientSessions[phone] = { step: 'ASK_LANG', language: 'English', name: '', age: '', gender: '', phone };
            }
            const session = patientSessions[phone];

            if (session.step === 'ASK_LANG') {
              session.step = 'ASK_DETAILS';
              session.language = textMsg || 'English';
              await waSocket.sendMessage(senderJid, { text: `🏥 Welcome to City Hospital!\nLanguage: ${session.language}\n\nStep 1/3: Please reply with your Name, Age, and Gender (e.g. "Rahul Sharma, 28, Male").` });
            } else if (session.step === 'ASK_DETAILS') {
              const details = await extractPatientDetailsFromText(textMsg);
              session.name = details.name !== 'Unknown' ? details.name : textMsg;
              session.age = details.age;
              session.gender = details.gender;
              session.step = 'ASK_PRESCRIPTION';

              db.addPatient({ name: session.name, phone: session.phone, age: session.age, gender: session.gender, language: session.language, doctor: 'Dr. Sarah Smith', consent: 'Opted In' });

              await waSocket.sendMessage(senderJid, { text: `✅ Patient Registered: ${session.name} (${session.age} Yrs, ${session.gender})\n\nStep 2/3: Please upload your Prescription Photo or medical complaint.` });
            } else if (session.step === 'ASK_PRESCRIPTION') {
              session.step = 'BOOK_SLOT';
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 7);
              const dateStr = dueDate.toISOString().split('T')[0];

              db.addFollowup({ patientName: session.name, phone: session.phone, doctor: 'Dr. Sarah Smith', reason: 'Prescription Follow-up', dueDate: dateStr, status: 'Pending', autoReminder: true, source: 'WhatsApp Prescription Bot' });

              const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
              const availableSlots = db.getAvailableSlots('doc-1', tomorrowStr);

              await waSocket.sendMessage(senderJid, { text: `✅ Prescription Received!\n\nStep 3/3: Select Available Slot for ${tomorrowStr} with Dr. Sarah Smith:\n\n` + availableSlots.map((s, idx) => `${idx + 1}. ${s}`).join('\n') });
            } else if (session.step === 'BOOK_SLOT') {
              const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
              const availableSlots = db.getAvailableSlots('doc-1', tomorrowStr);
              const slotIdx = parseInt(textMsg) - 1;
              const chosenSlot = (slotIdx >= 0 && slotIdx < availableSlots.length) ? availableSlots[slotIdx] : availableSlots[0];

              try {
                const appt = db.addAppointment({ patientName: session.name, phone: session.phone, doctorId: 'doc-1', doctorName: 'Dr. Sarah Smith', date: tomorrowStr, time: chosenSlot, status: 'Confirmed' });
                session.step = 'COMPLETED';
                await waSocket.sendMessage(senderJid, { text: `🎉 Appointment Confirmed!\n📋 ${appt.token}\n👨‍⚕️ Dr. Sarah Smith\n📅 ${tomorrowStr} at ${chosenSlot}` });
              } catch (e) {
                await waSocket.sendMessage(senderJid, { text: `⚠️ ${e.message}` });
              }
            } else {
              const reply = await callGroqAI(textMsg, `You are a helpful receptionist for City Hospital responding in ${session.language}.`);
              await waSocket.sendMessage(senderJid, { text: reply });
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

app.post('/api/patients', (req, res) => res.json({ success: true, patient: db.addPatient(req.body) }));
app.post('/api/doctors', (req, res) => res.json({ success: true, doctor: db.addDoctor(req.body) }));
app.post('/api/appointments', (req, res) => {
  try { res.json({ success: true, appointment: db.addAppointment(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/followups', (req, res) => res.json({ success: true, followup: db.addFollowup(req.body) }));

// 5. Bulk WhatsApp Media/Photo Campaign Endpoint (Evolution API Spec)
app.post('/message/sendMedia', upload.single('image'), async (req, res) => {
  try {
    const { number, caption } = req.body;
    let imageUrl = req.body.imageUrl;

    if (req.file) {
      imageUrl = req.file.path;
    }

    if (!waSocket || waConnectionState.status !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp is not connected.' });
    }

    const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';
    const sent = await waSocket.sendMessage(formattedNumber, {
      image: { url: imageUrl },
      caption: caption || ''
    });

    res.json({ status: 'SUCCESS', sent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send WhatsApp media message', details: err.message });
  }
});

app.post('/message/sendText', async (req, res) => {
  try {
    const { number, text } = req.body;
    if (!waSocket || waConnectionState.status !== 'connected') return res.status(400).json({ error: 'WhatsApp is not connected.' });
    const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';
    const sent = await waSocket.sendMessage(formattedNumber, { text });
    res.json({ status: 'SUCCESS', sent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

app.post('/api/chat', async (req, res) => res.json({ reply: await callGroqAI(req.body.prompt, req.body.systemPrompt) }));

app.get('/instance/connect', (req, res) => res.json({ instance: 'Hospital-Demo', status: waConnectionState.status, qrCode: waConnectionState.qrCodeDataUrl, user: waConnectionState.user }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`🚀 Hospital Platform running on port ${PORT}`));
