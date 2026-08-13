/**
 * Premium Hospital Patient Communication & WhatsApp Platform
 * Persistence Engine, Doctors, Patients & Bulk Photo Campaign Controller
 */

const AppState = {
  activeScreen: 'overview',
  waStatus: 'disconnected',
  waUser: null,
  waQrDataUrl: null,
  
  db: {
    patients: [],
    doctors: [],
    appointments: [],
    followups: [],
    prescriptions: []
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadDatabaseData();
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
  if (sidebar) sidebar.classList.toggle('hidden');
}
function closeMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  if (sidebar && window.innerWidth < 768) sidebar.classList.add('hidden');
}

async function loadDatabaseData() {
  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      AppState.db = await res.json();
      renderMetrics();
    }
  } catch (e) {}
}

function renderMetrics() {
  const docCount = document.getElementById('metric-doctors-count');
  const patCount = document.getElementById('metric-patients-count');
  const apptCount = document.getElementById('metric-appts-count');
  const folCount = document.getElementById('metric-followup-count');

  if (docCount) docCount.textContent = (AppState.db.doctors || []).length;
  if (patCount) patCount.textContent = (AppState.db.patients || []).length;
  if (apptCount) apptCount.textContent = (AppState.db.appointments || []).length;
  if (folCount) folCount.textContent = (AppState.db.followups || []).length;
}

// Preview Uploaded Campaign Photo Banner
function previewCampaignPhoto(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById('camp-photo-preview');
      const placeholder = document.getElementById('camp-photo-placeholder');
      if (preview && placeholder) {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
      }
    };
    reader.readAsDataURL(file);
  }
}

// Handle Bulk WhatsApp Photo & Text Campaign Submit
async function handleBulkCampaignSubmit(event) {
  event.preventDefault();
  const title = document.getElementById('camp-title').value.trim();
  const msgText = document.getElementById('camp-message-text').value.trim();
  const fileInput = document.getElementById('camp-photo-input');

  const patients = AppState.db.patients || [];
  if (patients.length === 0) {
    showToast('⚠️ No registered patients found in system.');
    return;
  }

  showToast(`Broadcasting Campaign "${title}" to ${patients.length} patients...`);

  let count = 0;
  for (const p of patients) {
    try {
      const personalizedMsg = msgText.replace('{{patient_name}}', p.name);

      if (fileInput?.files[0]) {
        // Send Photo + Caption via /message/sendMedia
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        formData.append('number', p.phone);
        formData.append('caption', personalizedMsg);

        await fetch('/message/sendMedia', {
          method: 'POST',
          body: formData
        });
      } else {
        // Send Text Only via /message/sendText
        await fetch('/message/sendText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: p.phone,
            text: personalizedMsg
          })
        });
      }
      count++;
    } catch (e) {}
  }

  showToast(`✅ Bulk Photo Campaign "${title}" Delivered to ${count} Patients!`);
}

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
  } catch (e) {}
}

function updateWhatsAppUI() {
  const textEl = document.getElementById('header-wa-status-text');
  const pulseEl = document.getElementById('header-wa-pulse');
  const qrImg = document.getElementById('wa-qr-img');
  const spinner = document.getElementById('wa-qr-spinner');

  if (AppState.waStatus === 'connected') {
    if (textEl) textEl.textContent = `Connected (${AppState.waUser?.id?.split(':')[0] || 'WhatsApp'})`;
    if (pulseEl) pulseEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse';
  } else if (AppState.waStatus === 'qr_ready' && AppState.waQrDataUrl) {
    if (textEl) textEl.textContent = 'Scan QR Code';
    if (pulseEl) pulseEl.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-pulse';
    if (qrImg) {
      qrImg.src = AppState.waQrDataUrl;
      qrImg.classList.remove('hidden');
    }
    if (spinner) spinner.classList.add('hidden');
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

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 bg-primary text-on-primary px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-fade-in font-label-md text-label-md';
  toast.innerHTML = `<span class="material-symbols-outlined text-tertiary-fixed-dim">info</span><span>${msg}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function toggleAIAssistantDrawer() {
  const drawer = document.getElementById('ai-assistant-drawer');
  if (drawer) drawer.classList.toggle('hidden');
}
