import fs from "fs";

const bulkPath = "./src/bulk_config.json";

if (!fs.existsSync(bulkPath)) {
  fs.writeFileSync(bulkPath, JSON.stringify({}, null, 2));
}

const readData = () => {
  try {
    return JSON.parse(fs.readFileSync(bulkPath));
  } catch (e) {
    return {};
  }
};

export const addBulkRule = (productId, minQty, bulkPrice) => {
  let data = readData();

  if (!data[productId] || !Array.isArray(data[productId])) {
    if (data[productId] && data[productId].min) {
      data[productId] = [data[productId]];
    } else {
      data[productId] = [];
    }
  }

  minQty = parseInt(minQty);
  bulkPrice = parseInt(bulkPrice);

  const existingIndex = data[productId].findIndex(
    (rule) => rule.min === minQty
  );

  if (existingIndex !== -1) {
    data[productId][existingIndex].price = bulkPrice;
  } else {
    data[productId].push({
      min: minQty,
      price: bulkPrice,
    });
  }

  data[productId].sort((a, b) => a.min - b.min);

  fs.writeFileSync(bulkPath, JSON.stringify(data, null, 2));
  return true;
};

export const deleteBulkRule = (productId) => {
  let data = readData();
  if (data[productId]) {
    delete data[productId];
    fs.writeFileSync(bulkPath, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
};

export const getBulkRules = (productId) => {
  let data = readData();
  let rules = data[productId];

  if (!rules) return [];

  if (!Array.isArray(rules)) return [rules];

  return rules;
};

export const checkBulkPrice = (productId, qty, originalPrice) => {
  let rules = getBulkRules(productId);

  let bestRule = null;

  for (let rule of rules) {
    if (qty >= rule.min) {
      bestRule = rule;
    } else {
      break;
    }
  }

  if (bestRule) {
    return {
      isBulk: true,
      finalPrice: bestRule.price,
      minQty: bestRule.min,
      originalPrice: originalPrice,
    };
  }

  return {
    isBulk: false,
    finalPrice: originalPrice,
  };
};
