import express from 'express';
import { User } from '../models/HeadlineModel.js';
import { verifyFirebaseToken } from '../Middlewares/AuthMiddleware.js';

const router = express.Router();

// Update your registration route
router.post('/register', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email, displayName, photoURL, username } = req.body;

    if (req.user.uid !== uid) {
      return res.status(403).json({ message: 'UID mismatch' });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    let user = await User.findOne({ uid });

    if (user) {
      // Update existing user
      user.email = email;
      user.displayName = displayName;
      user.photoURL = photoURL;
      if (username && username.trim() !== '') {
        user.username = username.trim();
      }
    } else {
      // Create new user
      user = new User({
        uid,
        email,
        displayName,
        photoURL,
        username: username.trim(),
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
      const { uid, email, displayName, photoURL, username } = req.body;
      console.log('Login attempt for:', { uid, email, displayName, username });
  
      if (req.user.uid !== uid) {
        console.log('UID mismatch:', { requestUID: uid, tokenUID: req.user.uid });
        return res.status(403).json({ message: 'UID mismatch' });
      }
  
      let user = await User.findOne({ uid });
      console.log('Existing user found:', user);
  
      if (user) {
        // Update existing user
        const updateData = { email, displayName, photoURL };
        if (username && username.trim() !== '') {
          updateData.username = username.trim();
        }
        const updateResult = await User.updateOne({ uid }, { $set: updateData });
        console.log('Update result:', updateResult);
      } else {
        // Create new user
        user = new User({
          uid,
          email,
          displayName,
          photoURL,
          ...(username && username.trim() !== '' && { username: username.trim() }),
        });
        const saveResult = await user.save();
        console.log('New user created:', saveResult);
      }
  
      res.status(200).json({ message: 'User logged in successfully', user });
    } catch (error) {
      console.error('Error in login route:', error);
      res.status(500).json({ message: 'Error logging in user', error: error.toString() });
    }
  });
  router.post('/google-signin', verifyFirebaseToken, async (req, res) => {
    try {
      const { uid, email, displayName, photoURL } = req.body;
  
      if (req.user.uid !== uid) {
        return res.status(403).json({ message: 'UID mismatch' });
      }
  
      let user = await User.findOne({ email });
  
      if (user) {
        // Update existing user
        user.uid = uid; // Update UID in case it has changed
        user.displayName = displayName;
        user.photoURL = photoURL;
      } else {
        // Create new user
        user = new User({
          uid,
          email,
          displayName,
          photoURL,
          username: email.split('@')[0], // Generate a username from email
        });
      }
  
      // Ensure username is unique
      let baseUsername = user.username;
      let usernameCounter = 1;
      while (await User.findOne({ username: user.username, _id: { $ne: user._id } })) {
        user.username = `${baseUsername}${usernameCounter}`;
        usernameCounter++;
      }
  
      await user.save();
  
      res.status(200).json({ message: 'User signed in successfully', user });
    } catch (error) {
      console.error('Error signing in with Google:', error);
      res.status(500).json({ message: 'Error signing in with Google', error: error.message });
    }
  });


export default router;