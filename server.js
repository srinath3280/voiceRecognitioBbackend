require('dotenv').config();
const Selfie = require('./image.model');
const express = require('express');
const Razorpay = require('razorpay');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const app = express();
const cloudinary = require('cloudinary').v2;

const secretKey = 'your_secret_key';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
  fileFilter: (req, file, cb) => {
    const allowedFileTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mkv',
      'video/avi',
    ];
    if (allowedFileTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  },
});

// const upload = multer({
//   dest: 'uploads/',
//   fileFilter: (req, file, cb) => {
//     const allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/mkv', 'video/avi'];
//     if (allowedFileTypes.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error('Invalid file type'), false);
//     }
//   },
// });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.post('/register', async (req, res) => {
  // console.log(req.body)
  const userDetails = JSON.parse(fs.readFileSync('files/register.txt').toString());
  // console.log(userDetails)
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    username,
    email,
    password: hashedPassword
  };
  userDetails.push(newUser);
  fs.writeFileSync('files/register.txt', JSON.stringify(userDetails));
  res.status(200).send('Registered successfully');
})

// app.post('/login', function (req, res) {
//     // console.log(req.body);
//     const user = req.body;
//     try {
//         const data = JSON.parse(fs.readFileSync('files/register.txt').toString());
//         const detail = data.filter((d) => {
//             if (user.username === d.username && user.password === d.password) {
//                 const token = jwt.sign({ username: user.username, password: user.password }, secretKey, { expiresIn: '1h' });
//                 res.json({ token });
//             }
//             else {
//                 return false;
//             }
//         })
//         res.json(detail);
//     }
//     catch (error) {
//         res.send('Error', err)
//     }
// })

const getUserData = () => {
  try {
    const data = fs.readFileSync('files/register.txt');
    return JSON.parse(data.toString());
  } catch (error) {
    throw new Error('Error reading user data'); // Custom error message
  }
};

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const data = getUserData(); // Read stored data
    const user = data.find((u) => u.username === username);

    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password); // Password comparison

    if (isMatch) { // If password matches
      const token = jwt.sign({ username: user.username }, secretKey, { expiresIn: '1h' });
      return res.status(200).json({ token }); // Return JWT token
    } else {
      return res.status(401).json({ message: 'Invalid username or password' }); // Password mismatch
    }
  } catch (error) {
    console.error('Server error:', error); // Log detailed error
    return res.status(500).json({ message: 'Internal server error' }); // General error response
  }
});

function verifyToken(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send('Unauthorized');

  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) return res.status(403).send('Forbidden');
    req.user = decoded;
    next();
  });
}

app.post('/image', verifyToken, upload.none(), async function (req, res) {
  // console.log(req.body)
  try {
    const { image } = req.body;
    const saveFile = JSON.parse(fs.readFileSync('imageCapture.txt').toString());
    if (image !== null) {
      saveFile.push(image);
    }
    fs.writeFileSync('imageCapture.txt', JSON.stringify(saveFile));
    // const newSelfie = new Selfie({ image });
    // await newSelfie.save();
    res.status(200).send('Image uploaded successfully');
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).send('Internal Server Error');
  }
})

// Configure Razorpay instance with your credentials
const razorpay = new Razorpay({
  key_id: 'rzp_test_MwQMiQVl16pUSA',
  key_secret: 'k2aeqXyecalyUerjWenhyJq9',
});

// Route to create a Razorpay order
app.post('/create-order', async (req, res) => {
  const { amount, currency, receipt } = req.body;
  try {
    const order = await razorpay.orders.create({
      amount, // in paise
      currency,
      receipt,
    });
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to verify Razorpay payment signature
app.post('/verify-signature', (req, res) => {
  const { order_id, payment_id, signature } = req.body;
  const crypto = require('crypto');

  const expectedSignature = crypto
    .createHmac('sha256', 'k2aeqXyecalyUerjWenhyJq9')
    .update(order_id + '|' + payment_id)
    .digest('hex');

  if (expectedSignature === signature) {
    res.status(200).json({ verified: true });
  } else {
    res.status(400).json({ verified: false });
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file.path;
  // console.log(req.file.mimetype)
  const isVideo = ['video/mp4', 'video/mkv', 'video/avi'].includes(req.file.mimetype);
  const resourceType = isVideo ? 'video' : 'image';

  cloudinary.uploader.upload(file, { resource_type: resourceType, folder: 'my_custom_folder' })
    .then((result) => {
      res.json({ url: result.secure_url });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

app.get('/images/:folder', (req, res) => {
  const folder = req.params.folder;

  cloudinary.api.resources({
    type: 'upload',
    prefix: folder  // Fetch all resources with this prefix (folder name)
  })
    .then((result) => {
      const imageUrls = result.resources.map((resource) => resource.secure_url);
      res.json(imageUrls);
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

app.listen(process.env.PORT, () => { console.log('Server running on ' + process.env.PORT) })