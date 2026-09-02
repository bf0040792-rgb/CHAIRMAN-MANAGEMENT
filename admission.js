const supabaseUrl = 'https://ynlcbpxcsnfxqrogizns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubGNicHhjc25meHFyb2dpem5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDMxNjMsImV4cCI6MjEwMzQ3OTE2M30.sx5iFeugOuLBt4pqt0-8_4VOGz1yWa7HQWl4NyGCWkE';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const getAuth = () => supabase.auth;
const onAuthStateChanged = (auth, callback) => {
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
            callback({ uid: session.user.id, email: session.user.email });
        } else {
            callback(null);
        }
    });
    supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
            callback({ uid: data.session.user.id, email: data.session.user.email });
        } else {
            callback(null);
        }
    });
};
const signInWithEmailAndPassword = async (auth, email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: { uid: data.user.id, email: data.user.email } };
};
const createUserWithEmailAndPassword = async (auth, email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { user: { uid: data.user.id, email: data.user.email } };
};
const signOut = async (auth) => await supabase.auth.signOut();
const setPersistence = async () => {};
const browserLocalPersistence = {};

const getFirestore = () => supabase;
const doc = (db, col, id, ...path) => {
    if (path.length > 0) {
        if (path[0] === 'feature_controls') {
           return { _isDoc: true, col: 'feature_controls', id: path[1], extraFilter: { field: 'schoolId', val: id } };
        }
    }
    return { _isDoc: true, col, id };
};
const collection = (db, col) => ({ _isCol: true, col });
const query = (colRef, ...constraints) => ({ ...colRef, constraints });
const where = (field, op, val) => ({ type: 'where', field, op, val });
const orderBy = (field, dir) => ({ type: 'orderBy', field, dir });
const limit = (num) => ({ type: 'limit', num });
const serverTimestamp = () => new Date().toISOString();
const deleteField = () => null;

const getDoc = async (docRef) => {
    let q = supabase.from(docRef.col).select('*').eq('id', docRef.id);
    if (docRef.extraFilter) q = q.eq(docRef.extraFilter.field, docRef.extraFilter.val);
    const { data, error } = await q.single();
    if (error || !data) return { exists: () => false, data: () => undefined, id: docRef.id };
    return { exists: () => true, data: () => data, id: docRef.id };
};

const getDocs = async (queryRef) => {
    let q = supabase.from(queryRef.col).select('*');
    if (queryRef.constraints) {
        for (const c of queryRef.constraints) {
            if (c.type === 'where') {
                if (c.op === '==') q = q.eq(c.field, c.val);
                else if (c.op === '!=') q = q.neq(c.field, c.val);
                else if (c.op === 'in') q = q.in(c.field, c.val);
            } else if (c.type === 'orderBy') {
                q = q.order(c.field, { ascending: c.dir !== 'desc' });
            } else if (c.type === 'limit') {
                q = q.limit(c.num);
            }
        }
    }
    const { data, error } = await q;
    if (error) throw error;
    const docs = (data || []).map(d => ({ id: d.id, data: () => d, exists: () => true }));
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (cb) => docs.forEach(cb) };
};

const setDoc = async (docRef, data, options = {}) => {
    const payload = { id: docRef.id, ...data };
    if (docRef.extraFilter) payload[docRef.extraFilter.field] = docRef.extraFilter.val;
    const { error } = await supabase.from(docRef.col).upsert(payload);
    if (error) throw error;
};

const updateDoc = async (docRef, data) => {
    let q = supabase.from(docRef.col).update(data).eq('id', docRef.id);
    if (docRef.extraFilter) q = q.eq(docRef.extraFilter.field, docRef.extraFilter.val);
    const { error } = await q;
    if (error) throw error;
};

const deleteDoc = async (docRef) => {
    const { error } = await supabase.from(docRef.col).delete().eq('id', docRef.id);
    if (error) throw error;
};

const addDoc = async (colRef, data) => {
    const { data: res, error } = await supabase.from(colRef.col).insert(data).select().single();
    if (error) throw error;
    return { id: res.id };
};

const writeBatch = () => {
    const operations = [];
    return {
        set: (docRef, data) => operations.push({ type: 'set', ref: docRef, data }),
        update: (docRef, data) => operations.push({ type: 'update', ref: docRef, data }),
        delete: (docRef) => operations.push({ type: 'delete', ref: docRef }),
        commit: async () => {
            for (const op of operations) {
                if (op.type === 'set') await setDoc(op.ref, op.data);
                if (op.type === 'update') await updateDoc(op.ref, op.data);
                if (op.type === 'delete') await deleteDoc(op.ref);
            }
        }
    };
};

const onSnapshot = (ref, callback) => {
    if (ref._isDoc) {
        getDoc(ref).then(callback);
        const channel = supabase.channel('public:' + ref.col + ':' + ref.id)
            .on('postgres_changes', { event: '*', schema: 'public', table: ref.col, filter: 'id=eq.' + ref.id }, async () => {
                const snap = await getDoc(ref);
                callback(snap);
            }).subscribe();
        return () => supabase.removeChannel(channel);
    } else {
        getDocs(ref).then(callback);
        const channel = supabase.channel('public:' + ref.col)
            .on('postgres_changes', { event: '*', schema: 'public', table: ref.col }, async () => {
                const snap = await getDocs(ref);
                callback(snap);
            }).subscribe();
        return () => supabase.removeChannel(channel);
    }
};

const increment = (num) => num;
const initializeApp = () => supabase;

// --- END ADAPTER ---

const auth = getAuth();
const db = getFirestore();
const secondaryAuth = getAuth();


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
        const docRef = doc(db, "schools", currentSchoolId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
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

        // Save to Firestore
        await addDoc(collection(db, "students"), {
            schoolId: currentSchoolId,
            status: "Pending",
            lockedOut: false,
            name: name,
            dob: dob,
            rollNo: rollNo,
            class: studentClass,
            parentage: parentage,
            motherName: motherName,
            mobile: mobile,
            address: address,
            photoUrl: photoUrl,
            createdAt: serverTimestamp()
        });

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


