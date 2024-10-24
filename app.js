require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const app = express();
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const port = process.env.PORT || 4000;


// Set up view engine
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Set up session middleware
app.use(session({
    secret: 'yourSecretKey', // Change this to a random secret
    resave: false,
    saveUninitialized: true,
}));



// Middleware to make session messages available in all views
app.use((req, res, next) => {
    res.locals.message = req.session.message;
    delete req.session.message; // Clear the message after it is used
    next();
});


// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log(err));

// Schema for Healthcare Staff and Admin
const userSchema = new mongoose.Schema({
    name: String,
    password: String,
    role: String,
});

const policySchema = new mongoose.Schema({
    title: String,
    description: String,
    version: Number,
    effectiveDate: Date,
    file: String,
    acknowledgedBy: [String], // Store IDs of staff who acknowledged
});

const User = mongoose.model('User', userSchema);
const Policy = mongoose.model('Policy', policySchema);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/chooseRole', (req, res) => {
    const { role } = req.body;
    if (role === 'healthcare') {
        res.redirect('/healthcare/register');
    } else {
        res.redirect('/admin/login');
    }
});

// Healthcare Staff Registration
app.get('/healthcare/register', (req, res) => {
    res.render('healthcare_register');
});

app.post('/healthcare/register', async (req, res) => {
    const { name, password } = req.body;
    const user = new User({ name, password, role: 'healthcare' });
    await user.save();
    res.redirect('/healthcare/login');
});

// Healthcare Staff Login
app.get('/healthcare/login', (req, res) => {
    res.render('healthcare_login');
});

// Healthcare Staff Login
app.post('/healthcare/login', async (req, res) => {
    const { name, password } = req.body;
    try {
        const user = await User.findOne({ name, password, role: 'healthcare' });
        if (user) {
            req.session.userId = user._id; // Save the user's ID in the session
            const policies = await Policy.find({}); // Fetch policies for the dashboard
            res.render('healthcare_dashboard', { user, policies }); // Pass policies to the dashboard
        } else {
            res.redirect('/healthcare/login');
        }
    } catch (err) {
        console.error(err);
        res.redirect('/healthcare/login');
    }
});


// Healthcare Staff Dashboard
app.get('/healthcare/dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/healthcare/login'); // Redirect if not authenticated
    }

    try {
        const policies = await Policy.find({});
        const user = await User.findById(req.session.userId); // Retrieve the logged-in user's details

        if (!user) {
            return res.redirect('/healthcare/login'); // Redirect if user not found
        }

        res.render('healthcare_dashboard', { user, policies }); // Render the healthcare dashboard
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});



// Healthcare Staff Acknowledging a Policy
app.post('/healthcare/acknowledge/:policyId', async (req, res) => {
    const policyId = req.params.policyId;
    const userId = req.body.userId; // This should now correctly capture the user ID


    // Check if userId is defined
    if (userId) {
        await Policy.findByIdAndUpdate(policyId, { $push: { acknowledgedBy: userId } });
        res.redirect('/healthcare/dashboard');
    } else {
        res.redirect('/healthcare/dashboard'); // Handle error appropriately
    }
});


// Admin Login
app.get('/admin/login', (req, res) => {
    const message = req.query.message; // Get message from query string
    res.render('admin_login', { message });
});


app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'adminPassword') {
        req.session.message = 'Login successful!'; // Store success message
        res.redirect('/admin/create-policy');
    } else {
        req.session.message = 'Incorrect password. Please try again.'; // Store failure message
        res.redirect('/admin/login?message=' + encodeURIComponent(req.session.message)); // Redirect with message
    }
});

// Admin Create Policy
app.get('/admin/create-policy', (req, res) => {
    res.render('admin_policy_create');
});


app.post('/admin/create-policy', upload.single('file'), async (req, res) => {
    const { title, description, version, effectiveDate } = req.body;
    const policy = new Policy({
        title,
        description,
        version,
        effectiveDate,
        file: req.file.filename, // Save the filename to the database
    });
    await policy.save();
    res.redirect('/admin/view-policy');
});



// Admin View Policies
app.get('/admin/view-policy', async (req, res) => {
    const policies = await Policy.find({});
    res.render('admin_view_policy', { policies });
});


// Admin Delete Policy
app.delete('/admin/delete-policy/:policyId', async (req, res) => {
    const policyId = req.params.policyId;
    await Policy.findByIdAndDelete(policyId);
    res.sendStatus(200);
});

// Compliance Dashboard
app.get('/admin/compliance', async (req, res) => {
    const policies = await Policy.find({ acknowledgedBy: { $exists: true, $ne: [] } });
    

    const acknowledgements = [];

    for (const policy of policies) {
        const staffDetails = await User.find({ _id: { $in: policy.acknowledgedBy } });

        staffDetails.forEach(staff => {
            acknowledgements.push({
                policyId: policy._id,
                policyTitle: policy.title,
                staffId: staff._id,
                staffName: staff.name
            });
        });
    }

    res.render('admin_compliance', { acknowledgements });
});



// Admin Edit Policy Form
app.get('/admin/edit-policy/:policyId', async (req, res) => {
    const policyId = req.params.policyId;
    const policy = await Policy.findById(policyId);
    res.render('admin_policy_edit', { policy }); // Create an edit template
});

// Admin Update Policy
app.post('/admin/edit-policy/:policyId', async (req, res) => {
    const policyId = req.params.policyId;
    const { title, description, version, effectiveDate } = req.body;
    await Policy.findByIdAndUpdate(policyId, {
        title,
        description,
        version,
        effectiveDate,
        // You may also want to handle file updates here
    });
    res.redirect('/admin/view-policy');
});


// Add this function for downloading files
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename); // Assuming you store uploaded files in an 'uploads' folder
    res.download(filepath, filename, (err) => {
        if (err) {
            console.error("Download failed:", err);
            res.status(404).send("File not found.");
        }
    });
});


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })
