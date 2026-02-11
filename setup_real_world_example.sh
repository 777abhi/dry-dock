#!/bin/bash

# Create base directory
mkdir -p mock-repos
rm -rf mock-repos/*

# --- Inventory Service ---
mkdir -p mock-repos/inventory-service/src/models
mkdir -p mock-repos/inventory-service/src/utils
echo '{"name": "inventory-service", "version": "1.0.0", "dependencies": {"express": "^4.17.1", "mongoose": "^5.12.3"}}' > mock-repos/inventory-service/package.json

cat <<EOF > mock-repos/inventory-service/src/models/Product.js
const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: false
  },
  sku: {
    type: String,
    required: true,
    unique: true
  },
  inStock: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', ProductSchema);
EOF

cat <<EOF > mock-repos/inventory-service/src/utils/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    });

    console.log(\`MongoDB Connected: \${conn.connection.host}\`);
  } catch (error) {
    console.error(\`Error: \${error.message}\`);
    process.exit(1);
  }
};

module.exports = connectDB;
EOF

cat <<EOF > mock-repos/inventory-service/src/index.js
const express = require('express');
const connectDB = require('./utils/db');
const Product = require('./models/Product');

const app = express();
connectDB();

app.use(express.json());

app.get('/api/inventory', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(\`Inventory Service running on port \${PORT}\`));
EOF

# --- Order Service ---
mkdir -p mock-repos/order-service/src/models
mkdir -p mock-repos/order-service/src/utils
echo '{"name": "order-service", "version": "1.0.0", "dependencies": {"express": "^4.17.1", "mongoose": "^5.12.3", "axios": "^0.21.1"}}' > mock-repos/order-service/package.json

cat <<EOF > mock-repos/order-service/src/models/Product.js
const mongoose = require('mongoose');

// Product Model for Order Service
const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: false
  },
  sku: {
    type: String,
    required: true,
    unique: true
  },
  inStock: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', ProductSchema);
EOF

cat <<EOF > mock-repos/order-service/src/utils/db.js
const mongoose = require('mongoose');

/**
 * Connects to the database
 */
const connectDB = async () => {
  try {
    // Connection string from env
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    });

    console.log(\`MongoDB Connected: \${conn.connection.host}\`);
  } catch (error) {
    console.error(\`Error: \${error.message}\`);
    process.exit(1);
  }
};

module.exports = connectDB;
EOF

cat <<EOF > mock-repos/order-service/src/index.js
const express = require('express');
const connectDB = require('./utils/db');
const Product = require('./models/Product');
const axios = require('axios');

const app = express();
connectDB();

app.use(express.json());

app.post('/api/orders', async (req, res) => {
  const { productId, quantity } = req.body;
  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.status(201).json({ message: 'Order created', productId, quantity });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(\`Order Service running on port \${PORT}\`));
EOF

echo "Real world example mock repos created in mock-repos/"
