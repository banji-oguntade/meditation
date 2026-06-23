// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyB5unnGDL74Sa0PBfipSGgjmU27_Nh4z-4",
    authDomain: "logos-meditation.firebaseapp.com",
    projectId: "logos-meditation",
    storageBucket: "logos-meditation.firebasestorage.app",
    messagingSenderId: "364047217245",
    appId: "1:364047217245:web:a30d52050b21f50559d3b4",
    measurementId: "G-63DK4PHNRR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);