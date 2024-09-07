import mongoose from "mongoose";

const BeyondVideoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  thumbnailUrl: { type: String, required: true },
  videoUrl: { type: String, required: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  createdAt: { type: Date, default: Date.now },
  commentsCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  viewsCount: { type: Number, default: 0 }
});

const BeyondVidCommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondVideo', required: true },
  picture: { type: String },
  text: { type: String, required: true },
  likes: [{ type: String }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondVidComment' },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BeyondVidComment' }],
  createdAt: { type: Date, default: Date.now },
});

export const BeyondVidComment = mongoose.model('BeyondVidComment', BeyondVidCommentSchema);
export const BeyondVideo = mongoose.model('BeyondVideo', BeyondVideoSchema);