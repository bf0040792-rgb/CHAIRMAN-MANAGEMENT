import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
    'https://ynlcbpxcsnfxqrogizns.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubGNicHhjc25meHFyb2dpem5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDMxNjMsImV4cCI6MjEwMzQ3OTE2M30.sx5iFeugOuLBt4pqt0-8_4VOGz1yWa7HQWl4NyGCWkE'
);

export const getAuth = () => supabase.auth;
export const onAuthStateChanged = (auth, callback) => {
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
export const signInWithEmailAndPassword = async (auth, email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: { uid: data.user.id, email: data.user.email } };
};
export const createUserWithEmailAndPassword = async (auth, email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { user: { uid: data.user.id, email: data.user.email } };
};
export const signOut = async (auth) => await supabase.auth.signOut();
export const setPersistence = async () => {};
export const browserLocalPersistence = {};

export const getFirestore = () => supabase;
export const doc = (db, col, id, ...path) => {
    if (path.length > 0) {
        if (path[0] === 'feature_controls') {
           return { _isDoc: true, col: 'feature_controls', id: path[1], extraFilter: { field: 'schoolId', val: id } };
        }
    }
    return { _isDoc: true, col, id };
};
export const collection = (db, col) => ({ _isCol: true, col });
export const query = (colRef, ...constraints) => ({ ...colRef, constraints });
export const where = (field, op, val) => ({ type: 'where', field, op, val });
export const orderBy = (field, dir) => ({ type: 'orderBy', field, dir });
export const limit = (num) => ({ type: 'limit', num });
export const serverTimestamp = () => new Date().toISOString();
export const deleteField = () => null;

export const getDoc = async (docRef) => {
    let q = supabase.from(docRef.col).select('*').eq('id', docRef.id);
    if (docRef.extraFilter) q = q.eq(docRef.extraFilter.field, docRef.extraFilter.val);
    const { data, error } = await q.single();
    if (error || !data) return { exists: () => false, data: () => undefined, id: docRef.id };
    return { exists: () => true, data: () => data, id: docRef.id };
};

export const getDocs = async (queryRef) => {
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

export const setDoc = async (docRef, data, options = {}) => {
    const payload = { id: docRef.id, ...data };
    if (docRef.extraFilter) payload[docRef.extraFilter.field] = docRef.extraFilter.val;
    const { error } = await supabase.from(docRef.col).upsert(payload);
    if (error) throw error;
};

export const updateDoc = async (docRef, data) => {
    let q = supabase.from(docRef.col).update(data).eq('id', docRef.id);
    if (docRef.extraFilter) q = q.eq(docRef.extraFilter.field, docRef.extraFilter.val);
    const { error } = await q;
    if (error) throw error;
};

export const deleteDoc = async (docRef) => {
    const { error } = await supabase.from(docRef.col).delete().eq('id', docRef.id);
    if (error) throw error;
};

export const addDoc = async (colRef, data) => {
    const { data: res, error } = await supabase.from(colRef.col).insert(data).select().single();
    if (error) throw error;
    return { id: res.id };
};

export const writeBatch = () => {
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

export const onSnapshot = (ref, callback) => {
    if (ref._isDoc) {
        getDoc(ref).then(callback);
        const channel = supabase.channel(`public:${ref.col}:${ref.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: ref.col, filter: `id=eq.${ref.id}` }, async () => {
                const snap = await getDoc(ref);
                callback(snap);
            }).subscribe();
        return () => supabase.removeChannel(channel);
    } else {
        getDocs(ref).then(callback);
        const channel = supabase.channel(`public:${ref.col}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: ref.col }, async () => {
                const snap = await getDocs(ref);
                callback(snap);
            }).subscribe();
        return () => supabase.removeChannel(channel);
    }
};

export const increment = (num) => num;
export const initializeApp = () => supabase;
