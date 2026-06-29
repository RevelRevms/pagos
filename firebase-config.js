import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCcEFQgNwtlPNYZzLcYdBgcj1xWOIB7SSs",
  authDomain:        "pagos-red.firebaseapp.com",
  projectId:         "pagos-red",
  storageBucket:     "pagos-red.firebasestorage.app",
  messagingSenderId: "538429549039",
  appId:             "1:538429549039:web:15ad9c0f5979b8e7fcee1a"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export { auth, db };
