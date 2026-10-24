
import express from "express";

import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  createBill,
  getBills,
  updateBillSettlement,
  recordStockUsage,
  getStockUsage,
} from "../controllers/inventoryController.js";

const router = express.Router();

// Products
router.post("/products", createProduct);
router.get("/products", getProducts);
router.get("/products/:id", getProductById);
router.patch("/products/:id", updateProduct);

// Purchase bills
router.post("/bills", createBill);
router.get("/bills", getBills);
router.patch("/bills/:id/settled", updateBillSettlement);

// Daily consumption
router.post("/usage", recordStockUsage);
router.get("/usage", getStockUsage);

export default router;
