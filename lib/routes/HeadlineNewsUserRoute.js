import express from 'express';
import { User } from '../models/HeadlineModel.js';
import { verifyFirebaseToken } from '../Middlewares/AuthMiddleware.js';

const router = express.Router();

// Update your registration route
router.post('/register', verifyFirebaseToken, async (req, res) => {
    try {
        const { uid, email, displayName, photoURL } = req.body;

        if (req.user.uid !== uid) {
            return res.status(403).json({ message: 'UID mismatch' });
        }

        let user = await User.findOne({ uid });

        if (user) {
            // Update existing user
            user.email = email;
            user.displayName = displayName;
            user.photoURL = photoURL;
            await user.save();
        } else {
            // Create new user
            user = new User({
                uid,
                email,
                displayName,
                photoURL
            });
            await user.save();
        }

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
        const { uid, email, displayName, photoURL } = req.body;
        console.log('Login attempt for:', { uid, email, displayName });

        if (req.user.uid !== uid) {
            console.log('UID mismatch:', { requestUID: uid, tokenUID: req.user.uid });
            return res.status(403).json({ message: 'UID mismatch' });
        }

        let user = await User.findOne({ uid });
        console.log('Existing user found:', user);

        if (user) {
            // Update existing user
            const updateResult = await User.updateOne(
                { uid },
                { $set: { email, displayName, photoURL } }
            );
            console.log('Update result:', updateResult);
        } else {
            // Create new user
            user = new User({ uid, email, displayName, photoURL });
            const saveResult = await user.save();
            console.log('New user created:', saveResult);
        }

        res.status(200).json({ message: 'User logged in successfully', user });
    } catch (error) {
        console.error('Error in login route:', error);
        res.status(500).json({ message: 'Error logging in user', error: error.toString() });
    }
});


export default router;