import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, deleteDoc, serverTimestamp, deleteField, onSnapshot, orderBy, limit, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- ADDED RECAPTCHA V3 IMPORTS ---
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app-check.js";

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
const auth = getAuth(app);
const db = getFirestore(app);
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LeAT9csAAAAANn9sBk-BPOFASXX9liQLCwwO5_4'),
  isTokenAutoRefreshEnabled: true
});

let currentSchoolId = ""; let currentSchoolName = ""; let currentSignatureUrl = ""; let currentThemeColor = "#1e3c72"; let currentSecondaryColor = "#ffffff"; let currentTemplateStyle = "wave"; let currentIdTemplateUrl = "";
window.fetchedStudents = []; window.fetchedStaff =[]; let currentEditStaffId = null;

const overlay = document.getElementById('auth-overlay');
const loginWrapper = document.getElementById('login-wrapper');
const dashboardWrapper = document.getElementById('dashboard-wrapper');
const licenseLockScreen = document.getElementById('license-lock-screen');

window.closeCustomModal = (id) => { document.getElementById(id).style.display = 'none'; };

function showLoginScreen(errorText = "") {
    overlay.style.display = "none"; 
    dashboardWrapper.style.display = "none"; 
    document.getElementById("pin-wrapper").style.display = "none"; 
    licenseLockScreen.style.display = "none"; 
    loginWrapper.style.display = "flex";
    
    if(errorText) {
        const errBox = document.getElementById('loginErrorMsg');
        errBox.innerText = errorText; errBox.style.display = 'block';
        setTimeout(() => errBox.style.display = 'none', 5000);
    }
}

// --- LICENSE VERIFICATION API LOGIC ---
async function verifySchoolLicense(schoolId) {
    try {
        const docSnap = await getDoc(doc(db, "schools", schoolId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            // If no license date is set, assume it is valid (Lifetime)
            if (!data.licenseExpiry) return true; 
            
            const expiryDate = new Date(data.licenseExpiry);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time for accurate date comparison
            
            return expiryDate >= today;
        }
        return false;
    } catch (error) {
        console.error("License verification failed:", error);
        return false;
    }
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('impersonate') === 'true') {
    sessionStorage.setItem("is_impersonating", "true");
    sessionStorage.setItem("imp_e", urlParams.get('email'));
    sessionStorage.setItem("imp_p", urlParams.get('pass'));
}

// --- CHAIRMAN PIN UNLOCK LOGIC ---
window.unlockChairmanDashboard = () => {
    document.getElementById("pin-wrapper").style.display = "none";
    dashboardWrapper.style.display = "flex";
};

window.saveChairmanPin = async () => {
    const pin = document.getElementById("c_newPin").value;
    if(pin.length < 4) return alert("Please enter 4 digits");
    await updateDoc(doc(db, "users", auth.currentUser.uid), { pin: pin });
    window.currentChairmanPin = pin;
    window.unlockChairmanDashboard();
};

window.verifyChairmanPin = () => {
    const pin = document.getElementById("c_loginPin").value;
    if(pin === window.currentChairmanPin) {
        window.unlockChairmanDashboard();
    } else {
        document.getElementById("c_pinErrorMsg").style.display = "block";
        setTimeout(()=>document.getElementById("c_pinErrorMsg").style.display = "none", 2000);
    }
};

window.logoutFromPin = () => signOut(auth);

// ================= AUTH LOGIC (WITH PIN, LICENSE LOCK & SUPER ADMIN BYPASS) =================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === "chairman") {
                const data = userDoc.data();
                if(data.status === "blocked") {
                    await signOut(auth); showLoginScreen("Account Blocked. Reason: " + (data.blockReason || "Contact Super Admin")); return;
                }
                
                currentSchoolId = data.schoolId; currentSchoolName = data.schoolName;

                // --- TRIGGER SAAS LICENSE VERIFICATION ---
                overlay.innerText = "Verifying License Subscription...";
                overlay.style.display = 'flex';
                
                const isLicenseValid = await verifySchoolLicense(currentSchoolId);
                
                if (!isLicenseValid) {
                    overlay.style.display = 'none';
                    dashboardWrapper.style.display = "none";
                    loginWrapper.style.display = "none";
                    document.getElementById("pin-wrapper").style.display = "none";
                    licenseLockScreen.style.display = "flex";
                    return; // Prevent remainder of the script from executing if invalid
                }
                // -----------------------------------------

                document.getElementById('top-school-name').innerText = data.schoolName;
                document.getElementById('req_old_pass').value = data.plainPassword || '******';

                const initials = data.schoolName.split(' ').map(word => word.charAt(0).toUpperCase()).join('');
                document.getElementById('top-school-name-mobile').innerText = initials;

                if(data.logoUrl) {
                    document.getElementById('top-school-logo').src = data.logoUrl; document.getElementById('top-school-logo').style.display = 'block';
                    document.getElementById('print_school_logo').src = data.logoUrl; document.getElementById('print_school_logo').style.display = 'block';
                }

                overlay.style.display = "none"; loginWrapper.style.display = "none"; 
                
                // PIN LOGIC (Auto bypass for Super Admin)
                if (sessionStorage.getItem("is_impersonating") === "true") {
                    window.unlockChairmanDashboard();
                } else {
                    if (data.pin) {
                        document.getElementById("pin-wrapper").style.display = "flex";
                        document.getElementById("enter-pin-box").style.display = "block";
                        document.getElementById("create-pin-box").style.display = "none";
                        window.currentChairmanPin = data.pin;
                    } else {
                        document.getElementById("pin-wrapper").style.display = "flex";
                        document.getElementById("create-pin-box").style.display = "block";
                        document.getElementById("enter-pin-box").style.display = "none";
                    }
                }
                
                document.documentElement.style.setProperty('--theme-color', currentThemeColor);
                checkAdmissionStatus(); listenToTicker(); loadAllData();

                const today = new Date().toISOString().split('T')[0];
                document.getElementById("fee_date").value = today; document.getElementById("salary_date").value = today; document.getElementById("exp_date").value = today;

                populateClassDropdowns();

                if(!sessionStorage.getItem("tracked_login_" + user.uid) && sessionStorage.getItem("is_impersonating") !== "true") {
                    try {
                        const ipRes = await fetch('https://api.ipify.org?format=json'); const ipData = await ipRes.json();
                        await setDoc(doc(collection(db, "login_logs")), {
                            uid: user.uid, name: data.name, email: data.email, role: "chairman", schoolId: currentSchoolId,
                            ip: ipData.ip || "Unknown", device: navigator.userAgent, timestamp: serverTimestamp()
                        });
                        sessionStorage.setItem("tracked_login_" + user.uid, "true");
                    } catch(e) {}
                }

            } else { 
                await signOut(auth); 
                if (sessionStorage.getItem("is_impersonating") !== "true") {
                    showLoginScreen("Access Denied: You are not a Chairman."); 
                }
            }
        } catch (e) { showLoginScreen("Database error."); }
    } else { 
        if (sessionStorage.getItem("is_impersonating") === "true" && sessionStorage.getItem("imp_e")) {
            document.getElementById('auth-overlay').innerText = "Authenticating Super Admin...";
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('login-wrapper').style.display = 'none';
            
            signInWithEmailAndPassword(auth, decodeURIComponent(sessionStorage.getItem("imp_e")), decodeURIComponent(sessionStorage.getItem("imp_p")))
            .then(() => {
                sessionStorage.removeItem("imp_e");
                sessionStorage.removeItem("imp_p");
                window.history.replaceState({}, document.title, window.location.pathname);
            }).catch(e => {
                sessionStorage.removeItem("is_impersonating");
                showLoginScreen("Impersonation Failed: " + e.message);
            });
        } else {
            showLoginScreen(); 
        }
    }
});

document.getElementById("doLoginBtn").addEventListener("click", async () => {
    const email = document.getElementById("loginId").value.trim(); const pass = document.getElementById("loginPassword").value.trim(); const btn = document.getElementById("doLoginBtn");
    if(!email || !pass) return showLoginScreen("Enter Username and Password");
    btn.innerText = "Verifying...";
    try { 
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, pass); 
    } catch(e) { 
        btn.innerText = "Login"; showLoginScreen("Invalid Credentials!"); 
    }
});

window.doLogout = () => signOut(auth);

document.getElementById("deviceModeToggle").addEventListener("change", (e) => { e.target.checked ? document.body.classList.add("force-desktop") : document.body.classList.remove("force-desktop"); });

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        if(item.classList.contains('logout-btn')) return;
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        item.classList.add('active'); document.getElementById(item.dataset.target).classList.add('active'); document.getElementById('tab-title').innerText = item.innerText;
    });
});

window.generateRegistrationLink = () => {
    const liveDomain = "https://bf0040792-rgb.github.io/CHAIRMAN-MANAGEMENT/admission.html"; const link = `${liveDomain}?school=${currentSchoolId}`;
    document.getElementById("short-link-input").value = link; document.getElementById("link-display-box").style.display = "flex";
};

window.copyToClipboard = () => {
    const link = document.getElementById("short-link-input").value;
    if(link) { navigator.clipboard.writeText(link).then(() => alert("✅ Link Copied!")); }
};

function populateClassDropdowns() {
    const classes =["Nursery", "LKG", "UKG", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
    let feeClsOpts = '<option value="">-- Select --</option>';
    classes.forEach(c => feeClsOpts += `<option value="${c}">${c}</option>`);
    document.getElementById("fee_class").innerHTML = feeClsOpts;
}

async function checkAdmissionStatus() {
    const docSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if(docSnap.exists()) {
        const data = docSnap.data();
        if(data.idTemplateUrl) { currentIdTemplateUrl = data.idTemplateUrl; }
        if(data.idTemplateStyle) { 
            currentTemplateStyle = data.idTemplateStyle;
            if(document.getElementById('ts_' + data.idTemplateStyle)) {
                document.getElementById('ts_' + data.idTemplateStyle).checked = true;
                if(typeof window.selectTemplateUI === 'function') window.selectTemplateUI(data.idTemplateStyle);
            }
        }
        if(data.idTemplateColor && document.getElementById("id_template_color")) {
            document.getElementById("id_template_color").value = data.idTemplateColor;
        }
        if(data.secondaryColor && document.getElementById("school_secondary_color")) {
            document.getElementById("school_secondary_color").value = data.secondaryColor;
            currentSecondaryColor = data.secondaryColor;
        }
        document.getElementById("admissionToggle").checked = data.admissionOpen !== false;
        
        if(data.emergencyMobile) { document.getElementById("school_emergency").value = data.emergencyMobile; document.getElementById("print_emergency").innerText = "Emergency: " + data.emergencyMobile; }
        if(data.signatureUrl) { 
            currentSignatureUrl = data.signatureUrl; 
            document.getElementById("preview-signature").src = data.signatureUrl; 
            if(!data.sigSettings || data.sigSettings.idCard !== false) document.getElementById("print_sig").src = data.signatureUrl; 
            document.getElementById("cert_sig").src = data.signatureUrl; 
        }
        if(data.sigSettings) {
            window.currentSigSettings = data.sigSettings;
            if(document.getElementById("sig_on_id")) {
                document.getElementById("sig_on_id").checked = data.sigSettings.idCard;
                document.getElementById("sig_on_tc").checked = data.sigSettings.tc;
                document.getElementById("sig_on_char").checked = data.sigSettings.char;
                document.getElementById("sig_on_bonafide").checked = data.sigSettings.bonafide;
            }
        } else {
            window.currentSigSettings = { idCard: true, tc: true, char: true, bonafide: true };
        }
        if(data.themeColor) { currentThemeColor = data.themeColor; document.getElementById("school_theme_color").value = currentThemeColor; document.documentElement.style.setProperty('--theme-color', currentThemeColor); }
        if(data.emergencyTicker) { document.getElementById("ticker_input").value = data.emergencyTicker; }
        
        // Authority Enforcement: Hide restricted modules
        if(data.blockedModules && Array.isArray(data.blockedModules)) {
            data.blockedModules.forEach(mod => {
                const menuItem = document.querySelector(`.menu-item[data-target="tab-${mod}"]`);
                if(menuItem) menuItem.style.display = 'none';
            });
        }
    }
}

window.listenToTicker = () => {
    onSnapshot(doc(db, "schools", currentSchoolId), (doc) => {
        if(doc.exists() && doc.data().tickerActive && doc.data().emergencyTicker) {
            document.getElementById("school-ticker-container").style.display = "block";
            document.getElementById("school-ticker-text").innerText = doc.data().emergencyTicker;
        } else { document.getElementById("school-ticker-container").style.display = "none"; }
    });
};

window.saveEmergencyTicker = async () => {
    const text = document.getElementById("ticker_input").value.trim();
    if(!text) return alert("Enter ticker text.");
    await updateDoc(doc(db, "schools", currentSchoolId), { emergencyTicker: text, tickerActive: true });
    alert("Emergency Ticker Published!");
};

window.clearEmergencyTicker = async () => {
    await updateDoc(doc(db, "schools", currentSchoolId), { tickerActive: false });
    document.getElementById("ticker_input").value = "";
    alert("Ticker Cleared.");
};

document.getElementById("admissionToggle").addEventListener("change", async (e) => {
    try { await updateDoc(doc(db, "schools", currentSchoolId), { admissionOpen: e.target.checked }); alert(e.target.checked ? "🟢 Admissions OPEN." : "🔴 Admissions CLOSED."); } 
    catch(err) { e.target.checked = !e.target.checked; }
});

const convertToBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = (e) => reject(e); });
const uploadToCloudinary = async (fileInputId, btnId, defaultText) => {
    const file = document.getElementById(fileInputId).files[0]; if (!file) return null;
    const btn = document.getElementById(btnId); btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Uploading...";
    try {
        const base64Image = await convertToBase64(file);
        const res = await fetch("https://api.cloudinary.com/v1_1/disgtvs6f/image/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: base64Image, upload_preset: "ml_default" }) });
        const data = await res.json(); btn.innerHTML = defaultText; return data.secure_url || null;
    } catch (e) { btn.innerHTML = defaultText; return null; }
};

function loadAllData() { loadStudents(); loadStaff(); loadNotices(); loadInbox(); loadSentMail(); loadTransactions(); loadPendingResults(); }

window.selectTemplateUI = (style) => {
    currentTemplateStyle = style;
    document.querySelectorAll('[id^="card_"]').forEach(el => el.style.borderColor = "transparent");
    const selectedCard = document.getElementById("card_" + style);
    if(selectedCard) selectedCard.style.borderColor = "#10b981";
};

window.saveThemeSettings = async () => {
    const color = document.getElementById("school_theme_color")?.value || currentThemeColor;
    const secColor = document.getElementById("school_secondary_color")?.value || currentSecondaryColor;
    const style = currentTemplateStyle || "wave";
    try { 
        await updateDoc(doc(db, "schools", currentSchoolId), { themeColor: color, idTemplateColor: color, secondaryColor: secColor, idTemplateStyle: style }); 
        currentThemeColor = color; 
        currentSecondaryColor = secColor;
        document.documentElement.style.setProperty('--theme-color', currentThemeColor); 
        alert("ID Card Design & Theme Color Saved Successfully!"); 
    } catch(e) {
        alert("Error saving design settings.");
    }
};
window.saveEmergency = async () => {
    const num = document.getElementById("school_emergency").value.trim(); if(!num) return alert("Enter Emergency Number");
    try { await updateDoc(doc(db, "schools", currentSchoolId), { emergencyMobile: num }); document.getElementById("print_emergency").innerText = "Emergency: " + num; alert("Emergency Number Saved!"); } catch(e) {}
};
window.saveSignature = async () => {
    let sigUrl = currentSignatureUrl; 
    if (document.getElementById("sig_photo").files.length > 0) {
        sigUrl = await uploadToCloudinary("sig_photo", "sig_btn", "<i class='fas fa-pen-nib'></i> Save Signature & Preferences");
        if(!sigUrl) return alert("Please select an image or wait for upload.");
    }
    
    const sigSettings = {
        idCard: document.getElementById("sig_on_id").checked,
        tc: document.getElementById("sig_on_tc").checked,
        char: document.getElementById("sig_on_char").checked,
        bonafide: document.getElementById("sig_on_bonafide").checked
    };

    try { 
        await updateDoc(doc(db, "schools", currentSchoolId), { signatureUrl: sigUrl, sigSettings: sigSettings }); 
        currentSignatureUrl = sigUrl; 
        window.currentSigSettings = sigSettings;
        if(sigUrl) {
            document.getElementById("preview-signature").src = sigUrl; 
            document.getElementById("print_sig").src = sigUrl; 
            document.getElementById("cert_sig").src = sigUrl; 
        }
        alert("Signature & Preferences Saved!"); 
    } catch(e) { console.error(e); }
};


window.sendPasswordRequest = async () => {
    const newPass = document.getElementById("req_new_pass").value.trim(); if(!newPass) return alert("Please enter a new password.");
    try { await updateDoc(doc(db, "users", auth.currentUser.uid), { suggestedPassword: newPass }); alert("Password change request sent to Super Admin!"); document.getElementById("req_new_pass").value = ""; } catch(e) {}
};

// ================= MAIL BOX =================
window.toggleSpecificStaff = () => { const val = document.getElementById("mail_target").value; document.getElementById("specific_staff_div").style.display = val === "specific_staff" ? "block" : "none"; };
window.sendChairmanMessage = async () => {
    const target = document.getElementById("mail_target").value; const title = document.getElementById("mail_title").value.trim(); const body = document.getElementById("mail_body").value.trim();
    if(!title || !body) return alert("Fill title and body");
    let receiverId = target; let receiverType = target;
    if (target === "specific_staff") { receiverId = document.getElementById("mail_specific_staff").value; receiverType = "staff_member"; if (!receiverId) return alert("Please select a staff member."); }
    try { await setDoc(doc(collection(db, "direct_messages")), { senderId: auth.currentUser.uid, senderName: currentSchoolName + " (Chairman)", senderRole: "chairman", schoolId: currentSchoolId, receiverType: receiverType, receiverId: receiverId, title: title, body: body, isRead: false, createdAt: serverTimestamp() }); alert("Message Sent!"); document.getElementById("mail_title").value=""; document.getElementById("mail_body").value=""; loadSentMail(); } catch(e) {}
};
async function loadInbox() {
    try {
        const snap = await getDocs(query(collection(db, "direct_messages"), where("schoolId", "==", currentSchoolId), where("receiverType", "==", "chairman")));
        let html = ""; let msgs =[]; snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        msgs.sort((a,b) => { if(!a.createdAt) return 1; if(!b.createdAt) return -1; return b.createdAt.toMillis() - a.createdAt.toMillis(); });
        msgs.forEach(msg => { let ts = msg.createdAt ? new Date(msg.createdAt.toMillis()).toLocaleString() : "Unknown"; html += `<tr><td style="font-size:11px; color:#888;">${ts}</td><td><span style="background:#eaf4ff; color:#2c7be5; padding:2px 6px; border-radius:4px; font-size:11px; text-transform:uppercase;">${msg.senderRole || 'Admin'}</span></td><td><strong>${msg.title}</strong><br><span style="font-size:12px;">${msg.body}</span></td></tr>`; });
        document.getElementById("inbox-table").innerHTML = html || "<tr><td colspan='3' style='text-align:center;'>No messages received.</td></tr>";
    } catch(e) {}
}
async function loadSentMail() {
    try {
        const snap = await getDocs(query(collection(db, "direct_messages"), where("senderId", "==", auth.currentUser.uid)));
        let html = ""; let msgs =[]; snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        msgs.sort((a,b) => { if(!a.createdAt) return 1; if(!b.createdAt) return -1; return b.createdAt.toMillis() - a.createdAt.toMillis(); });
        msgs.forEach(msg => { let ts = msg.createdAt ? new Date(msg.createdAt.toMillis()).toLocaleString() : "Unknown"; let toWho = msg.receiverType === 'staff_member' ? 'Specific Staff' : msg.receiverType; html += `<tr><td style="font-size:11px; color:#888;">${ts}</td><td><span style="background:#f4ebff; color:#8e44ad; padding:2px 6px; border-radius:4px; font-size:11px; text-transform:uppercase;">${toWho}</span></td><td><strong>${msg.title}</strong><br><span style="font-size:12px;">${msg.body}</span></td></tr>`; });
        document.getElementById("sent-table").innerHTML = html || "<tr><td colspan='3' style='text-align:center;'>No sent messages.</td></tr>";
    } catch(e) {}
}

// ================= FINANCE & PAYROLL & EXPENSES =================
window.saveFeeStructure = async () => {
    const cls = document.getElementById("master_fee_class").value;
    const tui = document.getElementById("master_tuition").value;
    const bus = document.getElementById("master_bus").value;
    const oth = document.getElementById("master_other").value;
    if(!tui) return alert("Tuition fee is required.");
    try {
        await setDoc(doc(db, `schools/${currentSchoolId}/feeStructures`, cls), { tuition: Number(tui), bus: bus?Number(bus):0, other: oth?Number(oth):0, updatedAt: serverTimestamp() });
        alert(`Fee structure for Class ${cls} updated successfully!`);
    } catch(e) { alert("Error saving fee structure."); }
};

window.populateFeeStudents = () => {
    const cls = document.getElementById("fee_class").value; const select = document.getElementById("fee_student"); select.innerHTML = '<option value="">-- Select Student --</option>'; if(!cls) return;
    const filtered = window.fetchedStudents.filter(s => s.class && s.class.toUpperCase() === cls.toUpperCase() && s.status === 'Approved');
    filtered.forEach(s => { select.innerHTML += `<option value="${s.id}">${s.name} ${s.roll ? '(Roll: '+s.roll+')' : ''}</option>`; }); document.getElementById("fee_mobile").value = "";
};
window.autoFillFeeDetails = () => { const sid = document.getElementById("fee_student").value; const s = window.fetchedStudents.find(x => x.id === sid); if(s) document.getElementById("fee_mobile").value = s.mobile || 'N/A'; };

window.saveStudentFee = async () => {
    const cls = document.getElementById("fee_class").value; const sId = document.getElementById("fee_student").value; const mob = document.getElementById("fee_mobile").value; const amt = document.getElementById("fee_amount").value; const mode = document.getElementById("fee_mode").value; const date = document.getElementById("fee_date").value;
    if(!sId || !amt || !date) return alert("Fill all required details.");
    const selectEl = document.getElementById("fee_student"); const sName = selectEl.options[selectEl.selectedIndex].text.split('(')[0].trim();
    try { await setDoc(doc(collection(db, "transactions")), { schoolId: currentSchoolId, type: "Fee", personId: sId, personName: sName, class: cls, mobile: mob, amount: Number(amt), mode: mode, date: date, createdAt: serverTimestamp() }); alert("Fee Record Added!"); document.getElementById("fee_amount").value = ""; loadTransactions(); } catch(e) {}
};

window.saveStaffSalary = async () => {
    const stId = document.getElementById("salary_staff").value; const amt = document.getElementById("salary_amount").value; const mode = document.getElementById("salary_mode").value; const date = document.getElementById("salary_date").value;
    if(!stId || !amt || !date) return alert("Fill all details.");
    const selectEl = document.getElementById("salary_staff"); const stName = selectEl.options[selectEl.selectedIndex].text.split('(')[0].trim();
    try { await setDoc(doc(collection(db, "transactions")), { schoolId: currentSchoolId, type: "Salary", personId: stId, personName: stName, amount: Number(amt), mode: mode, date: date, createdAt: serverTimestamp() }); alert("Salary Disbursed & Approved!"); document.getElementById("salary_amount").value = ""; loadTransactions(); } catch(e) {}
};

window.saveExpense = async () => {
    const title = document.getElementById("exp_title").value.trim(); const amt = document.getElementById("exp_amount").value; const date = document.getElementById("exp_date").value;
    if(!title || !amt || !date) return alert("Fill all expense details.");
    try { await setDoc(doc(collection(db, "transactions")), { schoolId: currentSchoolId, type: "Expense", personName: title, amount: Number(amt), mode: "Cash/Bank", date: date, createdAt: serverTimestamp() }); alert("Expense Logged!"); document.getElementById("exp_title").value = ""; document.getElementById("exp_amount").value = ""; loadTransactions(); } catch(e) {}
};

async function loadTransactions() {
    try {
        const snap = await getDocs(query(collection(db, "transactions"), where("schoolId", "==", currentSchoolId)));
        let html = ""; let totalRev = 0; let trans =[]; snap.forEach(d => trans.push({ id: d.id, ...d.data() }));
        trans.sort((a,b) => new Date(b.date) - new Date(a.date));
        trans.forEach(t => {
            if(t.type === "Fee") totalRev += Number(t.amount);
            if(t.type === "Salary" || t.type === "Expense") totalRev -= Number(t.amount); 
            const typeColor = t.type === "Fee" ? "#27ae60" : (t.type === "Expense" ? "#e53e3e" : "#e67e22");
            const details = t.type === "Fee" ? `Class: ${t.class}` : (t.type === "Expense" ? "School Expense" : "Staff Pay");
            html += `<tr><td>${t.date}</td><td><strong style="color:${typeColor}">${t.type}</strong></td><td>${t.personName}</td><td>${details}</td><td style="font-weight:bold;">₹ ${t.amount}</td><td>${t.mode}</td></tr>`;
        });
        document.getElementById("transaction-table").innerHTML = html || "<tr><td colspan='6' style='text-align:center;'>No Financial Records.</td></tr>";
        document.getElementById("count-revenue").innerText = "₹ " + totalRev;
    } catch(e) {}
}

// ================= STUDENTS, CERTS & DEFAULTER LOCKDOWN =================
async function loadStudents() {
    try {
        const snap = await getDocs(query(collection(db, "students"), where("schoolId", "==", currentSchoolId)));
        window.fetchedStudents =[]; let pendingCount = 0; let totalPresent = 0;
        snap.forEach(d => { let dt = d.data(); dt.id = d.id; if(dt.status === "Pending") pendingCount++; window.fetchedStudents.push(dt); });
        document.getElementById("count-students").innerText = snap.size; document.getElementById("count-pending").innerText = pendingCount;
        
        if(snap.size > 0) { const att = Math.floor(Math.random() * (98 - 85 + 1) + 85); document.getElementById("count-attendance").innerText = att + "%"; }
        
        renderClassFilters(); renderStudentsTable("All");
    } catch(e) {}
}
function renderClassFilters() {
    const classes =["Nursery", "LKG", "UKG", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
    let html = `<button class="filter-btn active" onclick="filterStudents('All', this)">All</button>`;
    classes.forEach(c => html += `<button class="filter-btn" onclick="filterStudents('${c}', this)">${c}</button>`);
    document.getElementById("class-filters").innerHTML = html;
}
window.filterStudents = (className, btnElement) => { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); if(btnElement) btnElement.classList.add('active'); renderStudentsTable(className); };

window.searchStudent = () => {
    const term = document.getElementById("searchStudentInput").value;
    const activeClass = document.querySelector('.filter-btn.active') ? document.querySelector('.filter-btn.active').innerText : 'All';
    renderStudentsTable(activeClass, term);
};

window.filterByStatus = (status) => {
    switchTab('tab-students');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn').classList.add('active');
    renderStudentsTable('All', null, status);
};

function renderStudentsTable(className, searchTerm = null, statusFilter = null) {
    const tbody = document.getElementById("student-table"); let html = "";
    let filtered = className === "All" ? window.fetchedStudents : window.fetchedStudents.filter(s => s.class && s.class.toUpperCase() === className.toUpperCase());
    
    if(statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter(s => s.status && s.status.toLowerCase() === statusFilter.toLowerCase());
    }

    if(searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(s => 
            (s.name && s.name.toLowerCase().includes(lowerTerm)) ||
            (s.rollNo && String(s.rollNo).includes(lowerTerm)) ||
            (s.regNo && String(s.regNo).includes(lowerTerm)) ||
            (s.mobile && String(s.mobile).includes(lowerTerm))
        );
    }

    // Sort by Roll Number Ascending
    filtered.sort((a,b) => (Number(a.rollNo) || 999999) - (Number(b.rollNo) || 999999));

    filtered.forEach(dt => {
        const safeId = dt.id.replace(/'/g, "\\'"); const locked = dt.lockedOut;
        const statusColor = dt.status === 'Approved' ? '#27ae60' : (dt.status === 'Pending' ? '#e67e22' : '#e53e3e'); const statusIcon = dt.status === 'Approved' ? '✓' : '⏳';
        
        const lockBtn = locked ? `<button class="action-btn btn-green" onclick="toggleStudentLock('${safeId}', false)" title="Unlock Account"><i class="fas fa-unlock"></i></button>` : `<button class="action-btn btn-dark" onclick="toggleStudentLock('${safeId}', true)" title="Lock Account"><i class="fas fa-lock"></i></button>`;

        const actionBtns = dt.status === "Pending" 
            ? `<button class="action-btn btn-green" onclick="updateStudentStatus('${safeId}')"><i class="fas fa-check"></i> Approve</button>`
            : `
            <button class="action-btn btn-blue" onclick="showIDCard('${safeId}')"><i class="fas fa-id-card"></i> ID</button>
            <button class="action-btn btn-purple" onclick="openStudentModal('${safeId}')"><i class="fas fa-edit"></i> Edit</button>
            ${lockBtn}`;
        
        html += `<tr class="${locked ? 'locked-row' : ''}">
            <td><img src="${dt.photoUrl || 'https://via.placeholder.com/100'}" class="img-circle"></td>
            <td><strong style="display:block; font-size:13px;">${dt.name || 'N/A'} ${locked ? '<i class="fas fa-lock" style="color:#e53e3e"></i>' : ''}</strong><small style="color:#7f8c8d;">${dt.mobile || 'No Mobile'}</small></td>
            <td><span style="font-weight:bold; font-size:13px; color:#333;">${dt.rollNo || 'N/A'}</span></td>
            <td><span style="background:#eaf4ff; color:#2c7be5; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold;">Class: ${dt.class || 'N/A'}</span></td>
            <td><span style="font-size:12px; display:block;"><b>F:</b> ${dt.fatherName || 'N/A'}</span><span style="font-size:12px; display:block;"><b>M:</b> ${dt.motherName || 'N/A'}</span></td>
            <td><span style="color:${statusColor}; font-weight:bold; font-size:13px;">${statusIcon} ${dt.status || 'N/A'}</span></td>
            <td style="white-space:nowrap;">${actionBtns} <button class="action-btn btn-red" onclick="deleteStudent('${safeId}')"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = html || "<tr><td colspan='7' style='text-align:center; padding:30px; color:#999;'>No Students Found.</td></tr>";
}

window.updateStudentStatus = async (id) => { if(confirm("Approve admission?")) { await updateDoc(doc(db, "students", id), { status: "Approved" }); loadStudents(); } };
window.deleteStudent = async (id) => { if(confirm("Delete this student permanently?")) { await deleteDoc(doc(db, "students", id)); loadStudents(); } };

window.toggleStudentLock = async (id, state) => {
    if(confirm(state ? "Lock this student's account?" : "Unlock this student's account?")) {
        await updateDoc(doc(db, "students", id), { lockedOut: state }); loadStudents();
    }
};

window.openStudentModal = (id = null) => {
    document.getElementById("student-modal").style.display = "flex";
    if (id) {
        document.getElementById("student-modal-title").innerText = "Edit Student";
        const st = window.fetchedStudents.find(s => s.id === id);
        document.getElementById("modal-student-id").value = id;
        document.getElementById("modal-student-name").value = st.name || "";
        document.getElementById("modal-student-regNo").value = st.regNo || "";
        document.getElementById("modal-student-rollNo").value = st.rollNo || "";
        document.getElementById("modal-student-class").value = st.class || "";
        document.getElementById("modal-student-father").value = st.fatherName || "";
        document.getElementById("modal-student-mobile").value = st.mobile || "";
        document.getElementById("modal-student-photo").value = st.photoUrl || "";
    } else {
        document.getElementById("student-modal-title").innerText = "Add Student";
        document.getElementById("modal-student-id").value = "";
        document.getElementById("modal-student-name").value = "";
        document.getElementById("modal-student-regNo").value = "";
        document.getElementById("modal-student-rollNo").value = "";
        document.getElementById("modal-student-class").value = "1st";
        document.getElementById("modal-student-father").value = "";
        document.getElementById("modal-student-mobile").value = "";
        document.getElementById("modal-student-photo").value = "";
    }
};

window.saveStudentModal = async () => {
    const id = document.getElementById("modal-student-id").value;
    const data = {
        name: document.getElementById("modal-student-name").value.trim(),
        regNo: document.getElementById("modal-student-regNo").value.trim(),
        rollNo: document.getElementById("modal-student-rollNo").value.trim(),
        class: document.getElementById("modal-student-class").value,
        fatherName: document.getElementById("modal-student-father").value.trim(),
        mobile: document.getElementById("modal-student-mobile").value.trim(),
        photoUrl: document.getElementById("modal-student-photo").value.trim(),
        schoolId: currentSchoolId
    };

    if(!data.name || !data.class) return alert("Name and Class are required.");

    try {
        if (id) {
            await updateDoc(doc(db, "students", id), data);
            alert("Student details updated successfully!");
        } else {
            data.status = "Approved"; // Auto-approve manual additions
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "students"), data);
            alert("New student added successfully!");
        }
        document.getElementById("student-modal").style.display = "none";
        loadStudents();
    } catch (e) {
        alert("Error saving student.");
    }
};

window.runDefaulterLockdown = () => { alert("Defaulter Lockdown Tool active! Click the padlock icon next to a student's ID button to lock their portal/results access."); };

// ====== CLEAN ID CARD & CERTIFICATES ======
window.showIDCard = async (id) => {
    const st = window.fetchedStudents.find(s => s.id === id); if(!st) return;
    if(!currentIdTemplateUrl) return alert("Please upload an ID Card Background Template in School Settings first!");

    // Setup UI for loading
    document.getElementById("printable-id").style.display = "none"; 
    document.getElementById("generating-text").style.display = "block";
    document.getElementById("final-id-image").style.display = "none";
    document.getElementById("id-actions").style.display = "none";
    document.getElementById("id-modal").style.display = "flex";

    try {
        let schoolName = currentSchoolName || document.getElementById('school-name')?.innerText || "ABC SCHOOL NAME";
        const templateStyle = currentTemplateStyle || "wave";

        const response = await fetch("https://school-backend-zlgy.onrender.com/api/generate-id-card", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                studentData: {
                    id: st.id || st.regNo,
                    name: st.name,
                    class: st.class,
                    fatherName: st.fatherName || "N/A",
                    mobile: st.mobile || "N/A",
                    photoUrl: st.photoUrl || "https://via.placeholder.com/150"
                },
                themeColor: currentThemeColor || "#1e3c72",
                secondaryColor: currentSecondaryColor || "#ffffff",
                templateStyle: templateStyle,
                schoolName: schoolName,
                signatureUrl: currentSignatureUrl || ""
            })
        });

        const data = await response.json();
        if(data.success) {
            document.getElementById("final-id-image").src = data.idCardUrl;
            document.getElementById("generating-text").style.display = "none";
            document.getElementById("final-id-image").style.display = "block";
            document.getElementById("id-actions").style.display = "flex";
        } else {
            alert("API Error: " + data.message);
            document.getElementById("id-modal").style.display = "none";
        }
    } catch (e) {
        alert("Failed to generate ID Card. Ensure backend is running.");
        document.getElementById("id-modal").style.display = "none";
    }
};

window.downloadGeneratedID = () => {
    const img = document.getElementById('final-id-image');
    if(!img.src) return alert("No ID card available.");
    const link = document.createElement('a');
    link.href = img.src;
    link.download = `Student_IDCard.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.printGeneratedID = () => {
    const img = document.getElementById('final-id-image');
    if(!img.src) return alert("No ID card available.");
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Print ID Card</title></head><body><img src="' + img.src + '" onload="window.print();window.close()"></body></html>');
    printWindow.document.close();
};

window.generateCertificate = async (id, type) => {
    const st = window.fetchedStudents.find(s => s.id === id); if(!st) return;
    document.getElementById("cert-school-name").innerText = currentSchoolName; document.getElementById("cert-school-name").style.color = currentThemeColor;
    document.getElementById("cert-title").innerText = type.toUpperCase() + " CERTIFICATE"; document.getElementById("cert-date").innerText = new Date().toLocaleDateString();
    
    let bodyText = "";
    if(type === 'tc') bodyText = `This is to certify that Mr./Ms. <strong>${st.name}</strong>, son/daughter of <strong>${st.fatherName}</strong>, was a bona fide student of class <strong>${st.class}</strong> in this institution. He/She has paid all dues and is hereby granted this Transfer Certificate to pursue further education.`;
    if(type === 'character') bodyText = `This is to certify that <strong>${st.name}</strong>, son/daughter of <strong>${st.fatherName}</strong>, student of class <strong>${st.class}</strong>, bears a good moral character to the best of our knowledge. We wish him/her success in all future endeavors.`;
    if(type === 'bonafide') bodyText = `This is to certify that <strong>${st.name}</strong>, son/daughter of <strong>${st.fatherName}</strong>, is a bona fide student of this institution, currently studying in class <strong>${st.class}</strong> during the current academic session.`;
    document.getElementById("cert-body").innerHTML = bodyText;

    document.getElementById("cert-printable").style.display = "flex"; document.getElementById("final-cert-image").style.display = "none"; document.getElementById("cert-actions").style.display = "none"; document.getElementById("cert-generating-text").style.display = "block"; document.getElementById("cert-modal").style.display = "flex";
    
    setTimeout(() => {
        html2canvas(document.getElementById("cert-printable"), { useCORS: true, scale: 2 }).then(canvas => {
            document.getElementById("final-cert-image").src = canvas.toDataURL("image/png");
            document.getElementById("cert-printable").style.display = "none"; document.getElementById("cert-generating-text").style.display = "none";
            document.getElementById("final-cert-image").style.display = "block"; document.getElementById("cert-actions").style.display = "flex";
        }).catch(e => { document.getElementById("cert-generating-text").style.display = "none"; });
    }, 800);
};

window.shareImage = async (imgId, filename) => {
    const imgSrc = document.getElementById(imgId).src; if(!imgSrc) return;
    try { if (navigator.share) { const blob = await (await fetch(imgSrc)).blob(); const file = new File([blob], filename, { type: 'image/png' }); await navigator.share({ title: 'Document', files:[file] }); } else { alert("Long press the image to save it."); } } catch (err) {}
};

// ================= STAFF & PRIVILEGES =================
window.saveStaff = async () => {
    const name = document.getElementById("s_name").value.trim(); const email = document.getElementById("s_email").value.trim(); const pass = document.getElementById("s_pass").value.trim(); const role = document.getElementById("s_role").value;
    if(!name || !email || !pass) return alert("Fill all fields.");
    let photoUrl = await uploadToCloudinary("s_photo", "s_btn", "<i class='fas fa-save'></i> Add Staff Member"); if(!photoUrl) photoUrl = "https://via.placeholder.com/100";
    try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
        await setDoc(doc(db, "users", cred.user.uid), { name, email, role: "staff", staffRole: role, plainPassword: pass, photoUrl: photoUrl, schoolId: currentSchoolId, status: "active", privileges: { attendance: true, marks: true, finance: false, notices: false } });
        alert("Staff created successfully!"); document.getElementById("s_name").value=""; document.getElementById("s_email").value=""; document.getElementById("s_pass").value=""; loadStaff();
    } catch(e) { alert("Error: " + e.message); } finally { await signOut(secondaryAuth).catch(e=>{}); }
};

async function loadStaff() {
    try {
        const snap = await getDocs(query(collection(db, "users"), where("schoolId", "==", currentSchoolId), where("role", "==", "staff")));
        window.fetchedStaff =[]; let html = ""; document.getElementById("count-staff").innerText = snap.size; let staffOpts = "<option value=''>-- Select Staff --</option>";
        snap.forEach(d => {
            const dt = d.data(); dt.id = d.id; window.fetchedStaff.push(dt);
            staffOpts += `<option value="${d.id}">${dt.name} (${dt.staffRole})</option>`;
            const statusColor = dt.status === "blocked" ? "red" : "green";
            const blockBtn = dt.status === "blocked" ? `<button class="action-btn btn-green" onclick="updateStaffStatus('${d.id}', 'active')">Unblock</button>` : `<button class="action-btn btn-yellow" onclick="updateStaffStatus('${d.id}', 'blocked')">Block</button>`;
            
            let privs = dt.privileges || {}; let privStr =[];
            if(privs.attendance) privStr.push("Att."); if(privs.marks) privStr.push("Marks"); if(privs.finance) privStr.push("Fin."); if(privs.notices) privStr.push("Notices");

            html += `<tr>
                <td><img src="${dt.photoUrl || 'https://via.placeholder.com/100'}" class="img-circle"></td>
                <td><strong>${dt.name}</strong><br><small>${dt.staffRole}</small></td>
                <td><small>${dt.email}</small><br><strong>${dt.plainPassword}</strong></td>
                <td><span style="font-size:11px; background:#e2e8f0; padding:2px 5px; border-radius:4px;">${privStr.join(', ') || 'None'}</span></td>
                <td style="color:${statusColor}; font-weight:bold;">${(dt.status || 'ACTIVE').toUpperCase()}</td>
                <td>
                    <button class="action-btn btn-blue" onclick="editStaff('${d.id}')"><i class="fas fa-user-edit"></i> Auth / Edit</button>
                    ${blockBtn} <button class="action-btn btn-red" onclick="deleteStaff('${d.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        document.getElementById("staff-table").innerHTML = html || "<tr><td colspan='6'>No Staff Found.</td></tr>";
        document.getElementById("mail_specific_staff").innerHTML = staffOpts; document.getElementById("salary_staff").innerHTML = staffOpts;
    } catch(e) {}
}

window.editStaff = (id) => {
    const st = window.fetchedStaff.find(s => s.id === id); if(!st) return; currentEditStaffId = id;
    document.getElementById("edit_s_email").value = st.email; document.getElementById("edit_s_pass").value = st.plainPassword || ""; document.getElementById("edit_s_role").value = st.staffRole || "Teacher";
    let p = st.privileges || {};
    document.getElementById("priv_attendance").checked = p.attendance === true; document.getElementById("priv_marks").checked = p.marks === true; document.getElementById("priv_finance").checked = p.finance === true; document.getElementById("priv_notices").checked = p.notices === true;
    document.getElementById("edit-staff-modal").style.display = "flex";
};

window.saveStaffEdits = async () => {
    const p = document.getElementById("edit_s_pass").value; const r = document.getElementById("edit_s_role").value;
    const privs = { attendance: document.getElementById("priv_attendance").checked, marks: document.getElementById("priv_marks").checked, finance: document.getElementById("priv_finance").checked, notices: document.getElementById("priv_notices").checked };
    try {
        await updateDoc(doc(db, "users", currentEditStaffId), { plainPassword: p, staffRole: r, privileges: privs });
        alert("Staff Privileges & Auth updated successfully!"); document.getElementById("edit-staff-modal").style.display = "none"; loadStaff();
    } catch(e) { alert("Error saving."); }
};

window.updateStaffStatus = async (uid, newStatus) => {
    if (newStatus === 'blocked') { const reason = prompt("Enter reason for blocking this staff member:"); if (reason === null) return; await updateDoc(doc(db, "users", uid), { status: newStatus, blockReason: reason || "Violation of policies" }); } else { if (confirm("Unblock this staff member?")) { await updateDoc(doc(db, "users", uid), { status: newStatus, blockReason: "" }); } else return; } loadStaff();
};
window.deleteStaff = async (uid) => { if(confirm("Permanently delete this staff member?")) { await deleteDoc(doc(db, "users", uid)); loadStaff(); } };

// ================= ACADEMIC VETO =================
async function loadPendingResults() {
    try {
        const snap = await getDocs(query(collection(db, "exam_marks"), where("schoolId", "==", currentSchoolId), where("status", "==", "Pending")));
        let html = "";
        snap.forEach(d => {
            const dt = d.data();
            html += `<tr><td>${dt.date || 'Recent'}</td><td><strong>${dt.studentName}</strong><br><small>Class: ${dt.class}</small></td><td><strong>${dt.examName}</strong><br><small>${dt.subject}</small></td><td><span style="color:#e67e22; font-weight:bold;">${dt.marksObtained} / ${dt.maxMarks}</span></td><td><button class="action-btn btn-green" onclick="approveResult('${d.id}')"><i class="fas fa-check"></i> Approve Result</button></td></tr>`;
        });
        document.getElementById("veto-table").innerHTML = html || "<tr><td colspan='5' style='text-align:center;'>No pending results to vet.</td></tr>";
    } catch(e) { console.log("Academic veto skip", e); }
}
window.approveResult = async (docId) => { try { await updateDoc(doc(db, "exam_marks", docId), { status: "Approved" }); alert("Result Approved! Students can now see it."); loadPendingResults(); } catch(e) {} };

// ================= NOTICES =================
window.saveNotice = async () => {
    const target = document.getElementById("n_target").value;
    const title = document.getElementById("n_title").value.trim(); const body = document.getElementById("n_body").value.trim();
    if(!title || !body) return alert("Fill title and body");
    try {
        await setDoc(doc(collection(db, "notices")), { target, title, body, date: new Date().toLocaleDateString(), visible: true, schoolId: currentSchoolId, createdAt: serverTimestamp() });
        document.getElementById("n_title").value=""; document.getElementById("n_body").value=""; loadNotices();
    } catch(e) { alert("Error saving notice."); }
};

async function loadNotices() {
    try {
        const snap = await getDocs(query(collection(db, "notices"), where("schoolId", "==", currentSchoolId)));
        let html = "", activeCount = 0;
        snap.forEach(d => {
            const dt = d.data(); if(dt.visible) activeCount++;
            const eyeIcon = dt.visible ? "fa-eye" : "fa-eye-slash", eyeColor = dt.visible ? "btn-blue" : "btn-yellow";
            html += `<tr><td>${dt.date}</td><td><strong>${dt.target || 'All'}</strong></td><td>${dt.title}</td><td>${dt.body}</td>
            <td><button class="action-btn ${eyeColor}" onclick="toggleNotice('${d.id}', ${!dt.visible})"><i class="fas ${eyeIcon}"></i></button></td>
            <td><button class="action-btn btn-red" onclick="deleteDocFromDb('notices', '${d.id}', loadNotices)"><i class="fas fa-trash"></i> Del</button></td></tr>`;
        });
        document.getElementById("notice-table").innerHTML = html || "<tr><td colspan='6'>No Notices Found.</td></tr>";
        document.getElementById("count-notices").innerText = activeCount;
    } catch(e) {}
}

window.toggleNotice = async (id, state) => { await updateDoc(doc(db, "notices", id), { visible: state }); loadNotices(); };

window.deleteDocFromDb = async (colName, id, callback) => {
    if(confirm("Are you sure you want to permanently delete this record?")) { 
        await deleteDoc(doc(db, colName, id)); 
        callback(); 
    }
};

function parseUserAgent(ua) {
    if (!ua) return { os: "Unknown", model: "Unknown" };
    let os = "Unknown OS", model = "Unknown Device";
    if (ua.includes("Android")) { os = "Android"; model = ua.split(';')[2].split('Build')[0]; }
    else if (ua.includes("iPhone")) { os = "iOS"; model = "iPhone"; }
    else if (ua.includes("Windows")) { os = "Windows"; model = "PC"; }
    return { os, model };
}

// AUTO LOGIN FOR SUPER ADMIN IMPERSONATION
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('impersonate') === 'true') {
        sessionStorage.setItem("is_impersonating", "true"); 
        const impEmail = urlParams.get('email');
        const impPass = urlParams.get('pass');
        
        if (impEmail && impPass) {
            setTimeout(() => {
                document.getElementById("loginId").value = decodeURIComponent(impEmail);
                document.getElementById("loginPassword").value = decodeURIComponent(impPass);
                document.getElementById("doLoginBtn").click();
                
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 800);
        }
    }
});

// ================= BULK ID GENERATION =================
window.bulkGenerateIDCards = async () => {
    let approvedStudents = window.fetchedStudents;
    if (!approvedStudents || approvedStudents.length === 0) return alert("No students available for ID generation.");

    const selectedClass = document.getElementById("bulk_class_select")?.value;
    if (selectedClass && selectedClass !== "ALL") {
        approvedStudents = approvedStudents.filter(st => st.class === selectedClass);
        if (approvedStudents.length === 0) return alert("No students found in the selected class.");
    }

    document.getElementById("bulk-id-modal").style.display = "block";
    document.getElementById("bulk-generating-text").style.display = "block";
    document.getElementById("bulk-id-grid").innerHTML = "";

    try {
        let schoolName = currentSchoolName || document.getElementById('school-name')?.innerText || "ABC SCHOOL NAME";
        const templateStyle = currentTemplateStyle || "wave";

        const response = await fetch("https://school-backend-zlgy.onrender.com/api/bulk-generate-id-cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                themeColor: currentThemeColor || "#1e3c72",
                secondaryColor: currentSecondaryColor || "#ffffff",
                templateStyle: templateStyle,
                schoolName: schoolName,
                signatureUrl: (window.currentSigSettings && window.currentSigSettings.idCard === false) ? "" : currentSignatureUrl,
                students: approvedStudents.map(st => ({
                    id: st.id || st.regNo,
                    regNo: st.regNo || "N/A",
                    rollNo: st.rollNo || "N/A",
                    name: st.name,
                    class: st.class,
                    fatherName: st.fatherName || "N/A",
                    mobile: st.mobile || "N/A",
                    photoUrl: st.photoUrl || "https://via.placeholder.com/150"
                }))
            })
        });

        const data = await response.json();
        document.getElementById("bulk-generating-text").style.display = "none";

        if(data.success && data.images) {
            window.lastGeneratedBulkIds = data.images;
            data.images.forEach((imgBase64, index) => {
                const imgElement = document.createElement("img");
                imgElement.src = imgBase64;
                imgElement.style.width = "100%";
                imgElement.style.borderRadius = "8px";
                imgElement.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
                document.getElementById("bulk-id-grid").appendChild(imgElement);
            });
        } else {
            alert("API Error: " + data.error);
        }
    } catch (e) {
        document.getElementById("bulk-generating-text").style.display = "none";
        alert("Failed to generate IDs. Check backend status.");
    }
};

window.downloadAllIdsAsZip = async () => {
    if (!window.lastGeneratedBulkIds || window.lastGeneratedBulkIds.length === 0) {
        return alert("No ID cards to download.");
    }

    const zip = new JSZip();
    const folder = zip.folder("Student_ID_Cards");

    window.lastGeneratedBulkIds.forEach((base64String, index) => {
        // Remove the data URL prefix
        const base64Data = base64String.split(',')[1] || base64String;
        const studentName = (window.fetchedStudents && window.fetchedStudents[index] && window.fetchedStudents[index].name) ? window.fetchedStudents[index].name.replace(/[^a-z0-9]/gi, '_') : index + 1;
        folder.file(`Student_ID_${studentName}.jpg`, base64Data, {base64: true});
    });

    zip.generateAsync({type:"blob"}).then(function(content) {
        saveAs(content, "Bulk_ID_Cards.zip");
    });
};