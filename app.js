/**
 * Premium Hospital Patient Communication & WhatsApp Platform
 * Baileys Engine & Evolution API Compatible Interactivity Controller
 */

const AppState = {
  activeScreen: 'overview',
  activeBranch: 'Main Branch',
  waStatus: 'disconnected',
  waUser: null,
  waQrDataUrl: null,
  demoMode: true,
  demoStep: 1,
  
  patients: [
    { id: '88392', name: 'Robert Chen', phone: '+1 (555) 283-9942', dob: '05/12/1975', doctor: 'Dr. Sarah Smith', lastContact: '10:42 AM Today', tags: ['Hypertension', 'Pending Labs'], consent: 'Opted In', unread: false },
    { id: '88395', name: 'Rahul Sharma', phone: '+91 98765 43210', dob: '08/19/1984', doctor: 'Dr. Arjun Mehta', lastContact: '10:30 AM Today', tags: ['Cardiology', 'Telehealth'], consent: 'Opted In', unread: true }
  ],

  demoScenario: [
    { step: 1, title: 'WhatsApp Patient Enquiry', text: 'Rahul Sharma texts on WhatsApp: "I want to book a cardiology appointment for tomorrow."', targetView: 'conversations' },
    { step: 2, title: 'AI Assistant Auto-Response', text: 'Hospital AI Assistant replies instantly with doctor availability for Cardiology.', targetView: 'conversations' },
    { step: 3, title: 'Doctor Selection', text: 'Patient selects Dr. Arjun Mehta for 10:30 AM slot tomorrow.', targetView: 'booking' },
    { step: 4, title: 'Appointment Confirmed', text: 'Token #14 created. Automated WhatsApp confirmation sent with location pin.', targetView: 'appointments' },
    { step: 5, title: 'Scheduled 24h Reminder', text: 'System sets automated reminder broadcast for tomorrow 8:00 AM.', targetView: 'automations' },
    { step: 6, title: 'Reschedule Request Received', text: 'Patient texts: "Can I move my appt to 2:00 PM instead?"', targetView: 'conversations' },
    { step: 7, title: 'Staff Takeover & Confirmation', text: 'Receptionist Anjali approves reschedule in 1-click & sends updated ticket.', targetView: 'conversations' },
    { step: 8, title: 'Consultation Complete & Feedback', text: 'Consultation completed. Automated 5-star feedback inquiry sent.', targetView: 'feedback' }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initDemoStepper();
  renderActiveView();
  startWhatsAppStatusPolling();
});

function navigateTo(screenId) {
  AppState.activeScreen = screenId;
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('data-screen') === screenId) {
      link.classList.add('active-nav-item');
    } else {
      link.classList.remove('active-nav-item');
    }
  });

  document.querySelectorAll('.screen-container').forEach(el => el.classList.add('hidden'));
  const targetEl = document.getElementById(`screen-${screenId}`);
  if (targetEl) {
    targetEl.classList.remove('hidden');
    targetEl.classList.add('animate-fade-in');
  }

  closeMobileSidebar();
}

function initNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const screenId = link.getAttribute('data-screen');
      if (screenId) navigateTo(screenId);
    });
  });
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('z-50');
  }
}
function closeMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  if (sidebar && window.innerWidth < 768) {
    sidebar.classList.add('hidden');
  }
}

// WhatsApp Baileys / Evolution API Status Polling
function startWhatsAppStatusPolling() {
  checkWhatsAppStatus();
  setInterval(checkWhatsAppStatus, 4000);
}

async function checkWhatsAppStatus() {
  try {
    const res = await fetch('/instance/connect');
    if (res.ok) {
      const data = await res.json();
      AppState.waStatus = data.status;
      AppState.waQrDataUrl = data.qrCode;
      AppState.waUser = data.user;

      updateWhatsAppUI();
    }
  } catch (e) {
    // Local fallback
  }
}

function updateWhatsAppUI() {
  const textEl = document.getElementById('header-wa-status-text');
  const pulseEl = document.getElementById('header-wa-pulse');
  const modalStatusEl = document.getElementById('modal-wa-status-pill');
  const qrImg = document.getElementById('wa-qr-img');
  const spinner = document.getElementById('wa-qr-spinner');

  if (AppState.waStatus === 'connected') {
    if (textEl) textEl.textContent = `Connected (${AppState.waUser?.id?.split(':')[0] || 'WhatsApp'})`;
    if (pulseEl) pulseEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse';
    if (modalStatusEl) {
      modalStatusEl.textContent = 'Connected ✅';
      modalStatusEl.className = 'px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold';
    }
    if (qrImg) qrImg.classList.add('hidden');
    if (spinner) {
      spinner.classList.remove('hidden');
      spinner.innerHTML = `<span class="material-symbols-outlined text-4xl text-emerald-600">check_circle</span><span class="font-bold text-emerald-800">WhatsApp Pair Success!</span>`;
    }
  } else if (AppState.waStatus === 'qr_ready' && AppState.waQrDataUrl) {
    if (textEl) textEl.textContent = 'Scan QR Code';
    if (pulseEl) pulseEl.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-pulse';
    if (modalStatusEl) {
      modalStatusEl.textContent = 'Scan QR Code 📷';
      modalStatusEl.className = 'px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold';
    }
    if (qrImg) {
      qrImg.src = AppState.waQrDataUrl;
      qrImg.classList.remove('hidden');
    }
    if (spinner) spinner.classList.add('hidden');
  } else {
    if (textEl) textEl.textContent = 'Baileys Disconnected';
    if (pulseEl) pulseEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500 inline-block';
    if (modalStatusEl) {
      modalStatusEl.textContent = 'Disconnected';
      modalStatusEl.className = 'px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-bold';
    }
  }
}

function openWhatsAppQRModal() {
  const modal = document.getElementById('whatsapp-qr-modal');
  if (modal) modal.classList.remove('hidden');
  checkWhatsAppStatus();
}

function closeWhatsAppQRModal() {
  const modal = document.getElementById('whatsapp-qr-modal');
  if (modal) modal.classList.add('hidden');
}

async function refreshWhatsAppQR() {
  showToast('Refreshing Baileys WhatsApp Session...');
  try {
    await fetch('/instance/restart', { method: 'POST' });
    setTimeout(checkWhatsAppStatus, 1500);
  } catch (e) {}
}

function initDemoStepper() { updateDemoBarUI(); }
function nextDemoStep() {
  if (AppState.demoStep < AppState.demoScenario.length) {
    AppState.demoStep++;
    const stepData = AppState.demoScenario[AppState.demoStep - 1];
    navigateTo(stepData.targetView);
    updateDemoBarUI();
    showToast(`Demo Step ${AppState.demoStep}: ${stepData.title}`);
  }
}
function prevDemoStep() {
  if (AppState.demoStep > 1) {
    AppState.demoStep--;
    const stepData = AppState.demoScenario[AppState.demoStep - 1];
    navigateTo(stepData.targetView);
    updateDemoBarUI();
  }
}
function updateDemoBarUI() {
  const stepObj = AppState.demoScenario[AppState.demoStep - 1];
  const counterEl = document.getElementById('demo-step-counter');
  const titleEl = document.getElementById('demo-step-title');
  const textEl = document.getElementById('demo-step-text');
  if (counterEl) counterEl.textContent = `Step ${AppState.demoStep} of 8`;
  if (titleEl) titleEl.textContent = stepObj.title;
  if (textEl) textEl.textContent = stepObj.text;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 bg-primary text-on-primary px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-fade-in font-label-md text-label-md';
  toast.innerHTML = `<span class="material-symbols-outlined text-tertiary-fixed-dim">info</span><span>${msg}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Send Chat Message via Baileys API Spec (/message/sendText) + Groq AI Bot Fallback
async function sendChatMessage(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('chat-input-textarea');
  if (!input || !input.value.trim()) return;

  const msgText = input.value.trim();
  input.value = '';

  const canvas = document.getElementById('chat-messages-canvas');
  if (!canvas) return;

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isNote = document.getElementById('note-toggle-btn')?.classList.contains('bg-amber-100');

  const msgHTML = isNote ? `
    <div class="flex flex-col gap-1 items-end self-end max-w-[85%] ml-auto animate-fade-in">
      <span class="text-[11px] text-amber-700 font-semibold mr-1">Internal Note by Anjali • ${timeStr}</span>
      <div class="internal-note-bubble p-4 rounded-2xl rounded-tr-sm shadow-sm">
        <p class="text-xs font-medium">📌 ${msgText}</p>
      </div>
    </div>
  ` : `
    <div class="flex flex-col gap-1 items-end self-end max-w-[80%] ml-auto animate-fade-in">
      <span class="text-[11px] text-secondary mr-1">Anjali (Front Desk) • ${timeStr}</span>
      <div class="bg-primary text-on-primary p-4 rounded-2xl rounded-tr-sm shadow-sm">
        <p class="text-sm">${msgText}</p>
      </div>
    </div>
  `;

  canvas.insertAdjacentHTML('beforeend', msgHTML);
  canvas.scrollTop = canvas.scrollHeight;

  // Send real WhatsApp message if Baileys is connected
  if (!isNote && AppState.waStatus === 'connected') {
    try {
      await fetch('/message/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '+15552839942', text: msgText })
      });
      showToast('Delivered to WhatsApp via Baileys');
    } catch (e) {}
  } else if (!isNote) {
    // Groq AI Assistant Fallback
    const typingId = 'typing-' + Date.now();
    const typingHTML = `
      <div id="${typingId}" class="flex flex-col gap-1 items-start max-w-[80%] animate-fade-in">
        <span class="text-[11px] text-secondary ml-1 font-medium">Groq Hospital AI • ${timeStr}</span>
        <div class="bg-surface-container-lowest border border-outline-variant/30 text-secondary p-3 rounded-2xl rounded-tl-sm text-xs italic">
          Thinking response...
        </div>
      </div>
    `;
    canvas.insertAdjacentHTML('beforeend', typingHTML);
    canvas.scrollTop = canvas.scrollHeight;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: msgText,
          systemPrompt: 'You are a professional hospital AI assistant for City Hospital. Provide helpful, calm, and concise responses for patient inquiries.'
        })
      });
      const data = await res.json();
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      const aiReply = data.reply || 'Hello Robert! Your request has been logged and Dr. Smith has been notified.';

      const aiHTML = `
        <div class="flex flex-col gap-1 items-start max-w-[80%] animate-fade-in">
          <span class="text-[11px] text-purple-700 ml-1 font-semibold">Groq Hospital AI • ${timeStr}</span>
          <div class="bg-purple-50 border border-purple-200 text-purple-950 p-4 rounded-2xl rounded-tl-sm shadow-sm">
            <p class="text-sm">${aiReply}</p>
          </div>
        </div>
      `;
      canvas.insertAdjacentHTML('beforeend', aiHTML);
      canvas.scrollTop = canvas.scrollHeight;
    } catch (e) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
    }
  }
}

function toggleNoteMode() {
  const btn = document.getElementById('note-toggle-btn');
  const input = document.getElementById('chat-input-textarea');
  if (btn && input) {
    if (btn.classList.contains('bg-amber-100')) {
      btn.classList.remove('bg-amber-100', 'text-amber-800');
      btn.classList.add('text-secondary');
      input.placeholder = 'Type a professional response...';
    } else {
      btn.classList.add('bg-amber-100', 'text-amber-800');
      btn.classList.remove('text-secondary');
      input.placeholder = 'Type an internal staff note...';
    }
  }
}

function renderActiveView() { navigateTo(AppState.activeScreen); }
