const mongoose = require('mongoose');

mongoose.connect(process.env.DB_URL);

const SelfieSchema = new mongoose.Schema({
    image: {
        type: String,
        required: true
    }
});
const Selfie = mongoose.model('Selfie', SelfieSchema);

module.exports = Selfie;