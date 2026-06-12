import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, deleteDoc, serverTimestamp, deleteField, onSnapshot, orderBy, limit, addDoc, writeBatch, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
let currentSchoolNameColor = "#ffffff"; let currentStudentNameColor = "#d32f2f"; let currentDetailsColor = "#333333"; let currentPhotoBgColor = "#ffffff";
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
    if(link) { navigator.clipboard.writeText(link).then(() => alert("Link Copied!")); }
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
                if (document.getElementById("sig_on_marksheet")) document.getElementById("sig_on_marksheet").checked = data.sigSettings.marksheet !== false;
                document.getElementById("sig_on_id").checked = data.sigSettings.idCard !== false;
                document.getElementById("sig_on_bonafide").checked = data.sigSettings.bonafide !== false;
                document.getElementById("sig_on_admit").checked = data.sigSettings.admit !== false;
            }
        } else {
            window.currentSigSettings = { marksheet: true, idCard: true, bonafide: true, admit: true };
        }
        
        if(data.examSubjects && Array.isArray(data.examSubjects)) {
            window.examSubjects = data.examSubjects;
        } else {
            window.examSubjects = [...(window.factoryDefaultSubjects || [])];
        }

        if(data.themeColor) { currentThemeColor = data.themeColor; document.getElementById("school_theme_color").value = currentThemeColor; document.documentElement.style.setProperty('--theme-color', currentThemeColor); }
        if(data.schoolNameColor) { currentSchoolNameColor = data.schoolNameColor; if(document.getElementById("idSchoolNameColor")) document.getElementById("idSchoolNameColor").value = currentSchoolNameColor; }
        if(data.studentNameColor) { currentStudentNameColor = data.studentNameColor; if(document.getElementById("idStudentNameColor")) document.getElementById("idStudentNameColor").value = currentStudentNameColor; }
        if(data.detailsColor) { currentDetailsColor = data.detailsColor; if(document.getElementById("idDetailsColor")) document.getElementById("idDetailsColor").value = currentDetailsColor; }
        if(data.photoBgColor) { currentPhotoBgColor = data.photoBgColor; if(document.getElementById("idPhotoBgColor")) document.getElementById("idPhotoBgColor").value = currentPhotoBgColor; }
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
    onSnapshot(doc(db, "schools", currentSchoolId), (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            if(data.tickerActive && data.emergencyTicker) {
                document.getElementById("school-ticker-container").style.display = "block";
                document.getElementById("school-ticker-text").innerText = data.emergencyTicker;
            } else { 
                document.getElementById("school-ticker-container").style.display = "none"; 
            }
            
            // Payment Settings Init
            if(data.paymentQrUrl) {
                currentPaymentQrUrl = data.paymentQrUrl;
                const preview = document.getElementById("payment_qr_preview");
                if (preview) { preview.src = currentPaymentQrUrl; preview.style.display = "block"; }
            }
            if(data.upiId) {
                const upiEl = document.getElementById("upi_id_input");
                if(upiEl && upiEl.value === "") upiEl.value = data.upiId;
            }
            if(data.whatsappGroup) {
                const waEl = document.getElementById("wa_group_link");
                if(waEl && waEl.value === "") waEl.value = data.whatsappGroup;
            }

            // Feature Modules Toggles
            const enabledModules = data.enabledModules || [];
            document.getElementById("module-qr-fee").style.display = enabledModules.includes("QR Fee Module") ? "" : "none";
            document.getElementById("module-admit-card").style.display = enabledModules.includes("Admit Card Module") ? "" : "none";
            document.getElementById("module-whatsapp").style.display = enabledModules.includes("WhatsApp Module") ? "" : "none";

            // Session Upgrade Status Logic
            const upgradeStatus = data.sessionUpgradeStatus;
            const statusText = document.getElementById("session-upgrade-status-text");
            const reqBtn = document.getElementById("request-upgrade-btn");
            const execBtn = document.getElementById("execute-promotion-btn");
            
            if (statusText && reqBtn && execBtn) {
                if (upgradeStatus === "pending") {
                    statusText.innerText = "Status: Pending Approval (Master Core)";
                    statusText.style.color = "#d97706";
                    reqBtn.style.display = "none";
                    execBtn.style.display = "none";
                } else if (upgradeStatus === "approved") {
                    statusText.innerText = "Status: Approved! Ready to Execute.";
                    statusText.style.color = "#059669";
                    reqBtn.style.display = "none";
                    execBtn.style.display = "inline-block";
                } else {
                    statusText.innerText = "Status: N/A";
                    statusText.style.color = "#7f8c8d";
                    reqBtn.style.display = "inline-block";
                    execBtn.style.display = "none";
                }
            }
        }
    });
};

window.requestSessionUpgrade = async () => {
    if(confirm("Are you sure you want to request a Session Upgrade? This will send a request to the Super Admin (Master Core).")) {
        try {
            await updateDoc(doc(db, "schools", currentSchoolId), { sessionUpgradeStatus: "pending" });
            alert("Request sent successfully! Please wait for Super Admin approval.");
        } catch (e) {
            console.error(e);
            alert("Error sending request.");
        }
    }
};

window.executePromotion = async () => {
    if(!confirm("CRITICAL WARNING: This will promote ALL approved students to the next class and RESET their Roll Numbers. This action cannot be undone. Do you want to proceed?")) return;
    
    try {
        const batch = writeBatch(db);
        let promotedCount = 0;

        window.fetchedStudents.forEach(st => {
            if (st.status === "Approved") {
                let nextClass = st.class;
                
                // Logic to increment class
                const classMap = {
                    "Nursery": "LKG", "LKG": "UKG", "UKG": "1st",
                    "1st": "2nd", "2nd": "3rd", "3rd": "4th", "4th": "5th",
                    "5th": "6th", "6th": "7th", "7th": "8th", "8th": "9th",
                    "9th": "10th", "10th": "11th", "11th": "12th", "12th": "Alumni"
                };

                if (classMap[st.class]) {
                    nextClass = classMap[st.class];
                }

                const studentRef = doc(db, "students", st.id);
                batch.update(studentRef, { 
                    class: nextClass,
                    rollNo: "" // Reset roll number
                });
                promotedCount++;
            }
        });

        if (promotedCount > 0) {
            await batch.commit();
            // Reset status after successful execution
            await updateDoc(doc(db, "schools", currentSchoolId), { sessionUpgradeStatus: null });
            alert(`Success! ${promotedCount} students have been promoted to the next class and roll numbers reset.`);
            loadStudents();
        } else {
            alert("No approved students found to promote.");
        }
    } catch (e) {
        console.error("Batch promotion error:", e);
        alert("Failed to execute promotion batch.");
    }
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
    try { await updateDoc(doc(db, "schools", currentSchoolId), { admissionOpen: e.target.checked }); alert(e.target.checked ? "Admissions OPEN." : "Admissions CLOSED."); }
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

function loadAllData() { loadStudents(); loadStaff(); loadNotices(); loadInbox(); loadSentMail(); loadTransactions(); loadPendingResults(); window.initDashboardChart(); window.loadTransportRoutes(); window.loadInventory(); }

window.initDashboardChart = () => {
    const ctx = document.getElementById('dashboardChart');
    if (!ctx) return;
    
    // Check if chart exists and destroy
    if (window.myDashboardChart) {
        window.myDashboardChart.destroy();
    }
    
    // Calculate total income (Fee) and expenses (Salary, Expense)
    let totalIncome = 0;
    let totalExpenses = 0;
    
    const filter = document.getElementById('chart-date-filter') ? document.getElementById('chart-date-filter').value : 'All Time';
    const specificDate = document.getElementById('chart-specific-date') ? document.getElementById('chart-specific-date').value : '';
    const now = new Date();
    
    let filteredTransactions = window.fetchedTransactions || [];
    
    if (specificDate) {
        filteredTransactions = filteredTransactions.filter(t => t.date === specificDate);
    } else if (filter === 'This Month') {
        filteredTransactions = filteredTransactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    } else if (filter === 'Last Month') {
        filteredTransactions = filteredTransactions.filter(t => {
            const d = new Date(t.date);
            const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            return d.getMonth() === lastMonth && d.getFullYear() === year;
        });
    } else if (filter === 'This Year') {
        filteredTransactions = filteredTransactions.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === now.getFullYear();
        });
    }
    
    filteredTransactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'Fee') {
            totalIncome += amt;
        } else if (t.type === 'Salary' || t.type === 'Expense') {
            totalExpenses += amt;
        }
    });

    if (document.getElementById("count-revenue")) {
        document.getElementById("count-revenue").innerText = "₹ " + (totalIncome - totalExpenses);
    }
    
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.5)'); // Neon Cyan
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.1)'); // Neon Purple

    window.myDashboardChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Total Income', 'Total Expenses'],
            datasets: [{
                label: 'Financial Analytics (₹)',
                data: [totalIncome, totalExpenses],
                backgroundColor: gradient,
                borderColor: '#00F0FF',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: '#00F0FF',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });
};

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
        alert("Failed to save theme: " + e.message);
    }
};

window.saveIDColorSettings = async () => {
    const scColor = document.getElementById("idSchoolNameColor")?.value || currentSchoolNameColor;
    const stColor = document.getElementById("idStudentNameColor")?.value || currentStudentNameColor;
    const dColor = document.getElementById("idDetailsColor")?.value || currentDetailsColor;
    const pbColor = document.getElementById("idPhotoBgColor")?.value || currentPhotoBgColor;
    try {
        await updateDoc(doc(db, "schools", currentSchoolId), { schoolNameColor: scColor, studentNameColor: stColor, detailsColor: dColor, photoBgColor: pbColor });
        currentSchoolNameColor = scColor;
        currentStudentNameColor = stColor;
        currentDetailsColor = dColor;
        currentPhotoBgColor = pbColor;
        alert("ID Card Text & Photo Colors Saved Successfully!");
    } catch(e) {
        alert("Failed to save colors: " + e.message);
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
        marksheet: document.getElementById("sig_on_marksheet") ? document.getElementById("sig_on_marksheet").checked : true,
        idCard: document.getElementById("sig_on_id").checked,
        bonafide: document.getElementById("sig_on_bonafide").checked,
        admit: document.getElementById("sig_on_admit").checked
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

let currentPaymentQrUrl = "";
window.savePaymentSettings = async () => {
    let qrUrl = currentPaymentQrUrl;
    if (document.getElementById("payment_qr_upload").files.length > 0) {
        qrUrl = await uploadToCloudinary("payment_qr_upload", "save_qr_btn", "<i class='fas fa-save'></i> Save Payment Settings");
        if (!qrUrl) return alert("Upload failed.");
    }
    
    const upiId = document.getElementById("upi_id_input").value.trim();
    if (!upiId) return alert("Please enter a valid UPI ID.");
    
    try {
        await updateDoc(doc(db, "schools", currentSchoolId), { paymentQrUrl: qrUrl, upiId: upiId });
        currentPaymentQrUrl = qrUrl;
        if (qrUrl) document.getElementById("payment_qr_preview").src = qrUrl;
        alert("Payment Settings Saved successfully!");
    } catch (e) {
        alert("Error saving payment settings: " + e.message);
    }
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

window.fetchedTransactions = [];
window.currentLedgerTab = 'All';

async function loadTransactions() {
    try {
        const snap = await getDocs(query(collection(db, "transactions"), where("schoolId", "==", currentSchoolId)));
        window.fetchedTransactions = [];
        snap.forEach(d => window.fetchedTransactions.push({ id: d.id, ...d.data() }));
        window.fetchedTransactions.sort((a,b) => new Date(b.date) - new Date(a.date));
        
        let totalFees = 0, totalSalaries = 0, totalExpenses = 0;
        window.fetchedTransactions.forEach(t => {
            if(t.type === "Fee") totalFees += Number(t.amount);
            if(t.type === "Salary") totalSalaries += Number(t.amount);
            if(t.type === "Expense") totalExpenses += Number(t.amount);
        });
        
        document.getElementById("summary-fees").innerText = "₹ " + totalFees;
        document.getElementById("summary-salaries").innerText = "₹ " + totalSalaries;
        document.getElementById("summary-balance").innerText = "₹ " + (totalFees - (totalSalaries + totalExpenses));
        
        if(window.initDashboardChart) window.initDashboardChart();
        window.renderTransactionsTable();
        document.getElementById("count-revenue").innerText = "Rs. " + (totalFees - totalSalaries - totalExpenses);
        
        const staffNames = new Set(window.fetchedTransactions.filter(t => t.type === "Salary" && t.personName).map(t => t.personName));
        const staffDropdown = document.getElementById("ledger-search-staff");
        staffDropdown.innerHTML = '<option value="">All Staff</option>';
        staffNames.forEach(name => {
            staffDropdown.innerHTML += `<option value="${name}">${name}</option>`;
        });
        
        window.renderTransactionsTable();
    } catch(e) {}
}

window.switchLedgerTab = (tab, btnElement) => {
    window.currentLedgerTab = tab;
    document.querySelectorAll('#ledger-tabs .filter-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    
    // Toggle Search Inputs
    const classFilter = document.getElementById("ledger-search-class");
    const staffFilter = document.getElementById("ledger-search-staff");
    
    if(tab === 'Fee') {
        classFilter.style.display = "block";
        staffFilter.style.display = "none";
        staffFilter.value = "";
    } else if (tab === 'Salary') {
        classFilter.style.display = "none";
        classFilter.value = "";
        staffFilter.style.display = "block";
    } else {
        classFilter.style.display = "none"; classFilter.value = "";
        staffFilter.style.display = "none"; staffFilter.value = "";
    }
    
    document.getElementById("ledger-search-name").value = "";
    document.getElementById("ledger-search-name").placeholder = tab === 'Fee' ? "Search by Student Name..." : (tab === 'Salary' ? "Search by Staff Name/ID..." : "Search by Name/Title...");
    
    window.renderTransactionsTable();
};

window.renderTransactionsTable = () => {
    const tbody = document.getElementById("transaction-table");
    const nameSearch = document.getElementById("ledger-search-name").value.toLowerCase();
    const classSearch = document.getElementById("ledger-search-class").value;
    const staffSearch = document.getElementById("ledger-search-staff").value;
    
    let filtered = window.fetchedTransactions;
    
    if(window.currentLedgerTab !== 'All') {
        filtered = filtered.filter(t => t.type === window.currentLedgerTab);
    }
    
    if(classSearch) {
        filtered = filtered.filter(t => t.class === classSearch);
    }
    
    if(staffSearch) {
        filtered = filtered.filter(t => t.personName === staffSearch);
    }
    
    if(nameSearch) {
        filtered = filtered.filter(t => t.personName?.toLowerCase().includes(nameSearch));
    }
    
    let html = "";
    filtered.forEach(t => {
        const typeColor = t.type === "Fee" ? "#27ae60" : (t.type === "Expense" ? "#e53e3e" : "#e67e22");
        const details = t.type === "Fee" ? `Class: ${t.class || 'N/A'}` : (t.type === "Expense" ? "School Expense" : "Staff Pay");
        const actionBtn = t.type === 'Salary' ? `<button class="action-btn btn-blue" style="padding:2px 5px; font-size:10px; margin-left:5px;" onclick="window.generatePayslip('${t.id}')"><i class="fas fa-download"></i> Slip</button>` : '';
        html += `<tr><td>${t.date}</td><td><strong style="color:${typeColor}">${t.type}</strong></td><td>${t.personName || 'N/A'}</td><td>${details}</td><td style="font-weight:bold;">Rs. ${t.amount}</td><td>${t.mode} ${actionBtn}</td>
        <td><button class="action-btn btn-red" onclick="window.requestTransactionDeletion('${t.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    
    tbody.innerHTML = html || "<tr><td colspan='7' style='text-align:center;'>No Financial Records Found.</td></tr>";
}

window.requestTransactionDeletion = async (id) => {
    const t = window.fetchedTransactions.find(x => x.id === id);
    if (!t) return;
    
    if (confirm("Request Super Admin to delete this transaction?")) {
        try {
            await setDoc(doc(db, "pending_deletions", id), {
                ...t,
                targetDocId: id,
                targetCollection: 'transactions',
                schoolId: window.currentSchoolId || t.schoolId || 'UNKNOWN',
                requestDate: new Date().toISOString(),
                status: "Pending"
            });
            alert("Deletion request sent to Super Admin for approval.");
        } catch (e) {
            console.error(e);
            alert("Error sending deletion request.");
        }
    }
};

window.downloadLedgerPDF = () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');
    
    pdf.setFontSize(18);
    pdf.text("Combined Financial Ledger", 14, 22);
    
    const nameSearch = document.getElementById("ledger-search-name").value.toLowerCase();
    const classSearch = document.getElementById("ledger-search-class").value;
    const staffSearch = document.getElementById("ledger-search-staff").value;
    
    let filtered = window.fetchedTransactions;
    if(window.currentLedgerTab !== 'All') { filtered = filtered.filter(t => t.type === window.currentLedgerTab); }
    if(classSearch) { filtered = filtered.filter(t => t.class === classSearch); }
    if(staffSearch) { filtered = filtered.filter(t => t.personName === staffSearch); }
    if(nameSearch) { filtered = filtered.filter(t => t.personName?.toLowerCase().includes(nameSearch)); }
    
    let y = 40;
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    pdf.text("Date", 14, y);
    pdf.text("Type", 40, y);
    pdf.text("Name/Title", 70, y);
    pdf.text("Details", 120, y);
    pdf.text("Amount", 180, y);
    pdf.text("Mode", 220, y);
    
    pdf.setFont(undefined, 'normal');
    y += 10;
    
    filtered.forEach((t, i) => {
        if (y > 190) {
            pdf.addPage();
            y = 20;
        }
        const details = t.type === "Fee" ? `Class: ${t.class || 'N/A'}` : (t.type === "Expense" ? "School Expense" : "Staff Pay");
        pdf.text(t.date || '', 14, y);
        pdf.text(t.type || '', 40, y);
        pdf.text((t.personName || 'N/A').substring(0, 20), 70, y);
        pdf.text(details.substring(0, 25), 120, y);
        pdf.text("Rs. " + t.amount, 180, y);
        pdf.text(t.mode || '', 220, y);
        y += 10;
    });
    
    pdf.save("Ledger_Report.pdf");
};

window.generatePayslip = async (id) => {
    const t = window.fetchedTransactions.find(x => x.id === id);
    if (!t) return;
    
    const slipDiv = document.createElement('div');
    slipDiv.style.position = 'absolute';
    slipDiv.style.top = '-9999px';
    slipDiv.style.left = '-9999px';
    slipDiv.style.width = '210mm';
    slipDiv.style.padding = '40px';
    slipDiv.style.background = '#fff';
    slipDiv.style.color = '#000';
    slipDiv.style.fontFamily = 'Arial, sans-serif';
    
    const schoolName = currentSchoolName || 'School Name';
    slipDiv.innerHTML = `
        <div style="text-align:center; border-bottom:2px solid #ccc; padding-bottom:20px; margin-bottom:20px;">
            <h1 style="margin:0; font-size:24px; color:#1e3c72;">${schoolName.toUpperCase()}</h1>
            <p style="margin:5px 0 0 0; color:#555;">STAFF SALARY SLIP</p>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:30px;">
            <div>
                <p><strong>Employee Name:</strong> ${t.personName}</p>
                <p><strong>Payment Date:</strong> ${new Date(t.date).toLocaleDateString()}</p>
            </div>
            <div>
                <p><strong>Transaction ID:</strong> ${t.id}</p>
                <p><strong>Payment Mode:</strong> ${t.mode}</p>
            </div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:40px;">
            <thead>
                <tr style="background:#f4f4f4;">
                    <th style="padding:12px; border:1px solid #ccc; text-align:left;">Description</th>
                    <th style="padding:12px; border:1px solid #ccc; text-align:right;">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding:12px; border:1px solid #ccc;">Basic Salary Disbursement</td>
                    <td style="padding:12px; border:1px solid #ccc; text-align:right;">Rs. ${t.amount}</td>
                </tr>
                <tr>
                    <td style="padding:12px; border:1px solid #ccc; font-weight:bold; text-align:right;">Net Payable:</td>
                    <td style="padding:12px; border:1px solid #ccc; font-weight:bold; text-align:right;">Rs. ${t.amount}</td>
                </tr>
            </tbody>
        </table>
        <div style="display:flex; justify-content:flex-end; margin-top:50px;">
            <div style="text-align:center;">
                ${currentSignatureUrl ? `<img src="${currentSignatureUrl}" style="height:50px; margin-bottom:5px;">` : `<div style="height:50px;"></div>`}
                <div style="border-top:1px solid #000; padding-top:5px;">Authorized Signatory</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(slipDiv);
    try {
        const canvas = await html2canvas(slipDiv, { scale: 2 });
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Payslip_${t.personName.replace(/\s+/g, '_')}_${t.date}.pdf`);
    } catch (e) {
        console.error(e);
        alert('Error generating pay-slip');
    } finally {
        document.body.removeChild(slipDiv);
    }
}

// ================= STUDENTS, CERTS & DEFAULTER LOCKDOWN =================
async function loadStudents() {
    try {
        const snap = await getDocs(query(collection(db, "students"), where("schoolId", "==", currentSchoolId)));
        window.fetchedStudents =[]; let pendingCount = 0; let totalPresent = 0;
        snap.forEach(d => { let dt = d.data(); dt.id = d.id; if(dt.status === "Pending") pendingCount++; window.fetchedStudents.push(dt); });
        document.getElementById("count-students").innerText = snap.size; document.getElementById("count-pending").innerText = pendingCount;
        
        if(snap.size > 0) {
            try {
                const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
                const attSnap = await getDocs(query(collection(db, "attendance"), where("schoolId", "==", currentSchoolId), where("date", "==", todayStr)));
                let totalStudentsRecorded = 0;
                let totalPresent = 0;
                attSnap.forEach(d => {
                    const recs = d.data().records || {};
                    for(let sid in recs) {
                        totalStudentsRecorded++;
                        if(recs[sid] === "Present") totalPresent++;
                    }
                });
                let att = 0;
                if(totalStudentsRecorded > 0) {
                    att = Math.floor((totalPresent / totalStudentsRecorded) * 100);
                } else {
                    att = "N/A ";
                }
                document.getElementById("count-attendance").innerText = att + (att !== "N/A " ? "%" : "");
            } catch(e) {
                document.getElementById("count-attendance").innerText = "Err";
            }
        }
        
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
        const statusColor = dt.status === 'Approved' ? '#27ae60' : (dt.status === 'Pending' ? '#e67e22' : '#e53e3e'); const statusIcon = dt.status === 'Approved' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-clock"></i>';
        
        const lockBtn = locked ? `<button class="action-btn btn-green" onclick="toggleStudentLock('${safeId}', false)" title="Unlock Account"><i class="fas fa-unlock"></i></button>` : `<button class="action-btn btn-dark" onclick="toggleStudentLock('${safeId}', true)" title="Lock Account"><i class="fas fa-lock"></i></button>`;

        const actionBtns = dt.status === "Pending" 
            ? `<button class="action-btn btn-green" onclick="updateStudentStatus('${safeId}')"><i class="fas fa-check"></i> Approve</button>`
            : `
            <button class="action-btn btn-blue" onclick="showIDCard('${safeId}')"><i class="fas fa-id-card"></i> ID</button>
            <button class="action-btn" style="background:#3b82f6; color:white;" onclick="window.openDirectMessageModal('${safeId}', '${dt.name.replace(/'/g, "\\'")}')"><i class="fas fa-comment-dots"></i> Message</button>
            <button class="action-btn btn-purple" onclick="openStudentModal('${safeId}')"><i class="fas fa-edit"></i> Edit</button>
            ${lockBtn}`;
        
        html += `<tr class="${locked ? 'locked-row' : ''}">
            <td><img src="${dt.photoUrl || 'https://via.placeholder.com/100'}" class="img-circle"></td>
            <td><strong style="display:block; font-size:13px;">${dt.name || 'N/A'} ${locked ? '<i class="fas fa-lock" style="color:#e53e3e"></i>' : ''}</strong><small style="color:#7f8c8d;">${dt.mobile || 'No Mobile'}</small></td>
            <td><span style="font-weight:bold; font-size:13px; color:#333;">${dt.rollNo || 'N/A'}</span></td>
            <td><span style="background:#eaf4ff; color:#2c7be5; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold;">Class: ${dt.class || 'N/A'}</span></td>
            <td><span style="font-size:12px; display:block;"><b>P:</b> ${(dt.parentage || dt.fatherName) || 'N/A'}</span><span style="font-size:12px; display:block;"><b>M:</b> ${dt.motherName || 'N/A'}</span></td>
            <td><span style="color:${statusColor}; font-weight:bold; font-size:13px;">${statusIcon} ${dt.status || 'N/A'}</span></td>
            <td style="white-space:nowrap;">${actionBtns} <button class="action-btn btn-red" onclick="deleteStudent('${safeId}')"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = html || "<tr><td colspan='7' style='text-align:center; padding:30px; color:#999;'>No Students Found.</td></tr>";
}

window.populateStudentsForMarks = () => {
    const classVal = document.getElementById("marks_class").value;
    const studentSelect = document.getElementById("marks_student");
    studentSelect.innerHTML = '<option value="">-- Select Student --</option>';
    if (!classVal) return;
    
    const students = window.fetchedStudents.filter(s => s.class === classVal);
    students.forEach(s => {
        studentSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.rollNo || 'N/A'})</option>`;
    });
    
    const subjects = window.examSubjects || ['English', 'Mathematics', 'Science', 'Social Studies', 'Hindi/Local'];
    const tbody = document.getElementById("marks_entry_table");
    tbody.innerHTML = '';
    
    subjects.forEach((sub, idx) => {
        tbody.innerHTML += `<tr>
            <td style="padding:10px; border:1px solid #ccc;">${sub}</td>
            <td style="padding:10px; border:1px solid #ccc; text-align:center;"><input type="number" id="marks_max_${idx}" value="100" class="input-premium" style="width:60px;"></td>
            <td style="padding:10px; border:1px solid #ccc; text-align:center;"><input type="number" id="marks_min_${idx}" value="33" class="input-premium" style="width:60px;"></td>
            <td style="padding:10px; border:1px solid #ccc; text-align:center;"><input type="number" id="marks_obt_${idx}" class="input-premium" style="width:80px;" placeholder="Marks"></td>
        </tr>`;
    });
};

window.saveStudentMarks = async () => {
    const studentId = document.getElementById("marks_student").value;
    if (!studentId) return alert("Please select a student.");
    const examTerm = document.getElementById("marks_exam_term") ? document.getElementById("marks_exam_term").value : "Annual Examination 2026";
    
    const subjects = window.examSubjects || ['English', 'Mathematics', 'Science', 'Social Studies', 'Hindi/Local'];
    const marksData = {};
    
    let totalObt = 0;
    let totalMax = 0;
    
    subjects.forEach((sub, idx) => {
        const max = parseFloat(document.getElementById(`marks_max_${idx}`).value) || 100;
        const min = parseFloat(document.getElementById(`marks_min_${idx}`).value) || 33;
        const obt = parseFloat(document.getElementById(`marks_obt_${idx}`).value) || 0;
        totalMax += max;
        totalObt += obt;
        let grade = obt >= (0.9*max) ? 'A+' : (obt >= (0.8*max) ? 'A' : (obt >= (0.7*max) ? 'B' : (obt >= min ? 'C' : 'F')));
        marksData[sub] = { max, min, obt, grade };
    });
    
    try {
        await setDoc(doc(db, "student_marks", studentId), {
            marks: marksData,
            totalMax,
            totalObt,
            examTerm: examTerm,
            updatedAt: new Date().toISOString()
        });
        alert("Marks saved successfully!");
    } catch (e) {
        console.error(e);
        alert("Error saving marks.");
    }
};

async function getTransparentSignature(sigUrl) {
    try {
        // Assuming backend is running on the same domain or configure full URL
        const res = await fetch('https://school-backend-zlgy.onrender.com/api/remove-sig-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: sigUrl })
        });
        const data = await res.json();
        return data.success ? data.base64 : sigUrl;
    } catch (e) {
        return sigUrl;
    }
}

window.generateMarksheet = async (st, marksDoc) => {
    const slipDiv = document.createElement('div');
    slipDiv.style.position = 'absolute';
    slipDiv.style.top = '-9999px';
    slipDiv.style.left = '-9999px';
    slipDiv.style.width = '210mm';
    slipDiv.style.padding = '40px';
    slipDiv.style.background = '#fff';
    slipDiv.style.color = '#000';
    slipDiv.style.fontFamily = 'Arial, sans-serif';
    
    const schoolName = currentSchoolName || 'School Name';
    const examTerm = marksDoc.examTerm || 'Annual Examination 2026';
    
    let rowsHtml = '';
    let totalMarks = marksDoc.totalObt || 0;
    let maxTotal = marksDoc.totalMax || 0;
    
    Object.keys(marksDoc.marks || {}).forEach(sub => {
        const m = marksDoc.marks[sub];
        rowsHtml += `<tr>
            <td style="padding:10px; border:1px solid #ccc;">${sub}</td>
            <td style="padding:10px; border:1px solid #ccc; text-align:center;">${m.max}</td>
            <td style="padding:10px; border:1px solid #ccc; text-align:center;">${m.min}</td>
            <td style="padding:10px; border:1px solid #ccc; text-align:center;">${m.obt}</td>
            <td style="padding:10px; border:1px solid #ccc; text-align:center;">${m.grade}</td>
        </tr>`;
    });
    
    const percentage = maxTotal > 0 ? ((totalMarks / maxTotal) * 100).toFixed(2) : 0;
    const finalResult = percentage >= 33 ? '<span style="color:#27ae60;">PASS</span>' : '<span style="color:#e53e3e;">FAIL</span>';
    
    slipDiv.innerHTML = `
        <div style="text-align:center; margin-bottom:20px; padding-bottom:10px; border-bottom:3px double #1e3c72;">
            <h1 style="margin:0; font-size:28px; color:#1e3c72; text-transform:uppercase;">${schoolName}</h1>
            <p style="margin:5px 0 0 0; font-size:16px; letter-spacing:2px; font-weight:bold;">ACADEMIC PERFORMANCE REPORT - ${examTerm.toUpperCase()}</p>
        </div>
        
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; border:1px solid #ccc; padding:15px; border-radius:5px;">
            <div style="flex:1;">
                <p style="margin:5px 0;"><strong>Student Name:</strong> ${st.name}</p>
                <p style="margin:5px 0;"><strong>Class/Section:</strong> ${st.class}</p>
                <p style="margin:5px 0;"><strong>Roll Number:</strong> ${st.rollNo || 'N/A'}</p>
            </div>
            <div style="flex:1; text-align:right;">
                <p style="margin:5px 0;"><strong>Parent/Guardian:</strong> ${(st.parentage || st.fatherName) || 'N/A'}</p>
                <p style="margin:5px 0;"><strong>Date of Birth:</strong> ${st.dob || 'N/A'}</p>
                <p style="margin:5px 0;"><strong>Reg No:</strong> ${st.regNo || 'N/A'}</p>
            </div>
        </div>
        
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <thead>
                <tr style="background:#1e3c72; color:#fff;">
                    <th style="padding:10px; border:1px solid #1e3c72; text-align:left;">SUBJECTS</th>
                    <th style="padding:10px; border:1px solid #1e3c72; text-align:center;">MAX MARKS</th>
                    <th style="padding:10px; border:1px solid #1e3c72; text-align:center;">MIN MARKS</th>
                    <th style="padding:10px; border:1px solid #1e3c72; text-align:center;">OBTAINED</th>
                    <th style="padding:10px; border:1px solid #1e3c72; text-align:center;">GRADE</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
                <tr style="background:#f4f4f4; font-weight:bold;">
                    <td style="padding:10px; border:1px solid #ccc;">GRAND TOTAL</td>
                    <td style="padding:10px; border:1px solid #ccc; text-align:center;">${maxTotal}</td>
                    <td style="padding:10px; border:1px solid #ccc; text-align:center;"></td>
                    <td style="padding:10px; border:1px solid #ccc; text-align:center;">${totalMarks}</td>
                    <td style="padding:10px; border:1px solid #ccc; text-align:center;"></td>
                </tr>
            </tbody>
        </table>
        
        <div style="display:flex; justify-content:space-between; margin-bottom:40px; padding:15px; background:#f9f9f9; border:1px solid #eee; border-radius:5px;">
            <div><strong>Overall Percentage:</strong> ${percentage}%</div>
            <div><strong>Final Result:</strong> ${finalResult}</div>
        </div>
    `;
    
    const renderSig = currentSignatureUrl && (!window.currentSigSettings || window.currentSigSettings.marksheet !== false);
    let finalSigSrc = "";
    if (renderSig) finalSigSrc = await getTransparentSignature(currentSignatureUrl);
    
    slipDiv.innerHTML += `
        <div style="display:flex; justify-content:space-between; margin-top:60px;">
            <div style="text-align:center; width:200px;">
                <div style="border-top:1px solid #000; padding-top:5px;">Class Teacher</div>
            </div>
            <div style="text-align:center; width:200px;">
                ${renderSig ? `<img src="${finalSigSrc}" style="height:50px; margin-bottom:5px;">` : `<div style="height:50px;"></div>`}
                <div style="border-top:1px solid #000; padding-top:5px;">Principal Signature</div>
            </div>
        </div>
    `;
    document.body.appendChild(slipDiv);
    await new Promise(r => setTimeout(r, 500));
    const canvas = await html2canvas(slipDiv, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    document.body.removeChild(slipDiv);
    return imgData;
};

window.generateBulkMarksheets = async (students) => {
    document.getElementById("cert-modal").style.display = "flex";
    if (document.getElementById("cert-printable")) document.getElementById("cert-printable").style.display = "none";
    if (document.getElementById("cert-preview-frame")) document.getElementById("cert-preview-frame").style.display = "none";
    if (document.getElementById("cert-actions")) document.getElementById("cert-actions").style.display = "none";
    document.getElementById("cert-generating-text").style.display = "block";
    document.getElementById("cert-generating-text").innerText = "Fetching Real Marks and Generating Marksheets...";

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        let pdfAdded = false;

        for (let st of students) {
            const docSnap = await getDoc(doc(db, "student_marks", st.id));
            if (!docSnap.exists()) {
                console.warn(`No marks found for ${st.name}`);
                continue; // Skip if no real data
            }
            
            const imgData = await window.generateMarksheet(st, docSnap.data());
            
            if (pdfAdded) pdf.addPage();
            
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdfAdded = true;
        }

        if (pdfAdded) {
            window.currentGeneratedPDF = pdf;
            window.currentGeneratedFileName = "Batch_Marksheets.pdf";
            const blobUrl = pdf.output('bloburl');
            document.getElementById("cert-preview-frame").src = blobUrl;
            document.getElementById("cert-preview-frame").style.display = "block";
            document.getElementById("cert-generating-text").style.display = "none";
            document.getElementById("cert-actions").style.display = "flex";
        } else {
            alert("No real marks data found for any of the selected students. Please enter marks in Academic Veto first.");
            closeCustomModal("cert-modal");
        }
    } catch (e) {
        alert("Failed to generate Marksheets. Error: " + e.message);
        closeCustomModal("cert-modal");
    }
};

window.updateStudentStatus = async (id) => { if(confirm("Approve admission?")) { await updateDoc(doc(db, "students", id), { status: "Approved" }); loadStudents(); } };
window.deleteStudent = async (id) => { if(confirm("Delete this student permanently?")) { await deleteDoc(doc(db, "students", id)); loadStudents(); } };

window.toggleStudentLock = async (id, state) => {
    if(confirm(state ? "Lock this student's account?" : "Unlock this student's account?")) {
        await updateDoc(doc(db, "students", id), { lockedOut: state }); loadStudents();
    }
};

window.openStudentModal = (id = null) => {
    document.getElementById("student-modal").style.display = "flex";
    document.getElementById("modal-student-photo-file").value = "";
    if (id) {
        document.getElementById("student-modal-title").innerText = "Edit Student";
        const st = window.fetchedStudents.find(s => s.id === id);
        document.getElementById("modal-student-id").value = id;
        document.getElementById("modal-student-name").value = st.name || "";
        document.getElementById("modal-student-father").value = (st.parentage || st.fatherName) || "";
        document.getElementById("dob").value = st.dob || "";
        document.getElementById("modal-student-class").value = st.class || "";
        document.getElementById("modal-student-address").value = st.address || "";
        document.getElementById("modal-student-rollNo").value = st.rollNo || "";
        document.getElementById("modal-student-regNo").value = st.regNo || "";
        document.getElementById("modal-student-mobile").value = st.mobile || "";
        document.getElementById("modal-student-emergency").value = st.emergencyNo || "";
        document.getElementById("modal-student-photo-url").value = st.photoUrl || "";
        if(st.photoUrl) {
            document.getElementById("modal-student-photo-preview").src = st.photoUrl;
            document.getElementById("modal-student-photo-preview").style.display = "block";
        } else {
            document.getElementById("modal-student-photo-preview").style.display = "none";
        }
    } else {
        document.getElementById("student-modal-title").innerText = "Add Student";
        document.getElementById("modal-student-id").value = "";
        document.getElementById("modal-student-name").value = "";
        document.getElementById("modal-student-father").value = "";
        document.getElementById("dob").value = "";
        document.getElementById("modal-student-class").value = "1st";
        document.getElementById("modal-student-address").value = "";
        document.getElementById("modal-student-rollNo").value = "";
        document.getElementById("modal-student-regNo").value = "";
        document.getElementById("modal-student-mobile").value = "";
        document.getElementById("modal-student-emergency").value = "";
        document.getElementById("modal-student-photo-url").value = "";
        document.getElementById("modal-student-photo-preview").style.display = "none";
    }
};

window.saveStudentModal = async () => {
    const id = document.getElementById("modal-student-id").value;
    
    let photoUrl = document.getElementById("modal-student-photo-url").value;
    if (document.getElementById("modal-student-photo-file").files.length > 0) {
        let uploadedUrl = await uploadToCloudinary("modal-student-photo-file", "modal-save-btn", "<i class='fas fa-save'></i> Save");
        if(uploadedUrl) photoUrl = uploadedUrl;
    }

    const data = {
        name: document.getElementById("modal-student-name").value.trim(),
        parentage: document.getElementById("modal-student-father").value.trim(),
        dob: document.getElementById("dob").value,
        address: document.getElementById("modal-student-address").value.trim(),
        class: document.getElementById("modal-student-class").value,
        rollNo: document.getElementById("modal-student-rollNo").value.trim(),
        regNo: document.getElementById("modal-student-regNo").value.trim(),
        mobile: document.getElementById("modal-student-mobile").value.trim(),
        emergencyNo: document.getElementById("modal-student-emergency").value.trim(),
        photoUrl: photoUrl.trim(),
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
                    dob: st.dob || "N/A",
                    parentage: (st.parentage || st.fatherName) || "N/A",
                    mobile: st.mobile || "N/A",
                    address: st.address || "N/A",
                    photoUrl: st.photoUrl || "https://via.placeholder.com/150"
                },
                themeColor: currentThemeColor || "#1e3c72",
                secondaryColor: currentSecondaryColor || "#ffffff",
                templateStyle: templateStyle,
                schoolName: schoolName,
                schoolEmergency: document.getElementById("school_emergency").value || "N/A",
                signatureUrl: (window.currentSigSettings && window.currentSigSettings.idCard === false) ? "" : currentSignatureUrl,
                schoolLogoUrl: document.getElementById('print_school_logo')?.src || document.getElementById('school-logo')?.src || "",
                schoolNameColor: document.getElementById('idSchoolNameColor')?.value || currentSchoolNameColor || "#ffffff",
                studentNameColor: document.getElementById('idStudentNameColor')?.value || currentStudentNameColor || "#d32f2f",
                detailsColor: document.getElementById('idDetailsColor')?.value || currentDetailsColor || "#333333",
                photoBgColor: document.getElementById('idPhotoBgColor')?.value || currentPhotoBgColor || "#ffffff"
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
    if(type === 'tc') bodyText = `This is to certify that Mr./Ms. <strong>${st.name}</strong>, son/daughter of <strong>${(st.parentage || st.fatherName)}</strong>, was a bona fide student of class <strong>${st.class}</strong> in this institution. He/She has paid all dues and is hereby granted this Transfer Certificate to pursue further education.`;
    if(type === 'character') bodyText = `This is to certify that <strong>${st.name}</strong>, son/daughter of <strong>${(st.parentage || st.fatherName)}</strong>, student of class <strong>${st.class}</strong>, bears a good moral character to the best of our knowledge. We wish him/her success in all future endeavors.`;
    if(type === 'bonafide') bodyText = `This is to certify that <strong>${st.name}</strong>, son/daughter of <strong>${(st.parentage || st.fatherName)}</strong>, is a bona fide student of this institution, currently studying in class <strong>${st.class}</strong> during the current academic session.`;
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
        await setDoc(doc(db, "users", cred.user.uid), { name, email, role: "staff", staffRole: role, plainPassword: pass, photoUrl: photoUrl, schoolId: currentSchoolId, status: "active", privileges: { attendance: true, marks: true, finance: false, notices: false, admissions: false, certs: false, exams: false, settings: false, view_finance: false, delete: false } });
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
    document.getElementById("priv_attendance").checked = p.attendance === true; 
    document.getElementById("priv_marks").checked = p.marks === true; 
    document.getElementById("priv_finance").checked = p.finance === true; 
    document.getElementById("priv_notices").checked = p.notices === true;
    document.getElementById("priv_admissions").checked = p.admissions === true;
    document.getElementById("priv_certs").checked = p.certs === true;
    document.getElementById("priv_exams").checked = p.exams === true;
    document.getElementById("priv_settings").checked = p.settings === true;
    document.getElementById("priv_view_finance").checked = p.view_finance === true;
    document.getElementById("priv_delete").checked = p.delete === true;
    document.getElementById("edit-staff-modal").style.display = "flex";
};

window.saveStaffEdits = async () => {
    const p = document.getElementById("edit_s_pass").value; const r = document.getElementById("edit_s_role").value;
    const privs = { 
        attendance: document.getElementById("priv_attendance").checked, 
        marks: document.getElementById("priv_marks").checked, 
        finance: document.getElementById("priv_finance").checked, 
        notices: document.getElementById("priv_notices").checked,
        admissions: document.getElementById("priv_admissions").checked,
        certs: document.getElementById("priv_certs").checked,
        exams: document.getElementById("priv_exams").checked,
        settings: document.getElementById("priv_settings").checked,
        view_finance: document.getElementById("priv_view_finance").checked,
        delete: document.getElementById("priv_delete").checked
    };
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

window.saveWhatsappLink = async () => {
    const link = document.getElementById("wa_group_link").value.trim();
    if (!link) return alert("Please enter the WhatsApp Group Link.");
    
    try {
        await updateDoc(doc(db, "schools", currentSchoolId), { whatsappGroup: link });
        alert("WhatsApp Group Link saved successfully!");
    } catch(e) {
        alert("Error saving link.");
    }
};

window.broadcastToWhatsapp = async () => {
    const link = document.getElementById("wa_group_link").value.trim();
    const msg = document.getElementById("wa_message").value.trim();
    
    if (!link) return alert("Please save the Official WhatsApp Group Link first.");
    if (!msg) return alert("Please enter a message to broadcast.");
    
    try {
        await navigator.clipboard.writeText(msg);
        alert("Message copied to clipboard! Opening WhatsApp Group...\nPlease paste the message into the chat.");
        window.open(link, "_blank");
    } catch (err) {
        alert("Failed to copy message. Please manually copy it before opening WhatsApp.");
        window.open(link, "_blank");
    }
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

// ================= BULK ACTION MODAL (ID, ADMIT, BONAFIDE) =================
window.currentBulkActionType = '';
window.pendingAdmitCardStudents = [];

window.openBulkActionModal = (type) => {
    window.currentBulkActionType = type;
    let title = "Batch Action";
    if(type === 'id') title = "<i class='fas fa-id-badge'></i> Bulk Generate ID Cards";
    if(type === 'admit') title = "<i class='fas fa-file-alt'></i> Bulk Generate Admit Cards";
    if(type === 'bonafide') title = "<i class='fas fa-graduation-cap'></i> Bulk Generate Bonafide Certificates";
    document.getElementById("bulk-modal-title").innerHTML = title;
    document.getElementById("bulk-action-class").value = "All";
    document.getElementById("bulk-select-all").checked = false;
    window.renderBulkActionStudents();
    document.getElementById("bulk-action-modal").style.display = "flex";
};

window.renderBulkActionStudents = () => {
    const cls = document.getElementById("bulk-action-class").value;
    let filtered = window.fetchedStudents.filter(s => s.status === 'Approved');
    if(cls !== "All") filtered = filtered.filter(s => s.class === cls);
    filtered.sort((a,b) => (Number(a.rollNo) || 999999) - (Number(b.rollNo) || 999999));

    const tbody = document.getElementById("bulk-action-list");
    if(filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:15px;'>No approved students found.</td></tr>";
        return;
    }
    let html = "";
    filtered.forEach(st => {
        html += `<tr>
            <td style="padding:10px;"><input type="checkbox" class="bulk-student-cb" value="${st.id}"></td>
            <td style="padding:10px;">${st.rollNo || 'N/A'}</td>
            <td style="padding:10px;">${st.name}</td>
            <td style="padding:10px;">${st.class}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
};

window.toggleAllBulkStudents = (el) => {
    document.querySelectorAll(".bulk-student-cb").forEach(cb => cb.checked = el.checked);
};

window.triggerBulkAction = () => {
    const checked = document.querySelectorAll(".bulk-student-cb:checked");
    if(checked.length === 0) return alert("Please select at least one student.");

    const selectedIds = Array.from(checked).map(cb => cb.value);
    const selectedStudents = window.fetchedStudents.filter(st => selectedIds.includes(st.id));

    closeCustomModal('bulk-action-modal');

    if(window.currentBulkActionType === 'id') {
        window.generateBatchIDCards(selectedStudents);
    } else if(window.currentBulkActionType === 'marksheet') {
        window.generateBulkMarksheets(selectedStudents);
    } else if(window.currentBulkActionType === 'admit') {
        const hasDefaulters = selectedStudents.some(st => st.dueBalance && st.dueBalance > 0);
        if(hasDefaulters) {
            window.pendingAdmitCardStudents = selectedStudents;
            document.getElementById("defaulter-admit-modal").style.display = "flex";
        } else {
            window.pendingAdmitCardStudents = selectedStudents;
            window.proceedAdmitCards('disable');
        }
    } else if(window.currentBulkActionType === 'bonafide') {
        window.triggerBulkBonafide(selectedStudents);
    }
};

window.triggerBulkBonafide = async (students) => {
    document.getElementById("cert-modal").style.display = "flex";
    if (document.getElementById("cert-printable")) document.getElementById("cert-printable").style.display = "none";
    if (document.getElementById("cert-preview-frame")) document.getElementById("cert-preview-frame").style.display = "none";
    if (document.getElementById("cert-actions")) document.getElementById("cert-actions").style.display = "none";
    document.getElementById("cert-generating-text").style.display = "block";
    document.getElementById("cert-generating-text").innerText = "Compiling Batch Bonafide PDF...";

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');
    let pageCount = 0;

    for(let st of students) {
        document.getElementById("cert-school-name").innerText = currentSchoolName;
        document.getElementById("cert-school-name").style.color = currentThemeColor;
        document.getElementById("cert-title").innerText = "BONAFIDE CERTIFICATE";
        document.getElementById("cert-date").innerText = new Date().toLocaleDateString();
        document.getElementById("cert-body").innerHTML = `This is to certify that <strong>${st.name}</strong>, son/daughter of <strong>${(st.parentage || st.fatherName) || 'N/A'}</strong>, is a bona fide student of this institution, currently studying in class <strong>${st.class}</strong> during the current academic session.`;

        if(currentSignatureUrl && (!window.currentSigSettings || window.currentSigSettings.bonafide !== false)) {
            const finalSigSrc = await getTransparentSignature(currentSignatureUrl);
            document.getElementById("cert_sig").src = finalSigSrc;
            document.getElementById("cert_sig").style.mixBlendMode = "normal"; // override inline CSS
            document.getElementById("cert_sig").style.display = "block";
        } else {
            document.getElementById("cert_sig").style.display = "none";
        }

        document.getElementById("cert-printable").style.display = "flex";

        await new Promise(r => setTimeout(r, 500));

        const canvas = await html2canvas(document.getElementById("cert-printable"), { useCORS: true, scale: 2 });
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        document.getElementById("cert-printable").style.display = "none";

        if(pageCount > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 10, 10, 277, 190);
        pageCount++;
    }

    if (pageCount > 0) {
        window.currentGeneratedPDF = pdf;
        window.currentGeneratedFileName = "Batch_Bonafide_Certificates.pdf";
        const blobUrl = pdf.output('bloburl');
        document.getElementById("cert-preview-frame").src = blobUrl;
        document.getElementById("cert-preview-frame").style.display = "block";
        document.getElementById("cert-generating-text").style.display = "none";
        document.getElementById("cert-actions").style.display = "flex";
    } else {
        closeCustomModal("cert-modal");
    }
};

window.downloadCertPDF = () => {
    if(window.currentGeneratedPDF) {
        window.currentGeneratedPDF.save(window.currentGeneratedFileName || "Document.pdf");
    }
};

window.downloadAllIdsAsPDF = () => {
    const images = document.getElementById("bulk-id-grid").querySelectorAll("img");
    if(images.length === 0) return alert("No ID cards generated yet.");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    images.forEach((img, index) => {
        if(index > 0) pdf.addPage();
        pdf.addImage(img.src, 'PNG', 10, 10, 54, 86);
    });
    pdf.save("Batch_ID_Cards.pdf");
};

// ================= BULK ADMIT CARDS =================
window.proceedAdmitCards = async (mode) => {
    document.getElementById("defaulter-admit-modal").style.display = "none";
    let students = window.pendingAdmitCardStudents;
    
    if (mode === 'disable') {
        students = students.filter(st => !(st.dueBalance && st.dueBalance > 0));
        if (students.length === 0) return alert("No paid students available to generate admit cards.");
    }

    document.getElementById("bulk-id-modal").style.display = "block";
    document.getElementById("bulk-generating-text").style.display = "block";
    document.getElementById("bulk-generating-text").innerText = "Generating Admit Cards... Please wait";
    document.getElementById("bulk-id-grid").innerHTML = "";

    let schoolName = currentSchoolName || document.getElementById('school-name')?.innerText || "SCHOOL NAME";
    let logoUrl = document.getElementById('school-logo')?.src || "";
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const template = document.getElementById("admit-card-template");
    
    document.getElementById("admit-school").innerText = schoolName.toUpperCase();
    if(logoUrl) document.getElementById("admit-logo").src = logoUrl;
    
    if (currentSignatureUrl && window.currentSigSettings && window.currentSigSettings.admit !== false) {
        const finalSigSrc = await getTransparentSignature(currentSignatureUrl);
        document.getElementById("admit-sig").src = finalSigSrc;
        document.getElementById("admit-sig").style.mixBlendMode = "normal"; // override inline CSS
        document.getElementById("admit-sig").style.display = "block";
    } else {
        document.getElementById("admit-sig").style.display = "none";
    }

    const uniqueClasses = [...new Set(students.map(st => st.class))];
    const classSchedules = {};
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
    for (let cls of uniqueClasses) {
        if(cls) {
            const fieldKey = "examSchedule_" + cls;
            if(schoolData[fieldKey] && Array.isArray(schoolData[fieldKey])) {
                classSchedules[cls] = schoolData[fieldKey];
            } else {
                try {
                    const snap = await getDoc(doc(db, "schools", currentSchoolId, "examSchedules", cls));
                    classSchedules[cls] = snap.exists() ? (snap.data().schedule || []) : [];
                } catch(e) { classSchedules[cls] = []; }
            }
        }
    }

    try {
        for (let i = 0; i < students.length; i++) {
            const st = students[i];
            document.getElementById("admit-name").innerText = st.name || "N/A";
            document.getElementById("admit-class").innerText = st.class || "N/A";
            document.getElementById("admit-roll").innerText = st.rollNo || "N/A";
            document.getElementById("admit-fname").innerText = (st.parentage || st.fatherName) || "N/A";
            document.getElementById("admit-mname").innerText = st.motherName || "N/A";
            document.getElementById("admit-dob").innerText = st.dob || "N/A";
            
            const fallbackImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
            document.getElementById("admit-photo").src = st.photoUrl || fallbackImg;

            const watermark = document.getElementById("admit-watermark");
            if (mode === 'enable' && st.dueBalance && st.dueBalance > 0) {
                watermark.style.display = "block";
            } else {
                watermark.style.display = "none";
            }

            const schedRows = document.getElementById("admit-card-tbody").querySelectorAll("tr");
            const sched = classSchedules[st.class] || [];
            for(let j=0; j<6; j++) {
                const tds = schedRows[j].querySelectorAll("td");
                let dStr = sched[j]?.date || "";
                if (dStr && dStr.includes("-")) {
                    let parts = dStr.split("-");
                    if (parts.length === 3) dStr = parts[2] + '/' + parts[1] + '/' + parts[0];
                }
                tds[0].innerText = dStr;
                tds[1].innerText = sched[j]?.subject || "";
                tds[2].innerText = sched[j]?.timing || "";
            }

            await new Promise(r => setTimeout(r, 200)); 

            const canvas = await html2canvas(template, { useCORS: true, scale: 2 });
            const imgData = canvas.toDataURL("image/jpeg");
            
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 10, 10, 190, 260);

            const imgElement = document.createElement("img");
            imgElement.src = imgData;
            imgElement.style.width = "100%";
            imgElement.style.borderRadius = "8px";
            imgElement.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
            document.getElementById("bulk-id-grid").appendChild(imgElement);
        }

        document.getElementById("bulk-generating-text").style.display = "none";
        pdf.save("Batch_Admit_Cards.pdf");

    } catch(e) {
        document.getElementById("bulk-generating-text").style.display = "none";
        alert("Failed to generate Admit Cards. Error: " + e.message);
    }
};

window.generateBatchIDCards = async (students) => {
    document.getElementById("bulk-id-modal").style.display = "block";
    document.getElementById("bulk-generating-text").style.display = "block";
    document.getElementById("bulk-generating-text").innerText = "Generating ID Cards...";
    document.getElementById("bulk-id-grid").innerHTML = "";

    try {
        let schoolName = currentSchoolName || document.getElementById('school-name')?.innerText || "ABC SCHOOL NAME";
        const templateStyle = currentTemplateStyle || "wave";
        const fallbackImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

        const response = await fetch("https://school-backend-zlgy.onrender.com/api/bulk-generate-id-cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                themeColor: currentThemeColor || "#1e3c72",
                secondaryColor: currentSecondaryColor || "#ffffff",
                templateStyle: templateStyle,
                schoolName: schoolName,
                schoolEmergency: document.getElementById("school_emergency").value || "N/A",
                emergencyMobile: document.getElementById("school_emergency_mobile")?.value || "N/A",
                signatureUrl: (window.currentSigSettings && window.currentSigSettings.idCard === false) ? "" : (currentSignatureUrl || ""),
                schoolLogoUrl: document.getElementById('print_school_logo')?.src || document.getElementById('school-logo')?.src || "",
                schoolNameColor: document.getElementById('idSchoolNameColor')?.value || currentSchoolNameColor || "#ffffff",
                studentNameColor: document.getElementById('idStudentNameColor')?.value || currentStudentNameColor || "#d32f2f",
                detailsColor: document.getElementById('idDetailsColor')?.value || currentDetailsColor || "#333333",
                photoBgColor: document.getElementById('idPhotoBgColor')?.value || currentPhotoBgColor || "#ffffff",
                students: students.map(st => ({
                    id: st.id || st.regNo,
                    regNo: st.regNo || "N/A",
                    rollNo: st.rollNo || "N/A",
                    name: st.name,
                    class: st.class,
                    dob: st.dob || "N/A",
                    parentage: (st.parentage || st.fatherName) || "N/A",
                    mobile: st.mobile || "N/A",
                    address: st.address || "N/A",
                    photoUrl: st.photoUrl || fallbackImg
                }))
            })
        });

        const data = await response.json();
        if(data.success && data.images) {
            const { jsPDF } = window.jspdf;
            
            const paperSizeEl = document.getElementById("bulk-paper-size");
            let pFormat = 'a4';
            if (paperSizeEl && paperSizeEl.value) { pFormat = paperSizeEl.value; }
            
            const pdf = new jsPDF('p', 'mm', pFormat);
            
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            
            // Standard ID Card dimensions in mm
            const cardW = 54;
            const cardH = 86;
            const marginX = 10;
            const marginY = 10;
            const gap = 5;
            
            const cols = Math.floor((pageWidth - 2*marginX + gap) / (cardW + gap));
            const rows = Math.floor((pageHeight - 2*marginY + gap) / (cardH + gap));
            const cardsPerPage = cols * rows;
            
            let currentCardInPage = 0;
            
            data.images.forEach((imgBase64, index) => {
                if (index > 0 && currentCardInPage >= cardsPerPage) {
                    pdf.addPage();
                    currentCardInPage = 0;
                }
                
                const colIdx = currentCardInPage % cols;
                const rowIdx = Math.floor(currentCardInPage / cols);
                
                const xPos = marginX + colIdx * (cardW + gap);
                const yPos = marginY + rowIdx * (cardH + gap);
                
                pdf.addImage(imgBase64, 'PNG', xPos, yPos, cardW, cardH);
                
                currentCardInPage++;

                const imgElement = document.createElement("img");
                imgElement.src = imgBase64;
                imgElement.style.width = "100%";
                imgElement.style.borderRadius = "8px";
                document.getElementById("bulk-id-grid").appendChild(imgElement);
            });
            
            pdf.save("Batch_ID_Cards.pdf");
        } else {
            alert("API Error: " + data.error);
        }
    } catch (e) {
        alert("Failed to generate ID Cards. Error: " + e.message);
     } finally {
      document.getElementById("bulk-generating-text").style.display = "none";
 }
 };
// ==========================================
// ZERO-COMMISSION FEE APPROVAL MODULE
// ==========================================

window.loadFeeVerifications = async () => {
    try {
        const snap = await getDocs(query(collection(db, "fee_verifications"), where("schoolId", "==", currentSchoolId)));
        let html = "";
        const now = new Date();
        
        let verifications = [];
        snap.forEach(d => verifications.push({ id: d.id, ...d.data() }));
        
        // Sort by newest first
        verifications.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        verifications.forEach(data => {
            // Auto-hide successful verifications older than 24 hours
            if (data.status === "Successful") {
                const ageHours = (now - data.createdAt.toDate()) / (1000 * 60 * 60);
                if (ageHours > 24) return; 
            }

            const isPending = data.status === "Pending";
            const statusClass = isPending ? "color: #d97706;" : "color: #059669;";
            const btnHtml = isPending ? 
                `<button class="action-btn" style="background:#059669; padding: 5px 10px; font-size:12px;" onclick="approveFeeVerification('${data.id}', '${data.studentId}', '${data.studentName}', ${data.amount})"><i class="fas fa-check"></i> Approve & Record</button>` :
                `<span style="color:#059669; font-weight:bold;"><i class="fas fa-check-circle"></i> Approved</span>`;

            html += `<tr>
                <td>${data.createdAt.toDate().toLocaleString()}</td>
                <td><strong>${data.studentName}</strong><br><small>Reg: ${data.regNo}</small></td>
                <td style="font-family: monospace;">${data.utr}</td>
                <td><strong>Rs. ${data.amount}</strong></td>
                <td><a href="${data.screenshotUrl}" target="_blank" style="color:#3182ce; text-decoration:none;"><i class="fas fa-image"></i> View Proof</a></td>
                <td style="${statusClass}">${btnHtml}</td>
            </tr>`;
        });

        document.getElementById("fee-verifications-body").innerHTML = html || '<tr><td colspan="6" style="text-align:center;">No pending fee verifications.</td></tr>';
    } catch(e) {
        console.error("Fee verification load error:", e);
    }
};

window.approveFeeVerification = async (verificationId, studentId, studentName, amount) => {
    if(!confirm(`Approve Rs.${amount} fee payment for ${studentName}? This will update the student's balance and ledger.`)) return;
    
    try {
        const batch = writeBatch(db);
        
        // 1. Mark verification successful
        const vRef = doc(db, "fee_verifications", verificationId);
        batch.update(vRef, { status: "Successful", updatedAt: serverTimestamp() });
        
        // 2. Add to transaction ledger
        const tRef = doc(collection(db, "transactions"));
        batch.set(tRef, {
            schoolId: currentSchoolId,
            type: "Fee",
            personId: studentId,
            personName: studentName,
            amount: Number(amount),
            mode: "UPI Manual QR",
            date: new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp()
        });
        
        // 3. Decrease due balance in student doc
        const sRef = doc(db, "students", studentId);
        batch.update(sRef, { dueBalance: increment(-amount) });
        
        await batch.commit();
        alert("Payment Approved! Ledger updated and student balance reduced.");
        loadFeeVerifications();
        loadTransactions();
    } catch(e) {
        alert("Error approving payment: " + e.message);
    }
};
window.openExamScheduler = () => {
    document.getElementById("exam-scheduler-modal").style.display = "flex";
    window.loadExamSchedule();
};

window.lastExamScheduleCache = null;

window.loadExamSchedule = async () => {
    const cls = document.getElementById("scheduler-class-select").value;
    const targetClass = (cls === "All") ? "Nursery" : cls;
    try {
        const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
        if(schoolSnap.exists()) {
            const schoolData = schoolSnap.data();
            const fieldKey = "examSchedule_" + targetClass;
            if(schoolData[fieldKey] && Array.isArray(schoolData[fieldKey])) {
                populateSchedulerTable(schoolData[fieldKey]);
                window.lastExamScheduleCache = schoolData[fieldKey];
                return;
            }
        }
        const docSnap = await getDoc(doc(db, "schools", currentSchoolId, "examSchedules", targetClass));
        if (docSnap.exists()) {
            const data = docSnap.data().schedule || [];
            populateSchedulerTable(data);
            window.lastExamScheduleCache = data;
        } else if (window.lastExamScheduleCache) {
            populateSchedulerTable(window.lastExamScheduleCache);
        } else {
            populateSchedulerTable([]);
        }
    } catch(e) { console.error(e); }
};

window.populateSchedulerTable = (data) => {
    const dates = document.querySelectorAll(".sched-date");
    const subjs = document.querySelectorAll(".sched-subj");
    const times = document.querySelectorAll(".sched-time");
    for(let i=0; i<6; i++) {
        dates[i].value = data[i]?.date || "";
        subjs[i].value = data[i]?.subject || "";
        times[i].value = data[i]?.timing || "";
    }
};

window.updateSchedulerDatalists = () => {
    const subjects = new Set(window.examSubjects || []);
    const timings = new Set();
    document.querySelectorAll(".sched-subj").forEach(el => {
        if(el.value.trim()) subjects.add(el.value.trim().toUpperCase());
    });
    document.querySelectorAll(".sched-time").forEach(el => {
        if(el.value.trim()) timings.add(el.value.trim());
    });
    
    const subjList = document.getElementById("subjectsList");
    if(subjList) {
        subjList.innerHTML = "";
        subjects.forEach(val => subjList.innerHTML += `<option value="${val}"></option>`);
    }
    
    const timeList = document.getElementById("timingsList");
    if(timeList) {
        timeList.innerHTML = "";
        timings.forEach(val => timeList.innerHTML += `<option value="${val}"></option>`);
    }
};
window.saveExamSchedule = async () => {
    const cls = document.getElementById("scheduler-class-select").value;
    if(!currentSchoolId) return alert("School ID not found. Please re-login.");

    const dates = document.querySelectorAll(".sched-date");
    const subjs = document.querySelectorAll(".sched-subj");
    const times = document.querySelectorAll(".sched-time");

    const schedule = [];
    for(let i=0; i<6; i++) {
        schedule.push({
            date: dates[i].value.trim(),
            subject: subjs[i].value.trim(),
            timing: times[i].value.trim()
        });
    }

    try {
        if(cls === "All") {
            const allClasses = ["Nursery","LKG","UKG","1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th","12th"];
            const scheduleMap = {};
            allClasses.forEach(c => { scheduleMap["examSchedule_" + c] = schedule; });
            await updateDoc(doc(db, "schools", currentSchoolId), scheduleMap);
            alert("Schedule saved for ALL Classes!");
        } else {
            const fieldKey = "examSchedule_" + cls;
            await updateDoc(doc(db, "schools", currentSchoolId), { [fieldKey]: schedule });
            alert("Schedule saved for Class " + cls);
        }
        window.lastExamScheduleCache = schedule;
    } catch(e) {
        console.error("Schedule save error:", e);
        alert("Error: " + e.message);
    }
};

window.openGlobalBonafideModal = () => {
    const sel = document.getElementById("global-bonafide-student");
    sel.innerHTML = '<option value="">-- Select a Student --</option>';
    window.fetchedStudents.forEach(st => {
        sel.innerHTML += `<option value="${st.id}">${st.name} (${st.class})</option>`;
    });
    document.getElementById("global-bonafide-modal").style.display = "flex";
};

window.triggerGlobalBonafide = () => {
    const studentId = document.getElementById("global-bonafide-student").value;
    if(!studentId) return alert("Please select a student first.");
    closeCustomModal("global-bonafide-modal");
    window.generateCertificate(studentId, 'bonafide');
};

let currentDMStudentId = null;
window.openDirectMessageModal = (id, name) => {
    currentDMStudentId = id;
    document.getElementById("dm-student-name").innerText = name;
    document.getElementById("dm-message-body").value = "";
    document.getElementById("direct-message-modal").style.display = "flex";
};

window.sendDirectMessage = async () => {
    const msg = document.getElementById("dm-message-body").value.trim();
    if(!msg) return alert("Please type a message.");
    try {
        await addDoc(collection(db, "direct_messages"), {
            schoolId: currentSchoolId,
            studentId: currentDMStudentId,
            message: msg,
            sender: "Chairman",
            timestamp: serverTimestamp(),
            read: false
        });
        alert("Message sent successfully!");
        closeCustomModal("direct-message-modal");
    } catch(e) {
        alert("Failed to send message: " + e.message);
    }
};

// --- EXAM SCHEDULER: MASTER SUBJECTS ---
window.factoryDefaultSubjects = ["ENGLISH", "MATHS", "SCIENCE", "SOCIAL SCIENCE", "HINDI", "URDU", "COMPUTER", "GENERAL KNOWLEDGE", "DRAWING"];
window.examSubjects = [];

window.toggleSubjectSettings = () => {
    const panel = document.getElementById("subject-settings-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    if(panel.style.display === "block") window.renderMasterSubjects();
};

window.renderMasterSubjects = () => {
    const list = document.getElementById("master-subjects-list");
    list.innerHTML = "";
    window.examSubjects.forEach((sub, i) => {
        list.innerHTML += `<div style="background:#e2e8f0; padding:5px 10px; border-radius:15px; font-size:12px; display:flex; align-items:center; gap:5px;">
            ${sub} <i class="fas fa-times" style="color:#ef4444; cursor:pointer;" onclick="window.deleteMasterSubject(${i})"></i>
        </div>`;
    });
};

window.addMasterSubject = async () => {
    const val = document.getElementById("new-custom-subject").value.trim().toUpperCase();
    if(!val) return;
    if(window.examSubjects.includes(val)) return alert("Subject already exists!");
    window.examSubjects.push(val);
    document.getElementById("new-custom-subject").value = "";
    window.renderMasterSubjects();
    window.updateSchedulerDatalists();
    await updateDoc(doc(db, "schools", currentSchoolId), { examSubjects: window.examSubjects });
};

window.deleteMasterSubject = async (index) => {
    window.examSubjects.splice(index, 1);
    window.renderMasterSubjects();
    window.updateSchedulerDatalists();
    await updateDoc(doc(db, "schools", currentSchoolId), { examSubjects: window.examSubjects });
};

window.resetMasterSubjects = async () => {
    if(!confirm("Reset to factory defaults? All custom subjects will be lost.")) return;
    window.examSubjects = [...window.factoryDefaultSubjects];
    window.renderMasterSubjects();
    window.updateSchedulerDatalists();
    await updateDoc(doc(db, "schools", currentSchoolId), { examSubjects: window.examSubjects });
};



// --- GLOBAL BONAFIDE BATCH LOGIC ---
window.renderGlobalBonafideStudents = () => {
    const cls = document.getElementById("global-bonafide-class").value;
    const tbody = document.getElementById("global-bonafide-tbody");
    tbody.innerHTML = "";
    
    let filtered = window.fetchedStudents.filter(s => s.status === 'Approved');
    if (cls !== "All") filtered = filtered.filter(s => s.class === cls);
    
    if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:10px;'>No approved students found.</td></tr>";
        return;
    }
    
    filtered.forEach(st => {
        tbody.innerHTML += `<tr>
            <td style="padding: 10px;"><input type="checkbox" class="bonafide-checkbox" value="${st.id}"></td>
            <td style="padding: 10px;">${st.name}</td>
            <td style="padding: 10px;">${st.class}</td>
            <td style="padding: 10px;">${st.rollNo || 'N/A'}</td>
        </tr>`;
    });
};

window.toggleAllBonafideStudents = (el) => {
    document.querySelectorAll(".bonafide-checkbox").forEach(cb => cb.checked = el.checked);
};

window.openGlobalBonafideModal = () => {
    document.getElementById("global-bonafide-class").value = "All";
    document.getElementById("global-bonafide-select-all").checked = false;
    window.renderGlobalBonafideStudents();
    document.getElementById("global-bonafide-modal").style.display = "flex";
};

window.triggerGlobalBonafideBatch = async () => {
    const checked = document.querySelectorAll(".bonafide-checkbox:checked");
    if (checked.length === 0) return alert("Please select at least one student.");
    
    document.getElementById("global-bonafide-modal").style.display = "none";
    document.getElementById("cert-modal").style.display = "flex";
    document.getElementById("cert-printable").style.display = "none";
    document.getElementById("cert-actions").style.display = "none";
    document.getElementById("cert-generating-text").style.display = "block";
    document.getElementById("cert-generating-text").innerText = "Compiling Batch Bonafide PDF...";
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4'); // Using landscape for certificates
    
    let pageCount = 0;
    
    for (let cb of checked) {
        const id = cb.value;
        const st = window.fetchedStudents.find(s => s.id === id);
        if (!st) continue;
        
        document.getElementById("cert-school-name").innerText = currentSchoolName; 
        document.getElementById("cert-school-name").style.color = currentThemeColor;
        document.getElementById("cert-title").innerText = "BONAFIDE CERTIFICATE"; 
        document.getElementById("cert-date").innerText = new Date().toLocaleDateString();
        
        let bodyText = `This is to certify that <strong>${st.name}</strong>, son/daughter of <strong>${(st.parentage || st.fatherName)}</strong>, is a bona fide student of this institution, currently studying in class <strong>${st.class}</strong> during the current academic session.`;
        document.getElementById("cert-body").innerHTML = bodyText;
        
        // Wait for render
        document.getElementById("cert-printable").style.display = "flex";
        
        const canvas = await html2canvas(document.getElementById("cert-printable"), { useCORS: true, scale: 2 });
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        
        document.getElementById("cert-printable").style.display = "none";
        
        if (pageCount > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 10, 10, 277, 190);
        pageCount++;
    }
    
    pdf.save("Batch_Bonafide_Certificates.pdf");
    document.getElementById("cert-modal").style.display = "none";
};

// ================= PHASE 2: TRANSPORT MANAGER =================
window.loadTransportRoutes = async () => {
    try {
        const snap = await getDocs(query(collection(db, "bus_routes"), where("schoolId", "==", currentSchoolId)));
        let html = "";
        snap.forEach(d => {
            const dt = d.data();
            html += `<tr class="hover-row">
                <td><strong>${dt.routeName}</strong></td>
                <td>${dt.driverName}</td>
                <td>${dt.contact}</td>
                <td>₹ ${dt.fee}</td>
                <td><button class="action-btn" style="background:#e53e3e; padding:5px 10px;" onclick="deleteBusRoute('${d.id}')"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        document.getElementById("transport-body").innerHTML = html || "<tr><td colspan='5' style='text-align:center;'>No routes found.</td></tr>";
    } catch(e) { console.error(e); }
};

window.saveBusRoute = async () => {
    const rn = document.getElementById("transportRouteName").value.trim();
    const dn = document.getElementById("transportDriverName").value.trim();
    const dc = document.getElementById("transportDriverContact").value.trim();
    const fe = document.getElementById("transportBusFee").value.trim();
    if(!rn || !dn || !dc || !fe) return alert("Fill all fields.");
    try {
        await addDoc(collection(db, "bus_routes"), {
            schoolId: currentSchoolId, routeName: rn, driverName: dn, contact: dc, fee: Number(fe), createdAt: new Date().toISOString()
        });
        alert("Route saved!");
        document.getElementById("transportRouteName").value = "";
        document.getElementById("transportDriverName").value = "";
        document.getElementById("transportDriverContact").value = "";
        document.getElementById("transportBusFee").value = "";
        loadTransportRoutes();
    } catch(e) { alert("Error saving route"); }
};

window.deleteBusRoute = async (id) => {
    if(!confirm("Delete this route?")) return;
    try { await deleteDoc(doc(db, "bus_routes", id)); loadTransportRoutes(); } catch(e) { alert("Error deleting route."); }
};

// ================= PHASE 2: INVENTORY MANAGER =================
window.loadInventory = async () => {
    try {
        const snap = await getDocs(query(collection(db, "inventory"), where("schoolId", "==", currentSchoolId)));
        let html = "";
        snap.forEach(d => {
            const dt = d.data();
            html += `<tr class="hover-row">
                <td><strong>${dt.itemName}</strong></td>
                <td><span class="status-badge" style="background:#3182ce;">${dt.category}</span></td>
                <td>${dt.quantity}</td>
                <td>${dt.dateAcquired}</td>
                <td><button class="action-btn" style="background:#e53e3e; padding:5px 10px;" onclick="deleteAsset('${d.id}')"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        document.getElementById("inventory-body").innerHTML = html || "<tr><td colspan='5' style='text-align:center;'>No assets found.</td></tr>";
    } catch(e) { console.error(e); }
};

window.logAsset = async () => {
    const iname = document.getElementById("inventoryItemName").value.trim();
    const cat = document.getElementById("inventoryCategory").value;
    const qty = document.getElementById("inventoryQuantity").value.trim();
    const dt = document.getElementById("inventoryDate").value;
    if(!iname || !qty || !dt) return alert("Fill all fields.");
    try {
        await addDoc(collection(db, "inventory"), {
            schoolId: currentSchoolId, itemName: iname, category: cat, quantity: Number(qty), dateAcquired: dt, createdAt: new Date().toISOString()
        });
        alert("Asset saved!");
        document.getElementById("inventoryItemName").value = "";
        document.getElementById("inventoryQuantity").value = "";
        document.getElementById("inventoryDate").value = "";
        loadInventory();
    } catch(e) { alert("Error saving asset"); }
};

window.deleteAsset = async (id) => {
    if(!confirm("Delete this asset?")) return;
    try { await deleteDoc(doc(db, "inventory", id)); loadInventory(); } catch(e) { alert("Error deleting asset."); }
};

// ================= PHASE 2: ATTENDANCE ENGINE =================
window.loadClassForAttendance = () => {
    const cls = document.getElementById("attendanceClassSelect").value;
    const dt = document.getElementById("attendanceDateSelect").value;
    if(!cls || !dt) return alert("Select both class and date.");
    
    document.getElementById("attendance-roster-panel").style.display = "block";
    const stds = (window.fetchedStudents || []).filter(s => s.class === cls && s.status === "Approved");
    
    let html = "";
    stds.forEach(st => {
        html += `<tr class="hover-row">
            <td>${st.rollNo || 'N/A'}</td>
            <td><strong>${st.name}</strong></td>
            <td>${(st.parentage || st.fatherName) || 'N/A'}</td>
            <td style="text-align:center;">
                <label style="margin-right:10px;"><input type="radio" name="att_${st.id}" value="Present" checked> Present</label>
                <label><input type="radio" name="att_${st.id}" value="Absent"> Absent</label>
            </td>
        </tr>`;
    });
    document.getElementById("attendance-roster-body").innerHTML = html || "<tr><td colspan='4' style='text-align:center;'>No approved students in this class.</td></tr>";
};

window.saveDailyAttendance = async () => {
    const cls = document.getElementById("attendanceClassSelect").value;
    const dt = document.getElementById("attendanceDateSelect").value;
    if(!cls || !dt) return alert("Select both class and date.");
    
    const stds = (window.fetchedStudents || []).filter(s => s.class === cls && s.status === "Approved");
    if(stds.length === 0) return alert("No students to save.");
    
    let records = {};
    stds.forEach(st => {
        const selected = document.querySelector(`input[name="att_${st.id}"]:checked`);
        records[st.id] = selected ? selected.value : "Absent";
    });
    
    try {
        const attId = currentSchoolId + "_" + cls + "_" + dt;
        await setDoc(doc(db, "attendance", attId), {
            schoolId: currentSchoolId,
            class: cls,
            date: dt,
            records: records,
            updatedAt: new Date().toISOString()
        });
        alert("Attendance saved!");
        loadStudents();
    } catch(e) { console.error(e); alert("Error saving attendance."); }
};