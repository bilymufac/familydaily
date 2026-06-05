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

const elements = {
  resetButton: document.querySelector("#reset-button"),
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
};

elements.todayDate.textContent = formatDate(today);

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

elements.resetButton.addEventListener("click", () => {
  sections.forEach((section) => {
    state[section] = { balances: [0], dailyBudget: 0, monthlyBudget: 0 };
    renderBalanceFields(section);
    document.querySelector(`[data-monthly-budget-input="${section}"]`).value = "";
    setMonthlyBudgetEditing(section, false);
  });
  saveState();
  closeResultModal();
});

render();

function render() {
  setWorkingDaysOutput(remainingWorkingDays);

  sections.forEach((section) => {
    setMonthlyBudgetOutput(section, state[section].monthlyBudget || 0);
    setIdealBudgetOutput(section);
  });
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
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return sections.reduce((nextState, section) => {
      const balances = Array.isArray(saved?.[section]?.balances)
        ? saved[section].balances.map((balance) => Number(balance) || 0)
        : [Number(saved?.[section]?.balance) || 0];

      nextState[section] = {
        balances: balances.length > 0 ? balances : [0],
        dailyBudget: Number(saved?.[section]?.dailyBudget) || 0,
        monthlyBudget: Number(saved?.[section]?.monthlyBudget) || 0,
      };
      return nextState;
    }, fallback);
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}
