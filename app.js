/**
 * Premium Hospital Patient Communication & WhatsApp Platform
 * Persistence Engine, Smart Double-Booking Prevention & Slot Scheduler
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

// Load Database Data & Render UI
async function loadDatabaseData() {
  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      AppState.db = await res.json();
      renderFollowupsTable();
      renderAppointmentsTable();
      updateAvailableBookingSlots();
    }
  } catch (e) {}
}

// Fetch & Update Dynamic Available Time Slots (Double-Booking Prevention)
async function updateAvailableBookingSlots() {
  const doctorSelect = document.getElementById('booking-doctor-select');
  const dateInput = document.getElementById('booking-date-input');
  const slotSelect = document.getElementById('booking-slot-select');

  if (!doctorSelect || !dateInput || !slotSelect) return;

  const doctorId = doctorSelect.value || 'doc-1';
  const date = dateInput.value || new Date().toISOString().split('T')[0];

  try {
    const res = await fetch(`/api/available-slots?doctorId=${doctorId}&date=${date}`);
    if (res.ok) {
      const data = await res.json();
      const available = data.availableSlots || [];

      if (available.length === 0) {
        slotSelect.innerHTML = `<option value="">⚠️ All slots booked for this date</option>`;
      } else {
        slotSelect.innerHTML = available.map(slot => `<option value="${slot}">🟢 ${slot} (Available)</option>`).join('');
      }
    }
  } catch (e) {}
}

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

function renderAppointmentsTable() {
  const tbody = document.getElementById('appointments-table-body');
  if (!tbody) return;

  const appts = AppState.db.appointments || [];
  if (appts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-secondary text-xs">No appointments booked yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = appts.map(a => `
    <tr class="hover:bg-surface-container-low transition-all">
      <td class="p-4 font-bold text-primary">${a.date} • ${a.time}</td>
      <td class="p-4 font-semibold text-primary">${a.patientName}</td>
      <td class="p-4 text-secondary">${a.doctorName}</td>
      <td class="p-4"><span class="px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-semibold text-[10px]">${a.dept || 'Consultation'}</span></td>
      <td class="p-4"><span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">${a.status || 'Confirmed'} (${a.token || 'Token'})</span></td>
      <td class="p-4 text-right">
        <button onclick="showToast('Appointment Confirmed')" class="px-2.5 py-1 bg-surface border border-outline-variant/50 rounded-lg font-semibold hover:bg-surface-container text-xs">Details</button>
      </td>
    </tr>
  `).join('');
}

// Booking Form Submit Handler with Double-Booking Prevention
async function handleBookingSubmit(event) {
  event.preventDefault();

  const patientName = document.getElementById('booking-patient-name')?.value.trim() || 'Patient';
  const phone = document.getElementById('booking-phone')?.value.trim() || '+91 98765 43210';
  const doctorSelect = document.getElementById('booking-doctor-select');
  const doctorId = doctorSelect?.value || 'doc-1';
  const doctorName = doctorSelect?.options[doctorSelect.selectedIndex]?.text || 'Dr. Sarah Smith';
  const date = document.getElementById('booking-date-input')?.value;
  const time = document.getElementById('booking-slot-select')?.value;

  if (!time) {
    showToast('⚠️ Please select an available slot.');
    return;
  }

  try {
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientName,
        phone,
        doctorId,
        doctorName,
        date,
        time,
        dept: 'General Medicine',
        status: 'Confirmed'
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`🎉 Appointment Booked (${data.appointment.token})!`);
      await loadDatabaseData();
      navigateTo('appointments');
    } else {
      showToast(`⚠️ ${data.error}`);
    }
  } catch (e) {
    showToast('Failed to book appointment');
  }
}

function openManualFollowupModal() {
  const modal = document.getElementById('manual-followup-modal');
  if (modal) {
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

async function handleManualFollowupSubmit(event) {
  event.preventDefault();

  const patientName = document.getElementById('fol-patient-name').value.trim();
  const phone = document.getElementById('fol-phone').value.trim();
  const doctor = document.getElementById('fol-doctor').value;
  const dueDate = document.getElementById('fol-due-date').value;
  const reason = document.getElementById('fol-reason').value.trim();

  try {
    const res = await fetch('/api/followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientName, phone, doctor, dueDate, reason, status: 'Pending', autoReminder: true, source: 'Manual Staff Entry' })
    });

    if (res.ok) {
      showToast('Follow-up Scheduled & Saved!');
      closeManualFollowupModal();
      await loadDatabaseData();
      navigateTo('followups');
    }
  } catch (e) {}
}

async function handlePrescriptionSubmit(event) {
  event.preventDefault();
  const fileInput = document.getElementById('presc-file-input');
  const patientName = document.getElementById('presc-patient-name').value.trim();
  const daysOffset = document.getElementById('presc-days-offset').value;

  const formData = new FormData();
  if (fileInput.files[0]) formData.append('prescription', fileInput.files[0]);
  formData.append('patientName', patientName);
  formData.append('daysOffset', daysOffset);

  showToast('Processing Prescription...');

  try {
    await fetch('/api/upload-prescription', { method: 'POST', body: formData });
    showToast('Prescription Uploaded & Follow-up Created!');
    closePrescriptionModal();
    await loadDatabaseData();
    navigateTo('followups');
  } catch (e) {
    closePrescriptionModal();
  }
}

async function sendFollowupWhatsAppReminder(phone, patientName, dateStr) {
  showToast(`Sending WhatsApp Reminder to ${phone}...`);
  try {
    await fetch('/message/sendText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text: `Namaste ${patientName}! Reminder from City Hospital: Your follow-up is set for ${dateStr}.` })
    });
    showToast('Reminder Sent Successfully!');
  } catch (e) {}
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
