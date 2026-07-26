import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBUAoXX64MTKrhMiRKd9oJPnaT0j60SPdY",
    authDomain: "admin-panel-17e6a.firebaseapp.com",
    databaseURL: "https://admin-panel-17e6a-default-rtdb.firebaseio.com",
    projectId: "admin-panel-17e6a",
    storageBucket: "admin-panel-17e6a.firebasestorage.app",
    messagingSenderId: "519315316570",
    appId: "1:519315316570:web:1448a0936e9a102d849d63"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const FEATURE_SETTINGS_COLLECTION = "feature_controls";

let currentSchoolId = "";
let currentStudentUser = null;
let currentStudentSchoolDoc = null;
window.currentFeatureSettings = {};

const DEFAULT_FEATURE_SETTINGS = {
    student: {
        profile: true, homework: true, fee: true, datesheet: true, attendance: true, sms: true,
        calendar: true, idcard: true, syllabus: true, 'fee-receipt': true, admit: true, gatepass: true,
        notifications: true, birthday: true, transport: true, 'study-material': true, result: true,
        leave: true, batchmate: true, circular: true, news: true, assignment: true, complaint: true,
        'online-classes': true, 'social-media': true
    }
};

const LEGACY_STUDENT_FEATURE_KEYS = {
    timetable: 'datesheet',
    notice: 'notifications',
    library: 'study-material',
    marks: 'result'
};

const studentFeatures = [
    { id: 'profile', title: 'Profile', icon: 'fa-user' },
    { id: 'homework', title: 'Homework', icon: 'fa-book-open' },
    { id: 'fee', title: 'Fee', icon: 'fa-indian-rupee-sign' },
    { id: 'datesheet', title: 'DateSheet', icon: 'fa-calendar-days' },
    { id: 'attendance', title: 'Attendance', icon: 'fa-calendar-check' },
    { id: 'sms', title: 'SMS', icon: 'fa-message' },
    { id: 'calendar', title: 'Calendar Planning', icon: 'fa-calendar' },
    { id: 'idcard', title: 'ID Card', icon: 'fa-id-card' },
    { id: 'syllabus', title: 'Syllabus', icon: 'fa-book' },
    { id: 'fee-receipt', title: 'Fee Receipt', icon: 'fa-receipt' },
    { id: 'admit', title: 'Admit Card', icon: 'fa-sparkles' },
    { id: 'gatepass', title: 'Gate Pass', icon: 'fa-ticket' },
    { id: 'notifications', title: 'Notifications', icon: 'fa-bell' },
    { id: 'birthday', title: 'Birthday', icon: 'fa-cake-candles' },
    { id: 'transport', title: 'Transport', icon: 'fa-bus' },
    { id: 'study-material', title: 'Study Material', icon: 'fa-graduation-cap' },
    { id: 'result', title: 'Result', icon: 'fa-chart-line' },
    { id: 'leave', title: 'Leave Request', icon: 'fa-calendar-xmark' },
    { id: 'batchmate', title: 'Batchmate', icon: 'fa-users' },
    { id: 'circular', title: 'Circular', icon: 'fa-paper-plane' },
    { id: 'news', title: 'News', icon: 'fa-newspaper' },
    { id: 'assignment', title: 'Assignment', icon: 'fa-clipboard-list' },
    { id: 'complaint', title: 'Complaint', icon: 'fa-wrench' },
    { id: 'online-classes', title: 'Online Classes', icon: 'fa-desktop' },
    { id: 'social-media', title: 'Social Media', icon: 'fa-share-nodes' }
];

function $(id) { return document.getElementById(id); }

function getFeatureSettingsDocRef(schoolId) {
    return doc(db, "schools", schoolId, FEATURE_SETTINGS_COLLECTION, "settings");
}

function hydrateFeatureSettings(payload = {}) {
    const settings = JSON.parse(JSON.stringify(DEFAULT_FEATURE_SETTINGS));
    const source = payload.featureSettings || payload || {};
    if (source.student) settings.student = { ...settings.student, ...source.student };
    Object.entries(LEGACY_STUDENT_FEATURE_KEYS).forEach(([legacyKey, currentKey]) => {
        if (source.student && Object.prototype.hasOwnProperty.call(source.student, legacyKey)) {
            settings.student[currentKey] = source.student[legacyKey] !== false;
        }
    });
    return settings;
}

async function readSchoolFeatureSettings(schoolId) {
    if (!schoolId) return hydrateFeatureSettings();
    const featureSnap = await getDoc(getFeatureSettingsDocRef(schoolId));
    if (featureSnap.exists()) return hydrateFeatureSettings(featureSnap.data());
    const schoolSnap = await getDoc(doc(db, "schools", schoolId));
    return schoolSnap.exists() ? hydrateFeatureSettings(schoolSnap.data()) : hydrateFeatureSettings();
}

function getStudentFeatureToggleKey(featureId) {
    return LEGACY_STUDENT_FEATURE_KEYS[featureId] || featureId;
}

function showStudentError(message) {
    const errBox = $('loginErrorMsg');
    if (!errBox) return alert(message);
    errBox.innerText = message;
    errBox.style.display = 'block';
    setTimeout(() => { errBox.style.display = 'none'; }, 5000);
}

function formatDobForPassword(dob) {
    if (!dob) return "";
    const value = String(dob).trim();
    if (/^\d{8}$/.test(value)) return value;
    const parts = value.split("-");
    if (parts.length === 3) {
        if (parts[0].length === 4) return `${parts[2].padStart(2, '0')}${parts[1].padStart(2, '0')}${parts[0]}`;
        return `${parts[0].padStart(2, '0')}${parts[1].padStart(2, '0')}${parts[2]}`;
    }
    return value.replace(/\D/g, "");
}

function formatDobForDisplay(dob) {
    if (!dob) return "N/A";
    const parts = String(dob).split('-');
    return parts.length === 3 && parts[0].length === 4 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(dob);
}

function renderStudentFeatureGrid() {
    const container = $('student-feature-grid');
    if (!container) return;
    container.innerHTML = `<div class="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-y-8 gap-x-4 justify-items-center">
        ${studentFeatures.map(feature => {
        const key = getStudentFeatureToggleKey(feature.id);
        const enabled = window.currentFeatureSettings?.student ? window.currentFeatureSettings.student[key] !== false : true;
        return `<div class="flex flex-col items-center group ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}" onclick="window.handleStudentFeatureClick('${feature.id}')" style="opacity:${enabled ? '1' : '0.45'}; filter:${enabled ? 'none' : 'grayscale(1)'};">
                <div class="w-14 h-14 rounded-full bg-[#E3EBF3] shadow-[6px_6px_14px_#c1c9d2,-6px_-6px_14px_#ffffff] flex items-center justify-center" style="position:relative;">
                    <i class="fas ${feature.icon} text-[#1E3A8A]"></i>
                    ${enabled ? '' : '<span style="position:absolute; right:-4px; top:-4px; background:#ef4444; color:#fff; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;"><i class="fas fa-lock"></i></span>'}
                </div>
                <span class="text-[10px] font-medium text-center mt-3 tracking-wide text-[#1E3A8A]" style="font-family:Inter,sans-serif;">${feature.title}</span>
            </div>`;
    }).join('')}
    </div>`;
}

window.openStudentView = (targetId) => {
    const mainGrid = $('student-main-grid');
    if (mainGrid) mainGrid.style.display = targetId === 'student-main-grid' ? 'block' : 'none';
    document.querySelectorAll('.student-view-section').forEach(el => { el.style.display = 'none'; });
    if (targetId !== 'student-main-grid') {
        const targetEl = $(targetId);
        if (targetEl) targetEl.style.display = 'block';
    }
};

window.handleStudentFeatureClick = (featureId) => {
    const key = getStudentFeatureToggleKey(featureId);
    if (window.currentFeatureSettings?.student && window.currentFeatureSettings.student[key] === false) {
        alert("Access Restricted: This feature is disabled by the school administration.");
        return;
    }
    if (featureId === 'fee') return window.showStudentPaymentSection();
    if (featureId === 'idcard') return window.openStudentView('student-idcard-section');
    if (featureId === 'admit') return window.openStudentView('student-admitcard-section');
    if (featureId === 'fee-receipt') return window.showStudentReceiptsSection();
    if (featureId === 'complaint') return window.openStudentView('student-complaint-section');
    const feature = studentFeatures.find(f => f.id === featureId);
    const title = $('placeholder-title');
    if (title && feature) title.innerText = `${feature.title} Module Under Construction`;
    window.openStudentView('student-placeholder-section');
};

async function loginStudent() {
    const mobile = $('student-login-username')?.value.trim();
    const dobPassword = $('student-login-password')?.value.trim();
    const btn = $('doStudentLoginBtn');
    if (!mobile || !dobPassword) return showStudentError("Enter registered mobile number and DOB password.");
    if (btn) {
        btn.disabled = true;
        btn.querySelector('span').innerText = "Verifying...";
    }
    try {
        const response = await fetch('https://school-backend-zlgy.onrender.com/api/student-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile, dob: dobPassword })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Invalid mobile number or DOB.');
        if (!data.student?.schoolId || !data.school?.id || data.student.schoolId !== data.school.id) {
            throw new Error('School mismatch detected. Login blocked for safety.');
        }

        currentStudentUser = data.student;
        currentSchoolId = data.student.schoolId;
        currentStudentSchoolDoc = data.school;
        window.currentFeatureSettings = hydrateFeatureSettings(data.featureSettings || {});
        loadStudentDashboard();
    } catch (error) {
        console.error("Student login error:", error);
        showStudentError(error.message || "Student login failed.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.querySelector('span').innerText = "Access Portal";
        }
    }
}

async function loadStudentDashboard() {
    $('student-login-wrapper') && ($('student-login-wrapper').style.display = 'none');
    $('student-dashboard-wrapper') && ($('student-dashboard-wrapper').style.display = 'block');
    $('student-dash-school-name') && ($('student-dash-school-name').innerText = currentStudentSchoolDoc?.schoolName || "Portal");
    $('stu-display-name') && ($('stu-display-name').innerText = currentStudentUser?.name || "Student");
    $('banner-name') && ($('banner-name').innerText = currentStudentUser?.name || "N/A");
    $('banner-parentage') && ($('banner-parentage').innerText = currentStudentUser?.parentage || currentStudentUser?.fatherName || "N/A");
    $('banner-class') && ($('banner-class').innerText = currentStudentUser?.class || "N/A");
    $('banner-reg') && ($('banner-reg').innerText = currentStudentUser?.regNo || currentStudentUser?.rollNo || "N/A");
    $('banner-dob') && ($('banner-dob').innerText = formatDobForDisplay(currentStudentUser?.dob));
    $('banner-contact') && ($('banner-contact').innerText = currentStudentUser?.mobile || "N/A");
    $('banner-blood') && ($('banner-blood').innerText = currentStudentUser?.bloodGroup || "N/A");
    $('banner-emergency') && ($('banner-emergency').innerText = currentStudentUser?.emergencyNo || "N/A");
    const qrString = `Name: ${currentStudentUser?.name || 'N/A'}\nSchool: ${currentStudentSchoolDoc?.schoolName || 'N/A'}\nClass: ${currentStudentUser?.class || 'N/A'}\nReg: ${currentStudentUser?.regNo || 'N/A'}\nContact: ${currentStudentUser?.mobile || 'N/A'}`;
    $('stu-banner-qr') && ($('stu-banner-qr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(qrString));
    const photo = $('stu-banner-photo');
    const icon = $('stu-banner-photo-icon');
    if (currentStudentUser?.photoUrl && photo) {
        photo.src = currentStudentUser.photoUrl;
        photo.classList.remove('hidden');
        if (icon) icon.style.display = 'none';
    }
    const logo = $('student-school-logo');
    const logoUrl = currentStudentSchoolDoc?.schoolLogoUrl || currentStudentSchoolDoc?.logoUrl;
    if (logo && logoUrl) {
        logo.src = logoUrl;
        logo.style.display = 'inline-block';
    }
    $('stu-due-balance') && ($('stu-due-balance').innerText = currentStudentUser?.dueBalance || currentStudentUser?.feeDue || 0);
    renderStudentFeatureGrid();
    window.openStudentView('student-main-grid');
}

window.showStudentPaymentSection = () => {
    if (!currentStudentSchoolDoc?.paymentQrUrl || !currentStudentSchoolDoc?.upiId) {
        alert("The school has not configured the QR Payment System yet.");
        return;
    }
    window.openStudentView('student-payment-section');
    $('stu-qr-img') && ($('stu-qr-img').src = currentStudentSchoolDoc.paymentQrUrl);
    $('stu-upi-text') && ($('stu-upi-text').innerText = currentStudentSchoolDoc.upiId);
    const dueAmount = Number(currentStudentUser?.feeDue || currentStudentUser?.dueBalance || 0);
    const upiLink = `upi://pay?pa=${currentStudentSchoolDoc.upiId}&pn=${encodeURIComponent(currentStudentSchoolDoc.schoolName || 'School')}&am=${dueAmount > 0 ? dueAmount : 0}&cu=INR`;
    $('stu-upi-deep-link') && ($('stu-upi-deep-link').href = upiLink);
};

window.showStudentReceiptsSection = () => {
    window.openStudentView('student-receipt-section');
    const tbody = $('stu-receipt-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px;">No receipts available.</td></tr>`;
};

window.submitStudentComplaint = async (event) => {
    event.preventDefault();
    if (!currentStudentUser || !currentSchoolId) return alert("Please login again.");
    const target = $('complaint-target')?.value;
    const subject = $('complaint-subject')?.value.trim();
    const description = $('complaint-desc')?.value.trim();
    if (!target || !subject || !description) return alert("Please fill all complaint fields.");
    await addDoc(collection(db, "complaints"), {
        schoolId: currentSchoolId,
        studentId: currentStudentUser.id,
        studentName: currentStudentUser.name || "Student",
        studentMobile: currentStudentUser.mobile || "",
        target, subject, description,
        timestamp: serverTimestamp(),
        status: "Pending"
    });
    alert("Complaint submitted successfully.");
    event.target.reset();
    window.openStudentView('student-main-grid');
};

window.logoutStudent = () => {
    if (window.unsubStudent) window.unsubStudent();
    if (window.unsubSchool) window.unsubSchool();
    if (window.unsubStudentFeatureSettings) window.unsubStudentFeatureSettings();
    currentStudentUser = null;
    currentStudentSchoolDoc = null;
    currentSchoolId = "";
    $('student-dashboard-wrapper') && ($('student-dashboard-wrapper').style.display = 'none');
    $('student-login-wrapper') && ($('student-login-wrapper').style.display = 'flex');
};

window.downloadStudentIDCard = () => alert("Digital ID card download will be connected in the next module pass.");
window.downloadStudentAdmitCard = () => alert("Admit card download will be connected in the next module pass.");

document.addEventListener('DOMContentLoaded', () => {
    $('doStudentLoginBtn')?.addEventListener('click', loginStudent);
    $('student-login-password')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') loginStudent();
    });
});
