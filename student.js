import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDocs, collection, query, where, addDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// URL Params
const urlParams = new URLSearchParams(window.location.search);
const currentSchoolId = urlParams.get('school');

// State
let currentStudent = null;
let currentSchoolDoc = null;

// DOM Elements
const loader = document.getElementById("loader");
const authContainer = document.getElementById("auth-container");
const dashContainer = document.getElementById("dashboard-container");
const loginForm = document.getElementById("student-login-form");
const loginError = document.getElementById("login-error");

// Initialization
async function init() {
    if (!currentSchoolId) {
        alert("Invalid Access: School ID missing in URL.");
        return;
    }
    try {
        const snap = await getDoc(doc(db, "schools", currentSchoolId));
        if (snap.exists()) {
            currentSchoolDoc = snap.data();
            document.getElementById("school-name").innerText = currentSchoolDoc.schoolName || "Fee Portal";
            if (currentSchoolDoc.schoolLogoUrl) {
                const logo = document.getElementById("school-logo");
                logo.src = currentSchoolDoc.schoolLogoUrl;
                logo.style.display = "block";
            }
            document.title = `${currentSchoolDoc.schoolName} - Student Portal`;
        } else {
            alert("School not found!");
        }
    } catch(e) {
        console.error("Init error:", e);
    }
    loader.style.display = "none";
}

// 1. Login Logic
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    const regNo = document.getElementById("login-regno").value.trim();
    const mobile = document.getElementById("login-mobile").value.trim();
    
    loader.style.display = "flex";
    try {
        const q = query(
            collection(db, "students"), 
            where("schoolId", "==", currentSchoolId),
            where("regNo", "==", regNo),
            where("mobile", "==", mobile)
        );
        const snap = await getDocs(q);
        
        if (snap.empty) {
            loginError.innerText = "Invalid Reg No or Mobile Number.";
            loginError.style.display = "block";
        } else {
            currentStudent = { id: snap.docs[0].id, ...snap.docs[0].data() };
            loadDashboard();
        }
    } catch (err) {
        loginError.innerText = "Error connecting to database.";
        loginError.style.display = "block";
    }
    loader.style.display = "none";
});

// 2. Load Dashboard
function loadDashboard() {
    authContainer.style.display = "none";
    dashContainer.style.display = "block";
    
    document.getElementById("dash-school-name").innerText = currentSchoolDoc.schoolName || "Portal";
    document.getElementById("student-display-name").innerText = currentStudent.name;
    document.getElementById("student-display-class").innerText = currentStudent.class;
    document.getElementById("student-display-reg").innerText = currentStudent.regNo;
    
    // Fallback dueBalance to 0 if not present
    const due = currentStudent.dueBalance || 0;
    document.getElementById("student-due-balance").innerText = due;
    
    // Only show "Pay Now" if they have balance, or maybe always show?
    if (due > 0) {
        document.getElementById("show-payment-btn").style.display = "inline-block";
        document.getElementById("pay-amount").value = due; // pre-fill
    } else {
        document.getElementById("show-payment-btn").style.display = "inline-block"; // Keep it so they can pay advance or any fees
    }
}

// 3. Show Payment QR Section
window.showPaymentSection = () => {
    if (!currentSchoolDoc.paymentQrUrl || !currentSchoolDoc.upiId) {
        alert("The school has not configured the QR Fee Payment System yet. Please contact the administration.");
        return;
    }
    
    document.getElementById("show-payment-btn").style.display = "none";
    document.getElementById("payment-section").style.display = "block";
    
    document.getElementById("school-qr-img").src = currentSchoolDoc.paymentQrUrl;
    document.getElementById("school-upi-text").innerText = currentSchoolDoc.upiId;
    
    // Create Deep Link
    const amount = currentStudent.dueBalance > 0 ? currentStudent.dueBalance : 0;
    const upiLink = `upi://pay?pa=${currentSchoolDoc.upiId}&pn=${encodeURIComponent(currentSchoolDoc.schoolName)}&am=${amount}&cu=INR`;
    document.getElementById("upi-deep-link").href = upiLink;
};

// 4. Cloudinary Upload Helper
const convertToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
});

async function uploadToCloudinary(file) {
    try {
        const base64Image = await convertToBase64(file);
        const response = await fetch("https://api.cloudinary.com/v1_1/disgtvs6f/image/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: base64Image, upload_preset: "ml_default" })
        });
        const data = await response.json();
        return data.secure_url || null;
    } catch (error) {
        console.error("Cloudinary Upload Error:", error);
        return null;
    }
}

// 5. Submit Verification
document.getElementById("verification-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const amount = document.getElementById("pay-amount").value.trim();
    const utr = document.getElementById("pay-utr").value.trim();
    const fileInput = document.getElementById("pay-screenshot").files[0];
    
    if (!fileInput) return alert("Please upload the payment screenshot.");
    if (utr.length < 5) return alert("Please enter a valid Transaction ID / UTR.");
    
    const submitBtn = document.getElementById("submit-verification-btn");
    submitBtn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Uploading...";
    submitBtn.disabled = true;
    
    try {
        const screenshotUrl = await uploadToCloudinary(fileInput);
        if (!screenshotUrl) throw new Error("Image upload failed.");
        
        await addDoc(collection(db, "fee_verifications"), {
            schoolId: currentSchoolId,
            studentId: currentStudent.id,
            studentName: currentStudent.name,
            regNo: currentStudent.regNo,
            amount: Number(amount),
            utr: utr,
            screenshotUrl: screenshotUrl,
            status: "Pending",
            createdAt: serverTimestamp()
        });
        
        document.getElementById("payment-section").style.display = "none";
        document.getElementById("success-section").style.display = "block";
    } catch(err) {
        alert("Error submitting verification: " + err.message);
        submitBtn.innerHTML = "<i class='fas fa-cloud-upload-alt'></i> Submit for Verification";
        submitBtn.disabled = false;
    }
});

window.logoutStudent = () => {
    currentStudent = null;
    dashContainer.style.display = "none";
    authContainer.style.display = "flex";
    document.getElementById("login-regno").value = "";
    document.getElementById("login-mobile").value = "";
};

window.onload = init;

// --- PDF DOWNLOADS ---
window.downloadMyIDCard = async () => {
    if (!currentStudent || !currentSchoolDoc) return;
    
    // Check defaulter lock
    if (currentStudent.dueBalance > 0) {
        return alert("Digital ID Card is locked due to pending fees. Please clear your dues first.");
    }
    
    const btn = document.getElementById("btn-download-id");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Generating ID...";
    btn.disabled = true;
    
    try {
        const response = await fetch("https://school-backend-zlgy.onrender.com/api/generate-id-card", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                studentData: {
                    id: currentStudent.id || currentStudent.regNo,
                    name: currentStudent.name,
                    class: currentStudent.class,
                    dob: currentStudent.dob || "N/A",
                    parentage: (currentStudent.parentage || currentStudent.fatherName) || "N/A",
                    mobile: currentStudent.mobile || "N/A",
                    address: currentStudent.address || "N/A",
                    photoUrl: currentStudent.photoUrl || "https://via.placeholder.com/150"
                },
                themeColor: currentSchoolDoc.themeColor || "#1e3c72",
                secondaryColor: currentSchoolDoc.secondaryColor || "#ffffff",
                templateStyle: currentSchoolDoc.idTemplateStyle || "wave",
                schoolName: currentSchoolDoc.schoolName || "SCHOOL NAME",
                schoolEmergency: currentSchoolDoc.emergencyMobile || "N/A",
                signatureUrl: (currentSchoolDoc.sigSettings && currentSchoolDoc.sigSettings.idCard === false) ? "" : (currentSchoolDoc.signatureUrl || ""),
                schoolLogoUrl: currentSchoolDoc.logoUrl || ""
            })
        });

        const data = await response.json();
        if(data.success && data.idCardUrl) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            pdf.addImage(data.idCardUrl, 'PNG', 10, 10, 54, 86);
            pdf.save(`${currentStudent.name}_ID_Card.pdf`);
        } else {
            alert("Could not generate ID card at this moment.");
        }
    } catch (e) {
        console.error(e);
        alert("Failed to generate ID card.");
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
};

window.downloadMyAdmitCard = async () => {
    if (!currentStudent || !currentSchoolDoc) return;
    
    // Check defaulter lock
    if (currentStudent.dueBalance > 0) {
        return alert("Admit Card is locked due to pending fees. Please clear your dues first.");
    }
    
    const btn = document.getElementById("btn-download-admit");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Generating Admit Card...";
    btn.disabled = true;
    
    try {
        // Fetch exam schedule
        const snap = await getDoc(doc(db, "schools", currentSchoolId, "examSchedules", currentStudent.class));
        const sched = snap.exists() ? (snap.data().schedule || []) : [];
        
        if (sched.length === 0) {
            alert("No exam routine published for your class yet.");
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        
        // Create hidden printable div
        const printable = document.createElement("div");
        printable.style.width = "800px";
        printable.style.padding = "20px";
        printable.style.background = "#fff";
        printable.style.color = "#000";
        printable.style.position = "absolute";
        printable.style.left = "-9999px";
        printable.style.top = "0";
        printable.style.border = "2px solid #000";
        
        let logoHtml = currentSchoolDoc.schoolLogoUrl ? `<img src="${currentSchoolDoc.schoolLogoUrl}" style="width:80px; height:80px; object-fit:contain; position:absolute; left:20px; top:20px;">` : '';
        
        let finalSigBase64 = "";
        if (currentSchoolDoc.signatureUrl && (!currentSchoolDoc.sigSettings || currentSchoolDoc.sigSettings.admit !== false)) {
            finalSigBase64 = currentSchoolDoc.signatureUrl;
            try {
                const res = await fetch("https://school-backend-zlgy.onrender.com/api/get-transparent-signature", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ signatureUrl: currentSchoolDoc.signatureUrl })
                });
                const data = await res.json();
                if (data.success) finalSigBase64 = data.base64;
            } catch(e) { console.error("Transparent sig fetch failed", e); }
        }
        
        let sigHtml = finalSigBase64 ? `<img src="${finalSigBase64}" style="height:50px;">` : '';
        
        let tbodyHtml = "";
        for (let i = 0; i < 6; i++) {
            let dStr = sched[i]?.date || "";
            if (dStr && dStr.includes("-")) {
                let parts = dStr.split("-");
                if(parts.length === 3) dStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            tbodyHtml += `<tr>
                <td style="border:1px solid #000; padding:8px;">${dStr}</td>
                <td style="border:1px solid #000; padding:8px;">${sched[i]?.subject || ""}</td>
                <td style="border:1px solid #000; padding:8px;">${sched[i]?.timing || ""}</td>
            </tr>`;
        }

        printable.innerHTML = `
            <div style="position:relative; text-align:center; margin-bottom:20px; border-bottom:2px solid #000; padding-bottom:10px;">
                ${logoHtml}
                <h2 style="margin:0; font-size:24px;">${(currentSchoolDoc.schoolName || "SCHOOL NAME").toUpperCase()}</h2>
                <h3 style="margin:5px 0 0; font-size:18px;">EXAMINATION ADMIT CARD</h3>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <div style="flex:1;">
                    <p><strong>Student Name:</strong> ${currentStudent.name}</p>
                    <p><strong>Class:</strong> ${currentStudent.class}</p>
                    <p><strong>Parentage:</strong> ${(currentStudent.parentage || currentStudent.fatherName)}</p>
                </div>
                <div style="flex:1; text-align:right;">
                    <p><strong>Roll No:</strong> ${currentStudent.rollNo || "N/A"}</p>
                    <p><strong>Reg No:</strong> ${currentStudent.regNo || "N/A"}</p>
                    <p><strong>DOB:</strong> ${currentStudent.dob || "N/A"}</p>
                </div>
            </div>
            
            <table style="width:100%; border-collapse:collapse; text-align:left; margin-bottom:30px;">
                <thead>
                    <tr>
                        <th style="border:1px solid #000; padding:8px; background:#f0f0f0;">Date</th>
                        <th style="border:1px solid #000; padding:8px; background:#f0f0f0;">Subject</th>
                        <th style="border:1px solid #000; padding:8px; background:#f0f0f0;">Timing</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbodyHtml}
                </tbody>
            </table>
            
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div><p>_______________________<br>Student Signature</p></div>
                <div style="text-align:right;">${sigHtml}<br><p>_______________________<br>Principal/Controller Signature</p></div>
            </div>
        `;
        
        document.body.appendChild(printable);
        
        const canvas = await html2canvas(printable, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        document.body.removeChild(printable);
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'mm', 'a4');
        pdf.addImage(imgData, 'JPEG', 10, 10, 277, 130);
        pdf.save(`${currentStudent.name}_Admit_Card.pdf`);
        
    } catch (e) {
        console.error(e);
        alert("Failed to generate Admit Card.");
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
};