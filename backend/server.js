const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2");
const cors = require("cors");
const dotenv = require("dotenv");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// MySQL connection setup
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "1234",
  database: "test",
  port: 3305,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL: ", err);
    return;
  }
  console.log("Connected to MySQL");
});

// JWT middleware for authentication
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

// Routes and video call management
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  // Check if the user exists in the database
  const query = "SELECT * FROM test.user WHERE email = ?";
  db.query(query, [email], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    // If no user is found
    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = results[0];

    // Compare the provided password with the hashed password in the database
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Error comparing passwords", error: err });
      }

      if (!isMatch) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Generate a JWT token if the password is correct
      const token = jwt.sign(
        { id: user.id, email: user.email }, // Payload
        process.env.JWT_SECRET, // Secret key
        { expiresIn: "1h" } // Token expiration time
      );

      // Send the token back to the client
      return res.status(200).json({
        message: "Login successful",
        token: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    });
  });
});

app.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  // Check if name, email, and password are provided
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ message: "Name, email, and password are required" });
  }

  // Check if the user already exists in the database
  const checkUserQuery = "SELECT * FROM test.user WHERE email = ?";
  db.query(checkUserQuery, [email], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    // If the user already exists
    if (results.length > 0) {
      return res
        .status(409)
        .json({ message: "User with this email already exists" });
    }

    // Hash the password using bcrypt
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Error hashing password", error: err });
      }

      // Insert the new user into the database
      const insertUserQuery =
        "INSERT INTO test.user (name, email, password) VALUES (?, ?, ?)";
      db.query(
        insertUserQuery,
        [name, email, hashedPassword],
        (err, result) => {
          if (err) {
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          // Successfully inserted new user
          return res.status(201).json({
            message: "User registered successfully",
            user: {
              id: result.insertId,
              name: name,
              email: email,
            },
          });
        }
      );
    });
  });
});

const emailToSocketIdMap = new Map();
const socketidToEmailMap = new Map();

io.on("connection", (socket) => {
  console.log(`Socket Connected`, socket.id);
  socket.on("room:join", (data) => {
    const { email, room } = data;
    let date = returnDate();
    const checkUserQuery = `SELECT * FROM test.user WHERE email = '${email}'`;
    new Promise((resolve, reject) => {
      db.query(checkUserQuery, (error, result) => {
        if (error) {
          reject(error); // Reject the promise if there's an error
        } else {
          resolve(result); // Resolve the promise with the result if successful
        }
      });
    })
      .then((result) => {
        if (result.length > 0) {
          const updateQuery = `UPDATE  test.user set logs=${JSON.stringify([
            date,
          ])} where email= ${email}`;
          db.query(updateQuery, (error, result) => {
            if (error) {
              reject(error); // Reject the promise if there's an error
            } else {
              resolve(result); // Resolve the promise with the result if successful
            }
          });
        } else {
          const insertUserQuery = `INSERT INTO test.user (email,logs) VALUES (${email}, ${JSON.stringify(
            [date]
          )})`;
          db.query(insertUserQuery, (error, result) => {
            if (error) {
              reject(error); // Reject the promise if there's an error
            } else {
              resolve(result); // Resolve the promise with the result if successful
            }
          });
        }
        console.log("Database query result:", result); // Print the result of the query
      })
      .catch((error) => {
        console.error("Error executing query:", error); // Log the error if the query fails
      });

    emailToSocketIdMap.set(email, socket.id);
    socketidToEmailMap.set(socket.id, email);
    io.to(room).emit("user:joined", { email, id: socket.id });
    socket.join(room);
    io.to(socket.id).emit("room:join", data);
  });

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    console.log("peer:nego:needed", offer);
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    console.log("peer:nego:done", ans);
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });
});

function returnDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  let mm = today.getMonth() + 1; // Months start at 0!
  let dd = today.getDate();
  let hh = today.getHours();
  let min = today.getMinutes();

  if (dd < 10) dd = "0" + dd;
  if (mm < 10) mm = "0" + mm;

  const formattedToday = `${dd}-${mm}-${yyyy}-${hh}:${min}`;
  return formattedToday;
}

// Start server
server.listen(5000, () => {
  console.log("Server running on port 5000");
});
