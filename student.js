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
    
    // Dispatch to implementation functions
    if (featureId === 'homework') return window.loadStudentHomework();
    if (featureId === 'attendance') return window.loadStudentAttendance();
    if (featureId === 'result') return window.loadStudentResult();
    if (featureId === 'datesheet') return window.loadStudentDateSheet();
    if (featureId === 'notifications' || featureId === 'circular' || featureId === 'news') return window.loadStudentNotifications();
    if (featureId === 'transport') return window.loadStudentTransport();
    if (featureId === 'leave') return window.loadStudentLeave();
    if (featureId === 'gatepass') return window.loadStudentGatepass();
    if (featureId === 'assignment') return window.loadStudentAssignments();
    if (featureId === 'syllabus') return window.loadStudentSyllabus();
    if (featureId === 'study-material') return window.loadStudentStudyMaterial();
    if (featureId === 'online-classes') return window.loadStudentOnlineClasses();

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

window.showStudentReceiptsSection = async () => {
    window.openStudentView('student-receipt-section');
    const tbody = $('stu-receipt-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px;">Loading receipts...</td></tr>`;
    
    try {
        const q = query(
            collection(db, "transactions"), 
            where("schoolId", "==", currentSchoolId),
            where("type", "==", "Fee"),
            where("personId", "==", currentStudentUser.id)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px; color:#64748b;">No receipts available.</td></tr>`;
            return;
        }
        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            html += `<tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px;">${data.date || 'N/A'}</td>
                <td style="padding: 12px; font-weight: bold; color: #10b981;">₹${data.amount || 0}</td>
                <td style="padding: 12px;"><span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 6px; font-size: 12px;">Paid (${data.mode || 'Auto'})</span></td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        console.error("Error fetching receipts:", err);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px; color:#ef4444;">Error loading receipts.</td></tr>`;
    }
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
    
    // Fully clear sensitive student state
    currentStudentUser = null;
    currentStudentSchoolDoc = null;
    currentSchoolId = "";
    window.currentFeatureSettings = {};
    
    // Reset all DOM containers to empty strings to prevent data leakage between sessions
    const containers = [
        'stu-homework-container', 'stu-attendance-container', 'stu-result-container',
        'stu-datesheet-container', 'stu-notifications-container', 'stu-transport-container',
        'stu-leave-container', 'stu-gatepass-container', 'stu-assignment-container',
        'stu-syllabus-container', 'stu-studymaterial-container', 'stu-onlineclasses-container',
        'stu-receipt-table-body'
    ];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    $('student-dashboard-wrapper') && ($('student-dashboard-wrapper').style.display = 'none');
    $('student-login-wrapper') && ($('student-login-wrapper').style.display = 'flex');
    $('student-login-password') && ($('student-login-password').value = '');
};

// --- DATA FETCHING & UI RENDERING FUNCTIONS --- //

// Helper for UI loading/empty/error states
function setContainerState(containerId, state, message = '') {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (state === 'loading') {
        el.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>Loading data...</p></div>`;
    } else if (state === 'empty') {
        el.innerHTML = `<div class="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-100"><i class="fas fa-folder-open text-3xl mb-3 text-slate-300"></i><p>${message || 'No records found.'}</p></div>`;
    } else if (state === 'error') {
        el.innerHTML = `<div class="p-8 text-center text-red-500 bg-red-50 rounded-xl border border-red-100"><i class="fas fa-exclamation-triangle text-3xl mb-3 opacity-70"></i><p>${message || 'Failed to load data.'}</p></div>`;
    }
}

// Helper query function ensuring schoolId isolation
async function fetchScopedData(colName, additionalWheres = []) {
    if (!currentSchoolId) throw new Error("Unauthenticated request blocked.");
    const conditions = [where("schoolId", "==", currentSchoolId), ...additionalWheres];
    const q = query(collection(db, colName), ...conditions);
    const snap = await getDocs(q);
    const results = [];
    snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
}

window.loadStudentHomework = async () => {
    window.openStudentView('student-homework-section');
    setContainerState('stu-homework-container', 'loading');
    try {
        const data = await fetchScopedData('homework', [where('class', '==', currentStudentUser.class)]);
        if (data.length === 0) return setContainerState('stu-homework-container', 'empty', 'There is no homework assigned for you right now.');
        
        let html = '';
        data.forEach(hw => {
            html += `<div class="p-4 border border-gray-200 rounded-xl bg-gray-50 flex flex-col gap-2">
                <div class="flex justify-between items-start">
                    <span class="font-bold text-[#1E3A8A] text-lg">${hw.subject || 'Subject'}</span>
                    <span class="text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded">Due: ${hw.dueDate || 'N/A'}</span>
                </div>
                <h4 class="font-semibold text-gray-800">${hw.title || 'Untitled Homework'}</h4>
                <p class="text-sm text-gray-600">${hw.description || 'No description provided.'}</p>
                <div class="text-xs text-gray-500 mt-2">Assigned by: ${hw.teacherName || 'Teacher'}</div>
            </div>`;
        });
        document.getElementById('stu-homework-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-homework-container', 'error');
    }
};

window.loadStudentAttendance = async () => {
    window.openStudentView('student-attendance-section');
    setContainerState('stu-attendance-container', 'loading');
    try {
        const data = await fetchScopedData('attendance', [where('class', '==', currentStudentUser.class)]);
        // Strictly filter on client for studentId if array, or specific id
        const studentRecords = data.filter(d => d.studentId === currentStudentUser.id || (d.students && d.students.includes(currentStudentUser.id)));
        
        if (studentRecords.length === 0) return setContainerState('stu-attendance-container', 'empty', 'No attendance records found.');
        
        let html = `<div class="p-4 bg-green-50 border border-green-200 rounded-xl mb-4 text-center">
            <h4 class="text-green-800 font-bold text-lg mb-1">Attendance Records Found</h4>
            <p class="text-sm text-green-600">Showing recent attendance dates.</p>
        </div><div class="grid grid-cols-2 md:grid-cols-4 gap-3">`;
        
        studentRecords.forEach(att => {
            html += `<div class="p-3 border border-gray-200 rounded-lg text-center bg-white shadow-sm">
                <div class="font-bold text-gray-800 text-sm mb-1">${att.date || 'Unknown Date'}</div>
                <div class="text-xs font-semibold px-2 py-1 rounded inline-block bg-green-100 text-green-700">Present</div>
            </div>`;
        });
        html += `</div>`;
        document.getElementById('stu-attendance-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-attendance-container', 'error');
    }
};

window.loadStudentResult = async () => {
    window.openStudentView('student-result-section');
    setContainerState('stu-result-container', 'loading');
    try {
        const data = await fetchScopedData('exam_marks', [where('studentId', '==', currentStudentUser.id)]);
        if (data.length === 0) return setContainerState('stu-result-container', 'empty', 'No result records found for you.');
        
        let html = '';
        data.forEach(res => {
            html += `<div class="p-4 border border-blue-100 rounded-xl bg-blue-50/30 flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-blue-900">${res.examName || 'Exam'}</h4>
                    <p class="text-sm text-slate-600">Subject: ${res.subject || 'All Subjects'}</p>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black text-[#1E3A8A]">${res.marksObtained || 0}/${res.totalMarks || 100}</div>
                    <div class="text-xs font-semibold text-green-600">Status: ${res.status || 'Published'}</div>
                </div>
            </div>`;
        });
        document.getElementById('stu-result-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-result-container', 'error');
    }
};

window.loadStudentDateSheet = async () => {
    window.openStudentView('student-datesheet-section');
    setContainerState('stu-datesheet-container', 'loading');
    try {
        const data = await fetchScopedData('datesheets', [where('class', '==', currentStudentUser.class)]);
        if (data.length === 0) return setContainerState('stu-datesheet-container', 'empty', 'No datesheet currently published for your class.');
        
        let html = '';
        data.forEach(ds => {
            html += `<div class="p-4 border border-gray-200 rounded-xl flex justify-between items-center shadow-sm">
                <div>
                    <h4 class="font-bold text-gray-800">${ds.examName || 'Upcoming Exam'}</h4>
                    <p class="text-sm text-gray-500">Date: ${ds.date || 'TBA'} | Time: ${ds.time || 'TBA'}</p>
                </div>
                <div class="font-bold text-[#1E3A8A]">${ds.subject || ''}</div>
            </div>`;
        });
        document.getElementById('stu-datesheet-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-datesheet-container', 'error');
    }
};

window.loadStudentNotifications = async () => {
    window.openStudentView('student-notifications-section');
    setContainerState('stu-notifications-container', 'loading');
    try {
        const data = await fetchScopedData('notices');
        // Only show notices targeted at 'All', 'Students', or specific class
        const validNotices = data.filter(n => !n.target || n.target === 'All' || n.target === 'Students' || n.target === currentStudentUser.class);
        if (validNotices.length === 0) return setContainerState('stu-notifications-container', 'empty', 'No new notifications or circulars.');
        
        let html = '';
        validNotices.forEach(n => {
            html += `<div class="p-4 border-l-4 border-[#1E3A8A] bg-gray-50 rounded-r-xl shadow-sm">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-gray-800">${n.title || 'Notification'}</h4>
                    <span class="text-xs text-gray-500">${n.date || new Date(n.createdAt?.toDate?.() || Date.now()).toLocaleDateString()}</span>
                </div>
                <p class="text-sm text-gray-600 whitespace-pre-wrap">${n.body || n.description || ''}</p>
            </div>`;
        });
        document.getElementById('stu-notifications-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-notifications-container', 'error');
    }
};

window.loadStudentTransport = async () => {
    window.openStudentView('student-transport-section');
    setContainerState('stu-transport-container', 'loading');
    try {
        const data = await fetchScopedData('bus_routes');
        // If there's a mapped route for this student
        const route = data.find(r => r.students && r.students.includes(currentStudentUser.id)) || data[0]; // fallback to showing school routes if none explicitly mapped
        
        if (!data || data.length === 0) return setContainerState('stu-transport-container', 'empty', 'No transport data mapped to your profile.');
        
        const html = `<div class="p-6 bg-yellow-50 border border-yellow-200 rounded-2xl shadow-sm text-center">
            <i class="fas fa-bus text-4xl text-yellow-500 mb-3"></i>
            <h4 class="font-bold text-yellow-800 text-xl mb-1">${route?.routeName || 'School Bus Route'}</h4>
            <p class="text-sm text-yellow-700 mb-4">Vehicle Number: ${route?.vehicleNo || 'TBA'}</p>
            <div class="grid grid-cols-2 gap-4 text-left">
                <div class="bg-white p-3 rounded-lg border border-yellow-100">
                    <div class="text-xs text-gray-500 font-semibold uppercase">Driver Name</div>
                    <div class="font-bold text-gray-800">${route?.driverName || 'TBA'}</div>
                </div>
                <div class="bg-white p-3 rounded-lg border border-yellow-100">
                    <div class="text-xs text-gray-500 font-semibold uppercase">Driver Contact</div>
                    <div class="font-bold text-gray-800">${route?.driverContact || 'TBA'}</div>
                </div>
            </div>
        </div>`;
        document.getElementById('stu-transport-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-transport-container', 'error');
    }
};

window.loadStudentLeave = async () => {
    window.openStudentView('student-leave-section');
    setContainerState('stu-leave-container', 'loading');
    try {
        const data = await fetchScopedData('leave_requests', [where('studentId', '==', currentStudentUser.id)]);
        if (data.length === 0) return setContainerState('stu-leave-container', 'empty', 'You have not submitted any leave requests yet.');
        
        let html = '';
        data.forEach(req => {
            const statusColor = req.status === 'Approved' ? 'text-green-600 bg-green-100' : (req.status === 'Rejected' ? 'text-red-600 bg-red-100' : 'text-orange-600 bg-orange-100');
            html += `<div class="p-3 border border-gray-200 rounded-xl bg-white shadow-sm flex justify-between items-center">
                <div>
                    <div class="font-bold text-gray-800 text-sm">${req.startDate} to ${req.endDate}</div>
                    <div class="text-xs text-gray-500 mt-1">${req.reason}</div>
                </div>
                <div class="px-3 py-1 rounded-full text-xs font-bold ${statusColor}">${req.status || 'Pending'}</div>
            </div>`;
        });
        document.getElementById('stu-leave-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-leave-container', 'error');
    }
};

window.submitStudentLeave = async (e) => {
    e.preventDefault();
    if (!currentStudentUser || !currentSchoolId) return alert("Session expired.");
    const start = $('leave-start').value;
    const end = $('leave-end').value;
    const reason = $('leave-reason').value.trim();
    if (!start || !end || !reason) return alert("Fill all fields.");
    try {
        await addDoc(collection(db, "leave_requests"), {
            schoolId: currentSchoolId,
            studentId: currentStudentUser.id,
            studentName: currentStudentUser.name,
            class: currentStudentUser.class,
            startDate: start, endDate: end, reason,
            status: "Pending", createdAt: serverTimestamp()
        });
        alert("Leave request submitted successfully.");
        e.target.reset();
        loadStudentLeave();
    } catch (err) {
        alert("Failed to submit request.");
    }
};

window.loadStudentGatepass = async () => {
    window.openStudentView('student-gatepass-section');
    setContainerState('stu-gatepass-container', 'loading');
    try {
        const data = await fetchScopedData('gate_passes', [where('studentId', '==', currentStudentUser.id)]);
        if (data.length === 0) return setContainerState('stu-gatepass-container', 'empty', 'No gate passes requested.');
        
        let html = '';
        data.forEach(req => {
            const statusColor = req.status === 'Approved' ? 'text-green-600 bg-green-100' : (req.status === 'Rejected' ? 'text-red-600 bg-red-100' : 'text-gray-600 bg-gray-100');
            html += `<div class="p-3 border border-gray-200 rounded-xl bg-white shadow-sm flex justify-between items-center">
                <div>
                    <div class="font-bold text-gray-800 text-sm">${new Date(req.dateTime).toLocaleString()}</div>
                    <div class="text-xs text-gray-500 mt-1">Reason: ${req.reason}</div>
                </div>
                <div class="px-3 py-1 rounded-full text-xs font-bold ${statusColor}">${req.status || 'Pending'}</div>
            </div>`;
        });
        document.getElementById('stu-gatepass-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-gatepass-container', 'error');
    }
};

window.submitStudentGatepass = async (e) => {
    e.preventDefault();
    if (!currentStudentUser || !currentSchoolId) return alert("Session expired.");
    const time = $('gatepass-time').value;
    const reason = $('gatepass-reason').value.trim();
    if (!time || !reason) return alert("Fill all fields.");
    try {
        await addDoc(collection(db, "gate_passes"), {
            schoolId: currentSchoolId,
            studentId: currentStudentUser.id,
            studentName: currentStudentUser.name,
            class: currentStudentUser.class,
            dateTime: time, reason,
            status: "Pending", createdAt: serverTimestamp()
        });
        alert("Gate pass request submitted successfully.");
        e.target.reset();
        loadStudentGatepass();
    } catch (err) {
        alert("Failed to submit gate pass.");
    }
};

window.loadStudentAssignments = async () => {
    window.openStudentView('student-assignment-section');
    setContainerState('stu-assignment-container', 'loading');
    try {
        const data = await fetchScopedData('assignments', [where('class', '==', currentStudentUser.class)]);
        if (data.length === 0) return setContainerState('stu-assignment-container', 'empty', 'No assignments published for your class.');
        let html = '';
        data.forEach(a => {
            html += `<div class="p-4 border border-purple-200 bg-purple-50 rounded-xl shadow-sm">
                <div class="flex justify-between font-bold text-purple-900 mb-1"><span>${a.subject || 'Subject'}</span> <span class="text-xs bg-white px-2 py-1 rounded text-purple-700">Deadline: ${a.deadline || 'N/A'}</span></div>
                <h4 class="font-semibold text-gray-800 text-sm">${a.title || 'Assignment'}</h4>
                <p class="text-xs text-gray-600 mt-2">${a.description || 'No description provided.'}</p>
            </div>`;
        });
        document.getElementById('stu-assignment-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-assignment-container', 'error');
    }
};

window.loadStudentSyllabus = async () => {
    window.openStudentView('student-syllabus-section');
    setContainerState('stu-syllabus-container', 'loading');
    try {
        const data = await fetchScopedData('syllabus', [where('class', '==', currentStudentUser.class)]);
        if (data.length === 0) return setContainerState('stu-syllabus-container', 'empty', 'Syllabus not available yet.');
        let html = '';
        data.forEach(s => {
            html += `<div class="p-4 border border-gray-200 rounded-xl shadow-sm flex items-center justify-between">
                <div><h4 class="font-bold text-gray-800">${s.subject}</h4><p class="text-xs text-gray-500">Class ${s.class}</p></div>
                ${s.fileUrl ? `<a href="${s.fileUrl}" target="_blank" class="px-3 py-1 bg-blue-600 text-white rounded font-semibold text-xs"><i class="fas fa-download"></i> View</a>` : ''}
            </div>`;
        });
        document.getElementById('stu-syllabus-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-syllabus-container', 'error');
    }
};

window.loadStudentStudyMaterial = async () => {
    window.openStudentView('student-studymaterial-section');
    setContainerState('stu-studymaterial-container', 'loading');
    try {
        const data = await fetchScopedData('study_materials', [where('class', '==', currentStudentUser.class)]);
        if (data.length === 0) return setContainerState('stu-studymaterial-container', 'empty', 'No study materials available.');
        let html = '';
        data.forEach(s => {
            html += `<div class="p-4 border border-gray-200 rounded-xl shadow-sm">
                <h4 class="font-bold text-gray-800">${s.title}</h4>
                <p class="text-xs text-gray-500 mb-2">${s.subject || ''}</p>
                ${s.link ? `<a href="${s.link}" target="_blank" class="text-blue-600 text-sm font-semibold underline">Open Material <i class="fas fa-external-link-alt ml-1"></i></a>` : ''}
            </div>`;
        });
        document.getElementById('stu-studymaterial-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-studymaterial-container', 'error');
    }
};

window.loadStudentOnlineClasses = async () => {
    window.openStudentView('student-onlineclasses-section');
    setContainerState('stu-onlineclasses-container', 'loading');
    try {
        const data = await fetchScopedData('online_classes', [where('class', '==', currentStudentUser.class)]);
        if (data.length === 0) return setContainerState('stu-onlineclasses-container', 'empty', 'No online classes scheduled for today.');
        let html = '';
        data.forEach(c => {
            html += `<div class="p-4 border border-teal-200 bg-teal-50 rounded-xl shadow-sm text-center">
                <i class="fas fa-video text-3xl text-teal-600 mb-2"></i>
                <h4 class="font-bold text-teal-900">${c.subject || 'Live Class'}</h4>
                <p class="text-sm text-teal-700 mb-3">Time: ${c.time || 'Scheduled'}</p>
                ${c.link ? `<a href="${c.link}" target="_blank" class="inline-block px-4 py-2 bg-teal-600 text-white rounded-lg font-bold text-sm hover:bg-teal-700"><i class="fas fa-play mr-1"></i> Join Class</a>` : ''}
            </div>`;
        });
        document.getElementById('stu-onlineclasses-container').innerHTML = html;
    } catch (e) {
        setContainerState('stu-onlineclasses-container', 'error');
    }
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
