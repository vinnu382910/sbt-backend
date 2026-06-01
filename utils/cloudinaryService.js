const cloudinary = require("cloudinary").v2;

const getCloudinaryConfig = () => {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary environment variables are missing.");
  }

  return { cloudName, apiKey, apiSecret };
};

const configureCloudinary = () => {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
};

const uploadQuestionImage = ({ buffer, originalname }) => {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_QUESTION_FOLDER || "sbt-exam/questions",
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        context: originalname ? { originalname } : undefined,
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve({
          imageUrl: result.secure_url,
          imagePublicId: result.public_id,
        });
      }
    );

    stream.end(buffer);
  });
};

const deleteImage = async (publicId) => {
  if (!publicId) return;
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
};

module.exports = {
  uploadQuestionImage,
  deleteImage,
};
