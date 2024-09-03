import mongoose from "mongoose";

const BeyondVideoSchema = new mongoose.Schema({
    title: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    videoUrl: { type: String, required: true },
    author: { type: String, required: true },
    truepacerUrl:{type: String, required: true},
    createdAt: { type: Date, default: Date.now },
    commentsCount: { type: Number, default: 0 },
    likesCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 }
  });
  
  export const BeyondVideo = mongoose.model('BeyondVideo', BeyondVideoSchema);