import { BeyondVideo } from "../../../models/Beyond_Video/BeyondVideoModel.js";

export const getAllVideos = async (req, res) => {
    try {
      const videos = await BeyondVideo.find().sort({ createdAt: -1 });
      res.status(200).json(videos);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  export const getVideoById = async (req, res) => {
    try {
      const video = await BeyondVideo.findById(req.params.id);
      if (!video) {
        return res.status(404).json({ message: 'Video not found' });
      }
      res.status(200).json(video);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

  export const createVideo = async (req, res) => {
    try {
      const { title, thumbnailUrl, videoUrl, author,truepacerUrl } = req.body;
      
      if (!title || !thumbnailUrl || !videoUrl || !author || !truepacerUrl) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
  
      const newVideo = new BeyondVideo({
        title,
        thumbnailUrl,
        videoUrl,
        author,
        truepacerUrl,
        // Other fields will use default values as defined in the schema
      });
  
      const savedVideo = await newVideo.save();
      res.status(201).json(savedVideo);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };