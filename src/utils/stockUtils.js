export const toNumber = (value) => Number(value ?? 0);

export const calculateStock = (product = {}) => {
  const purchased = (product.billItems || []).reduce(
    (total, item) => total + toNumber(item.quantity),
    0
  );

  const consumed = (product.stockUsages || []).reduce(
    (total, usage) => total + toNumber(usage.quantity),
    0
  );

  return {
    purchased,
    consumed,
    currentStock: purchased - consumed,
    lowStock: purchased - consumed <= Number(product.limit ?? 0),
  };
};

export const getBillItemRemainingQuantity = (billItem, usages = []) => {
  const purchased = toNumber(billItem?.quantity);
  const used = (usages || []).reduce(
    (total, usage) => total + toNumber(usage.quantity),
    0
  );

  return Math.max(purchased - used, 0);
};

export const validateBillItemUsage = ({ billItem, usages = [], requestedQuantity }) => {
  const remaining = getBillItemRemainingQuantity(billItem, usages);
  const requested = Number(requestedQuantity ?? 0);

  if (requested > remaining) {
    throw new Error(
      `Insufficient quantity in selected purchase batch. Available: ${remaining}`
    );
  }

  return remaining;
};
