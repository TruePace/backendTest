// firebaseAdmin.js

import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

async function initializeApp() {
  try {
    // Read the service account file
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '../serviceAccount.json';
    const serviceAccount = JSON.parse(await readFile(new URL(serviceAccountPath, import.meta.url)));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
}

await initializeApp();

export default admin;