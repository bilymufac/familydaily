const storageKey = "daily-budget-state";
const sections = ["meal", "transportation"];
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
const placeImageRequests = new Set();

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
  placeFormError: document.querySelector("#place-form-error"),
  placeList: document.querySelector("#place-list"),
  placeCount: document.querySelector("#place-count"),
  placesEmptyState: document.querySelector("#places-empty-state"),
};

elements.todayDate.textContent = formatDate(today);

elements.navItems.forEach((item) => {
  item.addEventListener("click", () => {
    setActiveScreen(item.dataset.navTarget);
  });
});

elements.placeForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const link = normalizeGoogleMapsLink(elements.placeLink.value);
  const category = elements.placeCategory.value;

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

  state.places.unshift({
    id: createPlaceId(),
    link,
    category,
  });
  saveState();
  renderPlaces();
  elements.placeForm.reset();
  showPlaceFormError("");
});

elements.placeLink.addEventListener("input", () => showPlaceFormError(""));
elements.placeCategory.addEventListener("change", () => showPlaceFormError(""));

elements.placeList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-place]");
  if (!removeButton) return;

  state.places = state.places.filter((place) => place.id !== removeButton.dataset.removePlace);
  saveState();
  renderPlaces();
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
  elements.placeCount.textContent = String(state.places.length);
  elements.placesEmptyState.hidden = state.places.length > 0;

  state.places.forEach((place) => {
    const card = document.createElement("article");
    card.className = "place-card";

    const thumbnail = createPlaceThumbnail(place);

    const content = document.createElement("div");
    content.className = "place-card-content";

    const category = document.createElement("strong");
    category.textContent = place.category;

    const link = document.createElement("a");
    link.href = place.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = getDisplayLink(place.link);
    link.setAttribute("aria-label", `Open ${place.category} in Google Maps`);
    content.append(category, link);

    const actions = document.createElement("div");
    actions.className = "place-card-actions";

    const openLink = document.createElement("a");
    openLink.className = "place-action-button open-place";
    openLink.href = place.link;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.title = "Open in Google Maps";
    openLink.setAttribute("aria-label", `Open ${place.category} in Google Maps`);
    openLink.innerHTML = '<span class="place-action-icon open-icon" aria-hidden="true"></span>';

    const removeButton = document.createElement("button");
    removeButton.className = "place-action-button";
    removeButton.type = "button";
    removeButton.dataset.removePlace = place.id;
    removeButton.title = "Remove Place";
    removeButton.setAttribute("aria-label", `Remove ${place.category}`);
    removeButton.innerHTML = '<span class="place-action-icon delete-icon" aria-hidden="true"></span>';

    actions.append(openLink, removeButton);
    card.append(thumbnail, content, actions);
    elements.placeList.append(card);
  });

  hydratePlaceImages();
}

function createPlaceThumbnail(place) {
  const thumbnail = document.createElement("div");
  thumbnail.className = "place-card-thumbnail";

  if (!place.imageUrl) {
    thumbnail.classList.add("is-placeholder");
    thumbnail.innerHTML = '<span class="bottom-nav-icon heroicon-map-pin" aria-hidden="true"></span>';
    return thumbnail;
  }

  const image = document.createElement("img");
  image.src = place.imageUrl;
  image.alt = `${place.category} place photo`;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    thumbnail.classList.add("is-placeholder");
    thumbnail.innerHTML = '<span class="bottom-nav-icon heroicon-map-pin" aria-hidden="true"></span>';
  });

  thumbnail.append(image);
  return thumbnail;
}

function hydratePlaceImages() {
  state.places.forEach((place) => {
    if (place.imageUrl || placeImageRequests.has(place.id)) return;
    placeImageRequests.add(place.id);

    fetchPlaceImage(place.link)
      .then((imageUrl) => {
        if (!imageUrl) return;
        const savedPlace = state.places.find((item) => item.id === place.id);
        if (!savedPlace) return;
        savedPlace.imageUrl = imageUrl;
        saveState();
        renderPlaces();
      })
      .finally(() => placeImageRequests.delete(place.id));
  });
}

async function fetchPlaceImage(link) {
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(link)}`;
    const response = await fetch(endpoint);
    if (!response.ok) return "";

    const result = await response.json();
    const imageUrl = result?.data?.image?.url;
    return typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl) ? imageUrl : "";
  } catch {
    return "";
  }
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
  window.scrollTo({ top: 0, behavior: "auto" });
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
          category: String(place.category),
          imageUrl: typeof place.imageUrl === "string" ? place.imageUrl : "",
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
