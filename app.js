    const express = require('express');
    const cron = require('node-cron');
    const medicineModel = require("./models/medicineModel");
    const userModel = require("./models/userModel")
    const app = express();
    const moment = require('moment');
    const bcrypt = require('bcrypt');
    const cookieParser = require('cookie-parser');
    const jwt = require("jsonwebtoken");
    const verifyToken = require('./middleware/verifyToken'); 
    require("dotenv").config();
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    const client = require('twilio')(accountSid,authToken);
    const sendSMS = async (body,phone)=>{
        let msgOptions = {
            from: process.env.TWILIO_FROM_NUMBER,
            to: phone,
            body
        };
        try {
            const message = await client.messages.create(msgOptions);
            console.log(message);
        } catch (error) {
            console.log(error);
        }
    }
    function create_cron_dateTime(seconds,minutes,hour,day_of_the_month,month,day_of_the_week){
        return seconds+" "+minutes+" "+hour+" "+day_of_the_month+" "+month+" "+day_of_the_week;
    }
    
    function isWithin(startDate,endDate){
        const currentDate = new Date();
        return currentDate >=startDate && currentDate<=endDate;
    }

    let scheduleJobs = [];

    const scheduleReminder = async (reminder)=>{
        const timesArray = reminder.time;
        const startDate = new Date(reminder.start_date);
        const endDate = new Date(reminder.end_date);
        const previousDate = new Date(startDate);
        previousDate.setDate(startDate.getDate() - 1);
        const nextDate = new Date(endDate);
        nextDate.setDate(endDate.getDate() + 1);
        const user1 = await userModel.findOne({_id:reminder.userid});
        timesArray.forEach(singleTime => {
            const [hours, minutes] = singleTime.split(':').map(Number);
            
            const job = cron.schedule(
                create_cron_dateTime(0, minutes, hours, '*', '*', '*'),
                function() {
                    if (isWithin(previousDate, nextDate)) {
                        console.log(`message sent at ${hours}:${minutes} in range ${startDate} & ${endDate}`);
                        sendSMS(`Time to take ${reminder.name}`, user1.phone);
                    }
                }
            );
        });
        const jobId = `${reminder._id}-${hours}-${minutes}`;
        scheduleJobs.push({id: jobId,job});

    }

    app.set('view engine', 'ejs');
    app.use(express.json());
    app.use(express.urlencoded({extended:true}))
    app.use(cookieParser())

    app.get("/",async (req,res)=>{
        const reminders = await medicineModel.find();
        reminders.forEach(scheduleReminder);
        res.render('login')
    });

    app.post("/create",verifyToken, async (req,res)=>{
        let {name,start_date,end_date,time} = req.body;
        let user1 = await userModel.findOne({ email: req.user.email });
        const times = time.split(',').map(t => t.trim());
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        const previousDate = new Date(startDate);
        previousDate.setDate(startDate.getDate() - 1);
        const nextDate = new Date(endDate);
        nextDate.setDate(endDate.getDate() + 1);
        const medicine = await medicineModel.create({name,start_date:startDate,end_date:endDate,time:times,userid:user1._id});
        const phone1 = user1.phone;
        times.forEach(singleTime => {
            const [hours, minutes] = singleTime.split(':').map(Number);
            
            const job = cron.schedule(
                create_cron_dateTime(0, minutes, hours, '*', '*', '*'),
                function() {
                    if (isWithin(previousDate, nextDate)) {
                        console.log(`message sent at ${hours}:${minutes} in range ${startDate} & ${endDate}`);
                        sendSMS(`Time to take ${name}`, phone1);
                    }
                }
            );
            const jobId = `${medicine._id}-${hours}-${minutes}`;
            scheduleJobs.push({id: jobId,job});

        });
        await medicine.save();
        
        res.redirect('/read');
    });

    app.get("/read",verifyToken,async (req,res)=>{
        let user1 = await userModel.findOne({ email: req.user.email });
        let allMedicines = await medicineModel.find({userid:user1._id});
        allMedicines.forEach(medicine => {
            medicine.formatted_start_date = medicine.start_date.toISOString().split('T')[0];
            medicine.formatted_end_date = medicine.end_date.toISOString().split('T')[0];
        });
        
        res.render('read',{allMedicines})
    });

    app.get("/delete/:id",verifyToken,async (req,res)=>{
        const id = req.params.id;
        try {
            const reminder = await medicineModel.findById(id);
            if(reminder){
                const timesArray = reminder.time;
                timesArray.forEach(singleTime => {
                    const [hours, minutes] = singleTime.split(':').map(Number);
                    const jobId = `${reminder._id}-${hours}-${minutes}`;
                    
                    const jobIndex = scheduleJobs.findIndex(job => job.id === jobId);
                    
                    if (jobIndex > -1) {
                        scheduleJobs[jobIndex].job.stop();
                        scheduleJobs.splice(jobIndex, 1);
                        console.log(`Removed scheduled job for phone ${reminder.phone} at time ${hours}:${minutes}`);
                    } else {
                        console.log(`No scheduled job found for phone ${reminder.phone} at time ${hours}:${minutes}`);
                    }
                });
    
                await medicineModel.findByIdAndDelete(id);
            }
        } catch (error) {
            
        }
        const medicine = await medicineModel.findOneAndDelete({_id:id});

        res.redirect('/read')
    });

    app.get("/update/:id",verifyToken,async (req,res)=>{
        let id = req.params.id;
        let {name,start_date,end_date,time} = req.body;
        res.render('update',{name,start_date,end_date,time,id});
    })

    app.post("/update/:id",verifyToken,async (req,res)=>{
        const id = req.params.id;
        let {name,start_date,end_date,time} = req.body;
        const times = time.split(',').map(t => t.trim());
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        const medicine = await medicineModel.findOneAndUpdate({_id:id},{name,start_date:startDate,end_date:endDate,time:times});
        res.redirect('/read')
    });

    app.get("/signup",(req,res)=>{
        res.render('signup')
    });

    app.post("/signup",async (req,res)=>{
        let {email,phone,password} = req.body;
        let user = await userModel.findOne({email});
        if(user) return res.status(500).send("User Already Present");

        bcrypt.genSalt(10,(err,salt)=>{
            bcrypt.hash(password,salt,async (err,hash)=>{
                let createdUser = await userModel.create({
                    email,
                    phone,
                    password:hash
                });
                let token = jwt.sign({email,userid:createdUser._id},"shh");
                res.cookie("token",token);
                res.render("index");
            })
        })
    });

    app.post("/login",async (req,res)=>{

        let { email, password } = req.body;
        let user = await userModel.findOne({ email });
        if (!user) return res.status(500).send("User not present");

        bcrypt.compare(password, user.password, function (err, result) {
            if (result) {
                let token = jwt.sign({ email, userid: user._id }, 'shh');
                res.cookie('token', token, { httpOnly: true });
                res.render('index');
            }
            else {
                res.send("failed");
            }
        });
    });

    app.get("/logout",(req,res)=>{
        res.cookie("token","");
        res.redirect("/");
    })



    app.listen(3000);