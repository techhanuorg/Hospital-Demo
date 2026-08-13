/**
 * Premium Hospital Patient Communication & WhatsApp Platform
 * Persistence Engine, Doctors & Patients Management, Bulk Campaign Engine
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

// Load Persistent Database Data from Backend API
async function loadDatabaseData() {
  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      AppState.db = await res.json();
      renderAllViews();
    }
  } catch (e) {}
}

function renderAllViews() {
  renderMetrics();
  renderPatientsTable();
  renderDoctorsGrid();
  renderConversationsList();
  renderAppointmentsTable();
  renderFollowupsTable();
  updateAvailableBookingSlots();
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

// Render Patients Directory Table
function renderPatientsTable() {
  const tbody = document.getElementById('patients-table-body');
  if (!tbody) return;

  const patients = AppState.db.patients || [];
  if (patients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-secondary text-xs">No registered patients. Click "+ Add New Patient".</td></tr>`;
    return;
  }

  tbody.innerHTML = patients.map(p => `
    <tr class="hover:bg-surface-container-low transition-all">
      <td class="p-4 flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs">
          ${p.name.charAt(0)}
        </div>
        <div>
          <p class="font-bold text-primary">${p.name}</p>
          <p class="text-[10px] text-secondary">Language: ${p.language || 'English'}</p>
        </div>
      </td>
      <td class="p-4 text-on-surface font-medium">${p.phone}</td>
      <td class="p-4 text-secondary">${p.age || '28'} Yrs • ${p.gender || 'Male'}</td>
      <td class="p-4 text-secondary font-medium">${p.doctor || 'Dr. Sarah Smith'}</td>
      <td class="p-4">
        <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">${p.consent || 'Opted In'}</span>
      </td>
      <td class="p-4 text-right space-x-2">
        <button onclick="navigateTo('conversations')" class="px-2.5 py-1 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary/90 text-xs">Chat</button>
      </td>
    </tr>
  `).join('');
}

// Render Doctors Directory Grid
function renderDoctorsGrid() {
  const container = document.getElementById('doctors-grid-container');
  const doctorSelect = document.getElementById('booking-doctor-select');
  if (!container) return;

  const doctors = AppState.db.doctors || [];
  
  if (doctorSelect) {
    doctorSelect.innerHTML = doctors.map(d => `<option value="${d.id}">${d.name} (${d.spec})</option>`).join('');
  }

  if (doctors.length === 0) {
    container.innerHTML = `<div class="col-span-4 p-8 text-center text-secondary text-xs">No doctors added. Click "+ Add New Doctor".</div>`;
    return;
  }

  container.innerHTML = doctors.map(d => `
    <div class="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
      <img class="w-full h-44 rounded-xl object-cover" src="${d.photo || 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=300&q=80'}"/>
      <div>
        <h3 class="font-bold text-base text-primary">${d.name}</h3>
        <p class="text-xs text-secondary">${d.spec} • ${d.dept || 'General'}</p>
      </div>
      <div class="flex items-center justify-between text-xs pt-2 border-t border-outline-variant/30">
        <span class="text-emerald-700 font-bold">● ${d.status || 'Available Today'}</span>
        <span class="font-semibold text-primary">${d.fee || '$80'} / consult</span>
      </div>
    </div>
  `).join('');
}

// Render Conversations List
function renderConversationsList() {
  const container = document.getElementById('conversations-list-container');
  if (!container) return;

  const patients = AppState.db.patients || [];
  if (patients.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-secondary text-xs">No active chats.</div>`;
    return;
  }

  container.innerHTML = patients.map((p, idx) => `
    <div onclick="selectActiveChat('${p.name}', '${p.phone}', '${p.age}', '${p.gender}')" class="p-4 ${idx === 0 ? 'bg-secondary-container/40 border-l-4 border-primary' : 'hover:bg-surface-container-low'} cursor-pointer transition-all">
      <div class="flex justify-between items-start mb-1">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs">
            ${p.name.charAt(0)}
          </div>
          <div>
            <h3 class="text-sm font-bold text-primary">${p.name}</h3>
            <p class="text-xs text-secondary truncate w-36 font-medium">${p.phone}</p>
          </div>
        </div>
        <span class="text-[10px] text-secondary font-medium">10:42 AM</span>
      </div>
    </div>
  `).join('');
}

function selectActiveChat(name, phone, age, gender) {
  const nameEl = document.getElementById('active-chat-patient-name');
  const ctxNameEl = document.getElementById('ctx-patient-name');
  const ctxDetEl = document.getElementById('ctx-patient-details');

  if (nameEl) nameEl.textContent = name;
  if (ctxNameEl) ctxNameEl.textContent = name;
  if (ctxDetEl) ctxDetEl.textContent = `Age: ${age || 28} • ${gender || 'Male'} • Phone: ${phone}`;
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
    </tr>
  `).join('');
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

// Modal Handlers
function openAddPatientModal() {
  const modal = document.getElementById('add-patient-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeAddPatientModal() {
  const modal = document.getElementById('add-patient-modal');
  if (modal) modal.classList.add('hidden');
}

function openAddDoctorModal() {
  const modal = document.getElementById('add-doctor-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeAddDoctorModal() {
  const modal = document.getElementById('add-doctor-modal');
  if (modal) modal.classList.add('hidden');
}

// Handle Add Patient Submit
async function handleAddPatientSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('pat-name').value.trim();
  const phone = document.getElementById('pat-phone').value.trim();
  const age = document.getElementById('pat-age').value;
  const gender = document.getElementById('pat-gender').value;

  try {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, age, gender, doctor: 'Dr. Sarah Smith', consent: 'Opted In' })
    });

    if (res.ok) {
      showToast('Patient Added Successfully!');
      closeAddPatientModal();
      await loadDatabaseData();
      navigateTo('patients');
    }
  } catch (e) {}
}

// Handle Add Doctor Submit (With Image Upload)
async function handleAddDoctorSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('doc-name').value.trim();
  const spec = document.getElementById('doc-spec').value.trim();
  const dept = document.getElementById('doc-dept').value.trim();
  const fileInput = document.getElementById('doc-photo-input');

  let photoUrl = 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=300&q=80';

  if (fileInput?.files[0]) {
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    try {
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        photoUrl = uploadData.url;
      }
    } catch (e) {}
  }

  try {
    const res = await fetch('/api/doctors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, spec, dept, photo: photoUrl, fee: '$100', status: 'Available Today' })
    });

    if (res.ok) {
      showToast('Doctor Profile Created & Saved!');
      closeAddDoctorModal();
      await loadDatabaseData();
      navigateTo('doctors');
    }
  } catch (e) {}
}

// Handle Bulk Campaign Broadcast Submit
async function handleBulkCampaignSubmit(event) {
  event.preventDefault();
  const title = document.getElementById('camp-title').value.trim();
  const msgText = document.getElementById('camp-message-text').value.trim();

  const patients = AppState.db.patients || [];
  if (patients.length === 0) {
    showToast('⚠️ No registered patients to broadcast to.');
    return;
  }

  showToast(`Sending Bulk WhatsApp Campaign to ${patients.length} patients...`);

  let count = 0;
  for (const p of patients) {
    try {
      await fetch('/message/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: p.phone,
          text: msgText.replace('{{patient_name}}', p.name)
        })
      });
      count++;
    } catch (e) {}
  }

  showToast(`✅ Campaign "${title}" Sent to ${count} Patients via Baileys API!`);
}

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
      body: JSON.stringify({ patientName, phone, doctorId, doctorName, date, time, dept: 'General Medicine', status: 'Confirmed' })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`🎉 Appointment Booked (${data.appointment.token})!`);
      await loadDatabaseData();
      navigateTo('appointments');
    } else {
      showToast(`⚠️ ${data.error}`);
    }
  } catch (e) {}
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

async function sendChatMessage(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('chat-input-textarea');
  if (!input || !input.value.trim()) return;

  const msgText = input.value.trim();
  input.value = '';

  const canvas = document.getElementById('chat-messages-canvas');
  if (!canvas) return;

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const msgHTML = `
    <div class="flex flex-col gap-1 items-end self-end max-w-[80%] ml-auto animate-fade-in">
      <span class="text-[11px] text-secondary mr-1">Anjali (Front Desk) • ${timeStr}</span>
      <div class="bg-primary text-on-primary p-4 rounded-2xl rounded-tr-sm shadow-sm">
        <p class="text-sm">${msgText}</p>
      </div>
    </div>
  `;

  canvas.insertAdjacentHTML('beforeend', msgHTML);
  canvas.scrollTop = canvas.scrollHeight;

  if (AppState.waStatus === 'connected') {
    try {
      await fetch('/message/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '+15552839942', text: msgText })
      });
      showToast('Delivered to WhatsApp via Baileys');
    } catch (e) {}
  } else {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: msgText, systemPrompt: 'You are a professional hospital receptionist.' })
      });
      const data = await res.json();
      const aiReply = data.reply || 'Message received.';

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
    } catch (e) {}
  }
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
