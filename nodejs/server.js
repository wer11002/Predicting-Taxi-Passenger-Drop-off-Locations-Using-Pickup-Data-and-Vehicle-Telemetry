const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Check if directories exist
console.log('Checking directories...');
console.log('Public directory exists:', fs.existsSync(path.join(__dirname, 'public')));
console.log('Data directory exists:', fs.existsSync(path.join(__dirname, 'data')));
console.log('CSV file exists:', fs.existsSync(path.join(__dirname, 'data', 'pickup_dropoff_flows.csv')));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve CSV
app.get('/data', (req, res) => {
    const csvPath = path.join(__dirname, 'data', 'pickup_dropoff_flows.csv');
    console.log('CSV request, file path:', csvPath);
    
    if (fs.existsSync(csvPath)) {
        res.sendFile(csvPath);
    } else {
        res.status(404).send('CSV file not found');
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Something went wrong!');
});

app.listen(PORT, (err) => {
    if (err) {
        console.error('Failed to start server:', err);
    } else {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});