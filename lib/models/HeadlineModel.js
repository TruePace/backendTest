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
    userId: { type: String, required: true }, // Store Firebase UID
    username: { type: String, required: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', required: true },
    picture: { type: String },
    text: { type: String, required: true },
    likes: [{ type: String }], // Store Firebase UIDs of users who liked
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
    username: { type: String, unique: true, sparse: true }, // Add this line
    createdAt: { type: Date, default: Date.now },
  });
  
  // Create models
  const Channel = mongoose.model('Channel', ChannelSchema);
  const Content = mongoose.model('Content', ContentSchema);
  const Comment = mongoose.model('Comment', CommentSchema);
  const User = mongoose.model('User', UserSchema);
  
  export  { Channel, Content, Comment, User };