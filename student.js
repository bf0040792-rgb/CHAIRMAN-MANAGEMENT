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
