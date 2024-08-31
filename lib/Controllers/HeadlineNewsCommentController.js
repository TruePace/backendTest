import  {Comment}  from "../models/HeadlineModel.js";



// Create a new comment
const postHeadlineNewsComment = async (req, res) => {
  try {
    const { contentId, text, replyTo } = req.body;
    const { uid, name, email } = req.user; // From verifyFirebaseToken middleware

    const newComment = new Comment({
      userId: uid,
      username: name || email,
      text,
      contentId,
    });

    if (replyTo) {
      const parentComment = await Comment.findById(replyTo);
      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }
      parentComment.replies.push(newComment._id);
      await parentComment.save();
    }

    await newComment.save();
    res.status(201).json(newComment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
 // Get comments for a specific content
 const getHeadlineNewsComments = async (req, res) => {
  try {
    const { contentId } = req.params;
    const comments = await Comment.find({ contentId, replyTo: null })
      .populate({
        path: 'replies',
        populate: { path: 'replies' }
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
    likeComment ,
    getCommentCount 
  };
