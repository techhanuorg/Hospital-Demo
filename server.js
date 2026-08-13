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

// Multi-Groq API Key Pool from Environment Variables & Fallbacks
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
          temperature: 0.3,
          max_tokens: 400
        })
      });

      if (response.ok) {
        currentKeyIndex = (currentKeyIndex + attempt + 1) % keyPool.length;
        const data = await response.json();
        return data.choices[0]?.message?.content || 'Message received.';
      }
    } catch (e) {
      console.warn(`[Groq Multi-API] Key attempt failure:`, e.message);
    }
  }

  return 'Thank you for messaging City Hospital. Our team is at your service.';
}

// Extract Patient Details (Name, Age, Gender) from Any Free-form Input Using Groq AI
async function extractPatientDetailsFromText(userText) {
  const systemPrompt = `You are a medical data extraction bot. Parse the user input and extract Name, Age, and Gender.
Return STRICT JSON format ONLY: {"name": "Extracted Name or Unknown", "age": "Extracted Age or Unknown", "gender": "Male/Female/Other or Unknown"}`;
  
  try {
    const rawReply = await callGroqAI(userText, systemPrompt);
    const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {}

  return { name: userText, age: 'Unknown', gender: 'Unknown' };
}

// In-Memory Patient Conversation State Tracker for WhatsApp
const patientSessions = {};

// Baileys WhatsApp Engine
let waSocket = null;
let waConnectionState = {
  status: 'disconnected',
  qrCodeDataUrl: null,
  user: null
};

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

    // Handle Conversational WhatsApp Onboarding & Prescription Workflow
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

            // STEP 1: Language Selection
            if (session.step === 'ASK_LANG') {
              session.step = 'ASK_DETAILS';
              session.language = textMsg || 'English';
              await waSocket.sendMessage(senderJid, {
                text: `🏥 Welcome to City Hospital!\n\nPreferred Language set to: ${session.language}\n\nStep 1/3: Please reply with your Name, Age, and Gender (e.g. "Rahul Sharma, 28, Male" or any format).`
              });
            }
            // STEP 2: Name, Age, Gender Extraction
            else if (session.step === 'ASK_DETAILS') {
              const details = await extractPatientDetailsFromText(textMsg);
              session.name = details.name !== 'Unknown' ? details.name : textMsg;
              session.age = details.age;
              session.gender = details.gender;
              session.step = 'ASK_PRESCRIPTION';

              // Save patient in persistent database
              db.addPatient({
                name: session.name,
                phone: session.phone,
                age: session.age,
                gender: session.gender,
                language: session.language,
                dob: session.age !== 'Unknown' ? (2026 - parseInt(session.age)) + '-01-01' : '1990-01-01',
                doctor: 'Dr. Sarah Smith',
                consent: 'Opted In',
                tags: ['WhatsApp Onboarded']
              });

              await waSocket.sendMessage(senderJid, {
                text: `✅ Patient Registered:\n• Name: ${session.name}\n• Age: ${session.age}\n• Gender: ${session.gender}\n\nStep 2/3: Please upload/send your Prescription Photo or describe your symptoms/medical history.`
              });
            }
            // STEP 3: Prescription Upload & Auto-Followup
            else if (session.step === 'ASK_PRESCRIPTION') {
              session.step = 'BOOK_SLOT';
              
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 7);
              const dateStr = dueDate.toISOString().split('T')[0];

              db.addFollowup({
                patientName: session.name,
                phone: session.phone,
                doctor: 'Dr. Sarah Smith',
                reason: 'Prescription Follow-up (Auto Extracted)',
                dueDate: dateStr,
                status: 'Pending',
                autoReminder: true,
                source: 'WhatsApp Prescription Bot'
              });

              // Fetch unbooked slots for Dr. Sarah Smith tomorrow
              const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
              const availableSlots = db.getAvailableSlots('doc-1', tomorrowStr);

              await waSocket.sendMessage(senderJid, {
                text: `✅ Prescription Received!\n📅 Automated Follow-up scheduled for ${dateStr}.\n\nStep 3/3: Select Available Appointment Slot for tomorrow (${tomorrowStr}) with Dr. Sarah Smith:\n\n` +
                      availableSlots.map((s, idx) => `${idx + 1}. ${s}`).join('\n') + `\n\nReply with slot number (e.g. 1).`
              });
            }
            // STEP 4: Appointment Slot Selection
            else if (session.step === 'BOOK_SLOT') {
              const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
              const availableSlots = db.getAvailableSlots('doc-1', tomorrowStr);
              const slotIdx = parseInt(textMsg) - 1;
              const chosenSlot = (slotIdx >= 0 && slotIdx < availableSlots.length) ? availableSlots[slotIdx] : availableSlots[0];

              try {
                const appt = db.addAppointment({
                  patientName: session.name,
                  phone: session.phone,
                  doctorId: 'doc-1',
                  doctorName: 'Dr. Sarah Smith',
                  date: tomorrowStr,
                  time: chosenSlot,
                  dept: 'Internal Medicine',
                  status: 'Confirmed'
                });

                session.step = 'COMPLETED';

                await waSocket.sendMessage(senderJid, {
                  text: `🎉 Appointment Confirmed!\n\n📋 Token: ${appt.token}\n👨‍⚕️ Doctor: Dr. Sarah Smith\n📅 Date: ${tomorrowStr}\n⏰ Time Slot: ${chosenSlot}\n📍 Location: Cabin 2, Main Branch\n\nPlease arrive 15 minutes prior.`
                });
              } catch (e) {
                await waSocket.sendMessage(senderJid, { text: `⚠️ ${e.message} Please choose another slot.` });
              }
            }
            // GENERAL CHAT
            else {
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

app.get('/api/db', (req, res) => {
  res.json(db.readDB());
});

// Endpoint to fetch unbooked available slots for any doctor and date
app.get('/api/available-slots', (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    return res.status(400).json({ error: 'doctorId and date query parameters are required.' });
  }
  const openSlots = db.getAvailableSlots(doctorId, date);
  res.json({ doctorId, date, availableSlots: openSlots });
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

// Create Appointment with Double-Booking Validation
app.post('/api/appointments', (req, res) => {
  try {
    const item = db.addAppointment(req.body);
    res.json({ success: true, appointment: item });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
  console.log(`🚀 Hospital Conversational & Slot Scheduler Server running on port ${PORT}`);
});
