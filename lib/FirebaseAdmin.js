// firebaseAdmin.js
import admin from 'firebase-admin';
import { readFile } from 'fs/promises';
let app;

async function initializeApp() {
  if (!app) {
    try {
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '../serviceAccount.json';
      const serviceAccount = JSON.parse(await readFile(new URL(serviceAccountPath, import.meta.url)));

      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
      throw error;
    }
  }
  return app;
}

export { initializeApp };
export default admin;