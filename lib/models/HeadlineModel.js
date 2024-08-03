import mongoose from "mongoose";
 

// Channel Schema
const ChannelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    picture: { type: String }, // URL to the picture
    subscribers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  });
  
  // Content Schema
  const ContentSchema = new mongoose.Schema({
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    message: { type: String },
    picture: { type: String }, // URL to the picture
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
    shareLink: { type: String },
    screenshotLink: { type: String },
    createdAt: { type: Date, default: Date.now }
  });
  
  // Comment Schema
  const CommentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: mongoose.Schema.Types.ObjectId, ref: 'Content' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  });
  
  // User Schema
  const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    subscribedChannels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }]
  });
  
  // Create models
  const Channel = mongoose.model('Channel', ChannelSchema);
  const Content = mongoose.model('Content', ContentSchema);
  const Comment = mongoose.model('Comment', CommentSchema);
  const User = mongoose.model('User', UserSchema);
  
  export  { Channel, Content, Comment, User };