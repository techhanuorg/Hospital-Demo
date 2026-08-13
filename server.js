const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const pino = require('pino');
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

// Baileys & Evolution API Global Connection State
let waSocket = null;
let waConnectionState = {
  status: 'disconnected', // 'connecting', 'connected', 'disconnected', 'qr_ready'
  qrCodeDataUrl: null,
  user: null,
  lastError: null
};

// Initialize Baileys WhatsApp Connection
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
        console.log('⚡ Evolution/Baileys WhatsApp QR Code updated');
      }

      if (connection === 'open') {
        waConnectionState.status = 'connected';
        waConnectionState.qrCodeDataUrl = null;
        waConnectionState.user = waSocket.user;
        console.log('✅ WhatsApp Baileys connected as:', waSocket.user?.id);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
        waConnectionState.status = 'disconnected';
        waConnectionState.qrCodeDataUrl = null;
        console.log('❌ WhatsApp connection closed. Reconnecting:', shouldReconnect);
        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 5000);
        }
      }
    });

    // Listen for incoming WhatsApp messages
    waSocket.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe) {
            console.log('📩 Incoming WhatsApp msg from:', msg.key.remoteJid, msg.message?.conversation || msg.message?.extendedTextMessage?.text);
          }
        }
      }
    });

  } catch (err) {
    console.error('Failed to initialize Baileys:', err);
    waConnectionState.status = 'disconnected';
    waConnectionState.lastError = err.message;
  }
}

// Start Baileys connection on server start
connectToWhatsApp();

// ==================== EVOLUTION API COMPATIBLE ROUTES ====================

// 1. Get WhatsApp Status & QR Code (Evolution API Spec)
app.get('/instance/connect', (req, res) => {
  res.json({
    instance: 'Hospital-Demo',
    status: waConnectionState.status,
    qrCode: waConnectionState.qrCodeDataUrl,
    user: waConnectionState.user
  });
});

app.get('/api/whatsapp/status', (req, res) => {
  res.json(waConnectionState);
});

// 2. Restart / Re-connect WhatsApp Session
app.post('/instance/restart', async (req, res) => {
  await connectToWhatsApp();
  res.json({ message: 'Baileys WhatsApp session restart initiated.' });
});

// 3. Send Text Message (Evolution API Spec: POST /message/sendText)
app.post('/message/sendText', async (req, res) => {
  try {
    const { number, text } = req.body;
    if (!waSocket || waConnectionState.status !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp is not connected. Scan QR code first.' });
    }

    if (!number || !text) {
      return res.status(400).json({ error: 'Parameters "number" and "text" are required.' });
    }

    // Format phone number to WhatsApp JID (e.g. 919876543210@s.whatsapp.net)
    const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';
    const sent = await waSocket.sendMessage(formattedNumber, { text: text });

    res.json({ status: 'SUCCESS', message: 'Message sent via Baileys API', sent });
  } catch (err) {
    console.error('Error sending WhatsApp message:', err);
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// 4. Groq AI Proxy Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt, systemPrompt } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY environment variable is not configured.' });
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
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
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: 'Groq API request failed', details: errorText });
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content || 'No response generated.';
    return res.json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// Serve index.html SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Hospital Platform with Baileys & Evolution API running on port ${PORT}`);
});
