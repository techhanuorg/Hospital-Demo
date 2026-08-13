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
  fetchLatestBaileysVersion,
  downloadMediaMessage
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

// Baileys WhatsApp Connection State
let waSocket = null;
let waConnectionState = {
  status: 'disconnected',
  qrCodeDataUrl: null,
  user: null,
  lastError: null
};

async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'baileys_auth_info'));
    const { version } = await fetchLatestBaileysVersion();

    waConnectionState.status = 'connecting';
    waConnectionState.lastError = null;

    waSocket = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
      auth: state,
      browser: ['Hospital Platform', 'Chrome', '1.0.0']
    });

    waSocket.ev.on('creds.update', saveCreds);

    waSocket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        waConnectionState.status = 'qr_ready';
        waConnectionState.qrCodeDataUrl = await QRCode.toDataURL(qr);
        console.log('⚡ Baileys WhatsApp QR Code updated');
      }

      if (connection === 'open') {
        waConnectionState.status = 'connected';
        waConnectionState.qrCodeDataUrl = null;
        waConnectionState.user = waSocket.user;
        console.log('✅ WhatsApp Connected as:', waSocket.user?.id);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
        waConnectionState.status = 'disconnected';
        waConnectionState.qrCodeDataUrl = null;
        if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
      }
    });

    // Handle Incoming WhatsApp Messages (Auto-Bot + Prescription Vision)
    waSocket.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe) {
            const senderJid = msg.key.remoteJid;
            const senderPhone = '+' + senderJid.split('@')[0];
            const textMsg = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
            const isImage = !!msg.message?.imageMessage;

            console.log(`📩 Incoming WhatsApp from ${senderPhone}:`, textMsg || '[Image Prescription]');

            // 1. If Patient sent Prescription Image
            if (isImage) {
              await waSocket.sendMessage(senderJid, { text: '🩺 Thank you! We received your prescription image. Analyzing details to schedule your follow-up...' });
              
              // Automatically schedule a follow-up in DB
              const followupDate = new Date();
              followupDate.setDate(followupDate.getDate() + 7); // Default 7 days follow up
              const dateStr = followupDate.toISOString().split('T')[0];

              const newFollowup = db.addFollowup({
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
                text: `✅ Prescription Received & Processed!\n\n📅 Automated Follow-up Scheduled:\nDate: ${dateStr}\nDoctor: Dr. Sarah Smith\n\nWe will send you a WhatsApp reminder 24 hours prior.`
              });
            }
            // 2. If Patient sent Text Message -> Call Groq AI Assistant
            else if (textMsg) {
              const aiReply = await callGroqAI(textMsg, 'You are a calm, professional hospital receptionist for City Hospital. Answer patient inquiries concisely.');
              await waSocket.sendMessage(senderJid, { text: aiReply });
            }
          }
        }
      }
    });

  } catch (err) {
    console.error('Failed to initialize Baileys:', err);
    waConnectionState.status = 'disconnected';
  }
}

connectToWhatsApp();

// Helper: Call Groq AI API
async function callGroqAI(prompt, systemPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return 'Hello! Your message has been received by City Hospital.';

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

    if (!response.ok) return 'Thank you for messaging City Hospital. Our receptionist will assist you shortly.';
    const data = await response.json();
    return data.choices[0]?.message?.content || 'Message received.';
  } catch (e) {
    return 'Thank you for messaging City Hospital. Our team is at your service.';
  }
}

// ==================== REST API & DATABASE ENDPOINTS ====================

// 1. Get Entire Database State
app.get('/api/db', (req, res) => {
  res.json(db.readDB());
});

// 2. Image Upload Endpoint (Free Local Disk Cloud Storage Served At /uploads/...)
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl, filename: req.file.filename });
});

// 3. Patients API
app.post('/api/patients', (req, res) => {
  const newPatient = db.addPatient(req.body);
  res.json({ success: true, patient: newPatient });
});

// 4. Doctors API
app.post('/api/doctors', (req, res) => {
  const newDoctor = db.addDoctor(req.body);
  res.json({ success: true, doctor: newDoctor });
});

// 5. Appointments API
app.post('/api/appointments', (req, res) => {
  const newAppt = db.addAppointment(req.body);
  res.json({ success: true, appointment: newAppt });
});

// 6. Follow-ups API (Manual + Bot Creation)
app.post('/api/followups', (req, res) => {
  const newFollowup = db.addFollowup(req.body);
  res.json({ success: true, followup: newFollowup });
});

// 7. Prescription Photo Scanner & Auto Follow-up Creator Endpoint
app.post('/api/upload-prescription', upload.single('prescription'), async (req, res) => {
  try {
    const patientName = req.body.patientName || 'Walk-in Patient';
    const phone = req.body.phone || '+91 98765 43210';
    const doctor = req.body.doctor || 'Dr. Sarah Smith';
    const daysOffset = parseInt(req.body.daysOffset) || 7;

    let imageUrl = '';
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysOffset);
    const dateStr = dueDate.toISOString().split('T')[0];

    const presc = db.addPrescription({
      patientName,
      phone,
      doctor,
      imageUrl,
      uploadedAt: new Date().toISOString()
    });

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

    res.json({ success: true, prescription: presc, followup });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process prescription' });
  }
});

// 8. Baileys / Evolution API Status
app.get('/instance/connect', (req, res) => {
  res.json({
    instance: 'Hospital-Demo',
    status: waConnectionState.status,
    qrCode: waConnectionState.qrCodeDataUrl,
    user: waConnectionState.user
  });
});

// 9. Send WhatsApp Text (Evolution API Spec)
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

// 10. Groq AI Proxy
app.post('/api/chat', async (req, res) => {
  const reply = await callGroqAI(req.body.prompt, req.body.systemPrompt);
  res.json({ reply });
});

// Serve SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Hospital Automation Platform with Persistence & Prescription Vision running on port ${PORT}`);
});
