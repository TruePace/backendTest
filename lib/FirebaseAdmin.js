import admin from 'firebase-admin';

let app;

function initializeApp() {
  if (!app) {
    try {
      console.log('FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT);
      
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
      }

      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
      console.error('Error details:', error.message);
      throw error;
    }
  }
  return app;
}

export { initializeApp };
export default admin;