import mongoose from "mongoose";

const UserHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  contentType: { type: String, enum: ['video', 'article'], required: true },
  contentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    refPath: 'contentType',
    required: true 
  },
  viewedAt: { type: Date, default: Date.now },
  duration: { type: Number, default: 0 } // Time spent watching/reading in seconds
});

UserHistorySchema.virtual('video', {
  ref: 'BeyondVideo',
  localField: 'contentId',
  foreignField: '_id',
  justOne: true
});

UserHistorySchema.virtual('article', {
  ref: 'BeyondArticle',
  localField: 'contentId',
  foreignField: '_id',
  justOne: true
});

export const UserHistory = mongoose.model('UserHistory', UserHistorySchema);