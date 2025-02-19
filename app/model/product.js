import mongoose from "mongoose";

const VariantSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  sku: { type: Number, required: true },
  price: { type: Number, required: true },
  inventory_quantity: { type: Number, required: true }
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  id: String,
  title: String,
  description: String,
  link: String,
  price: Number,
  condition: String,
  availability: String,
  imageLink: String,
  sku: Number,
  productType: String,
  variants: [VariantSchema],
}, { timestamps: true });

const Product = mongoose.models?.Product || mongoose.model('Product', ProductSchema);

export default Product;