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
app.listen(PORT, () => console.log(`Inventory Service running on port ${PORT}`));
