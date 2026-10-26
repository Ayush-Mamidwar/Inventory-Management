
import {prisma} from "../../config/db.js";
import {
  calculateStock,
  getBillItemRemainingQuantity,
  validateBillItemUsage,
} from "../utils/stockUtils.js";

// Helper: validate positive numeric values.
const isPositiveNumber = (value) =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0;

// --------------------------------------------------
// PRODUCTS
// --------------------------------------------------

// POST /api/inventory/products
export const createProduct = async (req, res) => {
  try {
    const { name, unit = "pcs", limit = 0 } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Product name is required" });
    }

    if (
      !Number.isFinite(Number(limit)) ||
      Number(limit) < 0
    ) {
      return res.status(400).json({
        message: "Limit must be a non-negative number",
      });
    }

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        unit,
        limit: Number(limit),
      },
    });

    res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        message: "A product with this name already exists",
      });
    }

    console.error("createProduct:", error);
    res.status(500).json({ message: "Failed to create product" });
  }
};

// GET /api/inventory/products
export const getProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        billItems: {
          include: {
            bill: {
              select: {
                id: true,
                billNumber: true,
                billDate: true,
                settled: true,
              },
            },
            stockUsages: {
              select: { quantity: true },
            },
          },
          orderBy: { expiryDate: "asc" },
        },
        stockUsages: {
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const inventory = products.map((product) => {
      const stock = calculateStock(product);

      return {
        id: product.id,
        name: product.name,
        unit: product.unit,
        limit: Number(product.limit),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        ...stock,
        billItems: product.billItems.map((item) => {
          const consumedQuantity = (item.stockUsages || []).reduce(
            (total, usage) => total + Number(usage.quantity),
            0
          );

          return {
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            consumedQuantity,
            remainingQuantity: getBillItemRemainingQuantity(item, item.stockUsages || []),
          };
        }),
      };
    });

    res.json(inventory);
  } catch (error) {
    console.error("getProducts:", error);
    res.status(500).json({ message: "Failed to fetch inventory" });
  }
};

// GET /api/inventory/products/:id
export const getProductById = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        billItems: {
          include: {
            bill: true,
            stockUsages: true,
          },
          orderBy: { createdAt: "desc" },
        },
        stockUsages: {
          orderBy: { usedAt: "desc" },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const stock = calculateStock(product);

    res.json({
      ...product,
      limit: Number(product.limit),
      ...stock,
      billItems: product.billItems.map((item) => {
        const consumedQuantity = (item.stockUsages || []).reduce(
          (total, usage) => total + Number(usage.quantity),
          0
        );

        return {
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          consumedQuantity,
          remainingQuantity: getBillItemRemainingQuantity(item, item.stockUsages || []),
        };
      }),
      stockUsages: product.stockUsages.map((usage) => ({
        ...usage,
        quantity: Number(usage.quantity),
      })),
    });
  } catch (error) {
    console.error("getProductById:", error);
    res.status(500).json({ message: "Failed to fetch product" });
  }
};

// PATCH /api/inventory/products/:id
export const updateProduct = async (req, res) => {
  try {
    const { name, unit, limit } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ message: "Name cannot be empty" });
    }

    if (
      limit !== undefined &&
      (!Number.isFinite(Number(limit)) || Number(limit) < 0)
    ) {
      return res.status(400).json({
        message: "Limit must be a non-negative number",
      });
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(unit !== undefined && { unit }),
        ...(limit !== undefined && { limit: Number(limit) }),
      },
    });

    res.json({ message: "Product updated successfully", product });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Product not found" });
    }

    if (error.code === "P2002") {
      return res.status(409).json({ message: "Product name already exists" });
    }

    console.error("updateProduct:", error);
    res.status(500).json({ message: "Failed to update product" });
  }
};

// --------------------------------------------------
// BILLS
// --------------------------------------------------

// POST /api/inventory/bills
export const createBill = async (req, res) => {
  try {
    const { billNumber, billDate, notes, supplier, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "A bill must contain at least one product",
      });
    }

    for (const item of items) {
      if (!item.productId) {
        return res.status(400).json({
          message: "Every bill item requires a productId",
        });
      }

      if (!isPositiveNumber(item.quantity)) {
        return res.status(400).json({
          message: "Every item must have a positive quantity",
        });
      }

      if (
        item.unitPrice === undefined ||
        item.unitPrice === null ||
        item.unitPrice === "" ||
        !Number.isFinite(Number(item.unitPrice)) ||
        Number(item.unitPrice) < 0
      ) {
        return res.status(400).json({
          message: "Every item must have a valid, non-negative unitPrice",
        });
      }

      if (
        item.expiryDate &&
        Number.isNaN(Date.parse(item.expiryDate))
      ) {
        return res.status(400).json({
          message: "Invalid expiryDate",
        });
      }
    }

    if (billDate && Number.isNaN(Date.parse(billDate))) {
      return res.status(400).json({ message: "Invalid billDate" });
    }

    // A nested create saves the bill and its items together.
    const bill = await prisma.bill.create({
      data: {
        billNumber: billNumber || null,
        billDate: billDate ? new Date(billDate) : new Date(),
        notes: notes || null,
        supplier: supplier?.trim() || null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            expiryDate: item.expiryDate
              ? new Date(item.expiryDate)
              : null,
          })),
        },
      },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    const total = bill.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0
    );

    res.status(201).json({
      message: "Bill created successfully",
      bill: { ...bill, total },
    });
  } catch (error) {
    if (error.code === "P2003" || error.code === "P2025") {
      return res.status(400).json({
        message: "One or more product IDs do not exist",
      });
    }

    console.error("createBill:", error);
    res.status(500).json({ message: "Failed to create bill" });
  }
};

// GET /api/inventory/bills
export const getBills = async (req, res) => {
  try {
    const rawPage = Number(req.query.page || 1);
    const rawLimit = Number(req.query.limit || 15);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 15;
    const skip = (page - 1) * limit;

    const wantPaginated = Object.prototype.hasOwnProperty.call(req.query, "page") ||
      Object.prototype.hasOwnProperty.call(req.query, "limit");

    if (wantPaginated) {
      const [totalCount, bills] = await Promise.all([
        prisma.bill.count(),
        prisma.bill.findMany({
          include: {
            items: {
              include: {
                product: true,
                stockUsages: true,
              },
            },
          },
          orderBy: { billDate: "desc" },
          skip,
          take: limit,
        }),
      ]);

      const result = bills.map((bill) => ({
        ...bill,
        total: bill.items.reduce(
          (sum, item) =>
            sum + Number(item.quantity) * Number(item.unitPrice),
          0
        ),
        items: bill.items.map((item) => {
          const consumedQuantity = (item.stockUsages || []).reduce(
            (total, usage) => total + Number(usage.quantity),
            0
          );

          return {
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            consumedQuantity,
            remainingQuantity: getBillItemRemainingQuantity(item, item.stockUsages || []),
          };
        }),
      }));

      return res.json({
        bills: result,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.max(1, Math.ceil(totalCount / limit)),
          hasNextPage: page * limit < totalCount,
          hasPrevPage: page > 1,
        },
      });
    }

    const bills = await prisma.bill.findMany({
      include: {
        items: {
          include: {
            product: true,
            stockUsages: true,
          },
        },
      },
      orderBy: { billDate: "desc" },
    });

    const result = bills.map((bill) => ({
      ...bill,
      total: bill.items.reduce(
        (sum, item) =>
          sum + Number(item.quantity) * Number(item.unitPrice),
        0
      ),
      items: bill.items.map((item) => {
        const consumedQuantity = (item.stockUsages || []).reduce(
          (total, usage) => total + Number(usage.quantity),
          0
        );

        return {
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          consumedQuantity,
          remainingQuantity: getBillItemRemainingQuantity(item, item.stockUsages || []),
        };
      }),
    }));

    res.json(result);
  } catch (error) {
    console.error("getBills:", error);
    res.status(500).json({ message: "Failed to fetch bills" });
  }
};

// PATCH /api/inventory/bills/:id/settled
export const updateBillSettlement = async (req, res) => {
  try {
    const { settled } = req.body;

    if (typeof settled !== "boolean") {
      return res.status(400).json({
        message: "settled must be true or false",
      });
    }

    const bill = await prisma.bill.update({
      where: { id: req.params.id },
      data: { settled },
    });

    res.json({
      message: settled ? "Bill marked as settled" : "Bill marked as unsettled",
      bill,
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Bill not found" });
    }

    console.error("updateBillSettlement:", error);
    res.status(500).json({ message: "Failed to update bill settlement" });
  }
};

// --------------------------------------------------
// DAILY STOCK USAGE
// --------------------------------------------------

// POST /api/inventory/usage
export const recordStockUsage = async (req, res) => {
  try {
    const { productId, billItemId, quantity, usedAt, notes } = req.body;

    if (!productId || !isPositiveNumber(quantity)) {
      return res.status(400).json({
        message: "productId and a positive quantity are required",
      });
    }

    if (usedAt && Number.isNaN(Date.parse(usedAt))) {
      return res.status(400).json({ message: "Invalid usedAt date" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: {
          billItems: {
            include: { stockUsages: true },
          },
          stockUsages: { select: { quantity: true } },
        },
      });

      if (!product) {
        const error = new Error("Product not found");
        error.statusCode = 404;
        throw error;
      }

      if (product.billItems.length > 0 && !billItemId) {
        const error = new Error(
          "Select the purchase batch this stock was taken from."
        );
        error.statusCode = 400;
        throw error;
      }

      if (billItemId) {
        const billItem = product.billItems.find((item) => item.id === billItemId);

        if (!billItem) {
          const error = new Error("Selected purchase batch does not belong to this product");
          error.statusCode = 400;
          throw error;
        }

        validateBillItemUsage({
          billItem,
          usages: billItem.stockUsages || [],
          requestedQuantity: quantity,
        });
      }

      const stock = calculateStock(product);

      if (Number(quantity) > stock.currentStock) {
        const error = new Error(
          `Insufficient stock. Available: ${stock.currentStock} ${product.unit}`
        );
        error.statusCode = 400;
        throw error;
      }

      return tx.stockUsage.create({
        data: {
          productId,
          billItemId: billItemId || null,
          quantity: Number(quantity),
          usedAt: usedAt ? new Date(usedAt) : new Date(),
          notes: notes || null,
        },
      });
    });

    res.status(201).json({
      message: "Stock usage recorded successfully",
      usage: {
        ...result,
        quantity: Number(result.quantity),
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    if (error.code === "P2003") {
      return res.status(400).json({ message: "Invalid productId" });
    }

    console.error("recordStockUsage:", error);
    res.status(500).json({ message: "Failed to record stock usage" });
  }
};

// GET /api/inventory/usage
export const getStockUsage = async (req, res) => {
  try {
    const usages = await prisma.stockUsage.findMany({
      include: {
        product: {
          select: { id: true, name: true, unit: true },
        },
        billItem: {
          include: {
            bill: true,
          },
        },
      },
      orderBy: { usedAt: "desc" },
    });

    res.json(
      usages.map((usage) => ({
        ...usage,
        quantity: Number(usage.quantity),
        unitPrice: usage.billItem ? Number(usage.billItem.unitPrice) : null,
        billItem: usage.billItem
          ? {
              ...usage.billItem,
              quantity: Number(usage.billItem.quantity),
              unitPrice: Number(usage.billItem.unitPrice),
            }
          : null,
      }))
    );
  } catch (error) {
    console.error("getStockUsage:", error);
    res.status(500).json({ message: "Failed to fetch stock usage" });
  }
};
