require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session setup (for local project demonstration)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected successfully!"))
    .catch((err) => console.log("MongoDB connection error:", err));

// Product schema
const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    category: String,
    type: String,
    description: String
});

const Product = mongoose.model("Product", productSchema, "Products");

// User schema
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    }
});

const User = mongoose.model("User", userSchema, "Users");

// Check whether user is logged in
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please login first"
        });
    }
    next();
}

// Register
app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill all fields"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters"
            });
        }

        const existingUser = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (existingUser) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        // Hash password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email: email.trim().toLowerCase(),
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({
            message: "Registration successful!"
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        res.status(500).json({
            message: "Error registering user"
        });
    }
});

// Login
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Enter email and password"
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        req.session.userId = user._id.toString();

        res.json({
            message: "Login successful!",
            name: user.name
        });

    } catch (error) {
        res.status(500).json({
            message: "Error logging in"
        });
    }
});

// Check login status
app.get("/api/me", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Not logged in"
        });
    }

    const user = await User.findById(req.session.userId)
        .select("name email");

    if (!user) {
        return res.status(401).json({
            message: "User not found"
        });
    }

    res.json(user);
});

// Logout
app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: "Logout failed"
            });
        }

        res.clearCookie("connect.sid");
        res.json({
            message: "Logged out successfully"
        });
    });
});

// Add sample products if database is empty
async function addSampleProducts() {
    const count = await Product.countDocuments();

    if (count === 0) {
        await Product.insertMany([
            {
                name: "Engineering Mathematics Book",
                price: 200,
                category: "Books",
                type: "Sell",
                description: "Used textbook in good condition"
            },
            {
                name: "School Backpack",
                price: 300,
                category: "Clothes",
                type: "Exchange",
                description: "Reusable backpack"
            },
            {
                name: "Study Table",
                price: 0,
                category: "Furniture",
                type: "Donate",
                description: "Available for donation"
            }
        ]);

        console.log("Sample products added!");
    }
}

// Get all products
app.get("/api/products", async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({
            message: "Error fetching products"
        });
    }
});

// Add a new product (login required)
app.post("/api/products", requireLogin, async (req, res) => {
    try {
        const { name, price, category, type, description } = req.body;

        const newProduct = new Product({
            name,
            price: Number(price) || 0,
            category,
            type,
            description
        });

        await newProduct.save();

        res.json({
            message: "Product added successfully!"
        });
    } catch (err) {
        res.status(500).json({
            message: "Error adding product"
        });
    }
});

// Update product (login required)
app.put("/api/products/:id", requireLogin, async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json({
            message: "Product updated successfully!",
            product
        });
    } catch (error) {
        res.status(500).json({
            message: "Error updating product"
        });
    }
});

// Delete product (login required)
app.delete("/api/products/:id", requireLogin, async (req, res) => {
    try {
        const deletedProduct = await Product.findByIdAndDelete(
            req.params.id
        );

        if (!deletedProduct) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json({
            message: "Product deleted successfully!"
        });
    } catch (error) {
        res.status(500).json({
            message: "Error deleting product"
        });
    }
});

// Start server after MongoDB connects
mongoose.connection.once("open", async () => {
    try {
        await addSampleProducts();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(
                `CEM server running at http://localhost:${PORT}`
            );
        });
    } catch (err) {
        console.log("Database setup error:", err);
    }
});