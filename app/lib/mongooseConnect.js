import mongoose from "mongoose";
import dotenv from 'dotenv';
dotenv.config();

export function mongooseConnect(){
    if(mongoose.connection.readyState === 1){
        return mongoose.connection.asPromise();
    }else{
        const uri = process.env.MONGODB_URI;
        return mongoose.connect(uri);
    }
}
