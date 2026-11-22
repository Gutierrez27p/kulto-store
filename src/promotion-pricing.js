// Pure promotion calculator: the price of a qualifying garment may change,
// but a design shared with an oversize garment never makes that garment eligible.
export const euroCents = value => Math.max(0, Math.round((Number(value) || 0) * 100));

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function isOversizeGarment(product = {}, item = {}, models = []) {
  const model = models.find(m => m.id === (item.garmentMockupId || product.garmentMockupId));
  const values = [
    product.category, product.subcategory, product.name, product.fit, product.model,
    product.garmentType, product.garmentStyle, product.prendaTipo,
    item.category, item.subcategory, item.fit, item.model, item.garmentType,
    item.garmentStyle, model?.name, model?.fit
  ];
  return values.some(value => /\b(over\s?size|oversized|extra\s?grande)\b/.test(normalize(value)));
}

export function seasonalPricing(cart = [], settings = {}, products = []) {
  const campaign = settings.storefrontPromotion || {};
  const blank = { active: false, applied: false, eligibleQuantity: 0, minimumQuantity: 0, discount: 0, label: "", includedIds: [] };
  if (!campaign.enabled || !String(campaign.title || "").trim()) return blank;
  const ids = new Set(Array.isArray(campaign.productIds) ? campaign.productIds : []);
  if (!ids.size) return blank;
  const count = Math.max(1, Math.trunc(Number(campaign.quantity) || 2));
  const target = euroCents(campaign.unitPrice);
  const models = settings.garmentMockupLibrary || [];
  const selected = cart.filter(item => {
    if (!ids.has(item.productId)) return false;
    const product = products.find(p => p.id === item.productId);
    if (!product || product.tags?.template) return false;
    if (campaign.excludeOversize !== false && isOversizeGarment(product, item, models)) return false;
    return true;
  });
  const units = selected.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.qty) || 0)), 0);
  const qualified = units >= count;
  const cents = qualified ? selected.reduce((sum, item) => {
    const quantity = Math.max(0, Math.trunc(Number(item.qty) || 0));
    return sum + quantity * Math.max(0, euroCents(item.unitPrice) - target);
  }, 0) : 0;
  return {
    active: true,
    applied: qualified && cents > 0,
    eligibleQuantity: units,
    minimumQuantity: count,
    discount: cents / 100,
    label: String(campaign.title),
    includedIds: selected.map(item => item.productId)
  };
}


/**
 * Only full-price merchandise may receive an additional welcome discount,
 * promotional coupon or points-reward voucher. Active seasonal bundles keep
 * their campaign price instead of silently losing it to a coupon.
 */
export function discountableSubtotal(cart = [], settings = {}, products = []) {
  const seasonal = seasonalPricing(cart, settings, products);
  const seasonalIds = seasonal.active && seasonal.eligibleQuantity >= seasonal.minimumQuantity
    ? new Set(seasonal.includedIds) : new Set();
  const byId = new Map(products.map(product => [product.id, product]));
  const cents = cart.reduce((total, item) => {
    const product = byId.get(item.productId);
    const sale = !!product?.tags?.oferta && Number(product.salePrice) > 0;
    if (sale || seasonalIds.has(item.productId) || item.onSale === true) return total;
    return total + Math.max(0, Math.trunc(Number(item.qty) || 0)) * euroCents(item.unitPrice);
  }, 0);
  return { subtotal: cents / 100, seasonal, hasExcluded: cents < cart.reduce(
    (total, item) => total + Math.max(0, Math.trunc(Number(item.qty) || 0)) * euroCents(item.unitPrice), 0
  ) };
}
