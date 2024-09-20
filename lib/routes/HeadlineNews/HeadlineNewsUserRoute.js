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
    const { uid, email, displayName, photoURL, username } = req.body;

    if (req.user.uid !== uid) {
      console.log('UID mismatch:', { requestUID: uid, tokenUID: req.user.uid });
      return res.status(403).json({ message: 'UID mismatch' });
    }

    console.log('Generating unique username for:', username);
    let uniqueUsername = await generateUniqueUsernameTwo(username);
    console.log('Generated unique username:', uniqueUsername);

    let user = await User.findOne({ uid });
    console.log('Existing user found:', user);

    if (user) {
      // Update existing user
      console.log('Updating existing user');
      user.email = email;
      user.displayName = displayName;
      user.photoURL = photoURL;
      user.username = uniqueUsername;
    } else {
      // Create new user
      console.log('Creating new user');
      user = new User({
        uid,
        email,
        displayName,
        photoURL,
        username: uniqueUsername,
        
      });
    }

    console.log('Saving user to database');
    await user.save();
    console.log('User saved successfully');

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

    let user = await User.findOne({ uid });

    if (user) {
      // Update existing user
      user.displayName = displayName;
      user.photoURL = photoURL;
      // Update username if it was previously set to email
      if (user.username === email.split('@')[0]) {
        user.username = await generateUniqueUsername(displayName);
      }
    } else {
      // Create new user
      user = new User({
        uid,
        email,
        displayName,
        photoURL,
        username: await generateUniqueUsername(displayName),
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