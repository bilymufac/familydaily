const storageKey = "daily-budget-state";
const sections = ["meal", "transportation"];
const placeCategories = ["Restaurant", "Cafe", "Shopping", "Activity", "Other"];
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const today = new Date();
const remainingWorkingDays = countWorkingDaysUntilCutoff(today);
const pastWorkingDays = countPastWorkingDaysUntilCutoff(today);
const totalWorkingDays = countWorkingDaysInCutoffPeriod(today);
const state = loadState();
const placeFilters = {
  categories: new Set(),
  search: "",
};
let userLocation = null;

const elements = {
  appScreens: document.querySelectorAll("[data-app-screen]"),
  navItems: document.querySelectorAll("[data-nav-target]"),
  todayDate: document.querySelector("#today-date"),
  balanceLists: document.querySelectorAll("[data-balance-list]"),
  addBalanceButtons: document.querySelectorAll("[data-add-balance-button]"),
  monthlyBudgetInputs: document.querySelectorAll("[data-monthly-budget-input]"),
  monthlyBudgetOutputs: document.querySelectorAll("[data-monthly-budget-output]"),
  idealBudgetOutputs: document.querySelectorAll("[data-ideal-budget-output]"),
  monthlyBudgetRows: document.querySelectorAll("[data-monthly-budget-row]"),
  editBudgetButtons: document.querySelectorAll("[data-edit-budget-button]"),
  calculateButton: document.querySelector("#calculate-button"),
  resultModal: document.querySelector("#result-modal"),
  closeResultButton: document.querySelector("#close-result-button"),
  copyResultButton: document.querySelector("#copy-result-button"),
  mealResult: document.querySelector("#meal-result"),
  transportationResult: document.querySelector("#transportation-result"),
  mealTotalBalance: document.querySelector("#meal-total-balance"),
  transportationTotalBalance: document.querySelector("#transportation-total-balance"),
  mealStatus: document.querySelector("#meal-status"),
  transportationStatus: document.querySelector("#transportation-status"),
  mealResultCard: document.querySelector("#meal-result-card"),
  transportationResultCard: document.querySelector("#transportation-result-card"),
  cutoffDateOutput: document.querySelector("#cutoff-date-output"),
  workingDaysOutput: document.querySelector("#working-days-output"),
  workingDaysFill: document.querySelector("#working-days-fill"),
  placeForm: document.querySelector("#place-form"),
  placeLink: document.querySelector("#place-link"),
  placeCategory: document.querySelector("#place-category"),
  placeDistance: document.querySelector("#place-distance"),
  placeFormError: document.querySelector("#place-form-error"),
  placeList: document.querySelector("#place-list"),
  placeCount: document.querySelector("#place-count"),
  placesEmptyState: document.querySelector("#places-empty-state"),
  placeSearch: document.querySelector("#place-search"),
  categoryFilterChips: document.querySelector("#category-filter-chips"),
  useLocationButton: document.querySelector("#use-location-button"),
  placesEmptyTitle: document.querySelector("#places-empty-state strong"),
  placesEmptyText: document.querySelector("#places-empty-state p"),
  openPlaceModalButton: document.querySelector("#open-place-modal-button"),
  closePlaceModalButton: document.querySelector("#close-place-modal-button"),
  placeModal: document.querySelector("#place-modal"),
};

elements.todayDate.textContent = formatDate(today);

elements.navItems.forEach((item) => {
  item.addEventListener("click", () => {
    setActiveScreen(item.dataset.navTarget);
  });
});

elements.openPlaceModalButton.addEventListener("click", openPlaceModal);
elements.closePlaceModalButton.addEventListener("click", closePlaceModal);

elements.placeModal.addEventListener("click", (event) => {
  if (event.target === elements.placeModal) {
    closePlaceModal();
  }
});

elements.placeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const link = normalizeGoogleMapsLink(elements.placeLink.value);
  const category = elements.placeCategory.value;
  const manualDistance = normalizeDistance(elements.placeDistance.value);

  if (!link) {
    showPlaceFormError("Enter a valid Google Maps link.");
    elements.placeLink.focus();
    return;
  }

  if (!category) {
    showPlaceFormError("Select a category.");
    elements.placeCategory.focus();
    return;
  }

  const resolvedLink = await resolveMapsLink(link);
  const distance = manualDistance || getAutoDistanceLabel(resolvedLink || link);

  state.places.unshift({
    id: createPlaceId(),
    link,
    resolvedLink,
    category,
    distance,
    addedAt: new Date().toISOString(),
  });
  saveState();
  renderPlaces();
  elements.placeForm.reset();
  showPlaceFormError("");
  closePlaceModal();
});

elements.placeLink.addEventListener("input", () => showPlaceFormError(""));
elements.placeCategory.addEventListener("change", () => showPlaceFormError(""));

elements.useLocationButton.addEventListener("click", async () => {
  elements.useLocationButton.textContent = "Getting Location";
  elements.useLocationButton.disabled = true;

  try {
    userLocation = await getCurrentLocation();
    await resolveSavedPlaceLinks();
    const updatedCount = updatePlaceDistancesFromLocation();
    saveState();
    renderPlaces();
    elements.useLocationButton.textContent = updatedCount > 0 ? "Distance Updated" : "No Coordinates Found";
  } catch {
    elements.useLocationButton.textContent = "Location Unavailable";
  } finally {
    window.setTimeout(() => {
      elements.useLocationButton.textContent = "Use My Location";
      elements.useLocationButton.disabled = false;
    }, 1800);
  }
});

elements.placeSearch.addEventListener("input", () => {
  placeFilters.search = elements.placeSearch.value.trim().toLowerCase();
  renderPlaces();
});

elements.categoryFilterChips.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category-filter]");
  if (!chip) return;

  const category = chip.dataset.categoryFilter;
  if (placeFilters.categories.has(category)) {
    placeFilters.categories.delete(category);
  } else {
    placeFilters.categories.add(category);
  }
  renderPlaces();
});

elements.placeList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-place]");
  if (removeButton) {
    state.places = state.places.filter((place) => place.id !== removeButton.dataset.removePlace);
    saveState();
    renderPlaces();
    return;
  }

  const card = event.target.closest("[data-open-place]");
  if (card) {
    window.open(card.dataset.openPlace, "_blank", "noopener,noreferrer");
  }
});

elements.placeList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  const card = event.target.closest("[data-open-place]");
  if (!card || event.target !== card) return;

  event.preventDefault();
  window.open(card.dataset.openPlace, "_blank", "noopener,noreferrer");
});

sections.forEach((section) => {
  document.querySelector(`[data-monthly-budget-input="${section}"]`).value = formatNumber(state[section].monthlyBudget);
  renderBalanceFields(section);
});

elements.balanceLists.forEach((list) => {
  list.addEventListener("input", (event) => {
    const input = event.target.closest("[data-balance-input]");
    if (!input) return;

    const section = input.dataset.balanceInput;
    const index = Number(input.dataset.balanceIndex);
    state[section].balances[index] = readWholeNumber(input.value);
    input.value = formatNumber(state[section].balances[index]);
    saveState();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-balance-button]");
    if (!button) return;

    const section = button.dataset.removeBalanceButton;
    const index = Number(button.dataset.balanceIndex);
    state[section].balances.splice(index, 1);
    renderBalanceFields(section);
    saveState();
  });
});

elements.addBalanceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const section = button.dataset.addBalanceButton;
    state[section].balances.push(0);
    renderBalanceFields(section);
    saveState();

    const inputs = document.querySelectorAll(`[data-balance-input="${section}"]`);
    inputs[inputs.length - 1].focus();
  });
});

elements.monthlyBudgetInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const section = input.dataset.monthlyBudgetInput;
    state[section].monthlyBudget = readWholeNumber(input.value);
    input.value = formatNumber(state[section].monthlyBudget);
    saveState();
    render();
  });

  input.addEventListener("blur", () => {
    setMonthlyBudgetEditing(input.dataset.monthlyBudgetInput, false);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur();
    }
  });
});

elements.editBudgetButtons.forEach((button) => {
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  button.addEventListener("click", () => {
    const section = button.dataset.editBudgetButton;
    const input = document.querySelector(`[data-monthly-budget-input="${section}"]`);
    const isEditing = !input.hidden;

    setMonthlyBudgetEditing(section, !isEditing);
    if (isEditing) return;

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
});

elements.calculateButton.addEventListener("click", () => {
  const mealTotalBalance = sumBalances(state.meal.balances);
  const transportationTotalBalance = sumBalances(state.transportation.balances);
  const mealDailyBudget = getDailyBudget(mealTotalBalance);
  const transportationDailyBudget = getDailyBudget(transportationTotalBalance);
  const mealStatus = getBudgetStatus(state.meal, mealDailyBudget);
  const transportationStatus = getBudgetStatus(state.transportation, transportationDailyBudget);

  state.meal.dailyBudget = mealDailyBudget;
  state.transportation.dailyBudget = transportationDailyBudget;
  saveState();

  elements.mealResult.textContent = currency.format(mealDailyBudget);
  elements.transportationResult.textContent = currency.format(transportationDailyBudget);
  elements.mealTotalBalance.textContent = currency.format(mealTotalBalance);
  elements.transportationTotalBalance.textContent = currency.format(transportationTotalBalance);
  setResultStatus(elements.mealStatus, elements.mealResultCard, mealStatus);
  setResultStatus(elements.transportationStatus, elements.transportationResultCard, transportationStatus);
  elements.resultModal.hidden = false;
});

elements.copyResultButton.addEventListener("click", async () => {
  const text = buildResultCopyText();
  await copyText(text);
  elements.copyResultButton.textContent = "Copied";
  window.setTimeout(() => {
    elements.copyResultButton.textContent = "Copy";
  }, 1400);
});

elements.closeResultButton.addEventListener("click", closeResultModal);

elements.resultModal.addEventListener("click", (event) => {
  if (event.target === elements.resultModal) {
    closeResultModal();
  }
});

renderCategoryFilterChips();
render();

function render() {
  setWorkingDaysOutput(remainingWorkingDays);
  renderPlaces();

  sections.forEach((section) => {
    setMonthlyBudgetOutput(section, state[section].monthlyBudget || 0);
    setIdealBudgetOutput(section);
  });
}

function renderPlaces() {
  elements.placeList.innerHTML = "";
  const visiblePlaces = getFilteredPlaces();
  elements.placeCount.textContent = String(visiblePlaces.length);
  elements.placesEmptyState.hidden = visiblePlaces.length > 0;
  elements.placeList.hidden = visiblePlaces.length === 0;
  syncCategoryFilterChips();

  if (visiblePlaces.length === 0) {
    const hasFilters = placeFilters.search || placeFilters.categories.size > 0;
    elements.placesEmptyTitle.textContent = hasFilters ? "No Matching Places" : "No Saved Places";
    elements.placesEmptyText.textContent = hasFilters ? "Try another search or category." : "Add a Google Maps link to start your list.";
  }

  visiblePlaces.forEach((place) => {
    const card = document.createElement("article");
    card.className = "place-card";
    card.dataset.openPlace = place.link;
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `Open ${getPlaceNameFromLink(place.link)} in Google Maps`);

    const content = document.createElement("div");
    content.className = "place-card-content";

    const topRow = document.createElement("div");
    topRow.className = "place-card-top-row";

    const categoryIcon = createPlaceCategoryIcon(place.category);

    const category = document.createElement("span");
    category.className = "place-category-label";
    category.textContent = place.category;
    topRow.append(categoryIcon, category);

    const title = document.createElement("strong");
    title.textContent = getPlaceNameFromLink(place.link);

    const link = document.createElement("span");
    link.className = "place-link-text";
    link.textContent = getDisplayLink(place.link);

    const distance = document.createElement("span");
    distance.className = "place-distance";
    distance.textContent = place.distance || "Distance Not Set";

    const addedDate = document.createElement("small");
    addedDate.className = "place-added-date";
    addedDate.textContent = formatAddedDate(place.addedAt);

    const removeButton = document.createElement("button");
    removeButton.className = "place-action-button";
    removeButton.type = "button";
    removeButton.dataset.removePlace = place.id;
    removeButton.title = "Remove Place";
    removeButton.setAttribute("aria-label", `Remove ${place.category}`);
    removeButton.innerHTML = '<span class="place-action-icon delete-icon" aria-hidden="true"></span>';

    const footer = document.createElement("div");
    footer.className = "place-card-footer";
    footer.append(addedDate, removeButton);

    content.append(topRow, title, link, distance, footer);
    card.append(content);
    elements.placeList.append(card);
  });
}

function syncCategoryFilterChips() {
  elements.categoryFilterChips.querySelectorAll("[data-category-filter]").forEach((chip) => {
    const isActive = placeFilters.categories.has(chip.dataset.categoryFilter);
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });
}

function renderCategoryFilterChips() {
  elements.categoryFilterChips.innerHTML = "";
  placeCategories.forEach((category) => {
    const chip = document.createElement("button");
    chip.className = "category-filter-chip";
    chip.type = "button";
    chip.dataset.categoryFilter = category;
    chip.setAttribute("aria-pressed", "false");
    chip.textContent = category;
    elements.categoryFilterChips.append(chip);
  });
}

function getFilteredPlaces() {
  return state.places.filter((place) => {
    const matchesCategory = placeFilters.categories.size === 0 || placeFilters.categories.has(place.category);
    const matchesSearch = !placeFilters.search || getPlaceNameFromLink(place.link).toLowerCase().includes(placeFilters.search);
    return matchesCategory && matchesSearch;
  });
}

function createPlaceCategoryIcon(category) {
  const icon = document.createElement("div");
  icon.className = "place-category-icon";
  icon.textContent = getPlaceCategoryEmoji(category);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function getPlaceCategoryEmoji(category) {
  const icons = {
    Restaurant: "🍽️",
    Cafe: "☕",
    Shopping: "🛍️",
    Activity: "🎟️",
    Other: "📍",
  };
  return icons[category] || icons.Other;
}

function normalizeGoogleMapsLink(value) {
  const rawValue = value.trim();
  if (!rawValue) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`);
    const hostname = url.hostname.toLowerCase();
    const isMapsShortLink = hostname === "maps.app.goo.gl" || (hostname === "goo.gl" && url.pathname.startsWith("/maps"));
    const isGoogleMapsLink = /(^|\.)google\.[a-z.]+$/.test(hostname) && (url.pathname.includes("/maps") || url.searchParams.has("q"));

    return isMapsShortLink || isGoogleMapsLink ? url.href : "";
  } catch {
    return "";
  }
}

function getDisplayLink(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

function getPlaceNameFromLink(value) {
  try {
    const url = new URL(value);
    const placePathMatch = url.pathname.match(/\/place\/([^/]+)/);
    const queryValue = url.searchParams.get("q") || url.searchParams.get("query");

    if (placePathMatch) {
      return formatPlaceName(placePathMatch[1]);
    }

    if (queryValue && !/^[-\d.,\s]+$/.test(queryValue)) {
      return formatPlaceName(queryValue);
    }
  } catch {
    // Fall back to a stable generic title for links that do not expose a name.
  }

  return "Google Maps Place";
}

function formatPlaceName(value) {
  return decodeURIComponent(value)
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Google Maps Place";
}

function createPlaceId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showPlaceFormError(message) {
  elements.placeFormError.textContent = message;
  elements.placeFormError.hidden = !message;
}

function setActiveScreen(screen) {
  elements.appScreens.forEach((item) => {
    item.hidden = item.dataset.appScreen !== screen;
  });

  elements.navItems.forEach((item) => {
    const isActive = item.dataset.navTarget === screen;
    item.classList.toggle("is-active", isActive);
    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });

  closeResultModal();
  closePlaceModal();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function openPlaceModal() {
  elements.placeModal.hidden = false;
  showPlaceFormError("");
  window.setTimeout(() => elements.placeLink.focus(), 0);
}

function closePlaceModal() {
  elements.placeModal.hidden = true;
  elements.placeForm.reset();
  showPlaceFormError("");
}

function getDailyBudget(balance) {
  if (balance <= 0 || remainingWorkingDays <= 0) return 0;
  return Math.floor(balance / remainingWorkingDays);
}

function getBudgetStatus(section, dailyBudget) {
  const idealDailyBudget = getIdealDailyBudget(section);
  if (dailyBudget <= 0 || idealDailyBudget <= 0) return "Not Set";
  return dailyBudget < idealDailyBudget ? "Low" : "Good";
}

function setResultStatus(statusElement, card, status) {
  const className = status === "Good" ? "is-good" : status === "Low" ? "is-low" : "";
  statusElement.textContent = status;
  statusElement.classList.remove("is-good", "is-low");
  card.classList.remove("is-good", "is-low");
  if (className) {
    statusElement.classList.add(className);
    card.classList.add(className);
  }
}

function buildResultCopyText() {
  return `Daily Budget\n\nMeal: ${elements.mealResult.textContent}/day\nStatus: ${elements.mealStatus.textContent}\n\nTransportation: ${elements.transportationResult.textContent}/day\nStatus: ${elements.transportationStatus.textContent}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through for local file previews without clipboard permission.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function renderBalanceFields(section) {
  const list = [...elements.balanceLists].find((item) => item.dataset.balanceList === section);
  list.innerHTML = "";

  state[section].balances.forEach((balance, index) => {
    const row = document.createElement("div");
    row.className = "balance-row";

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.placeholder = index === 0 ? "1.000.000" : "0";
    input.dataset.balanceInput = section;
    input.dataset.balanceIndex = String(index);
    input.setAttribute("aria-label", `${toTitleCase(section)} Balance ${index + 1}`);
    input.value = formatNumber(balance);
    row.append(input);

    if (index > 0) {
      const removeButton = document.createElement("button");
      removeButton.className = "remove-balance-button";
      removeButton.type = "button";
      removeButton.dataset.removeBalanceButton = section;
      removeButton.dataset.balanceIndex = String(index);
      removeButton.setAttribute("aria-label", `Remove ${toTitleCase(section)} Balance ${index + 1}`);
      removeButton.innerHTML = '<span aria-hidden="true">−</span>';
      row.append(removeButton);
    }

    list.append(row);
  });
}

function setWorkingDaysOutput(value) {
  const progress = totalWorkingDays > 0 ? Math.min((pastWorkingDays / totalWorkingDays) * 100, 100) : 0;

  elements.cutoffDateOutput.textContent = getOrdinalDay(25);
  elements.workingDaysOutput.textContent = `Remaining ${value} Working ${value === 1 ? "Day" : "Days"}`;
  elements.workingDaysFill.style.width = `${progress}%`;
}

function getOrdinalDay(day) {
  const suffix = day % 10 === 1 && day % 100 !== 11 ? "st" : day % 10 === 2 && day % 100 !== 12 ? "nd" : day % 10 === 3 && day % 100 !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}

function getIdealDailyBudget(section) {
  if (section.monthlyBudget <= 0 || totalWorkingDays <= 0) return 0;
  return Math.floor(section.monthlyBudget / totalWorkingDays);
}

function setMonthlyBudgetOutput(section, value) {
  const output = [...elements.monthlyBudgetOutputs].find((item) => item.dataset.monthlyBudgetOutput === section);
  output.textContent = currency.format(value);
}

function setIdealBudgetOutput(section) {
  const output = [...elements.idealBudgetOutputs].find((item) => item.dataset.idealBudgetOutput === section);
  output.textContent = currency.format(getIdealDailyBudget(state[section]));
}

function setMonthlyBudgetEditing(section, isEditing) {
  const row = [...elements.monthlyBudgetRows].find((item) => item.dataset.monthlyBudgetRow === section);
  const input = document.querySelector(`[data-monthly-budget-input="${section}"]`);
  row.classList.toggle("is-editing", isEditing);
  input.hidden = !isEditing;
}

function closeResultModal() {
  elements.resultModal.hidden = true;
}

function readWholeNumber(value) {
  const number = Number.parseInt(String(value).replace(/\D/g, ""), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatNumber(value) {
  return value > 0 ? new Intl.NumberFormat("id-ID").format(value) : "";
}

function sumBalances(balances) {
  return balances.reduce((total, balance) => total + balance, 0);
}

function toTitleCase(value) {
  return value
    .split(/[\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatAddedDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Today";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalizeDistance(value) {
  const distance = value.trim();
  if (!distance) return "";
  return /[a-z]/i.test(distance) ? distance : `${distance} km`;
}

function getAutoDistanceLabel(link) {
  if (!userLocation) return "";
  const placeLocation = getCoordinatesFromMapsLink(link);
  if (!placeLocation) return "";
  return formatDistance(getDistanceInMeters(userLocation, placeLocation));
}

function updatePlaceDistancesFromLocation() {
  let updatedCount = 0;
  state.places.forEach((place) => {
    const distance = getAutoDistanceLabel(place.resolvedLink || place.link);
    if (!distance) return;
    place.distance = distance;
    updatedCount += 1;
  });
  return updatedCount;
}

async function resolveMapsLink(link) {
  try {
    const response = await fetch("/.netlify/functions/resolve-maps-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link }),
    });
    if (!response.ok) return link;

    const result = await response.json();
    return normalizeGoogleMapsLink(result.resolvedUrl) || link;
  } catch {
    return link;
  }
}

async function resolveSavedPlaceLinks() {
  const unresolvedPlaces = state.places.filter((place) => !place.resolvedLink || place.resolvedLink === place.link);
  await Promise.all(
    unresolvedPlaces.map(async (place) => {
      place.resolvedLink = await resolveMapsLink(place.link);
    })
  );
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      reject,
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 12000 }
    );
  });
}

function getCoordinatesFromMapsLink(value) {
  let decodedValue = value;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    // Keep the original value if the URL contains malformed escape sequences.
  }

  const pathMatch = decodedValue.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const dataMatch = decodedValue.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/);
  const match = pathMatch || dataMatch;
  if (match) return normalizeCoordinates(Number(match[1]), Number(match[2]));

  try {
    const url = new URL(value);
    const queryValue = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("ll");
    const queryMatch = queryValue?.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    return queryMatch ? normalizeCoordinates(Number(queryMatch[1]), Number(queryMatch[2])) : null;
  } catch {
    return null;
  }
}

function normalizeCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
}

function getDistanceInMeters(start, end) {
  const earthRadius = 6371000;
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const kilometers = meters / 1000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
}

function countWorkingDaysUntilCutoff(startDate) {
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), 25);
  let days = 0;

  while (cursor <= endDate) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function countPastWorkingDaysUntilCutoff(date) {
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1);
  const endDate = new Date(date.getFullYear(), date.getMonth(), Math.min(date.getDate() - 1, 25));
  let days = 0;

  while (cursor <= endDate) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function countWorkingDaysInCutoffPeriod(date) {
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1);
  const endDate = new Date(date.getFullYear(), date.getMonth(), 25);
  let days = 0;

  while (cursor <= endDate) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function loadState() {
  const fallback = {
    meal: { balances: [0], dailyBudget: 0, monthlyBudget: 0 },
    transportation: { balances: [0], dailyBudget: 0, monthlyBudget: 0 },
    places: [],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    const nextState = sections.reduce((loadedState, section) => {
      const balances = Array.isArray(saved?.[section]?.balances)
        ? saved[section].balances.map((balance) => Number(balance) || 0)
        : [Number(saved?.[section]?.balance) || 0];

      loadedState[section] = {
        balances: balances.length > 0 ? balances : [0],
        dailyBudget: Number(saved?.[section]?.dailyBudget) || 0,
        monthlyBudget: Number(saved?.[section]?.monthlyBudget) || 0,
      };
      return loadedState;
    }, fallback);

    nextState.places = Array.isArray(saved?.places)
      ? saved.places.filter((place) => place?.id && place?.link && place?.category).map((place) => ({
          id: String(place.id),
          link: String(place.link),
          resolvedLink: typeof place.resolvedLink === "string" ? place.resolvedLink : "",
          category: String(place.category),
          distance: typeof place.distance === "string" ? place.distance : "",
          addedAt: typeof place.addedAt === "string" ? place.addedAt : new Date().toISOString(),
        }))
      : [];

    return nextState;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}
