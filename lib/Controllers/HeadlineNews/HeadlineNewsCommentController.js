import { Comment,Interaction ,Content} from "../../models/HeadlineNews/HeadlineModel.js";
import { io } from "../../../server.js";

const postHeadlineNewsComment = async (req, res) => {
  try {
    const { contentId, text, replyTo, photoURL, picture } = req.body;
    const { uid } = req.user;
    const username = req.body.username;

    // Create the new comment
    const newComment = new Comment({
      userId: uid,
      username: username,
      text,
      contentId,
      replyTo,
      photoURL: photoURL || picture,
      picture: photoURL || picture
    });

    // Handle reply logic
    if (replyTo) {
      const parentComment = await Comment.findById(replyTo);
      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }
      if (parentComment.userId === uid) {
        return res.status(403).json({ message: "You cannot reply to your own comment" });
      }
      parentComment.replies.push(newComment._id);
      await parentComment.save();
    }

    // Save the new comment
    await newComment.save();

    // Get updated comment count
    const commentCount = await Comment.countDocuments({ contentId });

    // Update the Content document's commentCount
    await Content.findByIdAndUpdate(
      contentId,
      { $inc: { commentCount: 1 } }, // Increment commentCount by 1
      { new: true }
    );

    // Emit socket event for real-time updates
    io.emit('updateCommentCount', { contentId, count: commentCount });

    // Create interaction record
    const newInteraction = new Interaction({
      userId: uid,
      contentId: contentId,
      interactionType: 'comment',
      timestamp: new Date()
    });

    await newInteraction.save();

    res.status(201).json(newComment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
const getHeadlineNewsComments = async (req, res) => {
  try {
    const { contentId } = req.params;
    const comments = await Comment.find({ contentId, replyTo: null })
      .populate({
        path: 'replies',
        populate: { 
          path: 'replies',
          populate: { path: 'replies' }
        }
      })
      .sort('-createdAt');

    const commentCount = await Comment.countDocuments({ contentId });

    res.json({ comments, commentCount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { uid } = req.user;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const likeIndex = comment.likes.indexOf(uid);
    if (likeIndex > -1) {
      comment.likes.splice(likeIndex, 1);
    } else {
      comment.likes.push(uid);
    }

    await comment.save();
    res.json({ likes: comment.likes.length });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getCommentCount = async (req, res) => {
  try {
    const { contentId } = req.params;
    const commentCount = await Comment.countDocuments({ contentId });
    res.json({ commentCount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export {
  postHeadlineNewsComment,
  getHeadlineNewsComments,
  likeComment,
  getCommentCount
};