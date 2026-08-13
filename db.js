const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const MASTER_TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', 
  '11:00 AM', '11:30 AM', '02:00 PM', '02:30 PM', 
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM'
];

if (!fs.existsSync(DB_PATH)) {
  const initialData = {
    patients: [],
    doctors: [],
    appointments: [],
    followups: [],
    prescriptions: [],
    conversations: [],
    sessions: {}
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
}

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { patients: [], doctors: [], appointments: [], followups: [], prescriptions: [], conversations: [], sessions: {} };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  readDB,
  writeDB,
  getPatients: () => readDB().patients || [],
  getDoctors: () => readDB().doctors || [],
  getAppointments: () => readDB().appointments || [],
  getFollowups: () => readDB().followups || [],

  // Dynamic Double-Booking Prevention: Returns ONLY unbooked slots for a doctor on a specific date
  getAvailableSlots: (doctorId, date) => {
    const db = readDB();
    const appts = db.appointments || [];
    
    // Find slots already booked for this doctor on this date
    const bookedSlots = appts
      .filter(a => (a.doctorId === doctorId || a.doctorName === doctorId) && a.date === date && a.status !== 'Cancelled')
      .map(a => a.time);

    // Filter master slots to exclude booked ones
    return MASTER_TIME_SLOTS.filter(slot => !bookedSlots.includes(slot));
  },
  
  addPatient: (patient) => {
    const db = readDB();
    patient.id = patient.id || 'pat-' + Date.now();
    // Prevent duplicate patient additions by phone
    const existingIndex = db.patients.findIndex(p => p.phone && patient.phone && p.phone.replace(/\D/g,'') === patient.phone.replace(/\D/g,''));
    if (existingIndex >= 0) {
      db.patients[existingIndex] = { ...db.patients[existingIndex], ...patient };
    } else {
      db.patients.unshift(patient);
    }
    writeDB(db);
    return patient;
  },

  addDoctor: (doctor) => {
    const db = readDB();
    doctor.id = doctor.id || 'doc-' + Date.now();
    db.doctors.unshift(doctor);
    writeDB(db);
    return doctor;
  },

  addAppointment: (appt) => {
    const db = readDB();
    // Validate slot isn't already booked
    const booked = (db.appointments || []).find(a => (a.doctorId === appt.doctorId || a.doctorName === appt.doctorName) && a.date === appt.date && a.time === appt.time && a.status !== 'Cancelled');
    if (booked) {
      throw new Error(`Slot ${appt.time} on ${appt.date} is already booked for this doctor.`);
    }

    appt.id = appt.id || 'appt-' + Date.now();
    appt.token = appt.token || 'Token #' + (db.appointments.length + 10);
    db.appointments.unshift(appt);
    writeDB(db);
    return appt;
  },

  addFollowup: (fol) => {
    const db = readDB();
    fol.id = fol.id || 'fol-' + Date.now();
    db.followups.unshift(fol);
    writeDB(db);
    return fol;
  }
};
