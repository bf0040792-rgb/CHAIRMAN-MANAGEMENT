// ============================================================================
// CHAIRMAN SCHOOL PORTAL - NATIVE SUPABASE SDK v2 (@supabase/supabase-js)
// ----------------------------------------------------------------------------
// The legacy Firebase / Firestore adapter layer is gone. Everything below talks
// to Supabase directly:
//   * data      -> PostgREST builders (.from().select()/.insert()/.upsert()
//                  /.update()/.delete())
//   * live sync -> Supabase Realtime channels (.channel().on('postgres_changes'))
//   * login     -> GoTrue (supabaseClient.auth.signInWithPassword / signOut /
//                  onAuthStateChange)
// The SDK bundle itself is loaded from the CDN in index.html (window.supabase).
// ============================================================================
const supabaseUrl = 'https://ynlcbpxcsnfxqrogizns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubGNicHhjc25meHFyb2dpem5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDMxNjMsImV4cCI6MjEwMzQ3OTE2M30.sx5iFeugOuLBt4pqt0-8_4VOGz1yWa7HQWl4NyGCWkE';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'coreedu-school-auth'
    }
});

// Provisioning a login for a new staff member must never replace or sign out the
// chairman's own session, so sign-up runs on a second, non-persisting Supabase client.
const staffAuthClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

// Supabase has no `auth.currentUser`: the signed-in user id is tracked from the
// auth session so the audit columns (createdBy / updatedBy / resolvedBy ...) keep working.
let currentUserId = null;

// PostgREST returns plain ISO timestamps, so ordering/formatting parses them as dates.
function toEpochMillis(value) {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

window.portalModuleLoaded = true;

let currentSchoolId = ""; let currentSchoolName = ""; let currentSignatureUrl = ""; let currentThemeColor = "#1e3c72"; let currentSecondaryColor = "#ffffff"; let currentTemplateStyle = "wave"; let currentIdTemplateUrl = "";
let currentSchoolNameColor = "#ffffff"; let currentStudentNameColor = "#d32f2f"; let currentDetailsColor = "#333333"; let currentPhotoBgColor = "#ffffff";
window.fetchedStudents = []; window.fetchedStaff = []; let currentEditStaffId = null;
window.selectedStudentIds = new Set();
window.currentFeatureSettings = {};
const DEFAULT_FEATURE_SETTINGS = {
    school: {
        dashboard: true, students: true, studentTransfer: true, admitCards: true, staff: true, finance: true,
        feeApprovals: true, academics: true, notices: true, communicationHub: true, qrFee: true,
        admitCardModule: true, whatsapp: true, transport: true, inventory: true, dailyAttendance: true,
        studentPortalFeatures: true, settings: true
    },
    modules: { qrFee: true, admitCard: true, whatsapp: true, transport: true, inventory: true, attendance: true },
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

const FEATURE_TOGGLE_META = {
    modules: {
        label: "Admin Modules",
        items: {
            qrFee: "QR Fee System",
            admitCard: "Admit Card Module",
            whatsapp: "WhatsApp / Group Link",
            transport: "Transport Manager",
            inventory: "Inventory Manager",
            attendance: "Daily Attendance"
        }
    },
    student: {
        label: "Student Portal Features",
        items: {
            profile: "Profile",
            homework: "Homework",
            fee: "Fee Payment",
            datesheet: "DateSheet",
            attendance: "Attendance",
            sms: "SMS",
            calendar: "Calendar Planning",
            idcard: "ID Card",
            syllabus: "Syllabus",
            'fee-receipt': "Fee Receipt",
            admit: "Admit Card",
            gatepass: "Gate Pass",
            notifications: "Notifications",
            birthday: "Birthday",
            transport: "Transport",
            'study-material': "Study Material",
            result: "Result",
            leave: "Leave Request",
            batchmate: "Batchmate",
            circular: "Circular",
            news: "News",
            assignment: "Assignment",
            complaint: "Complaint",
            'online-classes': "Online Classes",
            'social-media': "Social Media"
        }
    }
};

// Feature toggles live in their own Supabase table now (one row per school),
// instead of the old Firestore sub-collection schools/{id}/feature_controls/settings.
const FEATURE_SETTINGS_TABLE = "feature_controls";

function normalizeFeatureSettingsPayload(payload = {}) {
    const source = payload.featureSettings || payload;
    return hydrateFeatureSettings(source, payload.enabledModules || []);
}

async function readSchoolFeatureSettings(schoolId) {
    if (!schoolId) return hydrateFeatureSettings();

    const { data: featureRow, error: featureError } = await supabaseClient
        .from(FEATURE_SETTINGS_TABLE)
        .select("*")
        .eq("schoolId", schoolId)
        .maybeSingle();
    if (featureError) console.error("Feature control lookup failed:", featureError);
    if (featureRow) return normalizeFeatureSettingsPayload(featureRow);

    // Fallback: legacy toggle fields stored directly on the school row.
    const { data: schoolRow, error: schoolError } = await supabaseClient
        .from("schools")
        .select("*")
        .eq("id", schoolId)
        .maybeSingle();
    if (schoolError) console.error("School lookup failed:", schoolError);
    if (schoolRow) return normalizeFeatureSettingsPayload(schoolRow);
    return hydrateFeatureSettings();
}

async function syncSchoolFeatureSettings(schoolId) {
    if (!schoolId) return;
    window.currentFeatureSettings = await readSchoolFeatureSettings(schoolId);
    applyFeatureLocks();
    renderFeatureToggleSettings();
}

function listenToFeatureSettings() {
    if (window.unsubFeatureSettings) {
        window.unsubFeatureSettings();
        window.unsubFeatureSettings = null;
    }
    if (!currentSchoolId) return;
    const schoolId = currentSchoolId;

    const refreshFeatureSettings = async () => {
        window.currentFeatureSettings = await readSchoolFeatureSettings(schoolId);
        applyFeatureLocks();
        renderFeatureToggleSettings();
    };

    const featureChannel = supabaseClient.channel('realtime:' + FEATURE_SETTINGS_TABLE + ':' + crypto.randomUUID())
        .on('postgres_changes', { event: '*', schema: 'public', table: FEATURE_SETTINGS_TABLE, filter: `schoolId=eq.${schoolId}` }, () => {
            refreshFeatureSettings();
        })
        .subscribe();

    window.unsubFeatureSettings = () => supabaseClient.removeChannel(featureChannel);
}

const overlay = document.getElementById('auth-overlay');
const loginWrapper = document.getElementById('login-wrapper');
const dashboardWrapper = document.getElementById('dashboard-wrapper');
const licenseLockScreen = document.getElementById('license-lock-screen');

window.closeCustomModal = (id) => { document.getElementById(id).style.display = 'none'; };

window.switchTab = (targetId) => {
    if (!targetId) return;
    // Redirect the legacy CoreEdu menu tab into the unified Communication Hub (chat sub-section)
    if (targetId === 'tab-coreedu-comm') {
        window.switchTab('tab-mailbox');
        if (window.switchCommSubtab) window.switchCommSubtab('sub-chat');
        return;
    }
    if (isSchoolTabRestricted(targetId)) {
        showCompanyRestrictedAlert();
        applyFeatureLocks();
        return;
    }
    document.querySelectorAll('#dashboard-wrapper .tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#dashboard-wrapper .menu-item').forEach(item => item.classList.remove('active'));
    const targetTab = document.getElementById(targetId);
    const targetMenu = document.querySelector(`#dashboard-wrapper .menu-item[data-target="${targetId}"]`);
    if (targetTab) targetTab.classList.add('active');
    if (targetMenu) targetMenu.classList.add('active');
    sessionStorage.setItem('chairmanActiveTab', targetId);
    if (targetId === 'tab-student-transfer') {
        populateTransferStudentOptions();
        window.previewTransferStudent();
        window.previewTransferSchoolName();
        window.loadStudentTransfers();
    }
    if (targetId === 'tab-daily-attendance' && window.loadDailyAttendanceRoster) window.loadDailyAttendanceRoster();
    if (targetId === 'tab-export-records') window.renderStudentExportRecords();
    if (targetId === 'tab-staff') loadStaff();
    if (targetId === 'tab-finance') loadTransactions();
    // Refresh inbox/sent when opening the Communication Hub
    if (targetId === 'tab-mailbox') {
        loadInbox(); loadSentMail();
    }
};

window.openDashboardDetail = (type) => {
    const targetMap = {
        'students-all': { tab: 'tab-students', title: 'All Students', filter: () => renderStudentsTable('All') },
        attendance: { tab: 'tab-daily-attendance', title: 'Attendance' },
        pending: { tab: 'tab-students', title: 'Pending Admissions', filter: () => window.filterByStatus('Pending') },
        staff: { tab: 'tab-staff', title: 'Staff Directory' },
        notices: { tab: 'tab-notices', title: 'Notices' },
        finance: { tab: 'tab-finance', title: 'Finance Ledger' }
    };
    const detail = targetMap[type];
    if (!detail) return;
    window.switchTab(detail.tab);
    setTimeout(() => {
        if (typeof detail.filter === 'function') detail.filter();
        const title = document.querySelector(`#${detail.tab} h3`);
        if (title) title.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
};

function setRoleBadge(elementId, roleText) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    badge.innerHTML = `<i class="fas fa-user-shield"></i> Role: ${roleText}`;
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.gap = "6px";
}

function initializeChairmanNavigation() {
    document.querySelectorAll('#dashboard-wrapper .menu-item[data-target]').forEach(item => {
        if (item.dataset.navReady === 'true') return;
        item.dataset.navReady = 'true';
        item.addEventListener('click', () => window.switchTab(item.dataset.target));
    });
}

initializeChairmanNavigation();

function showLoginScreen(errorText = "") {
    if(overlay) overlay.style.display = "none";
    if(dashboardWrapper) dashboardWrapper.style.display = "none";
    const pw = document.getElementById("pin-wrapper"); if(pw) pw.style.display = "none";
    const stfw = document.getElementById("staff-dashboard-wrapper"); if(stfw) stfw.style.display = "none";
    const stdw = document.getElementById("student-dashboard-wrapper"); if(stdw) stdw.style.display = "none";
    if(licenseLockScreen) licenseLockScreen.style.display = "none";
    if(loginWrapper) loginWrapper.style.display = "flex";

    if (errorText) {
        const errBox = document.getElementById('loginErrorMsg');
        if (errBox) { errBox.innerText = errorText; errBox.style.display = 'block'; setTimeout(() => errBox.style.display = 'none', 5000); }
    }
}

// --- LICENSE VERIFICATION API LOGIC ---
async function verifySchoolLicense(schoolId) {
    try {
        const { data, error } = await supabaseClient.from("schools").select("*").eq("id", schoolId).maybeSingle();
        if (error) throw error;
        if (data) {
            window.currentLicenseStatus = data.licenseStatus || "Active";
            // If locked, reject access immediately
            if (window.currentLicenseStatus === "Locked") return false;

            // If no license date is set, assume it is valid (Lifetime)
            if (!data.licenseExpiry) return true;

            const expiryDate = new Date(data.licenseExpiry);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time for accurate date comparison

            if (expiryDate < today) return false;
            return true;
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
if (urlParams.get('isGhost') === 'true') {
    window.isGhost = true;
    sessionStorage.setItem("isGhost", "true");
    console.log("👻 GHOST MODE ACTIVE: Database audit logging bypassed.");
} else {
    window.isGhost = sessionStorage.getItem("isGhost") === "true";
}

// --- CHAIRMAN PIN UNLOCK LOGIC ---
window.unlockChairmanDashboard = () => {
    document.getElementById("pin-wrapper").style.display = "none";
    dashboardWrapper.style.display = "flex";
    initializeChairmanNavigation();

    const savedTab = sessionStorage.getItem('chairmanActiveTab');
    window.switchTab(savedTab || 'tab-dashboard');
};

window.saveChairmanPin = async () => {
    const pin = document.getElementById("c_newPin").value;
    if (pin.length < 4) return alert("Please enter 4 digits");
    const { error } = await supabaseClient.from("users").update({ pin: pin }).eq("id", currentUserId);
    if (error) throw error;
    window.currentChairmanPin = pin;
    window.unlockChairmanDashboard();
};

window.verifyChairmanPin = () => {
    const pin = document.getElementById("c_loginPin").value;
    if (pin === window.currentChairmanPin) {
        window.unlockChairmanDashboard();
    } else {
        document.getElementById("c_pinErrorMsg").style.display = "block";
        setTimeout(() => document.getElementById("c_pinErrorMsg").style.display = "none", 2000);
    }
};

window.logoutFromPin = () => supabaseClient.auth.signOut();

// ================= AUTH LOGIC (WITH PIN, LICENSE LOCK & SUPER ADMIN BYPASS) =================
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    window.portalAuthStateReceived = true;
    // A refreshed access token does not change who is signed in - skip the bootstrap.
    if (event === 'TOKEN_REFRESHED') return;

    // Supabase sends PASSWORD_RECOVERY after the user opens the reset email.
    // Do not bootstrap the dashboard until the new password has been saved.
    if (event === 'PASSWORD_RECOVERY') {
        overlay.style.display = 'none';
        dashboardWrapper.style.display = 'none';
        loginWrapper.style.display = 'flex';
        document.getElementById('admin-login-fields').style.display = 'none';
        document.getElementById('student-login-fields').style.display = 'none';
        document.getElementById('password-reset-fields').style.display = 'block';
        document.getElementById('loginErrorMsg').style.display = 'none';
        document.querySelector('.glass-login-title').innerText = 'set new password';
        return;
    }

    const user = session?.user ? { uid: session.user.id, email: session.user.email } : null;
    currentUserId = user ? user.uid : null;

    if (user) {
        try {
            const { data, error: userError } = await supabaseClient.from("users").select("*").eq("id", user.uid).maybeSingle();
            if (userError) throw userError;
            if (!data) { await supabaseClient.auth.signOut(); showLoginScreen("Account not found."); return; }

            if (data.role === "chairman") {
                // Ensure other dashboards are hidden
                document.getElementById("staff-dashboard-wrapper").style.display = "none";
                document.getElementById("student-dashboard-wrapper").style.display = "none";
                
                if (data.status === "blocked") {
                    await supabaseClient.auth.signOut(); showLoginScreen("Account Blocked. Reason: " + (data.blockReason || "Contact Super Admin")); return;
                }

                currentSchoolId = data.schoolId; currentSchoolName = data.schoolName;
                window.applyInstitutionMode && window.applyInstitutionMode();
                await syncSchoolFeatureSettings(currentSchoolId);
                listenToFeatureSettings();

                // --- TRIGGER SAAS LICENSE VERIFICATION ---
                overlay.innerHTML = '<i class="fas fa-fingerprint fa-pulse" style="font-size:3rem; margin-bottom:15px;"></i><div>Verifying License Subscription...</div>';
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
                setRoleBadge('dashboard-role-badge', data.staffRole || 'Chairman');
                const reqOp = document.getElementById('req_old_pass'); if(reqOp) reqOp.value = data.plainPassword || '******';

                const initials = data.schoolName.split(' ').map(word => word.charAt(0).toUpperCase()).join('');
                const mEl = document.getElementById('top-school-name-mobile'); if(mEl) mEl.innerText = initials;

                if (data.logoUrl) {
                    const tsl = document.getElementById('top-school-logo'); if(tsl) { tsl.src = data.logoUrl; tsl.style.display = 'block'; }
                    const psl = document.getElementById('print_school_logo'); if(psl) { psl.src = data.logoUrl; psl.style.display = 'block'; }
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
                const fd = document.getElementById("fee_date"); if(fd) fd.value = today;
                const sd = document.getElementById("salary_date"); if(sd) sd.value = today;
                const ed = document.getElementById("exp_date"); if(ed) ed.value = today;

                populateClassDropdowns();

                if (!sessionStorage.getItem("tracked_login_" + user.uid) && sessionStorage.getItem("is_impersonating") !== "true") {
                    try {
                        const ipRes = await fetch('https://api.ipify.org?format=json'); const ipData = await ipRes.json();
                        const { error: logError } = await supabaseClient.from("login_logs").insert({
                            uid: user.uid, name: data.name, email: data.email, role: "chairman", schoolId: currentSchoolId,
                            ip: ipData.ip || "Unknown", device: navigator.userAgent, timestamp: new Date().toISOString()
                        });
                        if (logError) throw logError;
                        sessionStorage.setItem("tracked_login_" + user.uid, "true");
                    } catch (e) { }
                }

            } else if (data.role === "staff") {
                // Ensure other dashboards are hidden
                document.getElementById("dashboard-wrapper").style.display = "none";
                document.getElementById("student-dashboard-wrapper").style.display = "none";
                
                if (data.status === "blocked") {
                    await supabaseClient.auth.signOut(); showLoginScreen("Account Blocked."); return;
                }
                currentSchoolId = data.schoolId; currentSchoolName = data.schoolName;
                window.applyInstitutionMode && window.applyInstitutionMode();
                await syncSchoolFeatureSettings(currentSchoolId);
                listenToFeatureSettings();

                const isLicenseValid = await verifySchoolLicense(currentSchoolId);
                if (!isLicenseValid) {
                    overlay.style.display = 'none'; dashboardWrapper.style.display = "none"; loginWrapper.style.display = "none";
                    document.getElementById("pin-wrapper").style.display = "none"; licenseLockScreen.style.display = "flex"; return;
                }

                overlay.style.display = "none"; loginWrapper.style.display = "none";
                document.getElementById("staff-dashboard-wrapper").style.display = "block";
                document.getElementById("staff-school-name").innerText = data.schoolName;
                document.getElementById("staff-welcome-name").innerText = data.name;
                setRoleBadge('staff-role-badge', data.staffRole || 'Staff');

                listenToTicker();
                window.initStaffPortal(data);
                document.querySelectorAll('#staff-dashboard-wrapper .menu-item').forEach(item => {
                    item.addEventListener('click', () => {
                        if (isSchoolTabRestricted(item.dataset.target)) {
                            showCompanyRestrictedAlert();
                            applyFeatureLocks();
                            return;
                        }
                        document.querySelectorAll('#staff-dashboard-wrapper .menu-item').forEach(m => m.classList.remove('active'));
                        document.querySelectorAll('#staff-dashboard-wrapper .tab-content').forEach(t => t.classList.remove('active'));
                        item.classList.add('active');
                        const target = document.getElementById(item.dataset.target);
                        if (target) target.classList.add('active');
                        document.getElementById('staff-tab-title').innerText = item.innerText;
                        if (window.onStaffTabOpen) window.onStaffTabOpen(item.dataset.target);
                    });
                });

            } else {
                await supabaseClient.auth.signOut();
                if (sessionStorage.getItem("is_impersonating") !== "true") {
                    showLoginScreen("Access Denied: Invalid role.");
                }
            }
        } catch (e) {
            document.getElementById('auth-overlay').style.display = 'none';
            showLoginScreen("DB Err: " + e.message); console.error("DB ERROR DETAILS:", e);
        }
    } else {
        if (sessionStorage.getItem("is_impersonating") === "true" && sessionStorage.getItem("imp_e")) {
            document.getElementById('auth-overlay').innerHTML = '<i class="fas fa-fingerprint fa-pulse" style="font-size:3rem; margin-bottom:15px;"></i><div>Authenticating Super Admin...</div>';
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('login-wrapper').style.display = 'none';

            supabaseClient.auth.signInWithPassword({
                email: decodeURIComponent(sessionStorage.getItem("imp_e")),
                password: decodeURIComponent(sessionStorage.getItem("imp_p"))
            })
                .then(({ error: signInError }) => { if (signInError) throw signInError; })
                .then(() => {
                    sessionStorage.removeItem("imp_e");
                    sessionStorage.removeItem("imp_p");
                    window.history.replaceState({}, document.title, window.location.pathname);
                }).catch(e => {
                    sessionStorage.removeItem("is_impersonating");
                    document.getElementById('auth-overlay').style.display = 'none';
                    showLoginScreen("Impersonation Failed: " + e.message);
                });
        } else {
            document.getElementById('auth-overlay').style.display = 'none';
            showLoginScreen();
        }
    }
});

document.getElementById("doLoginBtn").addEventListener("click", async () => {
    const email = document.getElementById("loginId").value.trim();
    // IMPORTANT: never trim a password. Spaces can be valid password characters.
    const pass = document.getElementById("loginPassword").value;
    const btn = document.getElementById("doLoginBtn");

    if (!email || !pass) return showLoginScreen("Enter Username and Password");

    btn.innerText = "Verifying...";
    btn.disabled = true;

    try {
        // Session persistence + auto token refresh are configured on the client itself.
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
            email,
            password: pass
        });

        if (signInError) throw signInError;
    } catch (e) {
        console.error("SUPABASE LOGIN ERROR:", {
            message: e?.message || "Unknown authentication error",
            status: e?.status || null,
            code: e?.code || null
        });

        let message = "Login failed. Please verify your email and password.";

        if (e?.code === "invalid_credentials" || /invalid login credentials/i.test(e?.message || "")) {
            message = "Email/password incorrect. Please enter the exact password from your authentication email.";
        } else if (/email not confirmed/i.test(e?.message || "")) {
            message = "Email is not verified yet. Please verify the authentication email and try again.";
        } else if (e?.status === 429) {
            message = "Too many login attempts. Please wait a few minutes and try again.";
        } else if (e?.message) {
            message = "Login failed: " + e.message;
        }

        btn.innerText = "Login";
        btn.disabled = false;
        showLoginScreen(message);
        return;
    }

    btn.innerText = "Login";
    btn.disabled = false;
});

// ================= SECURE PASSWORD RECOVERY =================
document.getElementById("forgotPasswordBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("loginId").value.trim();
    const errBox = document.getElementById("loginErrorMsg");

    if (!email) {
        showLoginScreen("Pehle apna registered email enter karein, phir Forgot Password dabayein.");
        return;
    }

    const btn = document.getElementById("forgotPasswordBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending reset email...';

    try {
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;

        showLoginScreen("Password reset email bhej di gayi hai. Gmail inbox/spam check karke link open karein.");
    } catch (e) {
        console.error("PASSWORD RESET ERROR:", {
            message: e?.message || "Unknown error",
            status: e?.status || null,
            code: e?.code || null
        });
        showLoginScreen("Password reset request failed: " + (e?.message || "Please try again."));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-key"></i> Forgot Password?';
    }
});

document.getElementById("updatePasswordBtn")?.addEventListener("click", async () => {
    const password = document.getElementById("newLoginPassword").value;
    const confirm = document.getElementById("confirmLoginPassword").value;
    const btn = document.getElementById("updatePasswordBtn");

    if (password.length < 8) {
        showLoginScreen("New password kam se kam 8 characters ka hona chahiye.");
        return;
    }
    if (password !== confirm) {
        showLoginScreen("New password aur confirmation match nahi karte.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Updating...";

    try {
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) throw error;

        await supabaseClient.auth.signOut();
        document.getElementById("password-reset-fields").style.display = "none";
        document.getElementById("admin-login-fields").style.display = "block";
        document.querySelector('.glass-login-title').innerText = 'login';
        document.getElementById("newLoginPassword").value = "";
        document.getElementById("confirmLoginPassword").value = "";
        showLoginScreen("Password successfully changed. Ab ab naye password se login karein.");
    } catch (e) {
        console.error("PASSWORD UPDATE ERROR:", {
            message: e?.message || "Unknown error",
            status: e?.status || null,
            code: e?.code || null
        });
        showLoginScreen("Password update failed: " + (e?.message || "Please reopen the reset email and try again."));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Set New Password</span> <i class="fas fa-check"></i>';
    }
});

window.doLogout = () => {
    document.getElementById("staff-dashboard-wrapper").style.display = "none";
    document.getElementById("student-dashboard-wrapper").style.display = "none";
    supabaseClient.auth.signOut();
};

document.getElementById("deviceModeToggle").addEventListener("change", (e) => { e.target.checked ? document.body.classList.add("force-desktop") : document.body.classList.remove("force-desktop"); });

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        if (item.classList.contains('logout-btn')) return;
        const targetId = item.dataset.target;
        if (isSchoolTabRestricted(targetId)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            showCompanyRestrictedAlert();
            applyFeatureLocks();
            return;
        }
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        item.classList.add('active');

        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add('active');

        document.getElementById('tab-title').innerText = item.innerText;
        sessionStorage.setItem('chairmanActiveTab', targetId);
    });
});

window.generateRegistrationLink = () => {
    const liveDomain = "https://bf0040792-rgb.github.io/SCHOOL.COLLAGE.STAFF.STUDENT.PROTAL/admission.html"; const link = `${liveDomain}?school=${currentSchoolId}`;
    document.getElementById("short-link-input").value = link; document.getElementById("link-display-box").style.display = "flex";
};

window.copyToClipboard = () => {
    const link = document.getElementById("short-link-input").value;
    if (link) { navigator.clipboard.writeText(link).then(() => alert("Link Copied!")); }
};

function populateClassDropdowns() {
    const classes = institutionIsCollege() ? ["1st Semester", "2nd Semester", "3rd Semester", "4th Semester", "5th Semester", "6th Semester"] : ["Nursery", "LKG", "UKG", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
    let feeClsOpts = '<option value="">-- Select --</option>';
    classes.forEach(c => feeClsOpts += `<option value="${c}">${c}</option>`);
    if(document.getElementById("fee_class")) document.getElementById("fee_class").innerHTML = feeClsOpts;
    
    // Auto-update all other class dropdowns in index.html
    document.querySelectorAll("select").forEach(select => {
        let has1st = false;
        let hasAll = false;
        Array.from(select.options).forEach(opt => {
            if (opt.value === "1st") has1st = true;
            if (opt.value === "All" || opt.value === "all") hasAll = true;
        });
        if (has1st) {
            let html = "";
            if (hasAll) html += `<option value="All">All Classes</option>`;
            else if (select.options[0].value === "") html += `<option value="">${select.options[0].text}</option>`;
            
            classes.forEach(c => html += `<option value="${c}">${c}</option>`);
            select.innerHTML = html;
        }
    });
}

async function checkAdmissionStatus() {
    const { data, error } = await supabaseClient.from("schools").select("*").eq("id", currentSchoolId).maybeSingle();
    if (error) console.error("School settings lookup failed:", error);
    if (data) {
        if (data.idTemplateUrl) { currentIdTemplateUrl = data.idTemplateUrl; }
        if (data.idTemplateStyle) {
            currentTemplateStyle = data.idTemplateStyle;
            if (document.getElementById('ts_' + data.idTemplateStyle)) {
                document.getElementById('ts_' + data.idTemplateStyle).checked = true;
                if (typeof window.selectTemplateUI === 'function') window.selectTemplateUI(data.idTemplateStyle);
            }
        }
        if (data.idTemplateColor && document.getElementById("id_template_color")) {
            document.getElementById("id_template_color").value = data.idTemplateColor;
        }
        if (data.secondaryColor && document.getElementById("school_secondary_color")) {
            document.getElementById("school_secondary_color").value = data.secondaryColor;
            currentSecondaryColor = data.secondaryColor;
        }
        document.getElementById("admissionToggle").checked = data.admissionOpen !== false;

        if (data.emergencyMobile) { document.getElementById("school_emergency").value = data.emergencyMobile; document.getElementById("print_emergency").innerText = "Emergency: " + data.emergencyMobile; }
        if (data.signatureUrl) {
            currentSignatureUrl = data.signatureUrl;
            document.getElementById("preview-signature").src = data.signatureUrl;
            if (!data.sigSettings || data.sigSettings.idCard !== false) document.getElementById("print_sig").src = data.signatureUrl;
            document.getElementById("cert_sig").src = data.signatureUrl;
        }
        if (data.sigSettings) {
            window.currentSigSettings = data.sigSettings;
            if (document.getElementById("sig_on_id")) {
                if (document.getElementById("sig_on_marksheet")) document.getElementById("sig_on_marksheet").checked = data.sigSettings.marksheet !== false;
                document.getElementById("sig_on_id").checked = data.sigSettings.idCard !== false;
                document.getElementById("sig_on_bonafide").checked = data.sigSettings.bonafide !== false;
                document.getElementById("sig_on_admit").checked = data.sigSettings.admit !== false;
            }
        } else {
            window.currentSigSettings = { marksheet: true, idCard: true, bonafide: true, admit: true };
        }

        if (data.examSubjects && Array.isArray(data.examSubjects)) {
            window.examSubjects = data.examSubjects;
        } else {
            window.examSubjects = [...(window.factoryDefaultSubjects || [])];
        }

        populateClassDropdowns();
        if (data.themeColor) { currentThemeColor = data.themeColor; document.getElementById("school_theme_color").value = currentThemeColor; document.documentElement.style.setProperty('--theme-color', currentThemeColor); }
        if (data.schoolNameColor) { currentSchoolNameColor = data.schoolNameColor; if (document.getElementById("idSchoolNameColor")) document.getElementById("idSchoolNameColor").value = currentSchoolNameColor; }
        if (data.studentNameColor) { currentStudentNameColor = data.studentNameColor; if (document.getElementById("idStudentNameColor")) document.getElementById("idStudentNameColor").value = currentStudentNameColor; }
        if (data.detailsColor) { currentDetailsColor = data.detailsColor; if (document.getElementById("idDetailsColor")) document.getElementById("idDetailsColor").value = currentDetailsColor; }
        if (data.photoBgColor) { currentPhotoBgColor = data.photoBgColor; if (document.getElementById("idPhotoBgColor")) document.getElementById("idPhotoBgColor").value = currentPhotoBgColor; }
        if (data.emergencyTicker) { document.getElementById("ticker_input").value = data.emergencyTicker; }

        // Authority Enforcement: Hide restricted modules
        if (data.blockedModules && Array.isArray(data.blockedModules)) {
            data.blockedModules.forEach(mod => {
                const menuItem = document.querySelector(`.menu-item[data-target="tab-${mod}"]`);
                if (menuItem) menuItem.style.display = 'none';
            });
        }
    }
}

window.listenToTicker = () => {
    if (!currentSchoolId) return;
    if (window.unsubTicker) { window.unsubTicker(); window.unsubTicker = null; }
    const schoolId = currentSchoolId;

    const applySchoolSnapshot = (data) => {
        if (data) {
            if (data.tickerActive && data.emergencyTicker) {
                document.getElementById("school-ticker-container").style.display = "block";
                document.getElementById("school-ticker-text").innerText = data.emergencyTicker;
            } else {
                document.getElementById("school-ticker-container").style.display = "none";
            }

            // Payment Settings Init
            if (data.paymentQrUrl) {
                currentPaymentQrUrl = data.paymentQrUrl;
                const preview = document.getElementById("payment_qr_preview");
                if (preview) { preview.src = currentPaymentQrUrl; preview.style.display = "block"; }
            }
            if (data.upiId) {
                const upiEl = document.getElementById("upi_id_input");
                if (upiEl && upiEl.value === "") upiEl.value = data.upiId;
            }
            if (data.whatsappGroup) {
                const waEl = document.getElementById("wa_group_link");
                if (waEl && waEl.value === "") waEl.value = data.whatsappGroup;
            }

            // Feature controls live in their own `feature_controls` table (one row per school).
            // Legacy toggle fields on the school row are only a fallback for readSchoolFeatureSettings().

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
    };

    // Paint once, then keep in sync with a native Supabase Realtime channel.
    supabaseClient.from("schools").select("*").eq("id", schoolId).maybeSingle()
        .then(({ data }) => applySchoolSnapshot(data));

    const tickerChannel = supabaseClient.channel('realtime:schools:' + crypto.randomUUID())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schools', filter: `id=eq.${schoolId}` }, async () => {
            const { data } = await supabaseClient.from("schools").select("*").eq("id", schoolId).maybeSingle();
            applySchoolSnapshot(data);
        })
        .subscribe();

    window.unsubTicker = () => supabaseClient.removeChannel(tickerChannel);
};

window.requestSessionUpgrade = async () => {
    if (confirm("Are you sure you want to request a Session Upgrade? This will send a request to the Super Admin (Master Core).")) {
        try {
            const { error } = await supabaseClient.from("schools").update({ sessionUpgradeStatus: "pending" }).eq("id", currentSchoolId);
            if (error) throw error;
            alert("Request sent successfully! Please wait for Super Admin approval.");
        } catch (e) {
            console.error(e);
            alert("Error sending request.");
        }
    }
};

window.executePromotion = async () => {
    if (!confirm("CRITICAL WARNING: This will promote ALL approved students to the next class and RESET their Roll Numbers. This action cannot be undone. Do you want to proceed?")) return;

    try {
        const promotions = [];
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

                promotions.push({ id: st.id, nextClass });
                promotedCount++;
            }
        });

        if (promotedCount > 0) {
            // Native PostgREST: one update per promoted student (replaces the legacy write batch).
            for (const promotion of promotions) {
                const { error } = await supabaseClient.from("students").update({
                    class: promotion.nextClass,
                    rollNo: "" // Reset roll number
                }).eq("id", promotion.id);
                if (error) throw error;
            }
            // Reset status after successful execution
            const { error: schoolError } = await supabaseClient.from("schools").update({ sessionUpgradeStatus: null }).eq("id", currentSchoolId);
            if (schoolError) throw schoolError;
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
    if (!text) return alert("Enter ticker text.");
    const { error } = await supabaseClient.from("schools").update({ emergencyTicker: text, tickerActive: true }).eq("id", currentSchoolId);
    if (error) throw error;
    alert("Emergency Ticker Published!");
};

window.clearEmergencyTicker = async () => {
    const { error } = await supabaseClient.from("schools").update({ tickerActive: false }).eq("id", currentSchoolId);
    if (error) throw error;
    document.getElementById("ticker_input").value = "";
    alert("Ticker Cleared.");
};

document.getElementById("admissionToggle").addEventListener("change", async (e) => {
    try {
        const { error } = await supabaseClient.from("schools").update({ admissionOpen: e.target.checked }).eq("id", currentSchoolId);
        if (error) throw error;
        alert(e.target.checked ? "Admissions OPEN." : "Admissions CLOSED.");
    }
    catch (err) { e.target.checked = !e.target.checked; }
});

const convertToBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = (e) => reject(e); });

const uploadToCloudinary = async (fileInputId, btnId, defaultText) => {
    const file = document.getElementById(fileInputId).files[0]; if (!file) return null;
    const btn = document.getElementById(btnId); btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Uploading...";
    try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "ml_default");
        
        const res = await fetch("https://api.cloudinary.com/v1_1/disgtvs6f/image/upload", { 
            method: "POST", 
            body: formData 
        });
        
        const data = await res.json();
        btn.innerHTML = defaultText;
        
        if (data.error) {
            alert("Cloudinary Error: " + data.error.message);
            return null;
        }
        return data.secure_url;
    } catch (e) {
        alert("Upload Catch Error: " + e.message);
        btn.innerHTML = defaultText; return null;
    }
};

function loadAllData() { loadStudents(); loadStaff(); loadNotices(); loadInbox(); loadSentMail(); loadTransactions(); loadPendingResults(); window.initDashboardChart(); window.loadTransportRoutes(); window.loadInventory(); loadAllSchools(); loadStudentTransfers(); loadCoreEduChat(); window.loadStudentComplaints(); }

// ================= STUDENT TRANSFER (3-STAGE APPROVAL WORKFLOW) =================
window.fetchedStudentTransfers = [];
window.fetchedIncomingTransfers = [];

const TRANSFER_CLASS_LIST = ["Nursery", "LKG", "UKG", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];

function populateTransferClassFilters() {
    const histFilter = document.getElementById("transfer_history_class_filter");
    if (histFilter) {
        const selectedClass = histFilter.value || "All";
        let html = "<option value='All'>All Classes</option>";
        (institutionIsCollege() ? ["1st Semester", "2nd Semester", "3rd Semester", "4th Semester", "5th Semester", "6th Semester"] : ["Nursery", "LKG", "UKG", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"]).forEach(c => html += `<option value="${c}">${c}</option>`);
        histFilter.innerHTML = html;
        histFilter.value = selectedClass;
    }
    const schoolFilter = document.getElementById("transfer_history_school_filter");
    if (schoolFilter) {
        const selectedSchool = schoolFilter.value || "All";
        const schools = new Map();
        (window.fetchedStudentTransfers || []).concat(window.fetchedIncomingTransfers || []).forEach(tr => {
            if (tr.fromSchoolId) schools.set(tr.fromSchoolId, tr.fromSchoolName || tr.fromSchoolId);
            if (tr.toSchoolId) schools.set(tr.toSchoolId, tr.toSchoolName || tr.toSchoolId);
        });
        let html = "<option value='All'>All Schools</option>";
        Array.from(schools.entries()).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => html += `<option value="${id}">${name}</option>`);
        schoolFilter.innerHTML = html;
        schoolFilter.value = schools.has(selectedSchool) ? selectedSchool : "All";
    }
}

window.populateTransferStudentOptions = () => {
    const select = document.getElementById("transfer_student_select");
    if (!select) return;
    const classFilter = document.getElementById("transfer_class_filter")?.value || "All";
    const approvedStudents = (window.fetchedStudents || []).filter(st => {
        const isApproved = (st.status || "Approved") === "Approved";
        const isTransferred = st.transferStatus === "Completed" || st.transferStatus === "Pending HQ Approval" || st.transferStatus === "Pending Target Accept";
        const classMatch = classFilter === "All" || st.class === classFilter;
        return isApproved && !isTransferred && classMatch;
    });
    let html = "<option value=''>-- Select Student --</option>";
    approvedStudents
        .sort((a, b) => (a.class || "").localeCompare(b.class || "") || (Number(a.rollNo) || 9999) - (Number(b.rollNo) || 9999))
        .forEach(st => {
            html += `<option value="${st.id}">${st.name || "Student"} - Class ${st.class || "N/A"} (${st.rollNo || "No Roll"})</option>`;
        });
    select.innerHTML = html;
    window.previewTransferStudent();
};

window.previewTransferStudent = () => {
    const studentId = document.getElementById("transfer_student_select")?.value;
    const student = (window.fetchedStudents || []).find(st => st.id === studentId);
    const target = document.getElementById("transfer-preview-student");
    if (target) target.innerText = student ? `${student.name || "Student"} | Class ${student.class || "N/A"} | Roll ${student.rollNo || "N/A"}` : "Not selected";
};

window.previewTransferSchoolName = () => {
    const schoolId = document.getElementById("transfer_to_school_select")?.value;
    const school = (window.allSchoolsCache || []).find(sc => sc.id === schoolId);
    const target = document.getElementById("transfer-preview-school");
    if (target) target.innerText = school ? (school.schoolName || school.name || school.id) : "Not selected";
};

async function uploadTransferDocument(fileInputId, buttonId, defaultText) {
    const input = document.getElementById(fileInputId);
    if (!input || input.files.length === 0) return null;
    const url = await uploadToCloudinary(fileInputId, buttonId, defaultText);
    return url || null;
}

window.submitStudentTransfer = async () => {
    const btn = document.getElementById("transfer-submit-btn");
    const defaultText = "<i class='fas fa-paper-plane'></i> Submit Transfer Request";
    const studentId = document.getElementById("transfer_student_select").value;
    const toSchoolId = document.getElementById("transfer_to_school_select").value;
    const transferDate = document.getElementById("transfer_date").value || new Date().toLocaleDateString("en-CA");
    const reason = document.getElementById("transfer_reason").value;
    const remarks = document.getElementById("transfer_remarks").value.trim();
    const student = (window.fetchedStudents || []).find(st => st.id === studentId);
    const toSchool = (window.allSchoolsCache || []).find(sc => sc.id === toSchoolId);

    if (!studentId || !student) return alert("Please select a student.");
    if (!toSchoolId || !toSchool) return alert("Please select the transfer target school.");
    if (toSchoolId === currentSchoolId) return alert("Cannot transfer to the same school.");
    if (!confirm(`Submit transfer request for ${student.name || "student"} to ${toSchool.schoolName || toSchool.name || toSchool.id}?\n\nThis request will first go to CoreEdu HQ for approval, then to the target school for acceptance.`)) return;

    btn.disabled = true;
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Uploading Documents...";

    try {
        const documents = {
            transferCertificate: await uploadTransferDocument("transfer_doc_tc", "transfer-submit-btn", defaultText),
            marksheet: await uploadTransferDocument("transfer_doc_marksheet", "transfer-submit-btn", defaultText),
            parentConsent: await uploadTransferDocument("transfer_doc_consent", "transfer-submit-btn", defaultText),
            other: await uploadTransferDocument("transfer_doc_other", "transfer-submit-btn", defaultText)
        };

        btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Submitting Request...";
        // Client-generated primary key so the student row can reference the transfer.
        const transferId = crypto.randomUUID();
        const transferPayload = {
            id: transferId,
            transferId: transferId,
            studentId,
            studentName: student.name || "",
            studentClass: student.class || "",
            rollNo: student.rollNo || "",
            regNo: student.regNo || "",
            fromSchoolId: currentSchoolId,
            fromSchoolName: currentSchoolName,
            toSchoolId,
            toSchoolName: toSchool.schoolName || toSchool.name || toSchool.id,
            transferDate,
            reason,
            remarks,
            documents,
            status: "Pending HQ Approval",
            workflowStage: 1,
            workflowStages: [
                { stage: "Submitted by Chairman", done: true, at: new Date().toISOString() },
                { stage: "HQ Approval", done: false },
                { stage: "Target School Acceptance", done: false },
                { stage: "Completed", done: false }
            ],
            createdAt: new Date().toISOString(),
            createdBy: currentUserId || "chairman"
        };

        const { error: transferError } = await supabaseClient.from("student_transfers").insert(transferPayload);
        if (transferError) throw transferError;

        const { error: studentError } = await supabaseClient.from("students").update({
            transferStatus: "Pending HQ Approval",
            transferRecordId: transferId,
            pendingTransferTo: toSchoolId
        }).eq("id", studentId);
        if (studentError) throw studentError;

        alert("Transfer request submitted. Status: Pending HQ Approval.\nCoreEdu HQ will review and approve this request.");
        document.getElementById("transfer_student_select").value = "";
        document.getElementById("transfer_to_school_select").value = "";
        document.getElementById("transfer_date").value = "";
        document.getElementById("transfer_remarks").value = "";
        ["transfer_doc_tc", "transfer_doc_marksheet", "transfer_doc_consent", "transfer_doc_other"].forEach(id => document.getElementById(id).value = "");
        window.previewTransferStudent();
        window.previewTransferSchoolName();
        loadStudents();
        loadStudentTransfers();
    } catch (e) {
        console.error("Transfer failed:", e);
        alert("Transfer request failed: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = defaultText;
    }
};

function transferStatusLabel(status) {
    switch (status) {
        case "Pending HQ Approval": return `<span style="color:#fbbf24; font-weight:bold;"><i class="fas fa-clock"></i> Pending HQ Approval</span>`;
        case "Pending Target Accept": return `<span style="color:#60a5fa; font-weight:bold;"><i class="fas fa-hourglass-half"></i> Pending Target Accept</span>`;
        case "Completed": return `<span style="color:#5eead4; font-weight:bold;"><i class="fas fa-circle-check"></i> Completed</span>`;
        case "Rejected": return `<span style="color:#fca5a5; font-weight:bold;"><i class="fas fa-circle-xmark"></i> Rejected</span>`;
        case "Cancelled": return `<span style="color:#94a3b8; font-weight:bold;"><i class="fas fa-ban"></i> Cancelled</span>`;
        default: return `<span style="color:#94a3b8;">${status || "Unknown"}</span>`;
    }
}

function buildTransferDocLinks(docs) {
    const entries = Object.entries(docs || {}).filter(([, url]) => !!url);
    if (entries.length === 0) return "No documents";
    return entries.map(([key, url]) => `<button class="transfer-doc-link transfer-doc-preview-btn" onclick="window.previewTransferDocument('${key}', '${encodeURIComponent(url)}')"><i class="fas fa-paperclip"></i> ${formatDocLabel(key)}</button>`).join("");
}

function formatDocLabel(key) {
    return String(key || "Document").replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
}

window.previewTransferDocument = (key, encodedUrl) => {
    const url = decodeURIComponent(encodedUrl || "");
    if (!url) return;
    const modal = document.getElementById("transfer-doc-modal");
    const title = document.getElementById("transfer-doc-title");
    const preview = document.getElementById("transfer-doc-preview");
    const link = document.getElementById("transfer-doc-open-link");
    if (!modal || !preview) return window.open(url, "_blank");
    const label = formatDocLabel(key);
    if (title) title.innerHTML = `<i class="fas fa-file-alt"></i> ${label}`;
    if (link) link.href = url;
    const isPdf = /\.pdf($|\?)/i.test(url);
    preview.innerHTML = isPdf ? `<iframe src="${url}" title="${label}"></iframe>` : `<img src="${url}" alt="${label}">`;
    modal.style.display = "flex";
};

window.renderTransferHistory = () => {
    const tbody = document.getElementById("transfer-history-body");
    if (!tbody) return;
    const classFilter = document.getElementById("transfer_history_class_filter")?.value || "All";
    const schoolFilter = document.getElementById("transfer_history_school_filter")?.value || "All";
    const transfers = (window.fetchedStudentTransfers || []).filter(tr => {
        const classMatch = classFilter === "All" || tr.studentClass === classFilter;
        const schoolMatch = schoolFilter === "All" || tr.fromSchoolId === schoolFilter || tr.toSchoolId === schoolFilter;
        return classMatch && schoolMatch;
    });

    let html = "";
    transfers.forEach(tr => {
        html += `<tr>
            <td>${tr.transferDate || "N/A"}</td>
            <td><strong>${tr.studentName || "N/A"}</strong><br><small>Class ${tr.studentClass || "N/A"} | Roll ${tr.rollNo || "N/A"}</small></td>
            <td>${tr.fromSchoolName || "N/A"}</td>
            <td>${tr.toSchoolName || "N/A"}</td>
            <td>${tr.reason || "N/A"}<br><small>${tr.remarks || ""}</small></td>
            <td>${buildTransferDocLinks(tr.documents)}</td>
            <td>${transferStatusLabel(tr.status)}</td>
            <td><button class="action-btn btn-blue" style="padding:4px 10px; font-size:12px;" onclick="window.downloadTransferReceipt('${tr.id}')"><i class="fas fa-file-pdf"></i> Receipt</button></td>
        </tr>`;
    });
    tbody.innerHTML = html || "<tr><td colspan='8' style='text-align:center;'>No transfer records found.</td></tr>";
};

window.renderIncomingTransfers = () => {
    const tbody = document.getElementById("incoming-transfer-body");
    if (!tbody) return;
    const incoming = window.fetchedIncomingTransfers || [];
    let html = "";
    incoming.forEach(tr => {
        let actionCell = "";
        if (tr.status === "Pending Target Accept") {
            actionCell = `<button class="action-btn btn-green" style="padding:4px 10px; font-size:12px; margin-right:5px;" onclick="window.acceptIncomingTransfer('${tr.id}')"><i class="fas fa-check"></i> Accept</button>
                <button class="action-btn btn-red" style="padding:4px 10px; font-size:12px;" onclick="window.rejectIncomingTransfer('${tr.id}')"><i class="fas fa-times"></i> Reject</button>`;
        } else {
            actionCell = `<span style="color:#94a3b8; font-size:12px;">No action needed</span>`;
        }
        html += `<tr>
            <td>${tr.transferDate || "N/A"}</td>
            <td><strong>${tr.studentName || "N/A"}</strong><br><small>Class ${tr.studentClass || "N/A"} | Roll ${tr.rollNo || "N/A"}</small></td>
            <td>${tr.fromSchoolName || "N/A"}</td>
            <td>${tr.reason || "N/A"}</td>
            <td>${buildTransferDocLinks(tr.documents)}</td>
            <td>${transferStatusLabel(tr.status)}</td>
            <td>${actionCell}</td>
        </tr>`;
    });
    tbody.innerHTML = html || "<tr><td colspan='7' style='text-align:center;'>No incoming transfer requests.</td></tr>";
};

// Transfer rows store ISO timestamps in Supabase, so ordering is done on parsed time.
function transferCreatedTime(record) {
    return toEpochMillis(record?.createdAt);
}

window.loadStudentTransfers = async () => {
    if (!currentSchoolId) return;
    populateTransferClassFilters();
    const tbody = document.getElementById("transfer-history-body");
    const incomingTbody = document.getElementById("incoming-transfer-body");
    if (tbody) tbody.innerHTML = "<tr><td colspan='8' style='text-align:center;'>Loading transfers...</td></tr>";
    if (incomingTbody) incomingTbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>Loading incoming requests...</td></tr>";
    try {
        const [outRes, inRes] = await Promise.all([
            supabaseClient.from("student_transfers").select("*").eq("fromSchoolId", currentSchoolId),
            supabaseClient.from("student_transfers").select("*").eq("toSchoolId", currentSchoolId)
        ]);
        if (outRes.error) throw outRes.error;
        if (inRes.error) throw inRes.error;

        window.fetchedStudentTransfers = outRes.data || [];
        window.fetchedStudentTransfers.sort((a, b) => transferCreatedTime(b) - transferCreatedTime(a));

        window.fetchedIncomingTransfers = inRes.data || [];
        window.fetchedIncomingTransfers.sort((a, b) => transferCreatedTime(b) - transferCreatedTime(a));

        populateTransferClassFilters();
        window.renderTransferHistory();
        window.renderIncomingTransfers();
    } catch (e) {
        console.error("Load transfers failed:", e);
        if (tbody) tbody.innerHTML = "<tr><td colspan='8' style='text-align:center; color:#fca5a5;'>Unable to load transfer records.</td></tr>";
        if (incomingTbody) incomingTbody.innerHTML = "<tr><td colspan='7' style='text-align:center; color:#fca5a5;'>Unable to load incoming requests.</td></tr>";
    }
};

window.acceptIncomingTransfer = async (transferId) => {
    const tr = window.fetchedIncomingTransfers.find(t => t.id === transferId);
    if (!tr) return alert("Transfer record not found.");
    if (tr.status !== "Pending Target Accept") return alert("This transfer is not awaiting your acceptance.");
    if (!confirm(`Accept transfer of ${tr.studentName || "student"} from ${tr.fromSchoolName || "previous school"}?\n\nThe student will be officially moved to your school.`)) return;
    try {
        const stages = tr.workflowStages || [];
        stages.forEach(s => { if (s.stage === "Target School Acceptance") { s.done = true; s.at = new Date().toISOString(); } if (s.stage === "Completed") { s.done = true; s.at = new Date().toISOString(); } });
        const { error: transferError } = await supabaseClient.from("student_transfers").update({
            status: "Completed",
            workflowStage: 4,
            acceptedAt: new Date().toISOString(),
            acceptedBy: currentUserId || "chairman",
            workflowStages: stages
        }).eq("id", transferId);
        if (transferError) throw transferError;

        const { error: studentError } = await supabaseClient.from("students").update({
            schoolId: currentSchoolId,
            previousSchoolId: tr.fromSchoolId,
            previousSchoolName: tr.fromSchoolName,
            transferStatus: "Completed",
            transferredAt: new Date().toISOString(),
            transferRecordId: transferId
        }).eq("id", tr.studentId);
        if (studentError) throw studentError;
        alert("Transfer accepted. Student has been moved to your school.");
        loadStudents();
        loadStudentTransfers();
    } catch (e) {
        console.error("Accept transfer failed:", e);
        alert("Failed to accept transfer: " + e.message);
    }
};

window.rejectIncomingTransfer = async (transferId) => {
    const tr = window.fetchedIncomingTransfers.find(t => t.id === transferId);
    if (!tr) return alert("Transfer record not found.");
    const rejectReason = prompt(`Reason for rejecting transfer of ${tr.studentName || "student"}:`);
    if (rejectReason === null) return;
    try {
        const stages = tr.workflowStages || [];
        stages.forEach(s => { if (s.stage === "Target School Acceptance") { s.done = true; s.at = new Date().toISOString(); s.rejected = true; } });
        const { error: transferError } = await supabaseClient.from("student_transfers").update({
            status: "Rejected",
            rejectedAt: new Date().toISOString(),
            rejectedBy: currentUserId || "chairman",
            rejectReason: rejectReason || "Rejected by target school",
            workflowStages: stages
        }).eq("id", transferId);
        if (transferError) throw transferError;

        const { error: studentError } = await supabaseClient.from("students").update({
            transferStatus: null,
            pendingTransferTo: null
        }).eq("id", tr.studentId);
        if (studentError) throw studentError;
        alert("Transfer rejected. The student remains at the original school.");
        loadStudents();
        loadStudentTransfers();
    } catch (e) {
        console.error("Reject transfer failed:", e);
        alert("Failed to reject transfer: " + e.message);
    }
};

window.cancelTransferRequest = async (transferId) => {
    const tr = window.fetchedStudentTransfers.find(t => t.id === transferId);
    if (!tr) return alert("Transfer record not found.");
    if (tr.status === "Completed") return alert("Cannot cancel a completed transfer.");
    if (!confirm("Cancel this transfer request? The student will remain at this school.")) return;
    try {
        const { error: transferError } = await supabaseClient.from("student_transfers")
            .update({ status: "Cancelled", cancelledAt: new Date().toISOString() })
            .eq("id", transferId);
        if (transferError) throw transferError;

        const { error: studentError } = await supabaseClient.from("students")
            .update({ transferStatus: null, pendingTransferTo: null })
            .eq("id", tr.studentId);
        if (studentError) throw studentError;
        alert("Transfer request cancelled.");
        loadStudents();
        loadStudentTransfers();
    } catch (e) {
        console.error("Cancel transfer failed:", e);
        alert("Failed to cancel transfer: " + e.message);
    }
};

window.downloadTransferReceipt = (transferId) => {
    const tr = [...(window.fetchedStudentTransfers || []), ...(window.fetchedIncomingTransfers || [])].find(t => t.id === transferId);
    if (!tr) return alert("Transfer record not found.");
    try {
        const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    let pageCount = 0;
    
    let transparentSig = currentSignatureUrl;
    if (currentSignatureUrl && (!window.currentSigSettings || window.currentSigSettings.bonafide !== false)) {
        if (typeof getTransparentSignature === 'function') {
            transparentSig = await getTransparentSignature(currentSignatureUrl);
        }
    } else {
        transparentSig = "";
    }

    for (let st of students) {
        const sRow = window.allSchoolsCache ? window.allSchoolsCache.find(s => s.id === currentSchoolId) : null;
        let affNo = "______";
        if (sRow) {
            affNo = sRow.affiliationNo || sRow.affiliation_no || affNo;
        }

                const sName = st.name ? st.name.toUpperCase() : (st.studentName ? st.studentName.toUpperCase() : "");
        const fName = st.fatherName ? st.fatherName.toUpperCase() : (st.parentage ? st.parentage.toUpperCase() : "");
        
        let bFontFamily = "font-family: 'Caveat', cursive, serif;";
        let bColor = "color: #2b3b7a;";
        let bFontWeight = "font-weight: bold;";
        let bFontStyle = "";
        
        if (window.currentTextSettings && window.currentTextSettings.applyBonafide) {
            bFontFamily = `font-family: ${window.currentTextSettings.font};`;
            bColor = `color: ${window.currentTextSettings.color};`;
            bFontWeight = window.currentTextSettings.isBold ? "font-weight: bold;" : "font-weight: normal;";
            bFontStyle = window.currentTextSettings.isItalic ? "font-style: italic;" : "font-style: normal;";
        }
        
        let classPrefix = currentInstitutionType === 'college' ? "of BG" : "of class";
        let classVal = st.class || "";

        printWrapper.innerHTML = `
           <div style="background: #eaf6ea; border: 3px double #2b3b7a; padding: 15mm; height: 100%; box-sizing: border-box; position: relative;">
               <div style="text-align: center; margin-bottom: 20px;">
                 <svg viewBox="0 0 800 120" style="width:100%; max-height:100px;">
                     <path id="curve" d="M 50 100 Q 400 -20 750 100" fill="transparent" />
                     <text width="800" style="font-family: 'Times New Roman', serif; font-size: 32px; font-weight: bold; fill: #2b3b7a; letter-spacing: 2px;">
                         <textPath href="#curve" startOffset="50%" text-anchor="middle">${currentSchoolName.toUpperCase()}</textPath>
                     </text>
                 </svg>
                 <div style="font-size: 14px; font-family: Arial, sans-serif; font-weight: bold; color: #2b3b7a; margin-top: 5px;">(NAAC ACCREDITED GRADE 'A')</div>
                 <div style="margin-top: 15px;">
                     <span style="display:inline-block; background: #2b3b7a; color: #fff; padding: 10px 30px; border-radius: 20px; font-weight: bold; font-family: 'Times New Roman', serif; font-size: 20px; text-transform: uppercase;">BONAFIDE CERTIFICATE</span>
                 </div>
               </div>
               <div style="display: flex; justify-content: space-between; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #333; margin-top: 30px; margin-bottom: 30px;">
                   <div>No: <span style="display:inline-block; border-bottom: 1px solid #000; width: 150px; text-align:center; color: #d32f2f;">${affNo}</span></div>
                   <div>Date <span style="display:inline-block; border-bottom: 1px solid #000; width: 120px; text-align:center; color: #2b3b7a; font-family: 'Caveat', cursive, serif;">${new Date().toLocaleDateString()}</span></div>
               </div>
               <div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 2.8; color: #333; text-align: left;">
                   <span style="color:#555;">This is to Certify that</span> <span style="display:inline-block; border-bottom: 1px solid #000; width: 420px; text-align:center; font-weight: bold; ${bFontFamily} font-size: 22px; ${bColor} ${bFontWeight} ${bFontStyle}">${sName}</span>
                   <br>
                   <span style="color:#555;">S/o, D/o</span> <span style="display:inline-block; border-bottom: 1px solid #000; width: 490px; text-align:center; font-weight: bold; ${bFontFamily} font-size: 22px; ${bColor} ${bFontWeight} ${bFontStyle}">${fName}</span>
                   <br>
                   <span style="color:#555;">R/o</span> <span style="display:inline-block; border-bottom: 1px solid #000; width: 510px; text-align:center; font-weight: bold; ${bFontFamily} font-size: 22px; ${bColor} ${bFontWeight} ${bFontStyle}">${st.address ? st.address.toUpperCase() : "N/A"}</span>
                   <br>
                   <span style="color:#555;">Is a bonafide student of this college under class Roll No.</span> <span style="display:inline-block; border-bottom: 1px solid #000; width: 180px; text-align:center; font-weight: bold; ${bFontFamily} font-size: 22px; ${bColor} ${bFontWeight} ${bFontStyle}">${st.rollNo || ""}</span>
                   <br>
                   <span style="color:#555;">${classPrefix}</span> <span style="display:inline-block; border-bottom: 1px solid #000; width: 150px; text-align:center; font-weight: bold; ${bFontFamily} font-size: 22px; ${bColor} ${bFontWeight} ${bFontStyle}">${classVal}</span>
                   <span style="color:#555; margin-left: 20px;">Year</span> <span style="display:inline-block; border-bottom: 1px solid #000; width: 150px; text-align:center; font-weight: bold; ${bFontFamily} font-size: 22px; ${bColor} ${bFontWeight} ${bFontStyle}">${new Date().getFullYear()}</span>
               </div>
               <div style="position: absolute; bottom: 40px; right: 40px; text-align: center; width: 200px;">
                 ${transparentSig ? `<img src="${transparentSig}" style="height: 60px; display: block; margin: 0 auto; object-fit: contain; mix-blend-mode: multiply;">` : `<div style="height:60px;"></div>`}
                 <div style="border-top: 1px solid #000; width: 150px; margin: 0 auto; padding-top: 5px; font-weight: bold; font-family: Arial, sans-serif; font-size: 14px; margin-top: 5px;">Principal</div>
               </div>
               <div style="position: absolute; bottom: 40px; left: 40px; text-align: center; width: 200px;">
                 <div style="height:60px;"></div>
                 <div style="border-top: 1px solid transparent; width: 150px; margin: 0 auto; padding-top: 5px; font-weight: bold; font-family: Arial, sans-serif; font-size: 14px; margin-top: 5px; color:#555;">I/c Admission</div>
               </div>
           </div>
        `;
        
        await new Promise(r => setTimeout(r, 50));
        const canvas = await html2canvas(printWrapper, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        if (pageCount > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
        pageCount++;
    }
    printWrapper.remove();

    if (triggerBtn) {
        triggerBtn.innerHTML = "<i class='fas fa-check'></i> Generated!";
        setTimeout(() => { triggerBtn.innerHTML = originalHtml; triggerBtn.disabled = false; }, 2000);
    }

    await new Promise(r => setTimeout(r, 1000)); const outBlob = pdf.output('blob');
    const outUrl = URL.createObjectURL(outBlob);
    
    // Now show modal
    document.getElementById("cert-modal").style.display = "flex";
    document.getElementById("cert-generating-text").style.display = "none";
    if (document.getElementById("cert-printable")) document.getElementById("cert-printable").style.display = "none";
    
    document.getElementById("cert-preview-frame").style.display = "block";
    document.getElementById("cert-preview-frame").src = outUrl;
    document.getElementById("cert-actions").style.display = "flex";
    
    document.getElementById("cert-download-btn").onclick = () => {
        const a = document.createElement("a");
        a.href = outUrl; a.download = `Bonafide_Batch_${Date.now()}.pdf`;
        a.click();
    };
    document.getElementById("cert-print-btn").onclick = () => {
        document.getElementById("cert-preview-frame").contentWindow.print();
    };
};
window.triggerGlobalBonafideBatch = async () => {
    const checked = document.querySelectorAll(".bonafide-checkbox:checked");
    if (checked.length === 0) return alert("Please select at least one student.");
    const btn = document.querySelector("#global-bonafide-modal .btn-blue") || null;
    
    let stArr = [];
    for (let cb of checked) {
        const st = window.fetchedStudents.find(s => s.id === cb.value);
        if (st) stArr.push(st);
    }
    if(stArr.length > 0) {
        await window.triggerBulkBonafide(stArr, btn);
    } else {
        alert("No valid students found.");
    }
    document.getElementById("global-bonafide-modal").style.display = "none";
};
// ================= PHASE 2: TRANSPORT MANAGER =================
window.loadTransportRoutes = async () => {
    try {
        const { data: routeRows, error } = await supabaseClient.from("bus_routes").select("*").eq("schoolId", currentSchoolId);
        if (error) throw error;
        let html = "";
        (routeRows || []).forEach(dt => {
            html += `<tr class="hover-row">
                <td><strong>${dt.routeName}</strong></td>
                <td>${dt.driverName}</td>
                <td>${dt.contact}</td>
                <td>₹ ${dt.fee}</td>
                <td><button class="action-btn" style="background:#e53e3e; padding:5px 10px;" onclick="deleteBusRoute('${dt.id}')"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        document.getElementById("transport-body").innerHTML = html || "<tr><td colspan='5' style='text-align:center;'>No routes found.</td></tr>";
    } catch (e) { console.error(e); }
};

window.saveBusRoute = async () => {
    const rn = document.getElementById("transportRouteName").value.trim();
    const dn = document.getElementById("transportDriverName").value.trim();
    const dc = document.getElementById("transportDriverContact").value.trim();
    const fe = document.getElementById("transportBusFee").value.trim();
    if (!rn || !dn || !dc || !fe) return alert("Fill all fields.");
    try {
        const { error } = await supabaseClient.from("bus_routes").insert({
            schoolId: currentSchoolId, routeName: rn, driverName: dn, contact: dc, fee: Number(fe), createdAt: new Date().toISOString()
        });
        if (error) throw error;
        alert("Route saved!");
        document.getElementById("transportRouteName").value = "";
        document.getElementById("transportDriverName").value = "";
        document.getElementById("transportDriverContact").value = "";
        document.getElementById("transportBusFee").value = "";
        loadTransportRoutes();
    } catch (e) { alert("Error saving route"); }
};

window.deleteBusRoute = async (id) => {
    if (!confirm("Delete this route?")) return;
    try {
        const { error } = await supabaseClient.from("bus_routes").delete().eq("id", id);
        if (error) throw error;
        loadTransportRoutes();
    } catch (e) { alert("Error deleting route."); }
};

// ================= PHASE 2: INVENTORY MANAGER =================
window.loadInventory = async () => {
    try {
        const { data: assetRows, error } = await supabaseClient.from("inventory").select("*").eq("schoolId", currentSchoolId);
        if (error) throw error;
        let html = "";
        (assetRows || []).forEach(dt => {
            html += `<tr class="hover-row">
                <td><strong>${dt.itemName}</strong></td>
                <td><span class="status-badge" style="background:#3182ce;">${dt.category}</span></td>
                <td>${dt.quantity}</td>
                <td>${dt.dateAcquired}</td>
                <td><button class="action-btn" style="background:#e53e3e; padding:5px 10px;" onclick="deleteAsset('${dt.id}')"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        document.getElementById("inventory-body").innerHTML = html || "<tr><td colspan='5' style='text-align:center;'>No assets found.</td></tr>";
    } catch (e) { console.error(e); }
};

window.logAsset = async () => {
    const iname = document.getElementById("inventoryItemName").value.trim();
    const cat = document.getElementById("inventoryCategory").value;
    const qty = document.getElementById("inventoryQuantity").value.trim();
    const dt = document.getElementById("inventoryDate").value;
    if (!iname || !qty || !dt) return alert("Fill all fields.");
    try {
        const { error } = await supabaseClient.from("inventory").insert({
            schoolId: currentSchoolId, itemName: iname, category: cat, quantity: Number(qty), dateAcquired: dt, createdAt: new Date().toISOString()
        });
        if (error) throw error;
        alert("Asset saved!");
        document.getElementById("inventoryItemName").value = "";
        document.getElementById("inventoryQuantity").value = "";
        document.getElementById("inventoryDate").value = "";
        loadInventory();
    } catch (e) { alert("Error saving asset"); }
};

window.deleteAsset = async (id) => {
    if (!confirm("Delete this asset?")) return;
    try {
        const { error } = await supabaseClient.from("inventory").delete().eq("id", id);
        if (error) throw error;
        loadInventory();
    } catch (e) { alert("Error deleting asset."); }
};

// ================= PHASE 2: ATTENDANCE ENGINE =================
window.loadClassForAttendance = () => {
    const cls = document.getElementById("attendanceClassSelect").value;
    const dt = document.getElementById("attendanceDateSelect").value;
    if (!cls || !dt) return alert("Select both class and date.");

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
    if (!cls || !dt) return alert("Select both class and date.");

    const stds = (window.fetchedStudents || []).filter(s => s.class === cls && s.status === "Approved");
    if (stds.length === 0) return alert("No students to save.");

    let records = {};
    stds.forEach(st => {
        const selected = document.querySelector(`input[name="att_${st.id}"]:checked`);
        records[st.id] = selected ? selected.value : "Absent";
    });

    try {
        const attId = currentSchoolId + "_" + cls + "_" + dt;
        const { error } = await supabaseClient.from("attendance").upsert({
            id: attId,
            schoolId: currentSchoolId,
            class: cls,
            date: dt,
            records: records,
            updatedAt: new Date().toISOString()
        });
        if (error) throw error;
        alert("Attendance saved!");
        loadStudents();
    } catch (e) { console.error(e); alert("Error saving attendance."); }
};

// =============================================================================================
// ============================== STAFF PORTAL ENGINE ==========================================
// =============================================================================================
// The staff member logs in with their own ID (GoTrue + users row). Everything below renders a
// role-aware dashboard: teachers get their own task panel, management roles (Chairman /
// Principal / Vice Principal / HOD) additionally get school-wide KPIs, teacher compliance and
// the veto queue. All reads/writes go through the staff member's own authenticated session.

let currentStaffDoc = null;
window.staffHomeCache = null;

const STAFF_MANAGEMENT_ROLES = ['Chairman', 'Principal', 'Vice Principal', 'HOD'];
const staffIsManagement = () => STAFF_MANAGEMENT_ROLES.includes(currentStaffDoc && currentStaffDoc.staffRole);
const staffHasPriv = (key) => staffIsManagement() || (currentStaffDoc && currentStaffDoc.privileges && currentStaffDoc.privileges[key] === true);
const staffTodayStr = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const staffEsc = (value) => { const node = document.createElement('span'); node.textContent = value == null || value === '' ? 'N/A' : String(value); return node.innerHTML; };
const staffPill = (ok, okText, noText) => ok
    ? `<span style="background:#dcfce7; color:#166534; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:bold; white-space:nowrap;"><i class="fas fa-check"></i> ${okText}</span>`
    : `<span style="background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:bold; white-space:nowrap;"><i class="fas fa-clock"></i> ${noText}</span>`;
const staffKpiCard = (icon, bg, fg, value, label, sub) => `
    <div class="staff-card" style="padding:16px 18px; display:flex; align-items:center; gap:14px;">
        <div style="width:46px; height:46px; border-radius:50%; background:${bg}; display:flex; align-items:center; justify-content:center; flex:none;">
            <i class="fas ${icon}" style="color:${fg}; font-size:17px;"></i>
        </div>
        <div style="min-width:0;">
            <div style="font-size:12px; color:#8fa3bf;">${label}</div>
            <div style="font-size:24px; font-weight:800; color:#f1f5f9; line-height:1.15;">${value}</div>
            <div style="font-size:11px; font-weight:700; color:#34d399; margin-top:2px;">${sub || ''}</div>
        </div>
    </div>`;

function syncStaffMenuGroups() {
    document.querySelectorAll('#staff-dashboard-wrapper .staff-group').forEach(g => {
        const any = Array.from(g.querySelectorAll('.menu-item')).some(m => m.style.display !== 'none');
        g.style.display = any ? '' : 'none';
    });
}

window.toggleStaffGroup = (id) => { const g = document.getElementById(id); if (g) g.classList.toggle('collapsed'); };

window.filterStaffMenus = (q) => {
    q = (q || '').trim().toLowerCase();
    const allowed = window.__staffMenuAllowed || {};
    document.querySelectorAll('#staff-dashboard-wrapper .menu-item').forEach(m => {
        const privOk = allowed[m.id] !== false;
        const textOk = !q || m.innerText.toLowerCase().includes(q);
        m.style.display = (privOk && textOk) ? '' : 'none';
    });
    syncStaffMenuGroups();
};

function applyStaffPortalAccess() {
    window.__staffMenuAllowed = window.__staffMenuAllowed || {};
    const show = (id, ok) => { const el = document.getElementById(id); if (el) { el.style.display = ok ? '' : 'none'; window.__staffMenuAllowed[id] = ok; } };
    show('staff-menu-attendance', staffHasPriv('attendance'));
    show('staff-menu-marks', staffHasPriv('marks'));
    show('staff-menu-homework', staffHasPriv('marks'));
    show('staff-menu-staff', staffIsManagement());
    show('staff-mgmt-panel', staffIsManagement());
    show('staff-teacher-panel', !staffIsManagement());
    show('staff-notice-form', staffHasPriv('notices'));
    syncStaffMenuGroups();
    if (!staffHasPriv('attendance')) document.getElementById('staff-menu-home') && document.getElementById('staff-menu-home').click();
}

function renderStaffProfile() {
    const el = document.getElementById('staff-profile-body');
    if (!el || !currentStaffDoc) return;
    const d = currentStaffDoc;
    const rows = [['Name', d.name], ['Role', d.staffRole], ['Email', d.email], ['Staff ID', d.id], ['Status', d.status || 'active'], ['School', currentSchoolName]];
    el.innerHTML = `<div style="display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
        <img src="${d.photoUrl ? staffEsc(d.photoUrl) : 'https://via.placeholder.com/100'}" alt="profile" style="width:84px; height:84px; border-radius:50%; object-fit:cover; border:3px solid #10b981;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px 26px; flex:1;">
            ${rows.map(([label, value]) => `<div><div style="font-size:11px; color:#8fa3bf; text-transform:uppercase; letter-spacing:0.4px;">${staffEsc(label)}</div><div style="font-weight:700; color:#e2e8f0;">${staffEsc(value)}</div></div>`).join('')}
        </div>
    </div>`;
}

function staffDestroyChart() { if (window.staffChartInstance) { window.staffChartInstance.destroy(); window.staffChartInstance = null; } }

function staffRenderChart(approvedRows) {
    const canvas = document.getElementById('staff-marks-chart');
    if (!canvas || !window.Chart) return;
    staffDestroyChart();
    const perClass = {};
    (approvedRows || []).forEach(r => {
        const max = Number(r.maxMarks || r.totalMarks || 0); const got = Number(r.marksObtained || 0);
        if (!r.class || !max) return;
        (perClass[r.class] = perClass[r.class] || []).push((got / max) * 100);
    });
    const labels = Object.keys(perClass).sort();
    const values = labels.map(c => Math.round(perClass[c].reduce((a, b) => a + b, 0) / perClass[c].length));
    window.staffChartInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Average %', data: values, backgroundColor: ['#3b82f6', '#60a5fa', '#10b981', '#34d399', '#64748b', '#1e3a8a', '#8b5cf6', '#f59e0b'], borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#8fa3bf' }, grid: { color: 'rgba(148,163,184,0.12)' } }, x: { ticks: { color: '#8fa3bf' }, grid: { color: 'rgba(148,163,184,0.08)' } } }, plugins: { legend: { display: false } } }
    });
}

function staffComplianceHtml(staffRows, mkRows) {
    if (!staffRows || staffRows.length === 0) return '<tr><td colspan="4" style="padding:14px; text-align:center; color:#64748b;">No staff records found.</td></tr>';
    return staffRows.map(st => {
        const mkOk = (mkRows || []).some(m => m.enteredBy === st.id);
        const active = (st.status || 'active') !== 'blocked';
        return `<tr>
            <td>${staffEsc(st.name)}</td>
            <td>${staffEsc(st.staffRole)}</td>
            <td>${staffPill(active, 'Active', 'Blocked')}</td>
            <td>${staffPill(mkOk, 'Submitted', 'Pending')}</td>
        </tr>`;
    }).join('');
}

const staffAttBar = (label, pct, color) => `
    <div class="staff-att-row">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:#9fb0c8; margin-bottom:6px;">
            <span><i class="fas fa-circle" style="color:${color}; font-size:8px; margin-right:7px;"></i>${label}</span>
            <strong style="color:#e2e8f0;">${pct}%</strong>
        </div>
        <div style="height:8px; border-radius:6px; background:#0d1830;">
            <div style="height:8px; border-radius:6px; width:${Math.max(0, Math.min(100, pct))}%; background:${color};"></div>
        </div>
    </div>`;

function staffRenderAttSummary(rows) {
    const el = document.getElementById('staff-att-summary');
    if (el) el.innerHTML = rows.map(([label, pct, color]) => staffAttBar(label, pct, color)).join('');
}

function staffRenderAttChart(monthRows, monthKeys) {
    const canvas = document.getElementById('staff-att-chart');
    if (!canvas || !window.Chart) return;
    if (window.staffAttChartInstance) { window.staffAttChartInstance.destroy(); window.staffAttChartInstance = null; }
    const per = {};
    monthKeys.forEach(k => per[k] = { present: 0, absent: 0 });
    (monthRows || []).forEach(r => {
        const k = String(r.date || '').slice(0, 7);
        if (!per[k]) return;
        Object.values(r.records || {}).forEach(v => { v === 'Absent' ? per[k].absent++ : per[k].present++; });
    });
    const labels = monthKeys.map(k => { const [y, m] = k.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' }); });
    window.staffAttChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Present', data: monthKeys.map(k => per[k].present), backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'Absent', data: monthKeys.map(k => per[k].absent), backgroundColor: '#f97316', borderRadius: 4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#8fa3bf' }, grid: { color: 'rgba(148,163,184,0.08)' } }, y: { beginAtZero: true, ticks: { color: '#8fa3bf' }, grid: { color: 'rgba(148,163,184,0.12)' } } }, plugins: { legend: { labels: { color: '#cbd5e1', boxWidth: 12 } } } }
    });
}

let staffCalOffset = 0;
window.staffCalNav = (dir) => { staffCalOffset += dir; staffRenderCalendar(); };

function staffRenderCalendar() {
    const el = document.getElementById('staff-calendar');
    if (!el) return;
    const base = new Date();
    const view = new Date(base.getFullYear(), base.getMonth() + staffCalOffset, 1);
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const firstDow = view.getDay();
    const title = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    let body = '<tr>';
    let col = firstDow;
    for (let i = 0; i < firstDow; i++) body += '<td class="staff-cal-dim"></td>';
    for (let d = 1; d <= days; d++) {
        const isToday = staffCalOffset === 0 && d === base.getDate();
        body += `<td class="${isToday ? 'staff-cal-today' : ''}"><span>${d}</span></td>`;
        col++;
        if (col % 7 === 0) body += '</tr><tr>';
    }
    while (col % 7 !== 0) { body += '<td class="staff-cal-dim"></td>'; col++; }
    body += '</tr>';
    el.innerHTML = `<div style="text-align:center; font-weight:800; color:#e2e8f0; margin-bottom:8px;">${title}</div>
        <table><thead><tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr></thead><tbody>${body}</tbody></table>`;
}

window.initStaffPortal = async (data) => {
    currentStaffDoc = data;
    await paInitStaffScope();
    const avatar = document.getElementById('staff-avatar');
    if (avatar) avatar.src = data.photoUrl || 'https://via.placeholder.com/100';
    const avName = document.getElementById('staff-avatar-name');
    if (avName) avName.innerText = data.name || 'Staff';
    const dateEl = document.getElementById('staff-today-date');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const subtitle = document.getElementById('staff-role-subtitle');
    if (subtitle) subtitle.innerText = `${data.staffRole || 'Staff'} | Staff ID: ${String(data.id || '').slice(0, 8)}`;
    applyStaffPortalAccess();
    renderStaffProfile();
    loadStaffHome();
};

async function loadStaffHome() {
    const grid = document.getElementById('staff-kpi-grid');
    if (!grid || !currentStaffDoc) return;
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:18px; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading dashboard...</div>';
    const today = staffTodayStr();
    const now = new Date();
    const monthKeys = [];
    for (let i = 7; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    const rangeStart = monthKeys[0] + '-01';
    const [stuRes, usrRes, attTodayRes, attRangeRes, mkRes, ntRes, hwRes] = await Promise.all([
        (() => { let q = supabaseClient.from('students').select('id, class, status, departmentId').eq('schoolId', currentSchoolId); if (institutionIsCollege() && !staffIsManagement() && window.staffDeptIds.length) q = q.in('departmentId', window.staffDeptIds); return q; })(),
        supabaseClient.from('users').select('id, name, staffRole, status, email, photoUrl').eq('schoolId', currentSchoolId).eq('role', 'staff'),
        supabaseClient.from('attendance').select('class, date, records').eq('schoolId', currentSchoolId).eq('date', today),
        supabaseClient.from('attendance').select('date, records').eq('schoolId', currentSchoolId).gte('date', rangeStart),
        supabaseClient.from('exam_marks').select('id, class, examName, subject, studentName, marksObtained, maxMarks, totalMarks, status, enteredBy, enteredByName').eq('schoolId', currentSchoolId),
        supabaseClient.from('notices').select('title, body, date, target, createdAt').eq('schoolId', currentSchoolId),
        supabaseClient.from('homework').select('id').eq('schoolId', currentSchoolId)
    ]);
    const students = (stuRes.data || []).filter(s => s.status === 'Approved');
    const staffRows = (usrRes.data || []).filter(u => u.status !== 'blocked');
    const attToday = attTodayRes.data || [];
    const mkRows = mkRes.data || [];
    const notices = (ntRes.data || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const approvedMarks = mkRows.filter(m => m.status === 'Approved');
    const pendingMarks = mkRows.filter(m => m.status === 'Pending');
    const hwCount = (hwRes.data || []).length;
    window.staffHomeCache = { staffRows, attToday, mkRows, pendingMarks };

    const countRecords = (rows) => {
        let present = 0, absent = 0;
        (rows || []).forEach(r => { Object.values(r.records || {}).forEach(v => { v === 'Absent' ? absent++ : present++; }); });
        return { present, absent };
    };
    const todayCounts = countRecords(attToday);
    const classTotal = new Set(students.map(s => s.class)).size;
    const classMarked = attToday.length;
    const attPct = classTotal ? Math.round((classMarked / classTotal) * 100) : 0;
    const markedTotalToday = todayCounts.present + todayCounts.absent;
    const presentTodayPct = markedTotalToday ? Math.round((todayCounts.present / markedTotalToday) * 100) : 0;
    const monthRows = (attRangeRes.data || []).filter(r => monthKeys.includes(String(r.date || '').slice(0, 7)));
    const monthCounts = countRecords(monthRows);
    const monthTotal = monthCounts.present + monthCounts.absent;
    const monthPresentPct = monthTotal ? Math.round((monthCounts.present / monthTotal) * 100) : 0;
    const monthAbsentPct = monthTotal ? Math.round((monthCounts.absent / monthTotal) * 100) : 0;
    const approvedPct = mkRows.length ? Math.round((approvedMarks.length / mkRows.length) * 100) : 0;
    const mgmtCount = staffRows.filter(u => STAFF_MANAGEMENT_ROLES.includes(u.staffRole)).length;
    const examSets = new Set(pendingMarks.map(m => m.examName + '|' + m.class)).size;

    grid.innerHTML =
        staffKpiCard('fa-chalkboard-teacher', 'rgba(16,185,129,0.15)', '#34d399', staffRows.length, 'Teachers & Staff', `${mgmtCount} management`) +
        staffKpiCard('fa-user-graduate', 'rgba(59,130,246,0.15)', '#60a5fa', students.length, 'Active Students', `${classTotal} classes`) +
        staffKpiCard('fa-clipboard-check', 'rgba(245,158,11,0.15)', '#fbbf24', attPct + '%', 'Attendance Marked Today', `${classMarked}/${classTotal} classes`) +
        staffKpiCard('fa-user-check', 'rgba(34,211,238,0.15)', '#22d3ee', todayCounts.present, 'Present Today', `${todayCounts.absent} absent · ${presentTodayPct}%`) +
        staffKpiCard('fa-hourglass-half', 'rgba(139,92,246,0.15)', '#a78bfa', pendingMarks.length, 'Results Awaiting Veto', `${examSets} exam sets`) +
        staffKpiCard('fa-book-open', 'rgba(16,185,129,0.15)', '#34d399', hwCount, 'Homework Published', `${notices.length} notices`);

    staffRenderAttSummary([
        ['Present (this month)', monthPresentPct, '#10b981'],
        ['Absent (this month)', monthAbsentPct, '#f97316'],
        ['Classes Marked Today', attPct, '#8b5cf6'],
        ['Results Approved', approvedPct, '#22d3ee']
    ]);
    staffRenderAttChart(monthRows, monthKeys);
    staffRenderChart(approvedMarks);
    staffRenderCalendar();

    const noticeBox = document.getElementById('staff-home-notices');
    if (noticeBox) {
        noticeBox.innerHTML = notices.length ? notices.slice(0, 6).map(n => `
            <div style="border-left:3px solid #10b981; background:#0f1a30; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
                <div style="font-weight:700; color:#e2e8f0;">${staffEsc(n.title)}</div>
                <div style="font-size:12px; color:#9fb0c8; margin-top:4px;">${staffEsc(n.body)}</div>
                <div style="font-size:11px; color:#64748b; margin-top:6px;"><i class="fas fa-calendar"></i> ${staffEsc(n.date)}</div>
            </div>`).join('') : '<div style="padding:16px; text-align:center; color:#64748b; background:#0f1a30; border-radius:8px;">No notices published yet.</div>';
    }

    if (staffIsManagement()) {
        const cb = document.getElementById('staff-compliance-body');
        if (cb) cb.innerHTML = staffComplianceHtml(staffRows, mkRows);
        const ab = document.getElementById('staff-approval-body');
        if (ab) ab.innerHTML = pendingMarks.length ? pendingMarks.slice(0, 6).map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid #1c2c47; padding:8px 2px;">
                <div style="font-size:13px; color:#dbe4f0;"><strong>${staffEsc(m.enteredByName || 'Staff')}</strong> — ${staffEsc(m.examName)} (${staffEsc(m.subject)}) · Class ${staffEsc(m.class)}</div>
                <button class="submit-btn" style="padding:6px 10px; font-size:12px;" onclick="window.viewStaffApprovalDetail('${m.id}')">View Entries</button>
            </div>`).join('') : '<div style="padding:16px; text-align:center; color:#64748b; background:#0f1a30; border-radius:8px;">No results awaiting veto.</div>';
    } else {
        const tb = document.getElementById('staff-tasks-body');
        if (tb) {
            const myPending = pendingMarks.filter(m => m.enteredBy === currentStaffDoc.id).length;
            const tasks = [];
            if (staffHasPriv('attendance')) tasks.push(`<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 2px; border-bottom:1px solid #1c2c47; color:#dbe4f0;"><div><i class="fas fa-clipboard-list" style="color:#60a5fa;"></i> Today's class attendance${attToday.length ? '' : ' is not marked yet'}.</div><button class="submit-btn" style="padding:6px 12px; font-size:12px;" onclick="document.getElementById('staff-menu-attendance').click()">Mark Now</button></div>`);
            if (staffHasPriv('marks')) tasks.push(`<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 2px; border-bottom:1px solid #1c2c47; color:#dbe4f0;"><div><i class="fas fa-pen-alt" style="color:#34d399;"></i> ${myPending ? myPending + ' of your submitted results are awaiting chairman veto.' : 'No pending results. Enter exam marks when ready.'}</div><button class="submit-btn" style="padding:6px 12px; font-size:12px; background:#10b981;" onclick="document.getElementById('staff-menu-marks').click()">Enter Marks</button></div>`);
            tasks.push(`<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 2px; color:#dbe4f0;"><div><i class="fas fa-book-open" style="color:#818cf8;"></i> Publish homework for your classes.</div><button class="submit-btn" style="padding:6px 12px; font-size:12px; background:#6366f1;" onclick="document.getElementById('staff-menu-homework').click()">Open</button></div>`);
            tb.innerHTML = tasks.join('');
        }
    }
}

window.viewStaffApprovalDetail = (markId) => {
    const cache = window.staffHomeCache; const detail = document.getElementById('staff-approval-detail');
    if (!cache || !detail) return;
    const ref = cache.pendingMarks.find(m => m.id === markId);
    if (!ref) return;
    const rows = cache.pendingMarks.filter(m => m.examName === ref.examName && m.class === ref.class);
    detail.innerHTML = `<div style="background:rgba(245,158,11,0.08); border:1px solid #7c5806; border-radius:10px; padding:12px;">
        <div style="font-weight:700; color:#fbbf24; margin-bottom:8px;">${staffEsc(ref.examName)} · ${staffEsc(ref.subject)} · Class ${staffEsc(ref.class)}</div>
        ${rows.map(r => `<div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px dashed #7c5806; color:#dbe4f0;"><span>${staffEsc(r.studentName)}</span><strong>${staffEsc(r.marksObtained)} / ${staffEsc(r.maxMarks || r.totalMarks)}</strong></div>`).join('')}
    </div>`;
};

window.onStaffTabOpen = (targetId) => {
    if (!currentStaffDoc) return;
    if (targetId === 'staff-tab-home') return loadStaffHome();
    if (targetId === 'staff-tab-department') return loadMyDepartment();
    if (targetId === 'staff-tab-attendance') { const d = document.getElementById('staff_att_date'); if (d && !d.value) d.value = staffTodayStr(); return; }
    if (targetId === 'staff-tab-marks') { const d = document.getElementById('staff_mk_date'); if (d && !d.value) d.value = staffTodayStr(); return; }
    if (targetId === 'staff-tab-homework') return loadStaffHomeworkList();
    if (targetId === 'staff-tab-notices') return loadStaffNotices();
    if (targetId === 'staff-tab-timetable') return loadStaffTimetable();
    if (targetId === 'staff-tab-leave') return loadStaffLeaveList();
    if (targetId === 'staff-tab-staff') return loadStaffTeachers();
    if (targetId === 'staff-tab-profile') return renderStaffProfile();
};

window.loadStaffAttendanceRoster = async () => {
    const cls = document.getElementById('staff_att_class').value;
    const dt = document.getElementById('staff_att_date').value;
    if (!cls || !dt) return alert('Select both class and date.');
    const { data: students, error } = await supabaseClient.from('students').select('*').eq('schoolId', currentSchoolId).eq('class', cls).eq('status', 'Approved');
    if (error) return alert('Error loading students: ' + error.message);
    const { data: existing } = await supabaseClient.from('attendance').select('records').eq('schoolId', currentSchoolId).eq('class', cls).eq('date', dt).maybeSingle();
    const records = (existing && existing.records) || {};
    const stds = students || [];
    const body = document.getElementById('staff_att_roster_body');
    body.innerHTML = stds.length ? stds.map(st => {
        const val = records[st.id] === 'Absent' ? 'Absent' : 'Present';
        return `<tr class="hover-row" style="border-bottom:1px solid #1c2c47;">
            <td style="padding:10px;">${staffEsc(st.rollNo)}</td>
            <td style="padding:10px;"><strong>${staffEsc(st.name)}</strong></td>
            <td style="padding:10px;">${staffEsc(st.parentage || st.fatherName)}</td>
            <td style="padding:10px; text-align:center;">
                <label style="margin-right:10px;"><input type="radio" name="staffatt_${st.id}" value="Present" ${val === 'Present' ? 'checked' : ''}> Present</label>
                <label><input type="radio" name="staffatt_${st.id}" value="Absent" ${val === 'Absent' ? 'checked' : ''}> Absent</label>
            </td>
        </tr>`;
    }).join('') : '<tr><td colspan="4" style="padding:14px; text-align:center;">No approved students in this class.</td></tr>';
    document.getElementById('staff_att_panel').style.display = 'block';
};

window.saveStaffAttendance = async () => {
    const cls = document.getElementById('staff_att_class').value;
    const dt = document.getElementById('staff_att_date').value;
    if (!cls || !dt) return alert('Select both class and date.');
    const { data: students } = await supabaseClient.from('students').select('id').eq('schoolId', currentSchoolId).eq('class', cls).eq('status', 'Approved');
    const stds = students || [];
    if (stds.length === 0) return alert('No students to save.');
    const records = {};
    stds.forEach(st => {
        const selected = document.querySelector(`input[name="staffatt_${st.id}"]:checked`);
        records[st.id] = selected ? selected.value : 'Absent';
    });
    const attId = currentSchoolId + '_' + cls + '_' + dt;
    const { error } = await supabaseClient.from('attendance').upsert({
        id: attId, schoolId: currentSchoolId, class: cls, date: dt, records: records,
        role: 'staff', uid: currentStaffDoc.id, updatedAt: new Date().toISOString()
    });
    if (error) return alert('Error saving attendance: ' + error.message);
    alert('Attendance saved!');
    loadStaffHome();
};

window.loadStaffMarksRoster = async () => {
    const cls = document.getElementById('staff_mk_class').value;
    if (!cls) return alert('Select class first.');
    const { data: students, error } = await supabaseClient.from('students').select('*').eq('schoolId', currentSchoolId).eq('class', cls).eq('status', 'Approved');
    if (error) return alert('Error loading students: ' + error.message);
    const stds = students || [];
    document.getElementById('staff_mk_roster_body').innerHTML = stds.length ? stds.map(st => `
        <tr style="border-bottom:1px solid #1c2c47;">
            <td style="padding:10px;">${staffEsc(st.rollNo)}</td>
            <td style="padding:10px;"><strong style="color:#e2e8f0;">${staffEsc(st.name)}</strong></td>
            <td style="padding:10px; text-align:center;"><input type="number" min="0" id="staffmk_${st.id}" class="input-premium" style="width:110px; text-align:center;" placeholder="0"></td>
        </tr>`).join('') : '<tr><td colspan="3" style="padding:14px; text-align:center;">No approved students in this class.</td></tr>';
    document.getElementById('staff_mk_panel').style.display = 'block';
};

window.submitStaffMarks = async () => {
    const cls = document.getElementById('staff_mk_class').value;
    const examName = document.getElementById('staff_mk_exam').value.trim();
    const subject = document.getElementById('staff_mk_subject').value.trim();
    const maxMarks = Number(document.getElementById('staff_mk_max').value || 0);
    const dt = document.getElementById('staff_mk_date').value || staffTodayStr();
    if (!cls || !examName || !subject || !maxMarks) return alert('Fill class, exam name, subject and max marks.');
    const { data: students } = await supabaseClient.from('students').select('id, name, rollNo').eq('schoolId', currentSchoolId).eq('class', cls).eq('status', 'Approved');
    const stds = students || [];
    if (stds.length === 0) return alert('No students to submit.');
    const rows = stds.map(st => {
        const el = document.getElementById('staffmk_' + st.id);
        const got = Math.max(0, Math.min(maxMarks, Number(el && el.value || 0)));
        return {
            schoolId: currentSchoolId, studentId: st.id, studentName: st.name, class: cls,
            examName, subject, marksObtained: got, maxMarks, totalMarks: maxMarks,
            date: dt, status: 'Pending', enteredBy: currentStaffDoc.id, enteredByName: currentStaffDoc.name,
            createdAt: new Date().toISOString()
        };
    });
    const { error } = await supabaseClient.from('exam_marks').insert(rows);
    if (error) return alert('Error submitting marks: ' + error.message);
    alert('Marks submitted for Chairman veto.');
    document.getElementById('staff_mk_panel').style.display = 'none';
    document.getElementById('staff_mk_exam').value = '';
    document.getElementById('staff_mk_subject').value = '';
    loadStaffHome();
};

window.publishStaffHomework = async () => {
    const cls = document.getElementById('sh_class').value;
    const subject = document.getElementById('sh_subject').value.trim();
    const title = document.getElementById('sh_title').value.trim();
    const description = document.getElementById('sh_desc').value.trim();
    const dueDate = document.getElementById('sh_due').value;
    if (!cls || !subject || !title || !description) return alert('Fill class, subject, title and description.');
    const { error } = await supabaseClient.from('homework').insert({
        schoolId: currentSchoolId, class: cls, subject, title, description, dueDate: dueDate || '',
        teacherName: currentStaffDoc.name, createdBy: currentStaffDoc.id, createdAt: new Date().toISOString()
    });
    if (error) return alert('Error publishing homework: ' + error.message);
    alert('Homework published!');
    document.getElementById('sh_subject').value = ''; document.getElementById('sh_title').value = ''; document.getElementById('sh_desc').value = '';
    loadStaffHomeworkList();
};

window.loadStaffHomeworkList = async () => {
    const el = document.getElementById('staff-hw-list'); if (!el) return;
    let q = supabaseClient.from('homework').select('*').eq('schoolId', currentSchoolId);
    if (!staffIsManagement()) q = q.eq('createdBy', currentStaffDoc.id);
    const { data, error } = await q;
    if (error) return el.innerHTML = '<div style="padding:14px; color:#888;">Unable to load homework.</div>';
    const rows = (data || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    el.innerHTML = rows.length ? rows.map(hw => `
        <div style="border-left:3px solid #6366f1; background:#0f1a30; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <strong style="color:#e2e8f0;">${staffEsc(hw.subject)} — ${staffEsc(hw.title)}</strong>
                <span style="font-size:11px; color:#64748b;">Class ${staffEsc(hw.class)} · Due: ${staffEsc(hw.dueDate || '—')}</span>
            </div>
            <div style="font-size:13px; color:#9fb0c8; margin-top:4px;">${staffEsc(hw.description)}</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:6px;">By ${staffEsc(hw.teacherName)}</div>
        </div>`).join('') : '<div style="padding:16px; text-align:center; color:#64748b; background:#0f1a30; border-radius:8px;">No homework published yet.</div>';
};

window.loadStaffNotices = async () => {
    const el = document.getElementById('staff-notices-list'); if (!el) return;
    const { data, error } = await supabaseClient.from('notices').select('*').eq('schoolId', currentSchoolId);
    if (error) return el.innerHTML = '<div style="padding:14px; color:#888;">Unable to load notices.</div>';
    const role = currentStaffDoc.staffRole;
    const rows = (data || []).filter(n => !n.target || n.target === 'All' || n.target === 'Staff' || n.target === role)
        .slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    el.innerHTML = rows.length ? rows.map(n => `
        <div style="border-left:3px solid #10b981; background:#0f1a30; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <strong style="color:#e2e8f0;">${staffEsc(n.title)}</strong>
                <span style="font-size:11px; color:#64748b;">${staffEsc(n.date)}</span>
            </div>
            <div style="font-size:13px; color:#9fb0c8; margin-top:4px; white-space:pre-wrap;">${staffEsc(n.body)}</div>
        </div>`).join('') : '<div style="padding:16px; text-align:center; color:#64748b; background:#0f1a30; border-radius:8px;">No notices for you yet.</div>';
};

window.publishStaffNotice = async () => {
    const target = document.getElementById('sn_target').value;
    const title = document.getElementById('sn_title').value.trim();
    const body = document.getElementById('sn_body').value.trim();
    if (!title || !body) return alert('Fill title and body.');
    const { error } = await supabaseClient.from('notices').insert({
        target, title, body, date: new Date().toLocaleDateString(), visible: true,
        schoolId: currentSchoolId, authorName: currentStaffDoc.name, createdAt: new Date().toISOString()
    });
    if (error) return alert('Error publishing notice: ' + error.message);
    alert('Notice published!');
    document.getElementById('sn_title').value = ''; document.getElementById('sn_body').value = '';
    loadStaffNotices();
};

window.loadStaffTimetable = async () => {
    const el = document.getElementById('staff-timetable-body'); if (!el) return;
    const { data: schoolRow } = await supabaseClient.from('schools').select('schedule').eq('id', currentSchoolId).maybeSingle();
    const rows = Array.isArray(schoolRow && schoolRow.schedule) ? schoolRow.schedule : [];
    el.innerHTML = rows.length ? `<div style="overflow:auto;"><table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead><tr style="background:#0f1a30; text-align:left;"><th style="padding:8px; color:#8fa3bf;">Period</th><th style="padding:8px; color:#8fa3bf;">Time</th><th style="padding:8px; color:#8fa3bf;">Class</th><th style="padding:8px; color:#8fa3bf;">Subject</th><th style="padding:8px; color:#8fa3bf;">Teacher</th><th style="padding:8px; color:#8fa3bf;">Room</th></tr></thead>
        <tbody>${rows.map(r => `<tr style="border-bottom:1px solid #1c2c47; color:#dbe4f0;">
            <td style="padding:8px;">${staffEsc(r.period || r.title || '—')}</td>
            <td style="padding:8px;">${staffEsc(r.time || '—')}</td>
            <td style="padding:8px;">${staffEsc(r.class || '—')}</td>
            <td style="padding:8px;">${staffEsc(r.subject || '—')}</td>
            <td style="padding:8px;">${staffEsc(r.teacher || '—')}</td>
            <td style="padding:8px;">${staffEsc(r.room || '—')}</td>
        </tr>`).join('')}</tbody></table></div>`
        : '<div style="padding:16px; text-align:center; color:#64748b; background:#0f1a30; border-radius:8px;">Timetable has not been published by the school yet.</div>';
};

window.submitStaffLeave = async () => {
    const start = document.getElementById('sl_start').value;
    const end = document.getElementById('sl_end').value;
    const reason = document.getElementById('sl_reason').value.trim();
    if (!start || !end || !reason) return alert('Fill all leave fields.');
    const { error } = await supabaseClient.from('leave_requests').insert({
        schoolId: currentSchoolId, studentId: currentStaffDoc.id, studentName: currentStaffDoc.name,
        class: currentStaffDoc.staffRole || 'Staff', startDate: start, endDate: end, reason,
        status: 'Pending', createdAt: new Date().toISOString()
    });
    if (error) return alert('Error submitting leave request: ' + error.message);
    alert('Leave request submitted for approval.');
    document.getElementById('sl_reason').value = '';
    loadStaffLeaveList();
};

window.loadStaffLeaveList = async () => {
    const el = document.getElementById('staff-leave-list'); if (!el) return;
    const { data, error } = await supabaseClient.from('leave_requests').select('*').eq('schoolId', currentSchoolId).eq('studentId', currentStaffDoc.id);
    if (error) return el.innerHTML = '<div style="padding:14px; color:#888;">Unable to load leave requests.</div>';
    const rows = (data || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    el.innerHTML = rows.length ? rows.map(r => {
        const color = r.status === 'Approved' ? '#dcfce7;#166534' : (r.status === 'Rejected' ? '#fee2e2;#b91c1c' : '#fef3c7;#b45309');
        const [bg, fg] = color.split(';');
        return `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid #1c2c47; padding:10px 2px;">
            <div><strong style="font-size:13px; color:#e2e8f0;">${staffEsc(r.startDate)} → ${staffEsc(r.endDate)}</strong><div style="font-size:12px; color:#8fa3bf;">${staffEsc(r.reason)}</div></div>
            <span style="background:${bg}; color:${fg}; padding:4px 12px; border-radius:12px; font-size:11px; font-weight:bold;">${staffEsc(r.status || 'Pending')}</span>
        </div>`;
    }).join('') : '<div style="padding:16px; text-align:center; color:#64748b; background:#0f1a30; border-radius:8px;">No leave requests yet.</div>';
};

window.loadStaffTeachers = async () => {
    const el = document.getElementById('staff-teachers-body'); if (!el) return;
    const cache = window.staffHomeCache;
    const today = staffTodayStr();
    const [usrRes, mkRes] = await Promise.all([
        supabaseClient.from('users').select('id, name, staffRole, email, status').eq('schoolId', currentSchoolId).eq('role', 'staff'),
        supabaseClient.from('exam_marks').select('enteredBy').eq('schoolId', currentSchoolId)
    ]);
    const staffRows = usrRes.data || []; const mkRows = mkRes.data || [];
    window.staffHomeCache = Object.assign({}, cache, { staffRows, mkRows });
    el.innerHTML = staffRows.length ? staffRows.map(st => `
        <tr>
            <td><strong style="color:#e2e8f0;">${staffEsc(st.name)}</strong></td>
            <td>${staffEsc(st.staffRole)}</td>
            <td>${staffEsc(st.email)}</td>
            <td>${staffEsc(st.status || 'active')}</td>
            <td>${staffPill(mkRows.some(m => m.enteredBy === st.id), 'Submitted', 'Pending')}</td>
        </tr>`).join('') : '<tr><td colspan="6" style="padding:14px; text-align:center; color:#64748b;">No staff found.</td></tr>';
};

// =============================================================================================
// =============================================================================================
// ============================== PHASE A — INSTITUTION ARCHITECTURE ===========================
// =============================================================================================
// Multi-tenant extension: schools = institutions (school|college), departments /
// programs / academic_sessions / academic_levels / sections / staff_assignments.
// Tenant key stays schools.id ("schoolId"); department scope comes from
// staff_assignments so one user may serve several departments. RLS in
// supabase/migrations/20261002140000_phase_a_institution_architecture.sql
// enforces the same boundaries at the database level.
// =============================================================================================
let currentInstitutionType = 'school';
let phaseACache = { departments: [], programs: [], sessions: [], levels: [], sections: [], assignments: [] };
window.staffDeptIds = [];
const institutionIsCollege = () => currentInstitutionType === 'college';
const paFind = (arr, id) => (arr || []).find(x => x.id === id);
const paName = (arr, id) => { const r = paFind(arr, id); return r ? r.name : '—'; };

window.applyInstitutionMode = async () => {
    if (!currentSchoolId) return;
    const { data } = await supabaseClient.from('schools').select('institution_type').eq('id', currentSchoolId).maybeSingle();
    currentInstitutionType = (data && data.institution_type) || 'school';
    const college = institutionIsCollege();
    ['departments', 'programs', 'sessions', 'sections'].forEach(k => {
        const el = document.getElementById('pa-menu-' + k);
        if (el) el.style.display = college ? '' : 'none';
    });
    const ap = document.getElementById('pa-assign-panel');
    if (ap) ap.style.display = college ? '' : 'none';
    if (college) { await paLoadCache(); paRenderAll(); }
};

async function paLoadCache() {
    const q = (t) => supabaseClient.from(t).select('*').eq('schoolId', currentSchoolId);
    const [d, p, se, l, sec, as] = await Promise.all([
        q('departments'), q('programs'), q('academic_sessions'), q('academic_levels'), q('sections'), q('staff_assignments')
    ]);
    phaseACache = {
        departments: d.data || [], programs: p.data || [], sessions: se.data || [],
        levels: l.data || [], sections: sec.data || [], assignments: as.data || []
    };
}

function paFillSelect(id, rows, placeholder, extra) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder || '—'}</option>` + (rows || []).map(r =>
        `<option value="${r.id}">${staffEsc(r.name)}${r.code ? ' (' + staffEsc(r.code) + ')' : ''}</option>`).join('') + (extra || '');
}

function paRenderAll() {
    paFillSelect('pa_prog_dept', phaseACache.departments, 'Select department');
    paFillSelect('pa_level_prog', phaseACache.programs, '— Institution-wide —');
    paFillSelect('pa_sec_prog', phaseACache.programs, '—');
    paFillSelect('pa_sec_level', phaseACache.levels, '—');
    paFillSelect('pa_sec_session', phaseACache.sessions, '—');

    const db = document.getElementById('pa-dept-body');
    if (db) db.innerHTML = phaseACache.departments.length ? phaseACache.departments.map(d => {
        const progs = phaseACache.programs.filter(p => p.departmentId === d.id).length;
        const active = d.status === 'active';
        return `<tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px;"><strong>${staffEsc(d.name)}</strong></td>
            <td style="padding:8px;">${staffEsc(d.code)}</td>
            <td style="padding:8px;">${progs}</td>
            <td style="padding:8px;">${active ? '<span style="color:#16a34a;font-weight:bold;">Active</span>' : '<span style="color:#dc2626;font-weight:bold;">Inactive</span>'}</td>
            <td style="padding:8px;"><button class="action-btn btn-blue" onclick="window.paSetDepartmentStatus('${d.id}', ${active ? "'inactive'" : "'active'"})">${active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:14px;text-align:center;color:#888;">No departments yet.</td></tr>';

    const pb = document.getElementById('pa-prog-body');
    if (pb) pb.innerHTML = phaseACache.programs.length ? phaseACache.programs.map(p => `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px;"><strong>${staffEsc(p.name)}</strong> (${staffEsc(p.code)})</td>
        <td style="padding:8px;">${staffEsc(paName(phaseACache.departments, p.departmentId))}</td>
        <td style="padding:8px;">${staffEsc(p.levelType)}</td>
        <td style="padding:8px;">${p.status === 'active' ? '<span style="color:#16a34a;font-weight:bold;">Active</span>' : '<span style="color:#dc2626;font-weight:bold;">Inactive</span>'}</td>
        <td style="padding:8px;"><button class="action-btn btn-blue" onclick="window.paSetProgramStatus('${p.id}', ${p.status === 'active' ? "'inactive'" : "'active'"})">${p.status === 'active' ? 'Deactivate' : 'Activate'}</button></td>
    </tr>`).join('') : '<tr><td colspan="6" style="padding:14px;text-align:center;color:#888;">No programs yet.</td></tr>';

    const sb = document.getElementById('pa-session-body');
    if (sb) sb.innerHTML = phaseACache.sessions.length ? phaseACache.sessions.map(s => `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px;"><strong>${staffEsc(s.name)}</strong></td>
        <td style="padding:8px;">${staffEsc(s.startDate || '—')} → ${staffEsc(s.endDate || '—')}</td>
        <td style="padding:8px;">${s.isCurrent ? '<span style="color:#16a34a;font-weight:bold;">Current</span>' : '—'}</td>
        <td style="padding:8px;">${s.isCurrent ? '' : `<button class="action-btn btn-blue" onclick="window.paSetCurrentSession('${s.id}')">Mark Current</button>`}</td>
    </tr>`).join('') : '<tr><td colspan="4" style="padding:14px;text-align:center;color:#888;">No sessions yet.</td></tr>';

    const lb = document.getElementById('pa-level-body');
    if (lb) lb.innerHTML = phaseACache.levels.map(l => `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px;">${staffEsc(l.name)}</td><td style="padding:8px;">${staffEsc(l.code)}</td>
        <td style="padding:8px;">${staffEsc(l.kind)}</td><td style="padding:8px;">${staffEsc(paName(phaseACache.programs, l.programId))}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="padding:14px;text-align:center;color:#888;">No levels yet.</td></tr>';

    const scb = document.getElementById('pa-section-body');
    if (scb) scb.innerHTML = phaseACache.sections.map(sc => `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px;"><strong>${staffEsc(sc.name)}</strong></td><td style="padding:8px;">${staffEsc(sc.class || '—')}</td>
        <td style="padding:8px;">${staffEsc(paName(phaseACache.programs, sc.programId))} / ${staffEsc(paName(phaseACache.levels, sc.levelId))}</td>
        <td style="padding:8px;">${staffEsc(paName(phaseACache.sessions, sc.academicSessionId))}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="padding:14px;text-align:center;color:#888;">No sections yet.</td></tr>';

    paRenderAssignPanel();
}

window.paSaveDepartment = async () => {
    const name = document.getElementById('pa_dept_name').value.trim();
    const code = document.getElementById('pa_dept_code').value.trim().toUpperCase();
    if (!name || !code) return alert('Fill department name and code.');
    if (phaseACache.departments.some(d => d.code.toUpperCase() === code)) return alert('Code already used in this institution.');
    const { error } = await supabaseClient.from('departments').insert({ schoolId: currentSchoolId, name, code });
    if (error) return alert('Error saving department: ' + error.message);
    document.getElementById('pa_dept_name').value = ''; document.getElementById('pa_dept_code').value = '';
    alert('Department saved.');
    await paLoadCache(); paRenderAll();
};

window.paSetDepartmentStatus = async (id, status) => {
    const { error } = await supabaseClient.from('departments').update({ status }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    await paLoadCache(); paRenderAll();
};

window.paSaveProgram = async (withLevels) => {
    const departmentId = document.getElementById('pa_prog_dept').value;
    const name = document.getElementById('pa_prog_name').value.trim();
    const code = document.getElementById('pa_prog_code').value.trim().toUpperCase();
    const levelType = document.getElementById('pa_prog_leveltype').value;
    const duration = Number(document.getElementById('pa_prog_duration').value || 0);
    if (!departmentId || !name || !code) return alert('Select department and fill program name/code.');
    if (phaseACache.programs.some(p => p.code.toUpperCase() === code)) return alert('Program code already used in this institution.');
    const { data, error } = await supabaseClient.from('programs').insert({ schoolId: currentSchoolId, departmentId, name, code, levelType, duration: duration || null }).select().single();
    if (error) return alert('Error saving program: ' + error.message);
    if (withLevels && duration > 0) {
        const unit = levelType === 'semester' ? 'Semester' : levelType === 'year' ? 'Year' : levelType === 'trimester' ? 'Trimester' : 'Level';
        const rows = [];
        for (let i = 1; i <= duration; i++) rows.push({
            schoolId: currentSchoolId, departmentId, programId: data.id,
            name: `${unit} ${i}`, code: `${code}-${unit.slice(0, 3).toUpperCase()}${i}`, kind: levelType === 'custom' ? 'custom' : levelType, sortOrder: i
        });
        const { error: le } = await supabaseClient.from('academic_levels').insert(rows);
        if (le) return alert('Program saved but levels failed: ' + le.message);
    }
    document.getElementById('pa_prog_name').value = ''; document.getElementById('pa_prog_code').value = '';
    alert('Program saved.');
    await paLoadCache(); paRenderAll();
};

window.paSetProgramStatus = async (id, status) => {
    const { error } = await supabaseClient.from('programs').update({ status }).eq('id', id);
    if (error) return alert('Error: ' + error.message);
    await paLoadCache(); paRenderAll();
};

window.paSaveSession = async () => {
    const name = document.getElementById('pa_sess_name').value.trim();
    if (!name) return alert('Session name required.');
    const start = document.getElementById('pa_sess_start').value || null;
    const end = document.getElementById('pa_sess_end').value || null;
    const { error } = await supabaseClient.from('academic_sessions').insert({ schoolId: currentSchoolId, name, startDate: start, endDate: end });
    if (error) return alert('Error saving session: ' + error.message);
    alert('Session saved.');
    await paLoadCache(); paRenderAll();
};

window.paSetCurrentSession = async (id) => {
    const { error: e1 } = await supabaseClient.from('academic_sessions').update({ isCurrent: false }).eq('schoolId', currentSchoolId);
    if (e1) return alert('Error: ' + e1.message);
    const { error: e2 } = await supabaseClient.from('academic_sessions').update({ isCurrent: true }).eq('id', id);
    if (e2) return alert('Error: ' + e2.message);
    await paLoadCache(); paRenderAll();
};

window.paSaveLevel = async () => {
    const name = document.getElementById('pa_level_name').value.trim();
    const code = document.getElementById('pa_level_code').value.trim().toUpperCase();
    const kind = document.getElementById('pa_level_kind').value;
    const programId = document.getElementById('pa_level_prog').value || null;
    if (!name || !code) return alert('Level name and code required.');
    const prog = paFind(phaseACache.programs, programId);
    const { error } = await supabaseClient.from('academic_levels').insert({
        schoolId: currentSchoolId, programId, departmentId: prog ? prog.departmentId : null, name, code, kind
    });
    if (error) return alert('Error saving level: ' + error.message);
    alert('Level saved.');
    await paLoadCache(); paRenderAll();
};

window.paSaveSection = async () => {
    const name = document.getElementById('pa_sec_name').value.trim();
    const cls = document.getElementById('pa_sec_class').value.trim();
    const programId = document.getElementById('pa_sec_prog').value || null;
    const levelId = document.getElementById('pa_sec_level').value || null;
    const sessionId = document.getElementById('pa_sec_session').value || null;
    if (!name) return alert('Section name required.');
    if (!cls && !programId) return alert('Provide a class (school) or program (college).');
    const { error } = await supabaseClient.from('sections').insert({
        schoolId: currentSchoolId, class: cls || null, programId, levelId, name, academicSessionId: sessionId
    });
    if (error) return alert('Error saving section: ' + error.message);
    alert('Section saved.');
    await paLoadCache(); paRenderAll();
};

// ---- staff <-> department assignments (many-to-many) ----
async function paRenderAssignPanel() {
    const body = document.getElementById('pa-assign-body');
    if (!body || !institutionIsCollege()) return;
    const { data } = await supabaseClient.from('users').select('id, name, staffRole, email').eq('schoolId', currentSchoolId).eq('role', 'staff');
    const staff = data || [];
    body.innerHTML = staff.length ? staff.map(st => {
        const mine = phaseACache.assignments.filter(a => a.userId === st.id);
        const role = mine.length ? mine[0].roleId : (st.staffRole === 'HOD' ? 'hod' : 'teacher');
        return `<tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px;"><strong>${staffEsc(st.name)}</strong><br><small>${staffEsc(st.email)}</small></td>
            <td style="padding:8px;">
                <select id="pa_as_role_${st.id}" class="input-premium" style="min-width:110px;">
                    <option value="hod" ${role === 'hod' ? 'selected' : ''}>HOD</option>
                    <option value="teacher" ${role === 'teacher' ? 'selected' : ''}>Teacher</option>
                    <option value="staff" ${role === 'staff' ? 'selected' : ''}>Staff</option>
                </select>
            </td>
            <td style="padding:8px;">${phaseACache.departments.map(d => {
                const on = mine.some(a => a.departmentId === d.id);
                return `<label style="margin-right:10px;white-space:nowrap;"><input type="checkbox" id="pa_as_${st.id}_${d.id}" ${on ? 'checked' : ''}> ${staffEsc(d.code)}</label>`;
            }).join('') || '<small>No departments yet</small>'}</td>
            <td style="padding:8px;"><button class="action-btn btn-green" onclick="window.paSaveStaffAssignments('${st.id}')"><i class="fas fa-save"></i></button></td>
        </tr>`;
    }).join('') : '<tr><td colspan="4" style="padding:14px;text-align:center;color:#888;">No staff yet.</td></tr>';
}

window.paSaveStaffAssignments = async (userId) => {
    const roleSel = document.getElementById('pa_as_role_' + userId);
    const roleId = roleSel ? roleSel.value : 'teacher';
    const wanted = phaseACache.departments.filter(d => {
        const cb = document.getElementById(`pa_as_${userId}_${d.id}`);
        return cb && cb.checked;
    }).map(d => d.id);
    const current = phaseACache.assignments.filter(a => a.userId === userId);
    const removeIds = current.filter(a => a.departmentId && !wanted.includes(a.departmentId)).map(a => a.id);
    const addIds = wanted.filter(w => !current.some(a => a.departmentId === w));
    if (removeIds.length) {
        const { error } = await supabaseClient.from('staff_assignments').delete().in('id', removeIds);
        if (error) return alert('Error removing assignments: ' + error.message);
    }
    if (addIds.length) {
        const rows = addIds.map((depId, i) => ({
            schoolId: currentSchoolId, userId, departmentId: depId, roleId, isPrimary: i === 0
        }));
        const { error } = await supabaseClient.from('staff_assignments').insert(rows);
        if (error) return alert('Error adding assignments: ' + error.message);
    }
    if (roleId === 'hod') {
        await supabaseClient.from('users').update({ staffRole: 'HOD' }).eq('id', userId);
    }
    alert('Assignments saved.');
    await paLoadCache(); paRenderAssignPanel();
};

// ---- student academic placement (college) ----
let paPlacementStudentId = null;
window.openStudentPlacement = async (studentId) => {
    paPlacementStudentId = studentId;
    const { data } = await supabaseClient.from('students').select('*').eq('id', studentId).maybeSingle();
    if (!data) return alert('Student not found.');
    const row = data.data ? { ...data, ...data.data } : data;
    if (!phaseACache.departments.length) await paLoadCache();
    document.getElementById('pa_pl_student').innerText = `${row.name || 'Student'} (${row.class ? 'Class ' + row.class : 'College'})`;
    paFillSelect('pa_pl_dept', phaseACache.departments);
    paFillSelect('pa_pl_prog', phaseACache.programs);
    paFillSelect('pa_pl_level', phaseACache.levels);
    paFillSelect('pa_pl_section', phaseACache.sections);
    paFillSelect('pa_pl_session', phaseACache.sessions);
    document.getElementById('pa_pl_dept').value = row.departmentId || '';
    window.paPlacementCascade();
    document.getElementById('pa_pl_prog').value = row.programId || '';
    document.getElementById('pa_pl_level').value = row.levelId || '';
    document.getElementById('pa_pl_section').value = row.sectionId || '';
    document.getElementById('pa_pl_session').value = row.academicSessionId || '';
    document.getElementById('pa_pl_roll').value = row.rollCode || '';
    document.getElementById('pa-placement-modal').style.display = 'flex';
};

window.paPlacementCascade = () => {
    const dept = document.getElementById('pa_pl_dept').value;
    const progs = phaseACache.programs.filter(p => !dept || p.departmentId === dept);
    paFillSelect('pa_pl_prog', progs);
    const prog = document.getElementById('pa_pl_prog').value;
    paFillSelect('pa_pl_level', phaseACache.levels.filter(l => !prog || l.programId === prog));
    const level = document.getElementById('pa_pl_level').value;
    paFillSelect('pa_pl_section', phaseACache.sections.filter(sc => (!prog || sc.programId === prog) && (!level || sc.levelId === level)));
};

window.paAutoRoll = async () => {
    if (!paPlacementStudentId) return;
    const sessionId = document.getElementById('pa_pl_session').value || null;
    const progId = document.getElementById('pa_pl_prog').value || null;
    const levelId = document.getElementById('pa_pl_level').value || null;
    const sectionId = document.getElementById('pa_pl_section').value || null;
    const { data: st } = await supabaseClient.from('students').select('class').eq('id', paPlacementStudentId).maybeSingle();
    const cls = institutionIsCollege() ? null : (st && st.class) || null;
    const { data: num, error } = await supabaseClient.rpc('next_roll_code', {
        p_school_id: currentSchoolId, p_session_id: sessionId, p_program_id: progId, p_class: cls, p_section_id: sectionId
    });
    if (error) return alert('Roll code RPC unavailable until the Phase A migration is executed: ' + error.message);
    const prog = paFind(phaseACache.programs, progId);
    const level = paFind(phaseACache.levels, levelId);
    const sec = paFind(phaseACache.sections, sectionId);
    const parts = institutionIsCollege()
        ? [prog && prog.code, level && level.code, sec && sec.name]
        : ['CLASS', (st && st.class) || '', sec && sec.name];
    const prefix = parts.filter(Boolean).join('-');
    document.getElementById('pa_pl_roll').value = (prefix ? prefix + '-' : '') + num;
};

window.paSavePlacement = async () => {
    if (!paPlacementStudentId) return;
    const payload = {
        departmentId: document.getElementById('pa_pl_dept').value || null,
        programId: document.getElementById('pa_pl_prog').value || null,
        levelId: document.getElementById('pa_pl_level').value || null,
        sectionId: document.getElementById('pa_pl_section').value || null,
        academicSessionId: document.getElementById('pa_pl_session').value || null,
        rollCode: document.getElementById('pa_pl_roll').value.trim() || null
    };
    const { error } = await supabaseClient.from('students').update(payload).eq('id', paPlacementStudentId);
    if (error) return alert('Error saving placement: ' + error.message);
    document.getElementById('pa-placement-modal').style.display = 'none';
    alert('Academic placement saved.');
    if (window.loadStudents) window.loadStudents();
};

// ---- staff portal: department scope + My Department tab ----
async function paInitStaffScope() {
    window.staffDeptIds = [];
    const menu = document.getElementById('staff-menu-department');
    if (!currentStaffDoc) return;
    const { data } = await supabaseClient.from('schools').select('institution_type').eq('id', currentSchoolId).maybeSingle();
    currentInstitutionType = (data && data.institution_type) || 'school';
    if (!institutionIsCollege()) { if (menu) menu.style.display = 'none'; return; }
    const { data: as } = await supabaseClient.from('staff_assignments').select('*').eq('userId', currentStaffDoc.id);
    const rows = as || [];
    window.staffDeptIds = rows.filter(r => r.departmentId).map(r => r.departmentId);
    if (menu) menu.style.display = window.staffDeptIds.length ? '' : 'none';
}

async function loadMyDepartment() {
    const ov = document.getElementById('staff-dept-overview');
    const stb = document.getElementById('staff-dept-staff');
    const sub = document.getElementById('staff-dept-students');
    if (!ov || !window.staffDeptIds.length) { if (ov) ov.innerHTML = '<div style="color:#64748b;padding:12px;">No department assigned.</div>'; return; }
    const [dRes, pRes, sRes, uRes, asRes] = await Promise.all([
        supabaseClient.from('departments').select('*').eq('schoolId', currentSchoolId),
        supabaseClient.from('programs').select('*').in('departmentId', window.staffDeptIds),
        supabaseClient.from('students').select('id, name, rollNo, class, programId, levelId, status, departmentId').in('departmentId', window.staffDeptIds).eq('schoolId', currentSchoolId),
        supabaseClient.from('users').select('id, name, staffRole, email').eq('schoolId', currentSchoolId).eq('role', 'staff'),
        supabaseClient.from('staff_assignments').select('*').in('departmentId', window.staffDeptIds)
    ]);
    const depts = (dRes.data || []).filter(d => window.staffDeptIds.includes(d.id));
    const progs = pRes.data || [];
    const students = sRes.data || [];
    const staffIds = new Set((asRes.data || []).map(a => a.userId));
    const deptStaff = (uRes.data || []).filter(u => staffIds.has(u.id));
    ov.innerHTML = depts.map(d => {
        const dProgs = progs.filter(p => p.departmentId === d.id);
        const dStu = students.filter(s => s.departmentId === d.id).length;
        return `<div style="border:1px solid #1f3050;background:#0f1a30;border-radius:10px;padding:12px;margin-bottom:10px;">
            <div style="font-weight:800;color:#e2e8f0;">${staffEsc(d.name)} <span style="color:#64748b;font-size:11px;">(${staffEsc(d.code)})</span></div>
            <div style="font-size:12px;color:#8fa3bf;margin-top:6px;">${dProgs.length} programs · ${dStu} students</div>
            <div style="margin-top:6px;">${dProgs.map(p => `<span style="display:inline-block;background:rgba(16,185,129,0.12);color:#34d399;border-radius:10px;padding:2px 10px;font-size:11px;margin:2px 4px 2px 0;">${staffEsc(p.code)}</span>`).join('')}</div>
        </div>`;
    }).join('') || '<div style="color:#64748b;padding:12px;">Department data unavailable.</div>';
    stb.innerHTML = deptStaff.map(u => `<div style="display:flex;justify-content:space-between;padding:8px 2px;border-bottom:1px solid #1c2c47;color:#dbe4f0;font-size:13px;"><span>${staffEsc(u.name)}</span><span style="color:#8fa3bf;">${staffEsc(u.staffRole)}</span></div>`).join('') || '<div style="color:#64748b;padding:12px;">No staff assigned.</div>';
    sub.innerHTML = students.length ? students.map(s => `<tr>
        <td>${staffEsc(s.rollCode || s.rollNo || '—')}</td><td>${staffEsc(s.name)}</td>
        <td>${staffEsc(paName(progs, s.programId))}</td>
        <td>${staffEsc(paName(phaseACache.levels, s.levelId))} ${s.class ? '/ ' + staffEsc(s.class) : ''}</td>
        <td>${staffEsc(s.status || 'Approved')}</td>
        <td><button class="action-btn btn-blue" onclick="openStudentSubjectsModal('${s.id}')"><i class="fas fa-book"></i> Subjects</button></td>
    </tr>`).join('') : '<tr><td colspan="6" style="padding:14px;text-align:center;color:#64748b;">No students placed in your department yet.</td></tr>';
}

window.openStudentSubjectsModal = async (studentId) => {
    document.getElementById("hod_sub_student_id").value = studentId;
    document.getElementById("hod_sub_minor").value = "Loading...";
    document.getElementById("hod_sub_mdc").value = "Loading...";
    document.getElementById("hod_sub_skill").value = "Loading...";
    document.getElementById("hod_sub_voc").value = "Loading...";
    document.getElementById("hod-subjects-modal").style.display = "flex";

    const { data, error } = await supabaseClient.from("students").select("data").eq("id", studentId).maybeSingle();
    if (!error && data && data.data) {
        document.getElementById("hod_sub_minor").value = data.data.minorSubject || "";
        document.getElementById("hod_sub_mdc").value = data.data.mdcSubject || "";
        document.getElementById("hod_sub_skill").value = data.data.skillSubject || "";
        document.getElementById("hod_sub_voc").value = data.data.vocationalSubject || "";
    } else {
        document.getElementById("hod_sub_minor").value = "";
        document.getElementById("hod_sub_mdc").value = "";
        document.getElementById("hod_sub_skill").value = "";
        document.getElementById("hod_sub_voc").value = "";
    }
};

window.saveStudentSubjects = async () => {
    const studentId = document.getElementById("hod_sub_student_id").value;
    if (!studentId) return;
    const payload = {
        minorSubject: document.getElementById("hod_sub_minor").value.trim(),
        mdcSubject: document.getElementById("hod_sub_mdc").value.trim(),
        skillSubject: document.getElementById("hod_sub_skill").value.trim(),
        vocationalSubject: document.getElementById("hod_sub_voc").value.trim()
    };
    try {
        const { error } = await supabaseClient.rpc("update_student", { p_student_id: studentId, p_payload: payload });
        if (error) throw error;
        alert("Subjects assigned successfully!");
        document.getElementById("hod-subjects-modal").style.display = "none";
    } catch (e) {
        alert("Error saving subjects: " + e.message);
    }
};

  // ============================== STUDENT PORTAL (MERGED) ======================================
// =============================================================================================

let currentStudentUser = null;
let currentStudentSchoolDoc = null;

// ---------------------------------------------------------------------------
// Dedicated Supabase client for the merged student portal.
// The Render API issues a student JWT on login and it is attached as the
// `Authorization: Bearer` header of THIS client only. The chairman/staff client
// (`supabaseClient`, GoTrue backed) is never reused for student modules, so a
// chairman session open in the same browser can never become the authentication
// source for student data.
// ---------------------------------------------------------------------------
let studentPortalClient = null;

// Bumped on every student login/logout so a response that belongs to a previous
// student session can never be rendered into the current dashboard.
let studentSessionEpoch = 0;

function createStudentPortalClient(accessToken) {
    return window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        },
        global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
}

// Shared student modules may fall back to the default client (none of them carried a
// student JWT before). Modules that must run AS the student use
// requireStudentPortalClient() so they can never silently use a staff/anon session.
const studentSupabase = () => studentPortalClient || supabaseClient;

function requireStudentPortalClient() {
    if (!studentPortalClient) {
        const error = new Error('Authenticated student session required. Please sign in again.');
        error.studentAuthError = true;
        throw error;
    }
    return studentPortalClient;
}

// PostgREST reports JWT problems in the PGRST30x group (HTTP 401) and Supabase surfaces
// them as a PostgrestError, so a rejected/expired student token is detectable client side.
function isStudentAuthError(error) {
    if (!error) return false;
    if (error.studentAuthError === true) return true;
    const code = String(error.code || '').toUpperCase();
    if (/^PGRST30[0-3]$/.test(code)) return true;
    return /jwt|access token|token is expired|could not authenticate/i.test(`${error.message || ''} ${error.details || ''}`);
}

const studentFeatures = [
    { id: 'profile', title: 'Profile', icon: 'user' },
    { id: 'homework', title: 'Homework', icon: 'book-open' },
    { id: 'fee', title: 'Fee', icon: 'indian-rupee' },
    { id: 'datesheet', title: 'DateSheet', icon: 'calendar-days' },
    { id: 'attendance', title: 'Attendance', icon: 'calendar-check' },
    { id: 'sms', title: 'Sms', icon: 'message-square' },
    { id: 'calendar', title: 'Calendar Planing', icon: 'calendar-clock' },
    { id: 'idcard', title: 'Id Card', icon: 'credit-card' },
    { id: 'syllabus', title: 'Syllabus', icon: 'book' },
    { id: 'fee-receipt', title: 'Fee Receipt', icon: 'receipt' },
    { id: 'admit', title: 'Admit Card', icon: 'sparkles' },
    { id: 'gatepass', title: 'Gate Pass', icon: 'ticket' },
    { id: 'notifications', title: 'Notifications', icon: 'bell' },
    { id: 'birthday', title: 'Birthday', icon: 'cake' },
    { id: 'transport', title: 'Transport', icon: 'bus' },
    { id: 'study-material', title: 'Study Material', icon: 'graduation-cap' },
    { id: 'result', title: 'Result', icon: 'line-chart' },
    { id: 'leave', title: 'Leave Request', icon: 'calendar-off' },
    { id: 'batchmate', title: 'Batchmate', icon: 'users' },
    { id: 'circular', title: 'Circular', icon: 'send' },
    { id: 'news', title: 'News', icon: 'newspaper' },
    { id: 'assignment', title: 'Assignment', icon: 'clipboard-list' },
    { id: 'complaint', title: 'Complaint', icon: 'wrench' },
    { id: 'online-classes', title: 'Online Classes', icon: 'monitor-play' },
    { id: 'social-media', title: 'Social Media', icon: 'share-2' }
];

function getStudentFeatureToggleKey(featureId) {
    return LEGACY_STUDENT_FEATURE_KEYS[featureId] || featureId;
}

function renderStudentFeatureGrid() {
    const container = document.getElementById("student-feature-grid");
    if (!container) return;
    container.innerHTML = `
        <div class="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-y-8 gap-x-4 justify-items-center">
            ${studentFeatures.map(f => {
        const key = getStudentFeatureToggleKey(f.id);
        const enabled = window.currentFeatureSettings?.student ? window.currentFeatureSettings.student[key] !== false : true;
        return `
                <div class="flex flex-col items-center group ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}" data-feature="${f.id}" data-locked="${enabled ? 'false' : 'true'}" onclick="handleStudentFeatureClick('${f.id}')" style="opacity:${enabled ? '1' : '0.45'}; filter:${enabled ? 'none' : 'grayscale(1)'};">
                    <div class="w-14 h-14 rounded-full bg-[#E3EBF3] shadow-[6px_6px_14px_#c1c9d2,-6px_-6px_14px_#ffffff] flex items-center justify-center transition-all duration-150 ${enabled ? 'active:shadow-[inset_4px_4px_8px_#c1c9d2,inset_-4px_-4px_8px_#ffffff] group-hover:scale-105' : ''}" style="position:relative;">
                        <i data-lucide="${f.icon}" class="w-6 h-6 text-[#1E3A8A]" stroke-width="1.5"></i>
                        ${enabled ? '' : '<span style="position:absolute; right:-4px; top:-4px; background:#ef4444; color:#fff; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;"><i class="fas fa-lock"></i></span>'}
                    </div>
                    <span class="text-[10px] font-medium text-center mt-3 tracking-wide text-[#1E3A8A]" style="font-family:'Inter',sans-serif;">${f.title}</span>
                </div>`;
    }).join('')}
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

window.openStudentView = (targetId) => {
    const mainGrid = document.getElementById('student-main-grid');
    if (mainGrid) mainGrid.style.display = 'none';

    document.querySelectorAll('.student-view-section').forEach(el => el.style.display = 'none');

    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.style.display = 'block';
};

const STUDENT_MODULES = {
    profile: { title: 'My Profile', subtitle: 'Verified student and school information.', collections: [] },
    homework: { title: 'Homework', subtitle: 'Homework published for your school and class.', collections: ['homework'] },
    assignment: { title: 'Assignments', subtitle: 'Assignments and submission status for your account.', collections: ['assignments', 'assignment'] },
    datesheet: { title: 'DateSheet', subtitle: 'Exam schedules published for your class.', collections: [] },
    // Attendance is served by the dedicated normalized query in fetchStudentModuleRecords(),
    // so there is no legacy collection to fall back to.
    attendance: { title: 'Attendance', subtitle: 'Only your date-wise attendance records are shown.', collections: [] },
    result: { title: 'Result', subtitle: 'Approved academic results for your account.', collections: ['student_marks', 'exam_marks'] },
    syllabus: { title: 'Syllabus', subtitle: 'Syllabus shared for your school and class.', collections: ['syllabus'] },
    'study-material': { title: 'Study Material', subtitle: 'Learning resources shared with your class.', collections: ['study_material', 'studyMaterials'] },
    notifications: { title: 'Notifications', subtitle: 'School announcements and account updates.', collections: ['notifications', 'notices'] },
    sms: { title: 'SMS History', subtitle: 'Messages addressed to your school account.', collections: ['sms', 'direct_messages'] },
    circular: { title: 'Circulars', subtitle: 'Official circulars from your school.', collections: ['circulars', 'notices'] },
    news: { title: 'School News', subtitle: 'News published by your school.', collections: ['news'] },
    'online-classes': { title: 'Online Classes', subtitle: 'Your class meeting links and instructions.', collections: ['online_classes', 'onlineClasses'] },
    transport: { title: 'Transport', subtitle: 'Your assigned route and pickup information.', collections: ['student_transport', 'transport_assignments'] },
    birthday: { title: 'Birthdays', subtitle: 'Upcoming birthdays from your permitted class context.', collections: ['students'] },
    batchmate: { title: 'Batchmates', subtitle: 'Shareable classmates from your class only.', collections: ['students'] },
    calendar: { title: 'Calendar Planning', subtitle: 'Relevant academic dates and deadlines.', collections: ['calendar_events', 'events'] },
    leave: { title: 'Leave Requests', subtitle: 'Apply for leave and track your own requests.', collections: ['leave_requests'] },
    gatepass: { title: 'Gate Pass', subtitle: 'Submit and track your own gate-pass requests.', collections: ['gate_passes', 'gatepasses'] },
    complaint: { title: 'Complaints', subtitle: 'Submit and track your own complaints.', collections: ['complaints'] },
    'social-media': { title: 'Social Media', subtitle: 'Social links configured by your school.', collections: [] }
};

const studentHtml = value => {
    const node = document.createElement('span');
    node.textContent = value == null || value === '' ? 'N/A' : String(value);
    return node.innerHTML;
};

const isSafeStudentPhotoUrl = url => {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return false;
        if (parsed.hostname !== 'res.cloudinary.com' && parsed.hostname !== 'api.cloudinary.com') return false;
        return true;
    } catch (e) {
        return false;
    }
};

const studentTimestamp = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};
const studentId = () => currentStudentUser?.id || currentStudentUser?.regNo || '';
const studentScope = () => ({ schoolId: currentSchoolId, studentId: studentId(), className: currentStudentUser?.class || '', section: currentStudentUser?.section || '' });
const studentRecordMatches = (data, scope, personal = false) => {
    if (!data || data.schoolId !== scope.schoolId) return false;
    if (!personal) return true;
    const owner = data.studentId || data.personId || data.studentDocId || data.uid;
    return owner === scope.studentId || data.mobile === currentStudentUser?.mobile || data.regNo === currentStudentUser?.regNo;
};

function studentModuleState(message, kind = 'empty') {
    const icons = { loading: 'fa-spinner fa-spin', error: 'fa-triangle-exclamation', empty: 'fa-folder-open' };
    return `<div class="student-state student-state-${kind}"><i class="fas ${icons[kind] || icons.empty}"></i><h3>${studentHtml(message)}</h3><p>${kind === 'error' ? 'Please try again after checking your connection.' : 'Published records will appear here when available.'}</p></div>`;
}
function renderStudentModuleRows(rows, featureId) {
    const scope = studentScope();
    if (featureId === 'profile') {
        const s = currentStudentUser, school = currentStudentSchoolDoc || {};
        const fields = [['Student name', s.name], ['Parent / guardian', s.parentage || s.fatherName], ['Class / section', `${s.class || 'N/A'}${s.section ? ` / ${s.section}` : ''}`], ['Roll number', s.rollNo], ['Registration number', s.regNo], ['Date of birth', s.dob], ['Mobile', s.mobile], ['Blood group', s.bloodGroup], ['Emergency contact', s.emergencyNo], ['School', school.schoolName]];
        return `<div class="student-profile-card">${s.photoUrl ? `<img src="${studentHtml(s.photoUrl)}" alt="Student photo" class="student-profile-photo">` : ''}<div class="student-detail-grid">${fields.map(([label, value]) => `<div><span>${studentHtml(label)}</span><strong>${studentHtml(value)}</strong></div>`).join('')}</div></div>`;
    }
    if (featureId === 'birthday' || featureId === 'batchmate') rows = rows.filter(item => item.id !== scope.studentId && item.class === scope.className && (!scope.section || !item.section || item.section === scope.section));
    if (!rows.length) return studentModuleState('No published records found.');
    return `<div class="student-record-list">${rows.map(item => {
        const title = item.title || item.name || item.subject || item.examTerm || item.examName || (featureId === 'attendance' ? `Attendance — ${item.date || 'Date'}` : 'Published record');
        const detail = item.description || item.body || item.topic || item.routeName || item.status || '';
        const resultDetail = featureId === 'result' ? `${item.totalObt || 0} / ${item.totalMax || 0} • ${item.examTerm || 'Result'}` : detail;
        return `<article class="student-record-card"><div><h3>${studentHtml(title)}</h3><p>${studentHtml(resultDetail)}</p><small>${studentHtml(item.subject || item.teacher || item.date || item.createdAt ? `${item.subject || ''} ${item.teacher || ''} ${studentTimestamp(item.date || item.createdAt)}` : '')}</small></div>${item.attachmentUrl || item.fileUrl || item.link || item.meetingLink ? `<a class="student-action-link" href="${studentHtml(item.attachmentUrl || item.fileUrl || item.link || item.meetingLink)}" target="_blank" rel="noopener">Open</a>` : ''}</article>`;
    }).join('')}</div>`;
}

async function fetchStudentModuleRecords(featureId) {
    const scope = studentScope();
    if (featureId === 'profile' || featureId === 'social-media') return [];
    if (featureId === 'datesheet') {
        // The published routine lives on the school row: `examSchedule_<class>` first,
        // with the shared `schedule` column kept as a fallback.
        const { data: schoolRow } = await studentSupabase().from('schools').select('*').eq('id', scope.schoolId).maybeSingle();
        const classSchedule = schoolRow ? schoolRow['examSchedule_' + scope.className] : null;
        const schedule = Array.isArray(classSchedule) ? classSchedule : (schoolRow?.schedule || []);
        return schedule.map(item => ({ ...item, schoolId: scope.schoolId }));
    }
    // Existing admin schema stores marks in a student-keyed document. Read only that key,
    // then verify the school through the authenticated student record already returned by login.
    if (featureId === 'result') {
        const { data, error } = await studentSupabase().from('student_marks').select('*').eq('id', scope.studentId).maybeSingle();
        if (error) throw error;
        if (!data) return [];
        if (data.schoolId && data.schoolId !== scope.schoolId) return [];
        return [{ ...data, id: scope.studentId, schoolId: scope.schoolId }];
    }
    // Normalized attendance: this student's own rows, newest first, straight from
    // public.attendance_records. It runs on the dedicated student client, never on the
    // chairman/staff client. The schoolId / studentId filters only shrink the payload -
    // Postgres RLS on attendance_records is the real authorization boundary.
    if (featureId === 'attendance') {
        const { data: rows, error } = await requireStudentPortalClient()
            .from('attendance_records')
            .select('date, status, class, updatedAt')
            .eq('schoolId', scope.schoolId)
            .eq('studentId', scope.studentId)
            .order('date', { ascending: false })
            .limit(180);
        if (error) throw error;
        return rows || [];
    }
    const module = STUDENT_MODULES[featureId];
    for (const name of module?.collections || []) {
        try {
            const { data: rows, error } = await studentSupabase().from(name).select('*').eq('schoolId', scope.schoolId);
            if (error) throw error;
            const records = rows || [];
            const personal = ['attendance', 'result', 'sms', 'leave', 'gatepass', 'complaint', 'fee-receipt', 'transport', 'assignment'].includes(featureId);
            const filtered = records.filter(record => studentRecordMatches(record, scope, personal));
            if (filtered.length || name === module.collections[module.collections.length - 1]) return filtered;
        } catch (error) { if (name === module.collections[module.collections.length - 1]) throw error; }
    }
    return [];
}

window.openStudentDataModule = async featureId => {
    const feature = studentFeatures.find(item => item.id === featureId), module = STUDENT_MODULES[featureId];
    if (!feature || !module) return;
    window.openStudentView('student-module-section');
    document.getElementById('student-module-title').textContent = module.title;
    document.getElementById('student-module-subtitle').textContent = module.subtitle;
    const content = document.getElementById('student-module-content');
    content.innerHTML = featureId === 'profile' ? renderStudentModuleRows([], featureId) : studentModuleState('Loading records…', 'loading');
    const refresh = document.getElementById('student-module-refresh');
    refresh.onclick = () => window.openStudentDataModule(featureId);
    const requestEpoch = studentSessionEpoch;
    try {
        const rows = await fetchStudentModuleRecords(featureId);
        if (requestEpoch !== studentSessionEpoch) return; // logout / new login already happened
        content.innerHTML = renderStudentModuleRows(rows, featureId);
    } catch (error) {
        if (requestEpoch !== studentSessionEpoch) return;
        console.error(`Student ${featureId} module failed`, error);
        if (isStudentAuthError(error)) {
            // Rejected or expired student JWT: end the session instead of retrying.
            window.logoutStudent();
            showLoginScreen('Your session has expired. Please sign in again.');
            return;
        }
        content.innerHTML = studentModuleState('Unable to load this module.', 'error');
    }
};

window.handleStudentFeatureClick = (featureId) => {
    const key = getStudentFeatureToggleKey(featureId);
    if (window.currentFeatureSettings?.student && window.currentFeatureSettings.student[key] === false) { showCompanyRestrictedAlert(); return; }
    switch (featureId) {
        case 'fee': window.showStudentPaymentSection(); break;
        case 'idcard': window.openStudentView('student-idcard-section'); break;
        case 'admit': window.openStudentView('student-admitcard-section'); break;
        case 'fee-receipt': window.showStudentReceiptsSection(); break;
        case 'complaint': window.openStudentView('student-complaint-section'); window.loadStudentComplaintHistory(); break;
        default: window.openStudentDataModule(featureId);
    }
};

window.submitStudentComplaint = async (e) => {
    e.preventDefault();
    const target = document.getElementById("complaint-target").value;
    const subject = document.getElementById("complaint-subject").value;
    const desc = document.getElementById("complaint-desc").value;

    if (!target || !subject || !desc) return;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from("complaints").insert({
            schoolId: currentStudentSchoolDoc.id || currentSchoolId,
            studentId: currentStudentUser.id || currentStudentUser.regNo,
            studentName: currentStudentUser.name,
            studentMobile: currentStudentUser.mobile || "",
            target: target,
            subject: subject,
            description: desc,
            timestamp: new Date().toISOString(),
            status: 'Pending'
        });
        if (error) throw error;

        alert("Complaint submitted successfully!");
        e.target.reset();
        await window.loadStudentComplaintHistory();
        window.openStudentView('student-main-grid');
    } catch (err) {
        console.error("Error submitting complaint:", err);
        alert("Failed to submit complaint. Please try again.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.loadStudentComplaintHistory = async () => {
    const target = document.getElementById('student-complaint-history');
    if (!target || !currentStudentUser || !currentSchoolId) return;
    target.innerHTML = studentModuleState('Loading complaint history…', 'loading');
    try {
        const scope = studentScope();
        const { data: rows, error } = await studentSupabase().from('complaints').select('*').eq('schoolId', scope.schoolId).eq('studentId', scope.studentId);
        if (error) throw error;
        const items = rows || [];
        target.innerHTML = items.length ? items.map(item => `<article class="student-history-item"><div><strong>${studentHtml(item.subject)}</strong><p>${studentHtml(item.description)}</p><small>${studentHtml(studentTimestamp(item.timestamp))}</small></div><span class="student-status-badge">${studentHtml(item.status || 'Pending')}</span>${item.chairmanReply ? `<p class="student-reply"><b>Response:</b> ${studentHtml(item.chairmanReply)}</p>` : ''}</article>`).join('') : studentModuleState('No complaints submitted yet.');
    } catch (error) {
        console.error('Complaint history failed', error);
        target.innerHTML = studentModuleState('Unable to load complaint history.', 'error');
    }
};

window.showStudentReceiptsSection = async () => {
    window.openStudentView('student-receipt-section');
    const tbody = document.getElementById('stu-receipt-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8">${studentModuleState('Loading receipts…', 'loading')}</td></tr>`;
    try {
        const scope = studentScope();
        const { data: rows, error } = await studentSupabase().from('transactions').select('*').eq('schoolId', scope.schoolId).eq('type', 'Fee');
        if (error) throw error;
        const receipts = (rows || []).filter(item => studentRecordMatches(item, scope, true));
        window.studentReceiptCache = receipts;
        tbody.innerHTML = receipts.length ? receipts.map(r => `<tr>
            <td>${studentHtml(r.receiptNo || r.recNo || r.id)}</td><td>${studentHtml(r.date || studentTimestamp(r.createdAt))}</td>
            <td>${studentHtml(r.period || r.feePeriod || '—')}</td><td>${studentHtml(r.mode || '—')}</td>
            <td>₹${Number(r.total || r.amount || 0).toLocaleString('en-IN')}</td><td>₹${Number(r.paid || r.amount || 0).toLocaleString('en-IN')}</td>
            <td>₹${Number(r.due || 0).toLocaleString('en-IN')}</td><td><button class="student-action-link" onclick="window.printStudentReceipt('${studentHtml(r.id)}')">Print</button></td>
        </tr>`).join('') : `<tr><td colspan="8">${studentModuleState('No fee receipts found.')}</td></tr>`;
    } catch (error) { console.error('Student receipts failed', error); tbody.innerHTML = `<tr><td colspan="8">${studentModuleState('Unable to load fee receipts.', 'error')}</td></tr>`; }
};
window.printStudentReceipt = id => {
    const row = (window.studentReceiptCache || []).find(item => item.id === id);
    if (!row) return alert('Receipt is no longer available. Refresh and try again.');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow pop-ups to print the receipt.');
    printWindow.document.write(`<html><head><title>Fee Receipt</title></head><body><h1>${studentHtml(currentStudentSchoolDoc?.schoolName || 'School')}</h1><h2>Fee Receipt</h2><p>Receipt: ${studentHtml(row.receiptNo || row.recNo || row.id)}</p><p>Student: ${studentHtml(currentStudentUser?.name)}</p><p>Amount: ₹${Number(row.amount || row.paid || 0).toLocaleString('en-IN')}</p><p>Date: ${studentHtml(row.date || studentTimestamp(row.createdAt))}</p><script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
};

window.initAdmitCardUI = () => {
    if (!currentStudentUser) return;
    const btnContainer = document.getElementById("stu-btn-download-admit")?.parentElement;
    if (btnContainer) {
        if (!currentStudentUser.admitCardPublished) {
            document.getElementById("stu-btn-download-admit")?.remove();
            const lockedMsg = document.createElement("div");
            lockedMsg.id = "stu-admit-locked-msg";
            lockedMsg.style.cssText = "background:#fee2e2; color:#b91c1c; padding:12px; border-radius:8px; font-weight:bold; font-size:14px; text-align:center;";
            lockedMsg.innerHTML = `<i class="fas fa-lock"></i> Admit Card Not Available. Please contact the administration.`;
            // Remove any existing locked message first
            const existing = document.getElementById("stu-admit-locked-msg");
            if (existing) existing.remove();
            btnContainer.appendChild(lockedMsg);
        } else {
            // Ensure button is there if published (e.g. after relogin)
            if (!document.getElementById("stu-btn-download-admit")) {
                const existing = document.getElementById("stu-admit-locked-msg");
                if (existing) existing.remove();
                btnContainer.insertAdjacentHTML('beforeend', `<button id="stu-btn-download-admit" class="action-btn btn-yellow" onclick="window.downloadStudentAdmitCard()" style="width: 100%; padding: 12px; font-size: 14px; background:#e67e22; color:white; border-radius:10px;"><i class="fas fa-download"></i> Print / Save PDF</button>`);
            }
        }
    }
};

// Student Login Handler
const studentLoginBtn = document.getElementById("doStudentLoginBtn");
if (studentLoginBtn) studentLoginBtn.addEventListener("click", async () => {
    const username = document.getElementById("student-login-username")?.value.trim();
    const password = document.getElementById("student-login-password")?.value.trim();
    const errBox = document.getElementById('loginErrorMsg');

    if (!username || !password) {
        if (errBox) {
            errBox.innerText = "Enter registered mobile number and DOB password.";
            errBox.style.display = 'block';
            setTimeout(() => errBox.style.display = 'none', 4000);
        }
        return;
    }

    const btn = document.getElementById("doStudentLoginBtn");
    if (btn) btn.querySelector('span').innerText = "Verifying...";

    try {
        const response = await fetch('https://school-backend-zlgy.onrender.com/api/student-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile: username, dob: password })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Invalid mobile number or DOB.");
        if (!result.student?.schoolId || !result.school?.id || result.student.schoolId !== result.school.id) {
            throw new Error("School mismatch detected. Login blocked for safety.");
        }

        // The Render-issued JWT must exist before any student state is set: without it the
        // merged portal would keep running on the chairman/staff client, so login fails here.
        const accessToken = typeof result.token === 'string' ? result.token.trim() : '';
        if (!accessToken) throw new Error("Login failed: no student session token was issued. Please try again.");

        // Fresh dedicated client per login; the chairman/staff client is left untouched and
        // the student token is never handed to GoTrue.
        studentPortalClient = createStudentPortalClient(accessToken);
        studentSessionEpoch += 1;

        currentStudentUser = result.student;
        currentSchoolId = result.student.schoolId;
        currentStudentSchoolDoc = result.school;
        window.currentFeatureSettings = normalizeFeatureSettingsPayload(result.featureSettings || {});
        loadStudentDashboard();
    } catch (error) {
        console.error("Student Login Error:", error.message);
        if (errBox) {
            errBox.innerText = error.message || "Student login failed.";
            errBox.style.display = 'block';
            setTimeout(() => errBox.style.display = 'none', 8000);
        }
    }
    if (btn) btn.querySelector('span').innerText = "Access Portal";
});

async function loadStudentDashboard() {
    overlay.style.display = "none";
    loginWrapper.style.display = "none";
    document.getElementById("dashboard-wrapper").style.display = "none";
    document.getElementById("staff-dashboard-wrapper").style.display = "none";
    document.getElementById("student-dashboard-wrapper").style.display = "block";

    document.getElementById("student-dash-school-name").innerText = currentStudentSchoolDoc.schoolName || "Portal";
    document.getElementById("stu-display-name").innerText = currentStudentUser.name;

    // Top ID Banner
    document.getElementById("banner-name").innerText = currentStudentUser.name || "N/A";
    document.getElementById("banner-parentage").innerText = (currentStudentUser.parentage || currentStudentUser.fatherName) || "N/A";
    document.getElementById("banner-class").innerText = currentStudentUser.class || "N/A";
    document.getElementById("banner-reg").innerText = currentStudentUser.regNo || "N/A";

    // Format DOB if available
    let formattedDob = "N/A";
    if (currentStudentUser.dob) {
        const parts = currentStudentUser.dob.split('-');
        if (parts.length === 3) {
            formattedDob = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
            formattedDob = currentStudentUser.dob;
        }
    }
    document.getElementById("banner-dob").innerText = formattedDob;

    document.getElementById("banner-contact").innerText = currentStudentUser.mobile || "N/A";
    document.getElementById("banner-blood").innerText = currentStudentUser.bloodGroup || "N/A";
    document.getElementById("banner-emergency").innerText = currentStudentUser.emergencyNo || "N/A";

    // 1. Premium Styling & Colors (Fixed professional pastel pink matching reference image)
    const banner = document.getElementById("student-id-banner");
    if (banner) {
        banner.style.background = 'linear-gradient(135deg, #fbcfe8, #fecdd3)';
        banner.style.borderRadius = "12px";
        banner.style.padding = "15px";
    }

    // 3. Comprehensive QR Code Data
    const qrString = `Name: ${currentStudentUser.name}\nParentage: ${currentStudentUser.parentage || currentStudentUser.fatherName || 'N/A'}\nClass: ${currentStudentUser.class}\nReg/Roll: ${currentStudentUser.regNo || 'N/A'}\nDOB: ${formattedDob}\nContact: ${currentStudentUser.mobile || 'N/A'}`;
    const qrElem = document.getElementById("stu-banner-qr");
    if (qrElem) {
        qrElem.src = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(qrString);
    }

    // 2. Photo Background Removal Logic
    if (currentStudentUser.photoUrl) {
        document.getElementById("stu-banner-photo-icon").style.display = "none";
        const photoElem = document.getElementById("stu-banner-photo");
        photoElem.classList.remove("hidden");

        photoElem.src = currentStudentUser.photoUrl;

        const wrapperElem = document.getElementById("stu-banner-photo-bg");
        if (wrapperElem) {
            // Apply dynamic color ONLY to the photo wrapper
            wrapperElem.style.backgroundColor = currentStudentSchoolDoc.photoBgColor || '#ffffff';
        }

        try {
            const transparentSrc = await getStudentTransparentPhoto(currentStudentUser.photoUrl);
            if (transparentSrc) {
                photoElem.src = transparentSrc;
            }
        } catch (err) {
            console.error("Failed to load transparent photo for dashboard:", err);
        }
    } else {
        document.getElementById("stu-banner-photo-icon").style.display = "block";
        document.getElementById("stu-banner-photo").classList.add("hidden");

        const wrapperElem = document.getElementById("stu-banner-photo-bg");
        if (wrapperElem) {
            // Apply dynamic color ONLY to the photo wrapper even if no photo exists
            wrapperElem.style.backgroundColor = currentStudentSchoolDoc.photoBgColor || '#ffffff';
        }
    }

    if (currentStudentSchoolDoc.schoolLogoUrl) {
        const logo = document.getElementById("student-school-logo");
        if (logo) {
            logo.src = currentStudentSchoolDoc.schoolLogoUrl;
            logo.style.display = "inline-block";
        }
    }

    const due = currentStudentUser.dueBalance || 0;
    const dueElem = document.getElementById("stu-due-balance");
    if (dueElem) dueElem.innerText = due;
    if (due > 0) document.getElementById("stu-pay-amount") && (document.getElementById("stu-pay-amount").value = due);

    renderStudentFeatureGrid();
}

window.showStudentPaymentSection = () => {
    if (!currentStudentSchoolDoc.paymentQrUrl || !currentStudentSchoolDoc.upiId) {
        alert("The school has not configured the QR Payment System yet."); return;
    }

    window.openStudentView('student-payment-section');
    document.getElementById("stu-qr-img").src = currentStudentSchoolDoc.paymentQrUrl;
    document.getElementById("stu-upi-text").innerText = currentStudentSchoolDoc.upiId;

    // Advanced Math Logic
    const dueAmount = Number(currentStudentUser.feeDue || currentStudentUser.dueBalance || 0);
    // If totalFee exists use it, otherwise fake a realistic total fee (e.g. 1000 * 12) or just dueAmount
    const totalAmount = Number(currentStudentUser.totalFee || (dueAmount > 0 ? dueAmount + 12000 : 12000));
    const paidAmount = Number(currentStudentUser.paidAmount || (totalAmount - dueAmount));

    document.getElementById("stu-total-fee").innerText = `₹${totalAmount}`;
    document.getElementById("stu-paid-fee").innerText = `₹${paidAmount}`;
    document.getElementById("stu-due-fee").innerText = `₹${dueAmount}`;

    // Pie Chart Logic
    const percentagePaid = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
    document.getElementById("stu-fee-percentage").innerText = `${percentagePaid}%`;
    document.getElementById("stu-fee-pie-chart").style.background = `conic-gradient(#10b981 0% ${percentagePaid}%, #e53e3e ${percentagePaid}% 100%)`;

    // Monthly breakdown dummy data
    const tbody = document.getElementById("stu-monthly-fee-table");
    let html = "";
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthIndex = new Date().getMonth();

    months.forEach((month, idx) => {
        if (idx <= currentMonthIndex) {
            const isPaid = idx < currentMonthIndex || (idx === currentMonthIndex && dueAmount === 0);
            const amt = Math.round(totalAmount / 12) || 1000;
            const paid = isPaid ? amt : 0;
            const due = isPaid ? 0 : amt;
            const statusIcon = isPaid ? '<i class="fas fa-check-circle" style="color:#10b981; font-size:16px;"></i>' : '<i class="fas fa-times-circle" style="color:#e53e3e; font-size:16px;"></i>';
            const actionBtn = isPaid ? '<span style="color:#10b981; font-weight:bold;">Paid</span>' : `<button class="action-btn" style="background:#1E3A8A; color:white; padding:6px 12px; font-size:12px; border-radius:6px; width:100%;" onclick="document.getElementById('stu-pay-amount').value='${due}'; document.getElementById('stu-pay-amount').focus();">Pay</button>`;

            html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px; font-weight:bold;">${month}</td>
                <td style="padding: 12px;">₹${amt}</td>
                <td style="padding: 12px; color:#10b981;">₹${paid}</td>
                <td style="padding: 12px; color:#e53e3e; font-weight:bold;">₹${due}</td>
                <td style="padding: 12px; text-align: center;">${statusIcon}</td>
                <td style="padding: 12px; text-align: center;">${actionBtn}</td>
            </tr>`;
        }
    });
    tbody.innerHTML = html;

    const amountForUpi = dueAmount > 0 ? dueAmount : 0;
    const upiLink = `upi://pay?pa=${currentStudentSchoolDoc.upiId}&pn=${encodeURIComponent(currentStudentSchoolDoc.schoolName)}&am=${amountForUpi}&cu=INR`;
    document.getElementById("stu-upi-deep-link").href = upiLink;
};

// Student Payment Verification Submit
const svForm = document.getElementById("student-verification-form");
if (svForm) svForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = document.getElementById("stu-pay-amount").value.trim();
    const utr = document.getElementById("stu-pay-utr").value.trim();
    const fileInput = document.getElementById("stu-pay-screenshot").files[0];

    if (!fileInput) return alert("Please upload the payment screenshot.");
    if (utr.length < 5) return alert("Please enter a valid Transaction ID / UTR.");

    const submitBtn = document.getElementById("stu-submit-verification-btn");
    submitBtn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Uploading...";
    submitBtn.disabled = true;

    try {
        const base64Image = await convertToBase64(fileInput);
        const res = await fetch("https://api.cloudinary.com/v1_1/disgtvs6f/image/upload", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: base64Image, upload_preset: "ml_default" })
        });
        const uploadData = await res.json();
        const screenshotUrl = uploadData.secure_url;
        if (!screenshotUrl) throw new Error("Image upload failed.");

        const { error } = await supabaseClient.from("fee_verifications").insert({
            schoolId: currentSchoolId,
            studentId: currentStudentUser.id,
            studentName: currentStudentUser.name,
            regNo: currentStudentUser.regNo,
            amount: Number(amount),
            utr: utr,
            screenshotUrl: screenshotUrl,
            status: "Pending",
            createdAt: new Date().toISOString()
        });
        if (error) throw error;

        document.getElementById("student-payment-section").style.display = "none";
        document.getElementById("student-success-section").style.display = "block";
    } catch (err) {
        alert("Error submitting verification: " + err.message);
        submitBtn.innerHTML = "<i class='fas fa-cloud-upload-alt'></i> Submit for Verification";
        submitBtn.disabled = false;
    }
});

window.logoutStudent = () => {
    // Drop the student JWT client FIRST so nothing queued after this point can send the
    // previous student's token. `currentSchoolId` stays untouched: it belongs to the
    // chairman/staff session that may still be active in this browser.
    studentPortalClient = null;
    studentSessionEpoch += 1;
    window.studentReceiptCache = null;
    currentStudentUser = null;
    currentStudentSchoolDoc = null;
    const moduleContent = document.getElementById("student-module-content");
    if (moduleContent) moduleContent.innerHTML = "";
    const complaintHistory = document.getElementById("student-complaint-history");
    if (complaintHistory) complaintHistory.innerHTML = "";
    document.getElementById("student-dashboard-wrapper").style.display = "none";
    document.getElementById("student-payment-section").style.display = "none";
    document.getElementById("student-success-section").style.display = "none";
    showLoginScreen();
};

// Student ID Card Download
window.downloadStudentIDCard = async () => {
    if (!currentStudentUser || !currentStudentSchoolDoc) return;
    if (currentStudentUser.dueBalance > 0) return alert("Digital ID Card is locked due to pending fees. Please clear your dues first.");

    const btn = document.getElementById("stu-btn-download-id");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Generating...";
    btn.disabled = true;

    try {
        const response = await fetch("https://school-backend-zlgy.onrender.com/api/generate-id-card", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                studentData: {
                    id: currentStudentUser.id || currentStudentUser.regNo,
                    name: currentStudentUser.name, class: currentStudentUser.class,
                    dob: currentStudentUser.dob || "N/A",
                    parentage: (currentStudentUser.parentage || currentStudentUser.fatherName) || "N/A",
                    mobile: currentStudentUser.mobile || "N/A",
                    address: currentStudentUser.address || "N/A",
                    photoUrl: currentStudentUser.photoUrl || "https://via.placeholder.com/150"
                },
                themeColor: currentStudentSchoolDoc.themeColor || "#1e3c72",
                secondaryColor: currentStudentSchoolDoc.secondaryColor || "#ffffff",
                templateStyle: currentStudentSchoolDoc.idTemplateStyle || "wave",
                schoolName: currentStudentSchoolDoc.schoolName || "SCHOOL NAME",
                schoolEmergency: currentStudentSchoolDoc.emergencyMobile || "N/A",
                signatureUrl: (currentStudentSchoolDoc.sigSettings && currentStudentSchoolDoc.sigSettings.idCard === false) ? "" : (currentStudentSchoolDoc.signatureUrl || ""),
                schoolLogoUrl: currentStudentSchoolDoc.logoUrl || "",
                schoolNameColor: currentStudentSchoolDoc.schoolNameColor || "#ffffff",
                studentNameColor: currentStudentSchoolDoc.studentNameColor || "#d32f2f",
                detailsColor: currentStudentSchoolDoc.detailsColor || "#333333"
            })
        });
        const data = await response.json();
        if (data.success && data.idCardUrl) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            pdf.addImage(data.idCardUrl, 'PNG', 10, 10, 54, 86);
            pdf.save(`${currentStudentUser.name}_ID_Card.pdf`);
        } else { alert("Could not generate ID card at this moment."); }
    } catch (e) { console.error(e); alert("Failed to generate ID card."); }

    btn.innerHTML = originalText; btn.disabled = false;
};

// Student Admit Card Download
async function getStudentTransparentPhoto(imageUrl) {
    if (!imageUrl) return null;
    try {
        const response = await fetch('https://school-backend-zlgy.onrender.com/api/remove-bg', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: imageUrl })
        });
        const data = await response.json();
        if (data.success && data.base64) return data.base64;
        return imageUrl;
    } catch (e) { return imageUrl; }
}

window.downloadStudentAdmitCard = async () => {
    if (!currentStudentUser || !currentStudentSchoolDoc) return;
    if (currentStudentUser.dueBalance > 0) return alert("Admit Card is locked due to pending fees. Please clear your dues first.");

    const btn = document.getElementById("stu-btn-download-admit");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Generating...";
    btn.disabled = true;

    try {
        const { data: schoolRow } = await supabaseClient.from("schools").select("*").eq("id", currentSchoolId).maybeSingle();
        const classSchedule = schoolRow ? schoolRow["examSchedule_" + currentStudentUser.class] : null;
        const sched = Array.isArray(classSchedule) ? classSchedule : (schoolRow?.schedule || []);

        if (sched.length === 0) {
            alert("No exam routine published for your class yet.");
            btn.innerHTML = originalText; btn.disabled = false; return;
        }

        const printable = document.createElement("div");
        printable.style.cssText = "width:800px; padding:20px; background:#fff; color:#000; position:absolute; left:-9999px; top:0; border:2px solid #000;";

        let logoHtml = currentStudentSchoolDoc.schoolLogoUrl ? `<img src="${currentStudentSchoolDoc.schoolLogoUrl}" style="width:80px; height:80px; object-fit:contain; position:absolute; left:20px; top:20px;">` : '';

        let finalSigBase64 = "";
        if (currentStudentSchoolDoc.signatureUrl && (!currentStudentSchoolDoc.sigSettings || currentStudentSchoolDoc.sigSettings.admit !== false)) {
            finalSigBase64 = currentStudentSchoolDoc.signatureUrl;
            try {
                const res = await fetch("https://school-backend-zlgy.onrender.com/api/get-transparent-signature", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ signatureUrl: currentStudentSchoolDoc.signatureUrl })
                });
                const d = await res.json();
                if (d.success) finalSigBase64 = d.base64;
            } catch (e) { }
        }

        let sigHtml = finalSigBase64 ? `<img src="${finalSigBase64}" style="height:50px;">` : '';
        const fallbackImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        let finalPhotoSrc = fallbackImg;
        if (currentStudentUser.photoUrl) finalPhotoSrc = await getStudentTransparentPhoto(currentStudentUser.photoUrl);

        let tbodyHtml = "";
        for (let i = 0; i < 6; i++) {
            let dStr = sched[i]?.date || "";
            if (dStr && dStr.includes("-")) { let parts = dStr.split("-"); if (parts.length === 3) dStr = `${parts[2]}/${parts[1]}/${parts[0]}`; }
            tbodyHtml += `<tr><td style="border:1px solid #000; padding:8px;">${dStr}</td><td style="border:1px solid #000; padding:8px;">${sched[i]?.subject || ""}</td><td style="border:1px solid #000; padding:8px;">${sched[i]?.timing || ""}</td></tr>`;
        }

        printable.innerHTML = `
            <div style="position:relative; text-align:center; margin-bottom:20px; border-bottom:2px solid #000; padding-bottom:10px;">
                ${logoHtml}
                <h2 style="margin:0; font-size:24px;">${(currentStudentSchoolDoc.schoolName || "SCHOOL NAME").toUpperCase()}</h2>
                <h3 style="margin:5px 0 0; font-size:18px;">EXAMINATION ADMIT CARD</h3>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <div style="flex:1;"><p><strong>Student Name:</strong> ${currentStudentUser.name}</p><p><strong>Class:</strong> ${currentStudentUser.class}</p><p><strong>Parentage:</strong> ${(currentStudentUser.parentage || currentStudentUser.fatherName)}</p></div>
                <div style="flex:1; text-align:center;"><img id="print-admit-photo-stu" src="${finalPhotoSrc}" style="width:100px; height:120px; border:2px solid #ccc; object-fit:cover; border-radius:8px; background:#fff;"></div>
                <div style="flex:1; text-align:right;"><p><strong>Roll No:</strong> ${currentStudentUser.rollNo || "N/A"}</p><p><strong>Reg No:</strong> ${currentStudentUser.regNo || "N/A"}</p><p><strong>DOB:</strong> ${currentStudentUser.dob || "N/A"}</p></div>
            </div>
            <table style="width:100%; border-collapse:collapse; text-align:left; margin-bottom:30px;">
                <thead><tr><th style="border:1px solid #000; padding:8px; background:#f0f0f0;">Date</th><th style="border:1px solid #000; padding:8px; background:#f0f0f0;">Subject</th><th style="border:1px solid #000; padding:8px; background:#f0f0f0;">Timing</th></tr></thead>
                <tbody>${tbodyHtml}</tbody>
            </table>
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div><p>_______________________<br>Student Signature</p></div>
                <div style="text-align:right;">${sigHtml}<br><p>_______________________<br>Principal/Controller Signature</p></div>
            </div>
        `;

        document.body.appendChild(printable);
        const imgEl = printable.querySelector("#print-admit-photo-stu");
        if (imgEl && !imgEl.complete) await new Promise((resolve) => { imgEl.onload = resolve; imgEl.onerror = resolve; });

        const canvas = await html2canvas(printable, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        document.body.removeChild(printable);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'mm', 'a4');
        pdf.addImage(imgData, 'JPEG', 10, 10, 277, 130);
        pdf.save(`${currentStudentUser.name}_Admit_Card.pdf`);
    } catch (e) { console.error(e); alert("Failed to generate Admit Card."); }

    btn.innerHTML = originalText; btn.disabled = false;
};

// --- CoreEdu Chat ---
window.loadCoreEduChat = () => {
    if (!currentSchoolId) return;
    if (window.unsubCoreEduChat) { window.unsubCoreEduChat(); window.unsubCoreEduChat = null; }
    const schoolId = currentSchoolId;

    const renderCoreEduChat = async (messages) => {
        let html = "";
        let unreadCount = 0;
        let batchUpdates = [];

        (messages || []).forEach(msg => {
            let isMaster = msg.sender === "master";
            if (isMaster && !msg.isRead) {
                unreadCount++;
                batchUpdates.push(msg.id);
            }

            let ts = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : "";
            let className = msg.sender === "school" ? "chat-bubble sent" : "chat-bubble received";
            let attachHtml = msg.attachmentUrl ? `<br><a href="${msg.attachmentUrl}" target="_blank" style="font-size:12px; color:blue;"><i class="fas fa-paperclip"></i> Attachment</a>` : "";

            html += `<div class="${className}">${msg.text}${attachHtml}<span class="timestamp">${ts}</span></div>`;
        });

        document.getElementById("coreedu-chat-history").innerHTML = html || "<div style='text-align:center; color:#555; padding:20px;'>No messages yet. Say hi to CoreEdu!</div>";
        document.getElementById("coreedu-chat-history").scrollTop = document.getElementById("coreedu-chat-history").scrollHeight;

        if (unreadCount > 0) {
            document.getElementById("badge-coreedu").innerText = unreadCount;
            document.getElementById("badge-coreedu").style.display = "inline-block";
        } else {
            document.getElementById("badge-coreedu").style.display = "none";
        }

        if (unreadCount > 0 && document.getElementById("tab-coreedu-comm").classList.contains("active")) {
            for (let id of batchUpdates) {
                await supabaseClient.from("school_communications").update({ isRead: true }).eq("id", id);
            }
        }
    };

    const loadCoreEduMessages = async () => {
        const { data, error } = await supabaseClient
            .from("school_communications")
            .select("*")
            .eq("schoolId", schoolId)
            .order("timestamp", { ascending: true });
        if (error) return console.error("CoreEdu chat load failed:", error);
        await renderCoreEduChat(data);
    };

    loadCoreEduMessages();

    const chatChannel = supabaseClient.channel('realtime:school_communications:' + crypto.randomUUID())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'school_communications', filter: `schoolId=eq.${schoolId}` }, () => {
            loadCoreEduMessages();
        })
        .subscribe();

    window.unsubCoreEduChat = () => supabaseClient.removeChannel(chatChannel);
};

window.sendCoreEduMessage = async () => {
    let text = document.getElementById("coreedu-message-input").value.trim();
    let btn = document.getElementById("coreedu-send-btn");

    if (!text && document.getElementById("coreedu-attachment").files.length === 0) return alert("Type a message or attach a file.");

    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i>";
    btn.disabled = true;

    let attachmentUrl = null;
    if (document.getElementById("coreedu-attachment").files.length > 0) {
        attachmentUrl = await uploadToCloudinary("coreedu-attachment", "coreedu-send-btn", "<i class='fas fa-paper-plane'></i>");
        if (!attachmentUrl) {
            btn.innerHTML = "<i class='fas fa-paper-plane'></i>"; btn.disabled = false;
            return alert("Upload failed.");
        }
    }

    try {
        const { error } = await supabaseClient.from("school_communications").insert({
            schoolId: currentSchoolId,
            schoolName: currentSchoolName,
            sender: "school",
            text: text,
            attachmentUrl: attachmentUrl,
            timestamp: new Date().toISOString(),
            isRead: false
        });
        if (error) throw error;
        document.getElementById("coreedu-message-input").value = "";
        document.getElementById("coreedu-attachment").value = "";
    } catch (e) {
        alert("Error sending message");
    }
    btn.innerHTML = "<i class='fas fa-paper-plane'></i>"; btn.disabled = false;
};

// --- Mailbox Inter-School ---
window.allSchoolsCache = [];
window.loadAllSchools = async () => {
    try {
        const { data: rows, error } = await supabaseClient.from("vw_public_schools").select("*");
        if (error) throw error;
        let html = "<option value=''>-- Select School --</option>";
        window.allSchoolsCache = [];
        (rows || []).forEach(school => {
            window.allSchoolsCache.push(school);
            let sType = school.institution_type || "school";
            if (sType === currentInstitutionType && school.id !== currentSchoolId) html += `<option value="${school.id}">${school.schoolName || school.name || school.id}</option>`;
        });
        const mailSelect = document.getElementById("mail_specific_school");
        if (mailSelect) mailSelect.innerHTML = html;
        const transferSelect = document.getElementById("transfer_to_school_select");
        if (transferSelect) transferSelect.innerHTML = html;
        const schoolNameEl = document.getElementById("transfer-current-school-name");
        if (schoolNameEl) schoolNameEl.innerText = currentSchoolName || "Current School";
        const transferFromEl = document.getElementById("transfer-preview-from");
        if (transferFromEl) transferFromEl.innerText = currentSchoolName || "Current School";
    } catch (e) { }
};

// --- Mail Thread View Modal ---
window.currentMailThreadId = null;
window.openMailThread = async (msgId) => {
    window.currentMailThreadId = msgId;
    document.getElementById("mail-view-modal").style.display = "flex";
    document.getElementById("mail-thread-container").innerHTML = "<div style='text-align:center;'>Loading thread...</div>";

    try {
        const { error: readError } = await supabaseClient.from("direct_messages").update({ isRead: true }).eq("id", msgId);
        if (readError) throw readError;

        if (window.unsubMailThread) { window.unsubMailThread(); window.unsubMailThread = null; }

        const renderMailThread = async (msg) => {
            if (!msg) return;
            let html = "";

            let updatedReplies = false;
            let replies = msg.replies || [];
            replies.forEach(r => {
                if (r.senderRole !== "chairman" && !r.isRead) {
                    r.isRead = true;
                    updatedReplies = true;
                }
            });
            if (updatedReplies) {
                await supabaseClient.from("direct_messages").update({ replies: replies }).eq("id", msgId);
            }

            let ts = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "";
            let attachHtml = msg.attachmentUrl ? `<div style="margin-top:10px;"><a href="${msg.attachmentUrl}" target="_blank" class="action-btn" style="background:#e2e8f0; color:#333; padding:5px 10px; font-size:12px; display:inline-block;"><i class="fas fa-paperclip"></i> View Attachment</a></div>` : "";

            html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:10px;">
                            <div><strong>${msg.senderName} (${msg.senderRole})</strong><br><span style="font-size:11px; color:#888;">To: ${msg.receiverType}</span></div>
                            <div style="font-size:11px; color:#888;">${ts}</div>
                        </div>
                        <h4 style="margin-top:0;">${msg.title || 'No Subject'}</h4>
                        <div style="white-space:pre-wrap; font-size:14px;">${msg.body}</div>
                        ${attachHtml}
                     </div>`;

            replies.forEach(r => {
                let rTs = r.timestamp ? new Date(r.timestamp).toLocaleString() : "";
                let rAttachHtml = r.attachmentUrl ? `<div style="margin-top:10px;"><a href="${r.attachmentUrl}" target="_blank" class="action-btn" style="background:#e2e8f0; color:#333; padding:5px 10px; font-size:12px; display:inline-block;"><i class="fas fa-paperclip"></i> View Attachment</a></div>` : "";
                let align = r.senderRole === "chairman" ? "margin-left: 30px; border-left: 4px solid #3182ce;" : "margin-right: 30px; border-left: 4px solid #e53e3e;";
                html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-top:10px; ${align}">
                            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                                <div><strong>${r.senderName} (${r.senderRole})</strong></div>
                                <div style="font-size:11px; color:#888;">${rTs}</div>
                            </div>
                            <div style="white-space:pre-wrap; font-size:14px;">${r.text}</div>
                            ${rAttachHtml}
                         </div>`;
            });

            document.getElementById("mail-thread-container").innerHTML = html;
            setTimeout(() => {
                document.getElementById("mail-thread-container").scrollTop = document.getElementById("mail-thread-container").scrollHeight;
            }, 100);

            loadInbox(); loadSentMail();
        };

        const loadMailThread = async () => {
            const { data, error } = await supabaseClient.from("direct_messages").select("*").eq("id", msgId).maybeSingle();
            if (error) throw error;
            await renderMailThread(data);
        };

        await loadMailThread();

        const threadChannel = supabaseClient.channel('realtime:direct_messages:' + crypto.randomUUID())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: `id=eq.${msgId}` }, () => {
                loadMailThread().catch(err => console.error("Mail thread refresh failed:", err));
            })
            .subscribe();

        window.unsubMailThread = () => supabaseClient.removeChannel(threadChannel);
    } catch (e) { console.error(e); }
};

window.replyToMailThread = async () => {
    if (!window.currentMailThreadId) return;
    let text = document.getElementById("mail-reply-body").value.trim();
    let btn = document.getElementById("mail-reply-btn");

    if (!text && document.getElementById("mail-reply-attachment").files.length === 0) return alert("Type a reply or attach a file.");

    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i>";
    btn.disabled = true;

    let attachmentUrl = null;
    if (document.getElementById("mail-reply-attachment").files.length > 0) {
        attachmentUrl = await uploadToCloudinary("mail-reply-attachment", "mail-reply-btn", "<i class='fas fa-reply'></i>");
        if (!attachmentUrl) {
            btn.innerHTML = "<i class='fas fa-reply'></i> Reply"; btn.disabled = false;
            return alert("Upload failed.");
        }
    }

    try {
        const { data: threadRow, error: threadError } = await supabaseClient.from("direct_messages").select("*").eq("id", window.currentMailThreadId).maybeSingle();
        if (threadError) throw threadError;
        if (!threadRow) throw new Error("Message thread not found.");
        let replies = threadRow.replies || [];
        replies.push({
            senderRole: "chairman",
            senderName: currentSchoolName + " (Chairman)",
            text: text,
            attachmentUrl: attachmentUrl,
            timestamp: new Date().toISOString(),
            isRead: false
        });

        const { error } = await supabaseClient.from("direct_messages").update({ replies: replies }).eq("id", window.currentMailThreadId);
        if (error) throw error;

        document.getElementById("mail-reply-body").value = "";
        document.getElementById("mail-reply-attachment").value = "";
    } catch (e) {
        alert("Error sending reply");
    }
    btn.innerHTML = "<i class='fas fa-reply'></i> Reply"; btn.disabled = false;
};





















































