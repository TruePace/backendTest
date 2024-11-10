import express from 'express';
import { User } from '../../models/HeadlineNews/HeadlineModel.js';
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';

const router = express.Router();

// Helper function to generate a unique username
async function generateUniqueUsernameTwo(baseUsername) {
  let username = baseUsername;
  let counter = 1;
  while (await User.findOne({ username })) {
    username = `${baseUsername}${counter}`;
    counter++;
  }
  return username;
}

router.post('/register', verifyFirebaseToken, async (req, res) => {
  console.log('Received registration request:', req.body);
  try {
    const { 
      uid, 
      email, 
      displayName, 
      photoURL, 
      username,
      deviceInfo,
      location,
      loginHistory 
    } = req.body;

    if (req.user.uid !== uid) {
      return res.status(403).json({ message: 'UID mismatch' });
    }

    let uniqueUsername = await generateUniqueUsernameTwo(username);
    let user = await User.findOne({ uid });

    if (user) {
      user.email = email;
      user.displayName = displayName;
      user.photoURL = photoURL;
      user.username = uniqueUsername;
    } else {
      user = new User({
        uid,
        email,
        displayName,
        photoURL,
        username: uniqueUsername,
        deviceInfo,
        location,
        ipAddress: req.ipAddress,
        loginHistory: [{
          timestamp: new Date(),
          ipAddress: req.ipAddress,
          location,
          deviceInfo
        }]
      });
    }

    await user.save();
    res.status(200).json({ message: 'User registered successfully', user });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
});

  router.post('/details', async (req, res) => {
    try {
      const { uid } = req.body;
      const user = await User.findOne({ uid });
      if (user) {
        res.status(200).json({ user });
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({ message: 'Error fetching user details' });
    }
  });

  router.post('/login', verifyFirebaseToken, async (req, res) => {
    try {
      const { 
        uid, 
        email, 
        deviceInfo, 
        location 
      } = req.body;
  
      if (req.user.uid !== uid) {
        return res.status(403).json({ message: 'UID mismatch' });
      }
  
      let user = await User.findOne({ uid });
  
      if (user) {
        // Update user information
        user.lastActive = new Date();
        user.deviceInfo = deviceInfo;
        user.location = location;
        user.ipAddress = req.ipAddress;
  
        // Add to login history
        user.loginHistory.push({
          timestamp: new Date(),
          ipAddress: req.ipAddress,
          location,
          deviceInfo
        });
  
        await user.save();
      }
  
      res.status(200).json({ message: 'User logged in successfully', user });
    } catch (error) {
      console.error('Error in login route:', error);
      res.status(500).json({ message: 'Error logging in user', error: error.toString() });
    }
  });

  router.post('/google-signin', verifyFirebaseToken, async (req, res) => {
    console.log('Received Google sign-in request:', req.body);
    try {
      const { 
        uid, 
        email, 
        displayName, 
        photoURL,
        deviceInfo,
        location,
        loginHistory 
      } = req.body;
  
      // Verify UID matches the token
      if (req.user.uid !== uid) {
        return res.status(403).json({ message: 'UID mismatch' });
      }
  
      let user = await User.findOne({ uid });
  
      if (user) {
        // Update existing user
        user.email = email;
        user.displayName = displayName;
        user.photoURL = photoURL;
        user.lastActive = new Date();
        user.deviceInfo = deviceInfo;
        user.location = location;
        user.ipAddress = req.ipAddress;
  
        // Add to login history
        user.loginHistory.push({
          timestamp: new Date(),
          ipAddress: req.ipAddress,
          location,
          deviceInfo
        });
  
        // Update username if it was previously set to email (keeping existing logic)
        if (user.username === email.split('@')[0]) {
          user.username = await generateUniqueUsername(displayName);
        }
      } else {
        // Create new user with full schema
        user = new User({
          uid,
          email,
          displayName,
          photoURL,
          username: await generateUniqueUsername(displayName),
          deviceInfo,
          location,
          ipAddress: req.ipAddress,
          loginHistory: [{
            timestamp: new Date(),
            ipAddress: req.ipAddress,
            location,
            deviceInfo
          }],
          interests: [],
          subscriptions: [],
          readingHistory: [],
          interactionScores: new Map()
        });
      }
  
      await user.save();
      res.status(200).json({ message: 'User signed in successfully', user });
    } catch (error) {
      console.error('Error signing in with Google:', error);
      res.status(500).json({ message: 'Error signing in with Google', error: error.message });
    }
  });

// Helper function to generate a unique username
async function generateUniqueUsername(displayName) {
  let username = displayName.replace(/\s+/g, '').toLowerCase();
  let uniqueUsername = username;
  let counter = 1;

  while (await User.findOne({ username: uniqueUsername })) {
    uniqueUsername = `${username}${counter}`;
    counter++;
  }

  return uniqueUsername;
}

export default router;