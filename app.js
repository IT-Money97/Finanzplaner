(() => {
  "use strict";

  const STORAGE_KEY = "moneta-finance-v1";
  const categories = {
    expense: ["Wohnen", "Lebensmittel", "Mobilität", "Abos", "Versicherungen", "Gesundheit", "Freizeit", "Shopping", "Restaurants", "Reisen", "Bildung", "Sonstiges"],
    income: ["Gehalt", "Freelance", "Nebenjob", "Rückerstattung", "Investments", "Sonstiges"]
  };
  const categoryMeta = {
    Wohnen: ["⌂", "#69aa83"], Lebensmittel: ["⌁", "#79b889"], Mobilität: ["↗", "#76a6c2"], Abos: ["▤", "#9c87c0"],
    Versicherungen: ["◈", "#d5a35d"], Gesundheit: ["✚", "#dc8980"], Freizeit: ["✳", "#77b9ae"], Shopping: ["◇", "#d48a9c"],
    Restaurants: ["♨", "#d19b69"], Reisen: ["✈", "#6a9cc0"], Bildung: ["▧", "#8496bd"], Sonstiges: ["•", "#9da8a2"],
    Gehalt: ["↘", "#61ae83"], Freelance: ["✦", "#7ca7bd"], Nebenjob: ["↗", "#80b294"], Rückerstattung: ["↩", "#8aa5c2"],
    Investments: ["⌁", "#9c87c0"]
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const today = dateString(new Date());
  let state = loadState();
  let period = "month";
  let periodOffset = 0;
  let transactionKind = "expense";
  let recurringKind = "expense";
  let toastTimer;
  let speechRecognition;

  function dateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions.filter(isTransaction) : [],
        recurring: Array.isArray(parsed.recurring) ? parsed.recurring.filter(isRecurring) : []
      };
    } catch (error) {
      console.error("Finanzdaten konnten nicht aus dem lokalen Speicher gelesen werden.", error);
      showToast("Gespeicherte Daten konnten nicht gelesen werden.");
      return { transactions: [], recurring: [] };
    }
  }

  function isTransaction(item) {
    return item && typeof item.id === "string" && typeof item.description === "string" &&
      Number.isFinite(item.amount) && item.amount > 0 && ["income", "expense"].includes(item.kind) &&
      isDateValue(item.date) && categories[item.kind].includes(item.category);
  }

  function isRecurring(item) {
    return item && typeof item.id === "string" && typeof item.description === "string" &&
      Number.isFinite(item.amount) && item.amount > 0 && ["income", "expense"].includes(item.kind) &&
      ["monthly", "yearly"].includes(item.frequency) && isDateValue(item.start) &&
      categories[item.kind].includes(item.category) && (!item.end || isDateValue(item.end));
  }

  function isDateValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.valueOf()) && dateString(date) === value;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      return true;
    } catch (error) {
      console.error("Finanzdaten konnten nicht lokal gespeichert werden.", error);
      showToast("Speichern fehlgeschlagen. Bitte Gerätespeicher prüfen.");
      return false;
    }
  }

  function euro(value) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
  }

  function formatDate(value, options = { day: "numeric", month: "short" }) {
    return new Intl.DateTimeFormat("de-DE", options).format(new Date(`${value}T12:00:00`));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function setCategories(select, kind, chosen) {
    select.innerHTML = categories[kind].map((item) => `<option value="${item}">${item}</option>`).join("");
    if (chosen && categories[kind].includes(chosen)) select.value = chosen;
  }

  function suggestCategory(text, kind) {
    const value = text.toLocaleLowerCase("de-DE");
    const rules = kind === "income" ? [
      ["Gehalt", /\b(gehalt|lohn|salary)\b/], ["Freelance", /\b(freelance|auftrag|honorar)\b/],
      ["Nebenjob", /\b(nebenjob|minijob)\b/], ["Rückerstattung", /\b(rückerstattung|erstattung|retoure)\b/],
      ["Investments", /\b(dividende|zinsen|investment)\b/]
    ] : [
      ["Wohnen", /\b(miete|nebenkosten|strom|gas|internet|wohn|heizung)\b/],
      ["Lebensmittel", /\b(rewe|edeka|aldi|lidl|supermarkt|einkauf|lebensmittel|dm|rossmann)\b/],
      ["Mobilität", /\b(tanken|tankstelle|bahn|bus|ticket|uber|fahrrad|mobilität)\b/],
      ["Abos", /\b(netflix|spotify|disney|prime|abo|subscription|icloud|youtube)\b/],
      ["Versicherungen", /\b(versicherung|haftpflicht|krankenversicherung|hausrat)\b/],
      ["Gesundheit", /\b(apotheke|arzt|gesundheit|zahnarzt|medizin)\b/],
      ["Restaurants", /\b(restaurant|café|cafe|kaffee|mittagessen|lieferando|essen)\b/],
      ["Reisen", /\b(reise|hotel|flug|urlaub)\b/], ["Freizeit", /\b(kino|konzert|sport|fitness|freizeit)\b/],
      ["Shopping", /\b(shopping|kleidung|schuhe|amazon|kauf)\b/], ["Bildung", /\b(kurs|buch|bildung|schule|studium)\b/]
    ];
    const match = rules.find(([, expression]) => expression.test(value));
    return match ? match[0] : "Sonstiges";
  }

  function parseSpokenAmount(text) {
    const match = text.match(/(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(?:€|euro|eur)?/i);
    if (!match) return null;
    const raw = match[1].replace(/\s/g, "");
    let normalized;
    if (raw.includes(",") && raw.includes(".")) normalized = raw.replace(/\./g, "").replace(",", ".");
    else if (raw.includes(",")) normalized = raw.replace(",", ".");
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, "");
    else normalized = raw;
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function getRange() {
    const now = new Date();
    let start;
    let end;
    if (period === "custom") {
      const from = $("#date-from").value;
      const to = $("#date-to").value;
      start = from || dateString(new Date(now.getFullYear(), now.getMonth(), 1));
      end = to || dateString(now);
    } else if (period === "year") {
      const year = now.getFullYear() + periodOffset;
      start = dateString(new Date(year, 0, 1));
      end = dateString(new Date(year, 11, 31));
    } else {
      const months = period === "quarter" ? 3 : 1;
      const firstMonth = now.getMonth() + periodOffset * months;
      start = dateString(new Date(now.getFullYear(), firstMonth, 1));
      end = dateString(new Date(now.getFullYear(), firstMonth + months, 0));
    }
    return { start, end };
  }

  function periodLabel() {
    if (period === "custom") {
      const { start, end } = getRange();
      return `${formatDate(start)} – ${formatDate(end)}`;
    }
    const now = new Date();
    if (period === "year") return String(now.getFullYear() + periodOffset);
    const months = period === "quarter" ? 3 : 1;
    const first = new Date(now.getFullYear(), now.getMonth() + periodOffset * months, 1);
    if (period === "month") {
      if (periodOffset === 0) return "Dieser Monat";
      return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(first);
    }
    const last = new Date(first.getFullYear(), first.getMonth() + months - 1, 1);
    return `${new Intl.DateTimeFormat("de-DE", { month: "short" }).format(first)} – ${new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric" }).format(last)}`;
  }

  function occurrenceDate(rule, index) {
    const origin = new Date(`${rule.start}T12:00:00`);
    if (rule.frequency === "yearly") {
      const year = origin.getFullYear() + index;
      return new Date(year, origin.getMonth(), Math.min(origin.getDate(), new Date(year, origin.getMonth() + 1, 0).getDate()));
    }
    const month = origin.getMonth() + index;
    const year = origin.getFullYear() + Math.floor(month / 12);
    const monthIndex = month % 12;
    return new Date(year, monthIndex, Math.min(origin.getDate(), new Date(year, monthIndex + 1, 0).getDate()));
  }

  function occurrences(rule, start, end) {
    const from = new Date(`${start}T00:00:00`);
    const to = new Date(`${end}T23:59:59`);
    const origin = new Date(`${rule.start}T12:00:00`);
    const ruleEnd = rule.end ? new Date(`${rule.end}T23:59:59`) : null;
    const output = [];
    if (origin > to || (ruleEnd && ruleEnd < from)) return output;
    let index = 0;
    if (rule.frequency === "monthly" && origin < from) {
      index = Math.max(0, (from.getFullYear() - origin.getFullYear()) * 12 + from.getMonth() - origin.getMonth() - 1);
    } else if (rule.frequency === "yearly" && origin < from) {
      index = Math.max(0, from.getFullYear() - origin.getFullYear() - 1);
    }
    for (; index < 1200; index++) {
      const cursor = occurrenceDate(rule, index);
      if (cursor > to) break;
      if (ruleEnd && cursor > ruleEnd) break;
      if (cursor >= from) output.push({ ...rule, date: dateString(cursor), recurring: true });
    }
    return output;
  }

  function allTransactionsInRange(start, end) {
    const actual = state.transactions.filter((item) => item.date >= start && item.date <= end);
    const projected = state.recurring.flatMap((rule) => occurrences(rule, start, end));
    return [...actual, ...projected];
  }

  function render() {
    const { start, end } = getRange();
    const rangeTransactions = allTransactionsInRange(start, end);
    const income = rangeTransactions.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = rangeTransactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const fixed = rangeTransactions.filter((item) => item.kind === "expense" && item.recurring).reduce((sum, item) => sum + item.amount, 0);
    $("#period-label").textContent = periodLabel();
    $("#balance-value").textContent = euro(income - expense);
    $("#income-value").textContent = euro(income);
    $("#expense-value").textContent = euro(expense);
    $("#fixed-value").textContent = euro(fixed);
    $("#balance-value").classList.toggle("negative-value", income < expense);
    renderChart(start, end, rangeTransactions);
    renderCategories(rangeTransactions);
    renderTransactions(start, end);
    renderRecurring(start, end);
  }

  function renderChart(start, end, items) {
    const wrapper = $("#cashflow-chart");
    if (!items.length) {
      wrapper.innerHTML = '<div class="empty-chart">Dein Geldfluss erscheint hier, sobald Buchungen vorhanden sind.</div>';
      return;
    }
    const from = new Date(`${start}T12:00:00`);
    const to = new Date(`${end}T12:00:00`);
    const monthsSpan = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
    const groupByMonth = monthsSpan > 1;
    const buckets = [];
    if (groupByMonth) {
      for (let cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= to; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
        buckets.push({ key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`, label: new Intl.DateTimeFormat("de-DE", { month: "short" }).format(cursor), income: 0, expense: 0 });
      }
    } else {
      const dayCount = Math.max(1, Math.round((to - from) / 86400000) + 1);
      const count = Math.min(6, dayCount);
      for (let i = 0; i < count; i++) {
        const bucketStart = new Date(from);
        bucketStart.setDate(from.getDate() + Math.floor(i * dayCount / count));
        const bucketEnd = new Date(from);
        bucketEnd.setDate(from.getDate() + Math.floor((i + 1) * dayCount / count) - 1);
        buckets.push({ key: [dateString(bucketStart), dateString(bucketEnd)], label: `${bucketStart.getDate()}.–${bucketEnd.getDate()}.`, income: 0, expense: 0 });
      }
    }
    for (const item of items) {
      const bucket = groupByMonth
        ? buckets.find((entry) => entry.key === item.date.slice(0, 7))
        : buckets.find((entry) => item.date >= entry.key[0] && item.date <= entry.key[1]);
      if (bucket) bucket[item.kind] += item.amount;
    }
    const max = Math.max(1, ...buckets.flatMap((bucket) => [bucket.income, bucket.expense]));
    const width = 640;
    const height = 193;
    const left = 25;
    const right = 12;
    const chartTop = 12;
    const chartBottom = 157;
    const chartHeight = chartBottom - chartTop;
    const groupWidth = (width - left - right) / buckets.length;
    const barWidth = Math.min(22, groupWidth * .28);
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><title>Einnahmen und Ausgaben im Zeitraum</title>`;
    for (let i = 0; i < 4; i++) {
      const y = chartTop + i * chartHeight / 3;
      svg += `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="#edf1ee" stroke-dasharray="3 5"/>`;
    }
    buckets.forEach((bucket, index) => {
      const center = left + groupWidth * (index + .5);
      const incomeHeight = Math.max(bucket.income ? 2 : 0, bucket.income / max * chartHeight);
      const expenseHeight = Math.max(bucket.expense ? 2 : 0, bucket.expense / max * chartHeight);
      svg += `<rect x="${center - barWidth - 2}" y="${chartBottom - incomeHeight}" width="${barWidth}" height="${incomeHeight}" rx="3" fill="#68bd91"><title>${escapeHtml(bucket.label)} Einnahmen: ${euro(bucket.income)}</title></rect>`;
      svg += `<rect x="${center + 2}" y="${chartBottom - expenseHeight}" width="${barWidth}" height="${expenseHeight}" rx="3" fill="#e7a292"><title>${escapeHtml(bucket.label)} Ausgaben: ${euro(bucket.expense)}</title></rect>`;
      svg += `<text x="${center}" y="180" text-anchor="middle" font-size="10" fill="#9aa49e" font-family="DM Sans, sans-serif">${escapeHtml(bucket.label)}</text>`;
    });
    svg += "</svg>";
    wrapper.innerHTML = svg;
  }

  function renderCategories(items) {
    const expenses = items.filter((item) => item.kind === "expense");
    const totals = new Map();
    for (const item of expenses) totals.set(item.category, (totals.get(item.category) || 0) + item.amount);
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const target = $("#category-list");
    if (!sorted.length) {
      target.innerHTML = '<div class="empty-state">Noch keine Ausgaben in diesem Zeitraum.</div>';
      return;
    }
    const max = sorted[0][1];
    target.innerHTML = sorted.map(([category, total]) => {
      const [icon, color] = categoryMeta[category] || categoryMeta.Sonstiges;
      return `<div class="category-row"><span class="category-icon">${icon}</span><div><div class="category-name"><span>${category}</span><span>${Math.round(total / expenses.reduce((sum, item) => sum + item.amount, 0) * 100)}%</span></div><div class="category-track"><div class="category-fill" style="width:${total / max * 100}%;background:${color}"></div></div></div><span class="category-amount">${euro(total)}</span></div>`;
    }).join("");
  }

  function renderTransactions(start, end) {
    const list = state.transactions.filter((item) => item.date >= start && item.date <= end).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    $("#transaction-list").innerHTML = list.length ? list.map((item) => {
      const [icon] = categoryMeta[item.category] || categoryMeta.Sonstiges;
      return `<div class="transaction-row"><span class="transaction-icon">${icon}</span><div><div class="transaction-name">${escapeHtml(item.description)}</div><div class="transaction-meta"><span>${item.category}</span><span>·</span><span>${formatDate(item.date)}</span></div></div><div class="transaction-amount ${item.kind}">${item.kind === "income" ? "+" : "−"}${euro(item.amount)}<button class="delete-transaction" type="button" data-delete-transaction="${item.id}" aria-label="Buchung ${escapeHtml(item.description)} löschen">×</button></div></div>`;
    }).join("") : '<div class="empty-state">Noch keine Buchungen. Füge deine erste hinzu.</div>';
  }

  function renderRecurring(start, end) {
    const upcoming = state.recurring.map((item) => ({ ...item, next: occurrences(item, today, item.end || "9999-12-31")[0]?.date })).filter((item) => item.next).sort((a, b) => a.next.localeCompare(b.next));
    const list = $("#recurring-list");
    list.innerHTML = upcoming.length ? upcoming.slice(0, 5).map((item) => {
      const [icon] = categoryMeta[item.category] || categoryMeta.Sonstiges;
      return `<div class="recurring-row"><span class="recurring-item-icon">${icon}</span><div><div class="recurring-name">${escapeHtml(item.description)}</div><div class="recurring-meta">${item.frequency === "monthly" ? "Monatlich" : "Jährlich"} · nächstes Mal ${formatDate(item.next)}</div></div><div class="recurring-amount ${item.kind}">${item.kind === "income" ? "+" : "−"}${euro(item.amount)}<button class="delete-recurring" type="button" data-delete-recurring="${item.id}" aria-label="Regel ${escapeHtml(item.description)} löschen">×</button></div></div>`;
    }).join("") : '<div class="empty-state">Füge Abos, Versicherungen oder regelmäßige Einnahmen hinzu.</div>';
    const inPeriod = state.recurring.flatMap((rule) => occurrences(rule, start, end));
    const recurringIncome = inPeriod.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const recurringExpense = inPeriod.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const total = $("#recurring-total");
    total.hidden = !inPeriod.length;
    total.innerHTML = `<span>Im Zeitraum: Einnahmen ${euro(recurringIncome)} · Ausgaben ${euro(recurringExpense)}</span><strong>${state.recurring.length} ${state.recurring.length === 1 ? "Regel" : "Regeln"}</strong>`;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function openTransactionDialog() {
    $("#transaction-form").reset();
    transactionKind = "expense";
    $$(".entry-tab").forEach((tab) => tab.classList.toggle("selected", tab.dataset.kind === transactionKind));
    setCategories($("#category"), transactionKind);
    $("#transaction-date").value = today;
    $("#entry-dialog").showModal();
    $("#description").focus();
  }

  function openRecurringDialog() {
    $("#recurring-form").reset();
    recurringKind = "expense";
    $$(".recurring-tab").forEach((tab) => tab.classList.toggle("selected", tab.dataset.kind === recurringKind));
    setCategories($("#recurring-category"), recurringKind);
    $("#recurring-start").value = today;
    $("#recurring-dialog").showModal();
    $("#recurring-description").focus();
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Spracheingabe wird von diesem Browser nicht unterstützt.");
      return;
    }
    if (speechRecognition) {
      speechRecognition.stop();
      return;
    }
    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = "de-DE";
    speechRecognition.interimResults = false;
    speechRecognition.maxAlternatives = 1;
    const button = $("#voice-button");
    const hint = $("#voice-hint");
    button.classList.add("listening");
    hint.textContent = "Ich höre zu …";
    speechRecognition.onresult = (event) => {
      const text = event.results[0][0].transcript.trim();
      $("#description").value = text;
      const amount = parseSpokenAmount(text);
      if (amount) $("#amount").value = amount.toFixed(2);
      const spokenIncome = /\b(einnahme|bekommen|verdient|gehalt|erstattung|erhalten)\b/i.test(text);
      transactionKind = spokenIncome ? "income" : "expense";
      $$(".entry-tab").forEach((tab) => tab.classList.toggle("selected", tab.dataset.kind === transactionKind));
      const category = suggestCategory(text, transactionKind);
      setCategories($("#category"), transactionKind, category);
      hint.textContent = `Erkannt: ${text}${amount ? ` · ${euro(amount)}` : ""} · Kategorie: ${category}`;
      if (!amount) $("#amount").focus();
    };
    speechRecognition.onerror = (event) => {
      hint.textContent = event.error === "not-allowed" ? "Mikrofonzugriff verweigert. Bitte Browserberechtigung prüfen." : "Spracherkennung fehlgeschlagen. Bitte erneut versuchen.";
    };
    speechRecognition.onend = () => {
      speechRecognition = null;
      button.classList.remove("listening");
      if (hint.textContent === "Ich höre zu …") hint.textContent = "Tipp: „12 Euro für Kaffee“ – Spracheingabe ist abhängig vom Browser.";
    };
    try {
      speechRecognition.start();
    } catch (error) {
      speechRecognition = null;
      button.classList.remove("listening");
      hint.textContent = "Spracherkennung konnte nicht gestartet werden.";
      console.error("Spracherkennung konnte nicht gestartet werden.", error);
    }
  }

  function onVoiceDescriptionInput() {
    const description = $("#description").value;
    const category = suggestCategory(description, transactionKind);
    setCategories($("#category"), transactionKind, category);
  }

  function updatePeriod(next) {
    period = next;
    periodOffset = 0;
    $$(".period-option").forEach((button) => button.classList.toggle("active", button.dataset.period === period));
    $("#custom-dates").hidden = period !== "custom";
    if (period === "custom") {
      $("#date-from").value ||= dateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      $("#date-to").value ||= today;
    }
    render();
  }

  function movePeriod(direction) {
    if (period === "custom") return;
    periodOffset += direction;
    render();
  }

  function exportData() {
    const content = JSON.stringify({ app: "Moneta", version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    link.download = `moneta-finanzdaten-${today}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast("Dein Datenexport wurde heruntergeladen.");
  }

  async function importData(file) {
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || !Array.isArray(imported.transactions) || !Array.isArray(imported.recurring) ||
          !imported.transactions.every(isTransaction) || !imported.recurring.every(isRecurring)) {
        showToast("Die Datei enthält keine gültigen Moneta-Daten.");
        return;
      }
      if ((state.transactions.length || state.recurring.length) &&
          !window.confirm("Deine aktuellen Daten werden durch den Import ersetzt. Hast du vorher ein Backup erstellt?")) return;
      const previousState = state;
      state = { transactions: imported.transactions, recurring: imported.recurring };
      if (!saveState()) {
        state = previousState;
        render();
        return;
      }
      showToast("Deine Daten wurden importiert.");
    } catch (error) {
      console.error("Die ausgewählte Sicherungsdatei konnte nicht importiert werden.", error);
      showToast("Die Sicherungsdatei ist ungültig oder konnte nicht gelesen werden.");
    }
  }

  function bindEvents() {
    $("#open-transaction").addEventListener("click", openTransactionDialog);
    $("#add-recurring").addEventListener("click", openRecurringDialog);
    $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
    $$(".entry-tab").forEach((button) => button.addEventListener("click", () => {
      transactionKind = button.dataset.kind;
      $$(".entry-tab").forEach((tab) => tab.classList.toggle("selected", tab === button));
      setCategories($("#category"), transactionKind, suggestCategory($("#description").value, transactionKind));
    }));
    $$(".recurring-tab").forEach((button) => button.addEventListener("click", () => {
      recurringKind = button.dataset.kind;
      $$(".recurring-tab").forEach((tab) => tab.classList.toggle("selected", tab === button));
      setCategories($("#recurring-category"), recurringKind);
    }));
    $("#description").addEventListener("input", onVoiceDescriptionInput);
    $("#voice-button").addEventListener("click", startVoiceInput);
    $("#transaction-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast("Bitte gib einen gültigen Betrag ein.");
        return;
      }
      const transaction = {
        id: crypto.randomUUID(),
        description: String(form.get("description")).trim(),
        amount,
        date: String(form.get("date")),
        category: String(form.get("category")),
        kind: transactionKind
      };
      state.transactions.push(transaction);
      if (!saveState()) {
        state.transactions.pop();
        return;
      }
      event.currentTarget.closest("dialog").close();
      showToast("Buchung gespeichert.");
    });
    $("#recurring-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get("amount"));
      const start = String(form.get("start"));
      const end = String(form.get("end"));
      if (!Number.isFinite(amount) || amount <= 0 || (end && end < start)) {
        showToast("Bitte prüfe Betrag und Enddatum.");
        return;
      }
      const recurring = {
        id: crypto.randomUUID(),
        description: String(form.get("description")).trim(),
        amount,
        category: String(form.get("category")),
        kind: recurringKind,
        start,
        end,
        frequency: String(form.get("frequency"))
      };
      state.recurring.push(recurring);
      if (!saveState()) {
        state.recurring.pop();
        return;
      }
      event.currentTarget.closest("dialog").close();
      showToast("Wiederkehrende Buchung gespeichert.");
    });
    $("#period-prev").addEventListener("click", () => movePeriod(-1));
    $("#period-next").addEventListener("click", () => movePeriod(1));
    $$(".period-option").forEach((button) => button.addEventListener("click", () => updatePeriod(button.dataset.period)));
    $("#date-from").addEventListener("change", render);
    $("#date-to").addEventListener("change", render);
    $("#export-button").addEventListener("click", exportData);
    $("#import-button").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", (event) => {
      const [file] = event.currentTarget.files;
      if (file) importData(file);
      event.currentTarget.value = "";
    });
    $("#view-all").addEventListener("click", () => {
      $("#transactions").scrollIntoView({ behavior: "smooth" });
      showToast("Die letzten Buchungen für den Zeitraum werden angezeigt.");
    });
    $("#category-period").addEventListener("click", () => {
      $("#insights").scrollIntoView({ behavior: "smooth" });
      showToast("Die fünf größten Kategorien für den Zeitraum.");
    });
    document.addEventListener("click", (event) => {
      const transactionButton = event.target.closest("[data-delete-transaction]");
      const recurringButton = event.target.closest("[data-delete-recurring]");
      if (transactionButton) {
        const index = state.transactions.findIndex((item) => item.id === transactionButton.dataset.deleteTransaction);
        if (index < 0) return;
        const [removed] = state.transactions.splice(index, 1);
        if (!saveState()) {
          state.transactions.splice(index, 0, removed);
          render();
          return;
        }
        showToast("Buchung gelöscht.");
      }
      if (recurringButton) {
        const index = state.recurring.findIndex((item) => item.id === recurringButton.dataset.deleteRecurring);
        if (index < 0) return;
        const [removed] = state.recurring.splice(index, 1);
        if (!saveState()) {
          state.recurring.splice(index, 0, removed);
          render();
          return;
        }
        showToast("Wiederholung gelöscht.");
      }
    });
    $$(".nav-link[href]").forEach((link) => link.addEventListener("click", () => {
      $$(".nav-link[href]").forEach((item) => {
        item.classList.toggle("active", item === link);
        if (item === link) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
    }));
  }

  function init() {
    const hour = new Date().getHours();
    $("#greeting").textContent = hour < 11 ? "GUTEN MORGEN" : hour < 18 ? "GUTEN TAG" : "GUTEN ABEND";
    setCategories($("#category"), "expense");
    setCategories($("#recurring-category"), "expense");
    $("#transaction-date").value = today;
    $("#recurring-start").value = today;
    bindEvents();
    render();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Offline-Modus konnte nicht eingerichtet werden.", error));
    }
  }

  init();
})();
