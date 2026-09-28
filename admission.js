// ============================================================================
// PUBLIC ADMISSION FORM - NATIVE SUPABASE SDK v2 (@supabase/supabase-js)
// ----------------------------------------------------------------------------
// The legacy Firebase / Firestore adapter layer is gone: this form now talks
// to Supabase directly through PostgREST (table queries) and GoTrue auth.
// The SDK itself is loaded from the CDN in admission.html (window.supabase).
// ============================================================================
const supabaseUrl = 'https://ynlcbpxcsnfxqrogizns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubGNicHhjc25meHFyb2dpem5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDMxNjMsImV4cCI6MjEwMzQ3OTE2M30.sx5iFeugOuLBt4pqt0-8_4VOGz1yWa7HQWl4NyGCWkE';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// DOM Elements
const container = document.getElementById("admission-container");
const msgBox = document.getElementById("message-box");
const msgIcon = document.getElementById("msg-icon");
const msgTitle = document.getElementById("msg-title");
const msgText = document.getElementById("msg-text");

const schoolNameEl = document.getElementById("school-name");
const schoolLogoEl = document.getElementById("school-logo");
const form = document.getElementById("admission-form");
const submitBtn = document.getElementById("submit-btn");

let currentSchoolId = "";

// Helper to show message
function showMessage(title, text, type) {
    container.style.display = "none";
    msgBox.style.display = "block";
    msgTitle.innerText = title;
    msgText.innerText = text;
    
    if(type === "error") {
        msgIcon.className = "fas fa-exclamation-circle error";
    } else if (type === "success") {
        msgIcon.className = "fas fa-check-circle success";
    } else {
        msgIcon.className = "fas fa-spinner fa-spin loading";
    }
}

// 1. URL Parsing
const urlParams = new URLSearchParams(window.location.search);
const schoolIdParam = urlParams.get('school');

if (!schoolIdParam) {
    showMessage("Invalid Link", "Invalid Admission Link. Please contact the school.", "error");
} else {
    currentSchoolId = schoolIdParam;
    loadSchoolData();
}

// 2. Dynamic Branding
async function loadSchoolData() {
    try {
        const { data: school, error: schoolError } = await supabaseClient
            .from("vw_public_schools")
            .select("*")
            .eq("id", currentSchoolId)
            .maybeSingle();

        if (schoolError) console.error("School lookup failed:", schoolError);

        if (school) {
            const data = school;

            // Check if admissions are closed
            if (data.admissionOpen === false) {
                showMessage("Admissions Closed", "This school is not accepting new admissions at the moment.", "error");
                return;
            }

            // Update UI
            if (data.schoolName) {
                schoolNameEl.innerText = data.schoolName;
                document.title = data.schoolName + " - Admission Form";
            }
            if (data.logoUrl) {
                schoolLogoEl.src = data.logoUrl;
                schoolLogoEl.style.display = "block";
            }
            if (data.themeColor) {
                document.documentElement.style.setProperty('--theme-color', data.themeColor);
            }

            // Show Form
            msgBox.style.display = "none";
            container.style.display = "flex";
        } else {
            showMessage("School Not Found", "The school associated with this link does not exist.", "error");
        }
    } catch (error) {
        console.error("Error fetching school data:", error);
        showMessage("Connection Error", "Failed to load school details. Please try again later.", "error");
    }
}

// Helper: Convert File to Base64
const convertToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
});

// Helper: Upload to Cloudinary
async function uploadToCloudinary(file) {
    try {
        const base64Image = await convertToBase64(file);
        const response = await fetch("https://api.cloudinary.com/v1_1/disgtvs6f/image/upload", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                file: base64Image,
                upload_preset: "ml_default"
            })
        });
        const data = await response.json();
        return data.secure_url || null;
    } catch (error) {
        console.error("Cloudinary Upload Error:", error);
        return null;
    }
}

// 3. Form Submission
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("student-name").value.trim();
    const dob = document.getElementById("student-dob").value;
    const rollNo = document.getElementById("roll-no").value.trim();
    const studentClass = document.getElementById("student-class").value;
    const parentage = document.getElementById("parentage").value.trim();
    const motherName = document.getElementById("mother-name").value.trim();
    const mobile = document.getElementById("mobile").value.trim();
    const address = document.getElementById("address").value.trim();
    const photoFile = document.getElementById("photo").files[0];

    if (!name || !studentClass || !parentage || !motherName || !mobile || !address || !photoFile) {
        alert("Please fill in all required fields and upload a photo.");
        return;
    }

    // Set loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Submitting...";

    try {
        // Upload photo
        const photoUrl = await uploadToCloudinary(photoFile);
        
        if (!photoUrl) {
            throw new Error("Image upload failed");
        }

        // Use secure RPC for admission submission
        const payload = {
            name: name,
            dob: dob,
            rollNo: rollNo,
            class: studentClass,
            parentage: parentage,
            motherName: motherName,
            mobile: mobile,
            address: address,
            photoUrl: photoUrl
        };

        const { data: result, error: rpcError } = await supabaseClient.rpc('submit_admission', {
            p_school_id: currentSchoolId,
            p_payload: payload
        });

        if (rpcError) {
            console.error("RPC Error:", rpcError);
            if (rpcError.message && rpcError.message.includes('closed')) {
                throw new Error("Admissions are currently closed for this school.");
            }
            throw new Error(rpcError.message || "Failed to submit admission form");
        }

        // Show Success
        showMessage(
            "Success!", 
            "Admission Form Submitted Successfully! The school will contact you shortly.", 
            "success"
        );

    } catch (error) {
        console.error("Submission error:", error);
        alert("An error occurred while submitting your application. Please try again.");
        
        // Reset button
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<i class='fas fa-paper-plane'></i> Submit Application";
    }
});


