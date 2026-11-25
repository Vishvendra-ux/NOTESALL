const crypto = require('crypto');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const DEMO_ACCOUNT_EMAIL = 'demo@notesx.edu';
const DEMO_SESSION_TTL = '2h';
const DEMO_SESSION_TTL_SECONDS = 2 * 60 * 60;

const generateToken = (id, expiresIn = '30d') => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn,
  });
};

const formatUserResponse = (user, token) => {
  const data = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    bio: user.bio,
    collegeName: user.collegeName,
    course: user.course,
    year: user.year,
    semester: user.semester,
    github: user.github,
    linkedin: user.linkedin,
    reputation: user.reputation,
    badges: user.badges,
    profilePhoto: user.profilePhoto,
    resume: user.resume,
    resumeOriginalName: user.resumeOriginalName,
    isVerified: user.isVerified,
    isPro: Boolean(user.isPro) && (!user.proExpiresAt || new Date(user.proExpiresAt) > new Date()),
    proExpiresAt: user.proExpiresAt || null,
    isOnboarded: user.role === 'admin' ? true : Boolean(user.isOnboarded),
    isDemo: Boolean(user.isDemo),
    careerGoal: user.careerGoal || '',
    skills: user.skills || [],
    codingProfiles: user.codingProfiles,
  };
  if (token) data.token = token;
  return data;
};

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client();

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Explicitly reject any attempt to escalate privilege during registration
    if (req.body.role && req.body.role.toLowerCase() === 'admin') {
      return res.status(403).json({ message: 'Registration with administrative privileges is prohibited' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: cleanEmail });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Public registration ALWAYS assigns the 'student' role
    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role: 'student',
      isOnboarded: false,
      collegeName: '',
      course: '',
      year: '',
      semester: '',
    });

    if (user) {
      res.status(201).json(formatUserResponse(user, generateToken(user._id)));
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      console.log(`Login attempt failed: No user found with email '${cleanEmail}'`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      console.log(`Login successful for: ${user.email} (${user.role})`);
      res.json(formatUserResponse(user, generateToken(user._id)));
    } else {
      console.log(`Login attempt failed: Password mismatch for email '${cleanEmail}'`);
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Google Sign In / Verified Sign-in
// @route   POST /api/auth/google
// @access  Public
const googleLogin = async (req, res) => {
  const { credential, token, idToken, name, email, picture } = req.body;

  try {
    let verifiedEmail = null;
    let verifiedName = name;
    let verifiedPicture = picture;

    const rawToken = credential || token || idToken;
    const configuredClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();

    if (rawToken) {
      if (!configuredClientId) {
        return res.status(503).json({
          message: 'Google Sign-In is not configured on the server (missing GOOGLE_CLIENT_ID).'
        });
      }

      // 1. Cryptographically verify ID token signature, expiry, issuer, and audience with Google
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: rawToken,
          audience: configuredClientId,
        });
        const payload = ticket ? ticket.getPayload() : null;
        if (payload && payload.email && payload.email_verified !== false) {
          verifiedEmail = payload.email.toLowerCase().trim();
          verifiedName = payload.name || verifiedName;
          verifiedPicture = payload.picture || verifiedPicture;
        }
      } catch (tokenErr) {
        return res.status(401).json({
          message: 'Invalid or expired Google credential token.'
        });
      }

      if (!verifiedEmail) {
        return res.status(401).json({
          message: 'Google account email could not be verified.'
        });
      }
    }

    // In development mode only: allow student accounts for testing
    if (!verifiedEmail) {
      const cleanEmail = email ? email.toLowerCase().trim() : '';
      const adminEmail = (process.env.ADMIN_EMAIL || 'pratapsinghvishvendra6@gmail.com').toLowerCase().trim();
      const isAdminAccount = cleanEmail === adminEmail;

      if (isAdminAccount) {
        return res.status(403).json({
          message: 'Admin accounts must sign in using Email & Password.'
        });
      }

      const isDevDemo = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_USER === 'true' && cleanEmail;
      if (isDevDemo) {
        verifiedEmail = cleanEmail;
        verifiedName = verifiedName || cleanEmail.split('@')[0].replace(/[\._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      } else {
        return res.status(401).json({
          message: 'Valid Google identity credential token is required. Account impersonation is strictly prohibited.'
        });
      }
    }

    let user = await User.findOne({ email: verifiedEmail });

    if (!user) {
      const dummyPassword = await bcrypt.hash(Date.now().toString() + Math.random().toString(), 10);
      user = await User.create({
        name: verifiedName || 'Google Learner',
        email: verifiedEmail,
        password: dummyPassword,
        role: 'student',
        profilePhoto: verifiedPicture || '',
        isVerified: true,
        isOnboarded: false,
        collegeName: '',
        course: '',
        year: '',
        semester: '',
      });
      console.log(`✅ New student registered via Google Sign-in: ${user.email}`);
    } else {
      let updated = false;
      if (verifiedPicture && !user.profilePhoto) {
        user.profilePhoto = verifiedPicture;
        updated = true;
      }
      if (!user.isVerified) {
        user.isVerified = true;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
      console.log(`✅ Existing user logged in via Google Sign-in: ${user.email} (${user.role})`);
    }

    res.json(formatUserResponse(user, generateToken(user._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Issue a temporary one-time guest demo session so visitors can explore the full site
// @route   POST /api/auth/demo
// @access  Public (rate-limited)
const demoLogin = async (req, res) => {
  try {
    if (process.env.DISABLE_DEMO_ACCOUNT === 'true') {
      return res.status(403).json({
        message: 'Guest demo access is currently disabled. Please sign in with Google or create an account.'
      });
    }

    let user = await User.findOne({ email: DEMO_ACCOUNT_EMAIL });

    if (!user) {
      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await User.create({
        name: 'Demo Explorer',
        email: DEMO_ACCOUNT_EMAIL,
        password: randomPassword,
        role: 'student',
        bio: 'Exploring NOTESX with a temporary one-time guest pass.',
        collegeName: 'GLA University',
        course: 'B.Tech CSE',
        year: '3rd Year',
        semester: 'Semester 5',
        careerGoal: 'Full-Stack Software Engineer',
        skills: ['DSA', 'React', 'Node.js', 'MongoDB', 'Operating Systems'],
        reputation: 240,
        badges: ['👀 Guest Explorer', '🎓 Onboarded Student'],
        isVerified: true,
        isPro: false,
        isOnboarded: true,
        isDemo: true,
      });
      console.log(`✅ One-time Guest Demo Account initialized: ${user.email}`);
    } else {
      // Self-heal invariants: demo account is always a non-Pro, onboarded student
      let dirty = false;
      if (!user.isDemo) { user.isDemo = true; dirty = true; }
      if (!user.isOnboarded) { user.isOnboarded = true; dirty = true; }
      if (!user.isVerified) { user.isVerified = true; dirty = true; }
      if (user.role !== 'student') { user.role = 'student'; dirty = true; }
      if (user.isPro) { user.isPro = false; user.proExpiresAt = null; dirty = true; }
      if (dirty) await user.save();
    }

    const token = generateToken(user._id, DEMO_SESSION_TTL);
    res.json({
      ...formatUserResponse(user, token),
      demoExpiresInSeconds: DEMO_SESSION_TTL_SECONDS,
    });
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ message: 'Unable to start demo session right now. Please try again.' });
  }
};

// @desc    Complete Student Onboarding (academic profile, coding handles, career goal, skills)
// @route   PUT /api/auth/onboarding
// @access  Private (Student)
const completeStudentOnboarding = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isDemo) {
      return res.status(403).json({
        message: 'Demo account is already pre-configured. Sign in with Google to create your own profile.'
      });
    }

    const {
      name,
      collegeName,
      course,
      year,
      semester,
      codingHandles,
      github,
      linkedin,
      careerGoal,
      skills,
      bio
    } = req.body;

    if (!collegeName || !String(collegeName).trim()) {
      return res.status(400).json({ message: 'College name is required' });
    }
    if (!course || !String(course).trim()) {
      return res.status(400).json({ message: 'Course / Degree is required' });
    }
    if (!year || !String(year).trim()) {
      return res.status(400).json({ message: 'Academic year is required' });
    }

    if (name && String(name).trim()) user.name = String(name).trim();
    user.collegeName = String(collegeName).trim();
    user.course = String(course).trim();
    user.year = String(year).trim();
    user.semester = semester ? String(semester).trim() : 'Annual / Other';
    if (github !== undefined) user.github = String(github).trim();
    if (linkedin !== undefined) user.linkedin = String(linkedin).trim();
    if (careerGoal !== undefined) user.careerGoal = String(careerGoal).trim();
    if (bio !== undefined) user.bio = String(bio).trim();

    if (Array.isArray(skills)) {
      user.skills = skills.map(s => String(s).trim()).filter(Boolean);
    }

    if (!user.codingProfiles) {
      user.codingProfiles = { handles: {} };
    }
    if (!user.codingProfiles.handles) {
      user.codingProfiles.handles = {};
    }

    const { extractHandle, fetchLeetCodeStats, fetchCodeforcesStats, fetchCodeChefStats, calculateUnifiedCodingScore } = require('../services/codingTrackerService');

    let handlesChanged = false;
    if (codingHandles) {
      if (codingHandles.leetcode !== undefined) {
        const lcClean = extractHandle(codingHandles.leetcode);
        if (user.codingProfiles.handles.leetcode !== lcClean) {
          user.codingProfiles.handles.leetcode = lcClean;
          handlesChanged = true;
        }
      }
      if (codingHandles.codeforces !== undefined) {
        const cfClean = extractHandle(codingHandles.codeforces);
        if (user.codingProfiles.handles.codeforces !== cfClean) {
          user.codingProfiles.handles.codeforces = cfClean;
          handlesChanged = true;
        }
      }
      if (codingHandles.codechef !== undefined) {
        const ccClean = extractHandle(codingHandles.codechef);
        if (user.codingProfiles.handles.codechef !== ccClean) {
          user.codingProfiles.handles.codechef = ccClean;
          handlesChanged = true;
        }
      }
    }

    if (!user.badges.includes('🎓 Onboarded Student')) {
      user.badges.push('🎓 Onboarded Student');
      user.reputation = (user.reputation || 0) + 50;
    }

    user.isOnboarded = true;

    // If student provided handles, attempt initial sync
    const hasAnyHandle = Boolean(
      user.codingProfiles.handles.leetcode ||
      user.codingProfiles.handles.codeforces ||
      user.codingProfiles.handles.codechef
    );

    if (hasAnyHandle && handlesChanged) {
      try {
        const [lcStats, cfStats, ccStats] = await Promise.all([
          fetchLeetCodeStats(user.codingProfiles.handles.leetcode),
          fetchCodeforcesStats(user.codingProfiles.handles.codeforces),
          fetchCodeChefStats(user.codingProfiles.handles.codechef),
        ]);

        user.codingProfiles.leetcode = lcStats;
        user.codingProfiles.codeforces = cfStats;
        user.codingProfiles.codechef = ccStats;

        const { score, totalProblems } = calculateUnifiedCodingScore({
          leetcode: lcStats,
          codeforces: cfStats,
          codechef: ccStats,
        });

        user.codingProfiles.codingScore = score;
        user.codingProfiles.totalProblemsSolved = totalProblems;
        user.codingProfiles.lastSyncedAt = new Date();

        if (!user.codingProfiles.verificationCode) {
          user.codingProfiles.verificationCode = `NOTESX-${user._id.toString().slice(-4).toUpperCase()}`;
        }
      } catch (syncErr) {
        console.warn('Initial coding stats fetch warning:', syncErr.message);
      }
    }

    await user.save();
    console.log(`✅ Student onboarding completed for: ${user.email} (${user.collegeName})`);

    res.json(formatUserResponse(user));
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ message: error.message || 'Failed to complete onboarding' });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { register, login, googleLogin, demoLogin, completeStudentOnboarding, getMe, googleClient };
