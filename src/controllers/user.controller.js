import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong for generating tokens");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // Get user data from Frontend
  const { username, email, fullname, password } = req.body;
  console.log("Registering user:", { username, email, fullname });

  // Validation - not empty
  if (
    [username, email, fullname, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All Fields is required");
  }

  // Check if user already exists: username or email
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "Username or Email already exists");
  }

  // Check for Images, Check for Avatar
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  // Upload images to cloudinary, avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar is required");
  }

  // Create User Object - Create Entry in Database
  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  // Remove passsword & Refresh Token field from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Check user creation
  if (!createdUser) {
    throw new ApiError(500, "User creation failed");
  }

  // Return Response
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // Req Body -> Data
  const { email, username, password } = req.body;

  // Username or Email
  if (!email || !username) {
    throw new ApiError(400, "Email or Username is required");
  }

  // Check user exists
  const user = await User.findOne({ $or: [{ email }, { username }] });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Password Check
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid User Credentials");
  }

  // Access & Refresh Token
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  // Send Cookie
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findById({});
});

export { registerUser, loginUser, logoutUser };
