const jwt = require("jsonwebtoken");

const verifyToken = (req,res,next)=>{
    const token = req.cookies.token;
    if(!token){
        return res.status(403).send("token is required");
    }

    try {
        const decoded = jwt.verify(token,"shh");
        req.user = decoded;
    } catch (error) {
        return res.status(401).send('Invalid Token');
    }
    return next();
};

module.exports = verifyToken;