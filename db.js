const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

// Ensure DB file exists
if (!fs.existsSync(DB_PATH)) {
  const initialData = {
    patients: [],
    doctors: [],
    appointments: [],
    followups: [],
    prescriptions: [],
    conversations: []
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
}

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading DB file:', e);
    return { patients: [], doctors: [], appointments: [], followups: [], prescriptions: [], conversations: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error writing DB file:', e);
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
  getPrescriptions: () => readDB().prescriptions || [],
  
  addPatient: (patient) => {
    const db = readDB();
    patient.id = patient.id || 'pat-' + Date.now();
    db.patients.unshift(patient);
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
    appt.id = appt.id || 'appt-' + Date.now();
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
  },

  addPrescription: (presc) => {
    const db = readDB();
    presc.id = presc.id || 'presc-' + Date.now();
    db.prescriptions.unshift(presc);
    writeDB(db);
    return presc;
  }
};
