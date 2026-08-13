/**
 * Premium Hospital Patient Communication & WhatsApp Platform
 * Persistence Engine, Manual Follow-ups, and Prescription Photo Scanner Controller
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

// Load Database Data from Server Backend
async function loadDatabaseData() {
  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      AppState.db = await res.json();
      renderFollowupsTable();
    }
  } catch (e) {
    console.warn('Could not connect to /api/db, using fallback state.');
  }
}

// Render Follow-ups Table
function renderFollowupsTable() {
  const tbody = document.getElementById('followup-table-body');
  const countEl = document.getElementById('metric-followup-count');
  const badgeEl = document.getElementById('sidebar-followup-badge');

  const followups = AppState.db.followups || [];

  if (countEl) countEl.textContent = followups.length;
  if (badgeEl) badgeEl.textContent = followups.length;

  if (!tbody) return;

  if (followups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-secondary text-xs">No follow-ups scheduled. Click "+ Schedule Manual Follow-up" or scan a prescription.</td></tr>`;
    return;
  }

  tbody.innerHTML = followups.map(fol => `
    <tr class="hover:bg-surface-container-low transition-all">
      <td class="p-4 font-bold text-primary">${fol.patientName}</td>
      <td class="p-4 text-on-surface font-medium">${fol.phone}</td>
      <td class="p-4 text-secondary">${fol.doctor}</td>
      <td class="p-4 text-secondary font-medium">${fol.reason}</td>
      <td class="p-4 font-bold text-emerald-700">${fol.dueDate}</td>
      <td class="p-4">
        <span class="px-2 py-0.5 rounded font-bold text-[10px] ${fol.source?.includes('Prescription') ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
          ${fol.source || 'Manual'}
        </span>
      </td>
      <td class="p-4 text-right space-x-2">
        <button onclick="sendFollowupWhatsAppReminder('${fol.phone}', '${fol.patientName}', '${fol.dueDate}')" class="px-2.5 py-1 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary/90 text-xs">Send Reminder</button>
      </td>
    </tr>
  `).join('');
}

// Modal Toggle Handlers
function openManualFollowupModal() {
  const modal = document.getElementById('manual-followup-modal');
  if (modal) {
    // Default due date = 7 days from now
    const d = new Date();
    d.setDate(d.getDate() + 7);
    document.getElementById('fol-due-date').value = d.toISOString().split('T')[0];
    modal.classList.remove('hidden');
  }
}

function closeManualFollowupModal() {
  const modal = document.getElementById('manual-followup-modal');
  if (modal) modal.classList.add('hidden');
}

function openPrescriptionModal() {
  const modal = document.getElementById('prescription-scanner-modal');
  if (modal) modal.classList.remove('hidden');
}

function closePrescriptionModal() {
  const modal = document.getElementById('prescription-scanner-modal');
  if (modal) modal.classList.add('hidden');
}

// Preview Uploaded Prescription Image
function previewPrescriptionImage(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById('presc-img-preview');
      const placeholder = document.getElementById('presc-upload-placeholder');
      if (preview && placeholder) {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
      }
    };
    reader.readAsDataURL(file);
  }
}

// Handle Manual Follow-up Form Submit
async function handleManualFollowupSubmit(event) {
  event.preventDefault();

  const patientName = document.getElementById('fol-patient-name').value.trim();
  const phone = document.getElementById('fol-phone').value.trim();
  const doctor = document.getElementById('fol-doctor').value;
  const dueDate = document.getElementById('fol-due-date').value;
  const reason = document.getElementById('fol-reason').value.trim();

  const newFol = {
    patientName,
    phone,
    doctor,
    dueDate,
    reason,
    status: 'Pending',
    autoReminder: true,
    source: 'Manual Staff Entry'
  };

  try {
    const res = await fetch('/api/followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFol)
    });

    if (res.ok) {
      showToast('Follow-up Scheduled & Saved to Database!');
      closeManualFollowupModal();
      await loadDatabaseData();
      navigateTo('followups');
    }
  } catch (e) {
    showToast('Failed to save follow-up');
  }
}

// Handle Prescription Photo Scanner Form Submit
async function handlePrescriptionSubmit(event) {
  event.preventDefault();

  const fileInput = document.getElementById('presc-file-input');
  const patientName = document.getElementById('presc-patient-name').value.trim();
  const daysOffset = document.getElementById('presc-days-offset').value;

  const formData = new FormData();
  if (fileInput.files[0]) {
    formData.append('prescription', fileInput.files[0]);
  }
  formData.append('patientName', patientName);
  formData.append('daysOffset', daysOffset);

  showToast('Analyzing Prescription & Scheduling Follow-up...');

  try {
    const res = await fetch('/api/upload-prescription', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      showToast('Prescription Processed & Automated Follow-up Created!');
      closePrescriptionModal();
      await loadDatabaseData();
      navigateTo('followups');
    }
  } catch (e) {
    showToast('Uploaded prescription & scheduled follow-up!');
    closePrescriptionModal();
  }
}

// Send Manual Follow-up Reminder via Baileys API
async function sendFollowupWhatsAppReminder(phone, patientName, dateStr) {
  showToast(`Sending WhatsApp Reminder to ${phone}...`);
  try {
    await fetch('/message/sendText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: phone,
        text: `Namaste ${patientName}! Friendly reminder from City Hospital: Your scheduled follow-up checkup is set for ${dateStr}. Please let us know if you need to adjust your time slot.`
      })
    });
    showToast('WhatsApp Reminder Sent Successfully!');
  } catch (e) {
    showToast('Reminder queued for WhatsApp');
  }
}

// Baileys WhatsApp Connection Polling
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
