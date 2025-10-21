import mysql from "mysql2";

const connectToDatabase = async () => {
  try {
    const connection = await mysql.createConnection({
      host: "localhost", // Or your database host
      user: "root", // Your MySQL username
      password: "your_password", // Your MySQL password
      database: "your_database_name", // The database you want to connect to
    });

    console.log({success:true});
    return connection;
    
  } catch (error) {
    console.error({success:failed,message:error.message});
    throw error;
  }
};
