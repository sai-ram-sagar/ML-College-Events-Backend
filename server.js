require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bodyParser = require("body-parser");
const sqlite3 = require('sqlite3').verbose();
const {open} = require('sqlite')
const { exec } = require("child_process");

const fs = require("fs");
const path = require("path");
// const _ = require("lodash");

const app = express(); 
const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());


let db
const initializeDBandServer = async() => {
  try {
    db = await open({
      filename: path.join(__dirname, "events.db"),
      driver: sqlite3.Database,
    });
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
    
  } catch (error) {
    console.log(`Db error is ${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();
// db.serialize(() => {
//   db.run(`CREATE TABLE IF NOT EXISTS users (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       username TEXT NOT NULL,
//       email TEXT NOT NULL UNIQUE,
//       password TEXT NOT NULL
//   )`);

//   db.run(`CREATE TABLE IF NOT EXISTS favorite_events (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       user_id INTEGER NOT NULL,
//       event_id INTEGER NOT NULL,
//       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
//   )`);

//   db.run(`CREATE TABLE IF NOT EXISTS event_registrations (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       user_id INTEGER NOT NULL,
//       event_id INTEGER NOT NULL,
//       event_name TEXT NOT NULL,
//       name TEXT NOT NULL,
//       branch TEXT NOT NULL,
//       email TEXT NOT NULL,
//       mobile TEXT NOT NULL,
//       registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
//   )`);

//   db.run(`CREATE TABLE IF NOT EXISTS search_history (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       user_id INTEGER NOT NULL,
//       search_query TEXT,
//       category TEXT,
//       search_count INTEGER DEFAULT 1,
//       last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
//   )`);
// });

// db.close();


// Load events from JSON
const events = JSON.parse(fs.readFileSync("./events.json", "utf8"));

app.post("/", (req, res) => {
      res.status(200).json({ message: "Hello world", });
});

// Get all events
app.get("/api/events", (req, res) => {
  res.json(events);
});
 
// User Signup
app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
        const result = await db.run(query, [username, email, hashedPassword]);
        const userId = result.insertId;
        const token = jwt.sign({ userId }, "your_secret_key", { expiresIn: "1h" });

        res.status(201).json({ message: "User created successfully", token, userId });
    } catch (error) {
        res.status(500).json({ message: "Signup failed", error });
    }
});

// User Login
app.post("/login", async(req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    const query = `select id, password from users WHERE email = '${email}';`;

        const results = await db.get(query);
        console.log(results)
        if (results !==undefined) {
            const userId = results.id;
            const hashedPassword = results.password;
            // console.log(userId, hashedPassword)
            const isMatch = await bcrypt.compare(password, hashedPassword);
            console.log(isMatch)
            if (!isMatch) {
                return res.status(401).json({ error: "Invalid credentials", });
            }

            // Generate JWT token
            const token = jwt.sign({ userId }, "your_secret_key", { expiresIn: "1h" });

            res.json({ message: "Login successful!", token, userId });
        } else {
            res.status(401).json({ error: "User not avilable" });
        }
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Like (favorite) an event
app.post("/api/favorites", async (req, res) => {
    const { user_id, event_id } = req.body;
  
    if (!user_id || !event_id) {
      console.error("Missing user_id or event_id", req.body); // Debugging
      return res.status(400).json({ message: "User ID and Event ID are required" });
    }
  
    try {
      // Check if the event is already favorited
      const existing = await db.all(
        "SELECT * FROM favorite_events WHERE user_id = ? AND event_id = ?",
        [user_id, event_id]
      );
  
      if (existing.length > 0) {
        return res.status(409).json({ message: "Event already favorited" });
      }
  
      // Insert into database
      await db.all("INSERT INTO favorite_events (user_id, event_id) VALUES (?, ?)", [
        user_id,
        event_id,
      ]);
  
      res.json({ message: "Event added to favorites" });
    } catch (err) {
      console.error("Database error:", err); // Log the full error
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  });
  
  // Remove favorite
  app.delete("/api/favorites/:userId/:eventId", async (req, res) => {
    const { userId, eventId } = req.params;
    try {
      await db.all("DELETE FROM favorite_events WHERE user_id = ? AND event_id = ?", [userId, eventId]);
      res.json({ success: true, message: "Favorite removed successfully" });
    } catch (error) {
      console.error("Error removing favorite:", error);
      res.status(500).json({ success: false, message: "Error removing favorite" });
    }
  });
  

// get favorite
  app.get("/api/favorites", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
  
    try {
      const rows = await db.all(
        `SELECT event_id FROM favorite_events WHERE user_id = '${userId}';`,

      );
    console.log(rows)
      // console.log("Returning favorites:", rows); // Debugging
      res.json(rows);
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Internal server error", error: err.message });
    }
  });
  
  // Register for an event
  app.post("/api/register-event", async (req, res) => {
    try {
        const { user_id, event_id, name, branch, email, mobile } = req.body;

        if (!user_id || !event_id || !name || !branch || !email || !mobile) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check if the user has already registered for the event
        const existing = await db.all(
            "SELECT * FROM event_registrations WHERE user_id = ? AND event_id = ?",
            [user_id, event_id]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: "You have already registered for this event." });
        }

        // Find event name from JSON
        const event = events.find((e) => e.id === parseInt(event_id));
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }
        const event_name = event.event_name;

        // Insert into database
        const query = `
            INSERT INTO event_registrations (user_id, event_id, event_name, name, branch, email, mobile)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.all(query, [user_id, event_id, event_name, name, branch, email, mobile]);

        res.status(201).json({ message: "Successfully registered for the event!" });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

// get favorite
app.get("/api/register-event", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const rows = await db.all(
      "SELECT event_id FROM event_registrations WHERE user_id = ?",
      [userId]
    );

    // console.log("Returning favorites:", rows); // Debugging
    res.json(rows);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});


// Check if a user is registered for an event
app.get("/api/check-registration", async (req, res) => {
  try {
      const { user_id, event_id } = req.query;

      if (!user_id || !event_id) {
          return res.status(400).json({ message: "Missing parameters" });
      }

      const existing = await db.all(
          "SELECT * FROM event_registrations WHERE user_id = ? AND event_id = ?",
          [user_id, event_id]
      );

      if (existing.length > 0) {
          return res.status(200).json({ registered: true });
      } else {
          return res.status(200).json({ registered: false });
      }
  } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Search history route
app.post("/api/search-history", async (req, res) => {
  const { user_id, search_query, category } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: "User ID and category are required" });
  }

  try {
    const query = "INSERT INTO search_history (user_id, search_query, category) VALUES (?, ?, ?)";
    const values = [user_id, search_query, category];

    // Insert search history into the database
    await db.all(query, values);
    return res.status(200).json({ message: "Search history stored successfully" });
  } catch (error) {
    console.error("Error storing search history:", error);
    return res.status(500).json({ message: "Error storing search history" });
  }
});

// recomendations based on category filter in UI
app.get("/api/recommendations", async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    // Fetch search history from the database
    const rows = await db.all(
      "SELECT category, COUNT(*) AS category_count FROM search_history WHERE user_id = ? GROUP BY category ORDER BY category_count DESC LIMIT 3",
      [userId]
    );

    // If no search history is found
    if (rows.length === 0) {
      return res.status(200).json({ message: "No search history found" });
    }

    // Extract most frequent categories
    const frequentCategories = rows.map(row => row.category);

    // Filter events based on frequent categories
    const recommendedEvents = events.filter(event => 
      frequentCategories.includes(event.category)
    );

    return res.status(200).json({ recommendedEvents });

  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return res.status(500).json({ message: "Error fetching recommendations" });
  }
});

// Machine Learning recomendations based on search history table
app.get("/machinelearning/:userId", (req, res) => {
  const userId = req.params.userId;

  exec(`python3 recommend.py ${userId}`, (error, stdout, stderr) => {
      if (error) {
          console.error("Error executing Python script:", stderr);
          return res.status(500).json({ error: "Error generating recommendations" });
      }
      try {
          const recommendations = JSON.parse(stdout);
          res.json(recommendations);
      } catch (err) {
          console.error("Error parsing JSON:", err);
          res.status(500).json({ error: "Invalid recommendation response" });
      }
  });
});


// Get unique categories
// const categories = [...new Set(events.map((event) => event.category))];

// // One-hot encoding for categories
// const oneHotEncodeCategory = (category) => categories.map((cat) => (cat === category ? 1 : 0));

// Helper function to calculate cosine similarity
// function cosineSimilarity(vecA, vecB) {
//   if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
//     return 0;
//   }

//   const dotProduct = _.sum(vecA.map((x, i) => x * (vecB[i] || 0)));
//   const magnitudeA = Math.sqrt(_.sum(vecA.map((x) => x * x)));
//   const magnitudeB = Math.sqrt(_.sum(vecB.map((x) => x * x)));

//   return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
// }

// // API to get ML-based recommendations
// app.get("/api/ml/recommendations/:userId", async (req, res) => {
//   const userId = req.params.userId;

//   // Fetch user event registrations from the database
//   const [registrations] = await db.all(
//     "SELECT event_id FROM event_registrations WHERE user_id = ?",
//     [userId]
//   );

//   // Get event details based on registrations
//   const userEvents = registrations
//     .map((registration) => events.find((event) => event.id === registration.event_id))
//     .filter((event) => event !== undefined);

//   // Create a vector for user preferences based on the registered events
//   const userPreferences = userEvents.map((event) => [
//     event.entry_price === 0 ? 1 : 0, // Free event = 1, else 0
//     event.category, // One-hot encoding or numeric encoding of category
//   ]);

//   // Convert event data into vectors, ensuring only defined events are used
//   const eventVectors = events
//     .filter((event) => event !== undefined)
//     .map((event) => [
//       event.entry_price === 0 ? 1 : 0,
//       event.category, // One-hot or numeric encoding for category
//     ]);

//   // Calculate similarity between user's preferences and each event
//   const recommendations = eventVectors
//     .map((vector, index) => {
//       // Get cosine similarity between the first registered event and the current event
//       const similarity = cosineSimilarity(userPreferences[0], vector); 
//       return { event: events[index], similarity };
//     })
//     .sort((a, b) => b.similarity - a.similarity); // Sort by similarity

//   // Filter out events that the user is already registered for
//   const filteredRecommendations = recommendations
//     .filter((rec) => !userEvents.some((userEvent) => userEvent.id === rec.event.id)) // Exclude already registered events
//     .slice(0, 5) // Get last 5 events
//     .reverse(); // Reverse the order to get the most relevant ones last

//   // Return the recommended events
//   res.json(filteredRecommendations.map((rec) => rec.event));
// });

