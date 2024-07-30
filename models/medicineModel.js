const mongoose = require('mongoose');

mongoose.connect("mongodb://127.0.0.1:27017/medReminder");

const medicineSchema = mongoose.Schema({
    name:String,
    start_date:Date,
    end_date:Date,
    time:[
        {
            type:String
        }
    ],
    userid:String
});

module.exports = mongoose.model("medicine",medicineSchema);