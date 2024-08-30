import mongoose from "mongoose";
 

// Channel Schema
const ChannelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    picture: { type: String }, // URL to the picture
    subscriberCount: { type: Number, default: 0 }
  });
  
  // Content Schema
  const ContentSchema = new mongoose.Schema({
    message: { type: String },
    picture: { type: String ,required:false},
    likeCount: { type: Number, default: 0 },
    dislikeCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    isJustIn: { type: Boolean, default: true },
    justInExpiresAt: { type: Date },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
    showInAllChannels: { type: Boolean, default: true },
    reactions:[],
  engagementScore: { type: Number, default: 0 }
  });
  
  // Comment Schema
  const CommentSchema = new mongoose.Schema({
    username: { type: String, default: 'Anonymous' },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'HeadlineNews', required: true },
    picture: { type: String  },
    text: { type: String, required: true },
    likes: [{ type: String }], // Changed to store usernames instead of user IDs
    replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
    createdAt: { type: Date, default: Date.now },
  });

  // Add a method to calculate engagement score
ContentSchema.methods.calculateEngagementScore = function() {
  return this.likeCount + this.dislikeCount + (this.commentCount || 0);
};
  
  // User Schema
  const UserSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    displayName: { type: String },
    photoURL: { type: String },
    createdAt: { type: Date, default: Date.now },
  });
  
  // Create models
  const Channel = mongoose.model('Channel', ChannelSchema);
  const Content = mongoose.model('Content', ContentSchema);
  const Comment = mongoose.model('Comment', CommentSchema);
  const User = mongoose.model('User', UserSchema);
  
  export  { Channel, Content, Comment, User };