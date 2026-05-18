const STATUS = {
  all: "全部",
  in_stock: "现货",
  in_production: "生产中",
  stopped: "暂停销售",
};

const REFRESH_INTERVAL_MS = 60 * 1000;

let products = [];
let activeStatus = "all";
let activeSeries = "all";

const grid = document.querySelector("#productGrid");
const template = document.querySelector("#productTemplate");
const searchInput = document.querySelector("#searchInput");
const statusTabs = document.querySelector("#statusTabs");
const seriesTabs = document.querySelector("#seriesTabs");
const emptyState = document.querySelector("#emptyState");
const stockModal = document.querySelector("#stockModal");
const stockTitle = document.querySelector("#stockTitle");
const stockSeries = document.querySelector("#stockSeries");
const stockSubtitle = document.querySelector("#stockSubtitle");
const stockConfigList = document.querySelector("#stockConfigList");

function money(value) {
  return `¥${Number(value).toLocaleString("zh-CN")}`;
}

function completeConfigurations(product) {
  const configurations = product.availableConfigurations || product.configurations || product.variants || [];
  return configurations.filter((config) => config.status === "in_stock");
}

function productStatus(product) {
  if (product.statusOverride) return product.statusOverride;
  const configurations = product.availableConfigurations || product.configurations || product.variants;
  if (!Array.isArray(configurations) || configurations.length === 0) {
    return product.status;
  }
  if (completeConfigurations(product).length > 0) return "in_stock";
  const statuses = configurations.map((variant) => variant.status);
  if (statuses.includes("in_production")) return "in_production";
  return "stopped";
}

function stockVariantCount(product) {
  const configurations = product.availableConfigurations || product.configurations || product.variants;
  return Array.isArray(configurations)
    ? completeConfigurations(product).length
    : product.status === "in_stock"
      ? 1
      : 0;
}

function statusLabel(product) {
  const configurations = product.availableConfigurations || product.configurations || product.variants;
  if (Array.isArray(configurations) && configurations.length > 0) {
    const count = stockVariantCount(product);
    if (count > 0) return `${count} 款现货`;
  }
  return STATUS[productStatus(product)];
}

function configSummary(config) {
  const tabletop = config.tabletopType === "桌面"
    ? "桌面"
    : config.tabletopType
      ? `${config.tabletopType}桌面`
      : "";
  return [
    config.frameColor && `${config.frameColor}框架`,
    tabletop,
    config.tabletopColor,
    config.material,
    config.fabricCode && `面料 ${config.fabricCode}`,
  ].filter(Boolean).join(" / ");
}

function todayLabel() {
  return "05/19";
}

function compactDimensions(value) {
  if (!value || value === "需确认") return "尺寸待补";
  const numbers = String(value).match(/\d+(?:\.\d+)?/g) || [];
  if (numbers.length < 2) return String(value);
  return String(value);
}

async function loadProducts() {
  if (window.location.protocol === "file:" && Array.isArray(window.SIFAS_PRODUCTS)) {
    products = structuredClone(window.SIFAS_PRODUCTS);
  } else {
    try {
      const response = await fetch("/api/products");
      if (!response.ok) throw new Error("api unavailable");
      products = await response.json();
    } catch {
      if (Array.isArray(window.SIFAS_PRODUCTS)) {
        products = structuredClone(window.SIFAS_PRODUCTS);
      } else {
        const response = await fetch("data/products.json");
        products = await response.json();
      }
    }
  }
  renderTabs();
  render();
}

function renderTabs() {
  statusTabs.innerHTML = "";
  Object.entries(STATUS).forEach(([value, label]) => {
    statusTabs.appendChild(makeChip(label, value, activeStatus, (next) => {
      activeStatus = next;
      renderTabs();
      render();
    }));
  });

  const series = ["all", ...Array.from(new Set(products.map((product) => product.series))).sort()];
  seriesTabs.innerHTML = "";
  series.forEach((value) => {
    seriesTabs.appendChild(makeChip(value === "all" ? "全部系列" : value, value, activeSeries, (next) => {
      activeSeries = next;
      renderTabs();
      render();
    }));
  });
}

function makeChip(label, value, activeValue, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${value === activeValue ? " active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", () => onClick(value));
  return button;
}

function getFilteredProducts() {
  const query = searchInput.value.trim().toLowerCase();
  return products.filter((product) => {
    const statusMatch = activeStatus === "all" || productStatus(product) === activeStatus;
    const seriesMatch = activeSeries === "all" || product.series === activeSeries;
    const configurations = product.availableConfigurations || product.configurations || product.variants;
    const variantText = Array.isArray(configurations)
      ? configurations.map((variant) => Object.values(variant).join(" ")).join(" ")
      : "";
    const haystack = `${product.series} ${product.name} ${product.ref} ${product.description || ""} ${variantText}`.toLowerCase();
    const queryMatch = !query || haystack.includes(query);
    return statusMatch && seriesMatch && queryMatch;
  });
}

function render() {
  const filtered = getFilteredProducts();
  grid.innerHTML = "";
  document.querySelector("#totalCount").textContent = products.length;
  document.querySelector("#stockCount").textContent = products.filter((product) => productStatus(product) === "in_stock").length;
  document.querySelector("#updatedAt").textContent = todayLabel();
  emptyState.hidden = filtered.length > 0;

  filtered.forEach((product) => {
    const status = productStatus(product);
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(`status-${status}`);
    node.querySelector("img").src = product.image || "";
    node.querySelector("img").alt = product.ref;
    node.querySelector(".status-badge").textContent = statusLabel(product);
    node.querySelector(".series").textContent = product.series;
    node.querySelector("h2").textContent = product.ref;
    node.querySelector(".description").textContent = product.description || "";
    node.querySelector(".dimensions").textContent = compactDimensions(product.dimensions);
    node.querySelector(".price").textContent = money(product.price);
    const variantStrip = node.querySelector(".variant-strip");
    const configurations = product.availableConfigurations || product.configurations || product.variants;
    if (Array.isArray(configurations) && configurations.length > 0) {
      const available = completeConfigurations(product);
      variantStrip.hidden = false;
      variantStrip.textContent = (available.length ? available : configurations)
        .slice(0, 3)
        .map((variant) => configSummary(variant) || STATUS[variant.status])
        .join(" · ");
    }
    node.querySelector(".image-button").addEventListener("click", () => openStockModal(product));
    grid.appendChild(node);
  });
}

function openStockModal(product) {
  const status = productStatus(product);
  const hasManualOverride = Boolean(product.statusOverride);
  const available = status === "in_stock" && !hasManualOverride ? completeConfigurations(product) : [];
  const configurations = product.availableConfigurations || product.configurations || product.variants || [];
  stockSeries.textContent = product.series;
  stockTitle.textContent = product.ref;
  stockSubtitle.textContent = product.description || `${STATUS[status]} · ${compactDimensions(product.dimensions)}`;
  stockConfigList.innerHTML = "";

  if (available.length > 0) {
    available.forEach((config) => {
      stockConfigList.appendChild(makeConfigItem(configSummary(config), config.note || "完整配置可售", "现货"));
    });
  } else if (hasManualOverride) {
    stockConfigList.appendChild(makeConfigItem("已设置为暂停销售", "当前以发布状态为准", STATUS[status]));
  } else if (configurations.length > 0) {
    stockConfigList.appendChild(makeConfigItem("暂无完整现货配置", "部分框架或桌面缺货，暂不能凑成完整产品", STATUS[status]));
  } else {
    stockConfigList.appendChild(makeConfigItem("标准配置", `${compactDimensions(product.dimensions)} · ${money(product.price)}`, STATUS[status]));
  }

  stockModal.hidden = false;
  document.body.classList.add("modal-open");
}

function makeConfigItem(title, note, statusText) {
  const item = document.createElement("div");
  item.className = "config-item";
  const heading = document.createElement("strong");
  heading.textContent = title || "标准配置";
  const meta = document.createElement("span");
  meta.textContent = note || "";
  const badge = document.createElement("em");
  badge.textContent = statusText;
  item.append(heading, meta, badge);
  return item;
}

function closeModals() {
  stockModal.hidden = true;
  document.body.classList.remove("modal-open");
}

searchInput.addEventListener("input", render);
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", closeModals);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModals();
});

loadProducts();

setInterval(() => {
  if (window.location.protocol === "file:" || document.hidden) return;
  loadProducts();
}, REFRESH_INTERVAL_MS);
