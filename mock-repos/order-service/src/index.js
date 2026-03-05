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
app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
