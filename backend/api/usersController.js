const clientModel = require('../Models/clientmodel'); 
const tailorModel = require('../Models/tailorModel');
const validator = require('validator');
const userVerification = require('../Models/userVerificationModel')
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const path = require('path');
const { profile } = require('console');
require('dotenv').config();
let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// Verify transporter
transporter.verify((error, success) => {
    if (error) {
        console.log(error);
    } else {
        console.log('SMTP transporter ready for messages');
    }
});

const sendVerificationEmail = ({ _id, email }, res) => {
    const currentUrl = "http://localhost:5001/";
    const uniqueString = uuidv4() + _id;
    const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: 'Verify your email',
        html: `<h1>Click on the link below to verify your email</h1> <br> <a href=${currentUrl}verify/${_id}/${uniqueString}>Verify Email</a>`
    };

    const saltRounds = 10;
    bcrypt.hash(uniqueString, saltRounds)
        .then((hashedUniqueString) => {
            const newVerification = new userVerification({
                userId: _id,
                uniqueString: hashedUniqueString,
                createdAt: Date.now()
            });

            newVerification.save()
                .then(() => {
                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) {
                            console.log(error);
                            res.status(500).json(error);
                        } else {
                            console.log('Email sent:', info.response);
                            res.status(200).json('Email sent');
                        }
                    });
                })
                .catch((err) => {
                    console.log(err);
                    res.status(500).json(err);
                });
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json(err);
        });
};

const registerClient = async (req, res) => {
    try {
        const { username, email, password, gender } = req.body;

        let client = await clientModel.findOne({ email });
        if (client) return res.status(400).json("User with this email already exists...");

        let tailor = await tailorModel.findOne({ email });
        if (tailor) return res.status(400).json("User with this email already exists...");

        if (!validator.isEmail(email)) return res.status(400).json("Please enter a valid email ...");
        if (!validator.isStrongPassword(password)) return res.status(400).json("The password must be a strong one ...");


        const hashedPassword = await bcrypt.hash(password, 10); 

        client = new clientModel({ username, email, password: hashedPassword, gender,verified:false });

        await client.save()
        .then(result=>{sendVerificationEmail(result,res)}); 

        res.status(200).json({
            _id: client._id,
            username: client.username,
            email: client.email,
            gender: client.gender,
            profilePicture: client.profilePicture,
            userType: 'client',
        });
    } catch (error) {
        console.log(error);
        res.status(500).json(error);
    }
};

const registerTailor = async (req, res) => {
    try {
        const { name, email, gender, password, phone, city } = req.body;

        let tailor = await tailorModel.findOne({ email });
        if (tailor) return res.status(400).json('Tailor already exists');

        let client = await clientModel.findOne({ email });
        if (client) return res.status(400).json("User with this email already exists...");

        if (!validator.isEmail(email)) return res.status(400).json('Invalid email');
        if (!validator.isStrongPassword(password)) return res.status(400).json('Password is weak');

       
        const hashedPassword = await bcrypt.hash(password, 10); 

        tailor = new tailorModel({ name, email, gender, password: hashedPassword, phone, city,verified:false });
       await  tailor.save()
        .then(result=>{sendVerificationEmail(result,res)}); 
        res.status(200).json({
            _id: tailor._id,
            name: tailor.name,
            email: tailor.email,
            gender: tailor.gender,
            phone: tailor.phone,
            city: tailor.city,
            profilePicture: tailor.profilePicture,
            userType: 'tailor',
        });
    } catch (err) {
        console.log(err);
        res.status(500).json('Server error');
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        let user = await clientModel.findOne({ email });
        let userType = 'client'; 
        
        if (!user) {
            user = await tailorModel.findOne({ email });
            userType = 'tailor'; 
        }
        
        if (user) {
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (isPasswordValid) {
                if (userType === 'tailor') {
                    res.status(200).json({
                        _id: user._id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        city: user.city,
                        gender:user.gender,
                        verified: user.verified,
                        userType: userType ,
                        profilePicture: user.profilePicture,
                    });

                }else{
                    res.status(200).json({
                        _id: user._id,
                        name: user.name,
                        email: user.email,
                        verified: user.verified,
                        gender:user.gender,
                        userType: userType ,
                        profilePicture: user.profilePicture,
                    });
                }
            } else {
                res.status(400).json('Invalid credentials');
            }
        } else {
            res.status(400).json('User not found');
        }
    } catch (err) {
        res.status(500).json('Server error');
    }
};
const verifyEmail = async (req, res) => {
    try {
        const { userId, uniqueString } = req.params;

        let user = await clientModel.findById(userId);
        let userType = 'client';

        if (!user) {
            user = await tailorModel.findById(userId);
            userType = 'tailor';
        }

        if (!user) {
            return res.status(404).json('User not found');
        }

        const userVerificationEntry = await userVerification.findOne({ userId });

        if (!userVerificationEntry) {
            return res.status(404).json('User verification entry not found');
        }

        bcrypt.compare(uniqueString, userVerificationEntry.uniqueString)
            .then(async (isMatch) => {
                if (isMatch) {
                    if (userType === 'client')
                    await clientModel.findByIdAndUpdate(userId, { verified: true });
                    else{
                        await tailorModel.findByIdAndUpdate(userId, { verified: true });
                    }

                    await userVerification.findByIdAndDelete(userVerificationEntry._id);

                    const filePath = path.join(__dirname,'..', 'verified.html');
                    res.sendFile(filePath, (err) => {
                        if (err) {
                            console.error('Error sending file:', err);
                            res.status(500).send('Error sending page');
                        }
                    });
                } else {
                    res.status(400).json('Invalid verification link');
                }
            })
            .catch((err) => {
                console.log(err);
                res.status(500).json('Server error');
            });
    } catch (error) {
        console.log(error);
        res.status(500).json('Server error');
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email } = req.body;
        
        let user = await clientModel.findOne({ email });
        
        if (!user) {
            user = await tailorModel.findOne({ email });
        }
        
        if (user) {
            const resetToken = uuidv4();

            user.resetPasswordToken = resetToken;
            await user.save();

            const resetUrl = `http://localhost:5000/${email}/${resetToken}`;
            const mailOptions = {
                from: process.env.AUTH_EMAIL,
                to: email,
                subject: 'Password Reset',
                html: `<p>You have requested to reset your password. Please follow the link below to reset your password:</p><a href="${resetUrl}">here</a>`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending email:', error);
                    res.status(500).json('Failed to send password reset email');
                } else {
                    console.log('Password reset email sent:', info.response);
                    res.status(200).json('Password reset email sent');
                }
            });
        } else {
            res.status(400).json('Email not found');
        }
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json('Server error');
    }
};
const updatePassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        
        let user = await clientModel.findOne({ resetPasswordToken: resetToken });

        if (!user) {
            user = await tailorModel.findOne({ resetPasswordToken: resetToken });
        }
        if (!validator.isStrongPassword(newPassword)) return res.status(400).json('Password is weak');

        if (user) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            user.password = hashedPassword;
            user.resetPasswordToken = null; 
            await user.save();

            res.status(200).json('Password updated successfully');
        } else {
            res.status(400).json('Invalid or expired reset token');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json('Server error');
    }
};

const updateProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, city, phone, profilePicture } = req.body;
        if (!userId) {
            return res.status(400).json('User ID is required');
        }

        let user = await clientModel.findById(userId);
        let userType = 'client';
        if (!user) {
            user = await tailorModel.findById(userId);
            userType = 'tailor';
        }
        
        if (!user) {
            return res.status(404).json('User not found');
        }
        if (name) {user.name = name;}
        if (email) user.email = email;
        if (city) user.city = city;
        if (phone) user.phone = phone;
        if (profilePicture) user.profilePicture = profilePicture;
        
        await user.save();
        
        const userWithoutPassword = user.toObject();
        delete userWithoutPassword.password;

        // Add userType to the response object
        const responseObject = {
            ...userWithoutPassword,
            userType: userType
        };

        res.status(200).json(responseObject);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json('Server error');
    }
};

const getallTailors=async (req,res)=>{
    try{
        const tailors=await tailorModel.find();
        res.status(200).json(tailors);
    }catch(error){
        res.status(500).json({error:'Server error'});
    }

}




module.exports = { registerClient, registerTailor, login, verifyEmail, resetPassword, updatePassword, updateProfile,getallTailors};

