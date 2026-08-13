/**
 * Premium Hospital Patient Communication, Appointment & WhatsApp Automation Engine
 * State Management & UI Interactivity Controller with Groq AI Integration
 */

// Global App State
const AppState = {
  activeScreen: 'overview',
  activeBranch: 'Main Branch',
  isWhatsAppConnected: true,
  demoMode: true,
  demoStep: 1,
  selectedPatientId: '88392',
  selectedDoctorId: 'doc-1',
  activeInboxFilter: 'all',
  activeLang: 'en',
  notificationsOpen: false,
  aiAssistantOpen: false,
  duplicateModalOpen: false,
  addDoctorModalOpen: false,
  onboardingStep: 1,
  campaignStep: 1,
  
  // Synthetic Data Store
  patients: [
    { id: '88392', name: 'Robert Chen', phone: '+1 (555) 283-9942', dob: '05/12/1975', doctor: 'Dr. Sarah Smith', lastContact: '10:42 AM Today', tags: ['Hypertension', 'Pending Labs'], consent: 'Opted In', unread: false, avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80' },
    { id: '88393', name: 'Elena Jackson', phone: '+1 (555) 912-3341', dob: '11/24/1988', doctor: 'Dr. Arjun Mehta', lastContact: '09:15 AM Today', tags: ['Cardiology', 'New Patient'], consent: 'Opted In', unread: true, avatar: '' },
    { id: '88394', name: 'Martha Hughes', phone: '+1 (555) 441-0092', dob: '02/15/1952', doctor: 'Dr. Priya Patel', lastContact: 'Yesterday', tags: ['Diabetes Type 2'], consent: 'Opted In', unread: false, avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80' },
    { id: '88395', name: 'Rahul Sharma', phone: '+91 98765 43210', dob: '08/19/1984', doctor: 'Dr. Arjun Mehta', lastContact: '10:30 AM Today', tags: ['Cardiology', 'Telehealth'], consent: 'Opted In', unread: true, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80' },
    { id: '88396', name: 'Ananya Roy', phone: '+91 98112 00491', dob: '03/04/1991', doctor: 'Dr. Rajesh Kumar', lastContact: '2 days ago', tags: ['Orthopedics'], consent: 'Opted Out', unread: false, avatar: '' }
  ],

  doctors: [
    { id: 'doc-1', name: 'Dr. Sarah Smith', spec: 'General Physician', dept: 'Internal Medicine', exp: '14 Yrs', apptsToday: 12, status: 'Available Today', fee: '$80', photo: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=300&q=80' },
    { id: 'doc-2', name: 'Dr. Arjun Mehta', spec: 'Senior Cardiologist', dept: 'Cardiology', exp: '18 Yrs', apptsToday: 16, status: 'Available Today', fee: '$120', photo: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=300&q=80' },
    { id: 'doc-3', name: 'Dr. Priya Patel', spec: 'Endocrinologist', dept: 'Diabetology', exp: '10 Yrs', apptsToday: 9, status: 'On Leave', fee: '$95', photo: 'https://images.unsplash.com/photo-1594824813566-78a9c29415bc?auto=format&fit=crop&w=300&q=80' },
    { id: 'doc-4', name: 'Dr. Rajesh Kumar', spec: 'Orthopedic Surgeon', dept: 'Orthopedics', exp: '15 Yrs', apptsToday: 14, status: 'Available Today', fee: '$110', photo: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=300&q=80' }
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

// DOM Content Loaded Handler
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSearchKeyboardShortcut();
  initDemoStepper();
  renderActiveView();
});

// View Router
function navigateTo(screenId) {
  AppState.activeScreen = screenId;
  
  // Update sidebar active classes
  document.querySelectorAll('.nav-link').forEach(link => {
    const target = link.getAttribute('data-screen');
    if (target === screenId) {
      link.classList.add('active-nav-item');
    } else {
      link.classList.remove('active-nav-item');
    }
  });

  // Hide all screens, show target screen
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

function initSearchKeyboardShortcut() {
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleGlobalSearchModal();
    }
  });
}

function toggleGlobalSearchModal() {
  const modal = document.getElementById('global-search-modal');
  if (modal) modal.classList.toggle('hidden');
}

function toggleNotificationsDrawer() {
  const drawer = document.getElementById('notifications-drawer');
  if (drawer) drawer.classList.toggle('hidden');
}

function toggleAIAssistantDrawer() {
  const drawer = document.getElementById('ai-assistant-drawer');
  if (drawer) drawer.classList.toggle('hidden');
}

function openDuplicateModal() {
  const modal = document.getElementById('duplicate-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeDuplicateModal() {
  const modal = document.getElementById('duplicate-modal');
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

function handleDoctorPhotoUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById('doctor-photo-preview');
      if (preview) {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  }
}

function initDemoStepper() {
  updateDemoBarUI();
}

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

// Send Chat Message with Groq AI API Backend Fallback
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

  // If not an internal note, trigger Groq AI Bot Response simulation via /api/chat
  if (!isNote) {
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
      input.placeholder = 'Type an internal staff note (Will NOT be sent to patient)...';
    }
  }
}

function updateCampaignExclusions() {
  const total = 1248;
  const optedOut = 28;
  const recentlyContacted = 14;
  const eligible = total - (optedOut + recentlyContacted);

  const elEligible = document.getElementById('campaign-eligible-count');
  if (elEligible) elEligible.textContent = eligible.toLocaleString();
}

function switchTemplateLang(lang) {
  AppState.activeLang = lang;
  document.querySelectorAll('.lang-btn').forEach(btn => {
    if (btn.getAttribute('data-lang') === lang) {
      btn.classList.add('bg-primary', 'text-on-primary');
      btn.classList.remove('bg-surface', 'text-secondary');
    } else {
      btn.classList.remove('bg-primary', 'text-on-primary');
      btn.classList.add('bg-surface', 'text-secondary');
    }
  });

  const previewEl = document.getElementById('template-preview-box');
  if (previewEl) {
    if (lang === 'en') {
      previewEl.innerText = "Dear {{patient_name}}, your appointment with {{doctor_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. Please arrive 15 minutes early.";
    } else if (lang === 'hi') {
      previewEl.innerText = "प्रिय {{patient_name}}, {{doctor_name}} के साथ आपका अपॉइंटमेंट {{appointment_date}} को {{appointment_time}} पर कन्फर्म है। कृपया 15 मिनट पहले पहुंचे।";
    } else if (lang === 'hinglish') {
      previewEl.innerText = "Namaste {{patient_name}}, aapka appointment {{doctor_name}} ke saath {{appointment_date}} ko {{appointment_time}} baje confirm ho gaya hai. Pls 15 mins pehle aayein.";
    }
  }
}

function renderActiveView() {
  navigateTo(AppState.activeScreen);
}
