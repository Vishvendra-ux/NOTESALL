const mongoose = require('mongoose');
const User = require('../models/User');

exports.me = async (req, res, next) => { 
  try { 
    res.json(await User.findById(req.user._id).select('-password').populate('collegeId', 'name location')); 
  } catch (error) { 
    next(error); 
  } 
};

exports.profile = async (req, res, next) => { 
  try { 
    const username = (req.params.username || '').trim();
    if (!username) {
      return res.status(400).json({ message: 'Username or identifier is required' });
    }

    const safeRegex = new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const queryConditions = [{ name: safeRegex }];
    if (/^[0-9a-fA-F]{24}$/.test(username)) {
      queryConditions.push({ _id: username });
    }

    const user = await User.findOne({ $or: queryConditions })
      .select('name bio collegeName course year semester github linkedin reputation badges profilePhoto createdAt')
      .populate('collegeId', 'name location'); 
    
    if (!user) return res.status(404).json({ message: 'Student not found' }); 
    res.json(user); 
  } catch (error) { 
    next(error); 
  } 
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, bio, collegeName, course, year, semester, github, linkedin, profilePhoto, careerGoal, skills } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isDemo) {
      return res.status(403).json({
        message: 'Demo account profile is read-only. Sign in with Google or register to customize your own profile.'
      });
    }

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (collegeName) user.collegeName = collegeName;
    if (course) user.course = course;
    if (year) user.year = year;
    if (semester) user.semester = semester;
    if (github !== undefined) user.github = github;
    if (linkedin !== undefined) user.linkedin = linkedin;
    if (profilePhoto) user.profilePhoto = profilePhoto;
    if (careerGoal !== undefined) user.careerGoal = careerGoal;
    if (Array.isArray(skills)) user.skills = skills.map(s => String(s).trim()).filter(Boolean);

    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');
    console.log(`✅ Profile updated for: ${updatedUser.email}`);
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

exports.uploadResume = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a valid resume file (PDF, DOC, DOCX)' });
    }

    const fileUrl = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isDemo) {
      return res.status(403).json({
        message: 'Demo account profile is read-only. Sign in with Google or register to customize your own profile.'
      });
    }

    user.resume = fileUrl;
    user.resumeOriginalName = req.file.originalname;
    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');
    console.log(`📄 Resume successfully uploaded for ${updatedUser.email}: ${fileUrl}`);
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

exports.deleteResume = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.isDemo) {
      return res.status(403).json({
        message: 'Demo account profile is read-only. Sign in with Google or register to customize your own profile.'
      });
    }

    user.resume = '';
    user.resumeOriginalName = '';
    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');
    console.log(`🗑️ Resume deleted for ${updatedUser.email}`);
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

exports.togglePro = async (req, res, next) => {
  try {
    // Defense-in-depth: never allow non-admins to modify Pro subscriptions directly
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can update Pro subscriptions.' });
    }

    const { userId, email, isPro, durationDays } = req.body || {};

    let targetUser = null;
    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
      const cleanId = String(userId).trim();
      if (!mongoose.isValidObjectId(cleanId)) {
        return res.status(400).json({ message: 'Invalid target userId format.' });
      }
      targetUser = await User.findById(cleanId);
    } else if (email !== undefined && email !== null && String(email).trim() !== '') {
      targetUser = await User.findOne({ email: String(email).toLowerCase().trim() });
    } else {
      targetUser = await User.findById(req.user._id);
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found.' });
    }

    let parsedDays = 365;
    if (durationDays !== undefined) {
      const numDays = Number(durationDays);
      if (!Number.isFinite(numDays) || numDays < 1 || numDays > 3650) {
        return res.status(400).json({ message: 'durationDays must be a number between 1 and 3650.' });
      }
      parsedDays = Math.floor(numDays);
    }

    const setProTo = isPro !== undefined ? Boolean(isPro) : !targetUser.isPro;
    targetUser.isPro = setProTo;
    targetUser.proExpiresAt = setProTo ? new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000) : null;
    targetUser.proProvider = setProTo ? 'admin' : '';
    await targetUser.save();

    const updatedUser = await User.findById(targetUser._id).select('-password');
    console.log(`⭐ Pro status updated for ${updatedUser.email}: ${updatedUser.isPro} (by admin ${req.user.email})`);
    res.json({
      message: updatedUser.isPro ? 'Successfully upgraded to NOTESX Pro!' : 'Downgraded to free plan.',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

