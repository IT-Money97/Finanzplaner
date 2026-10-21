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
  let bulkVoiceActive = false;
  let voiceDrafts = [];

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
    const numberPattern = "\\d{1,3}(?:[.\\s]\\d{3})*(?:[,.]\\d{1,2})?|\\d+(?:[,.]\\d{1,2})?";
    const withCurrency = text.match(new RegExp(`(?:€\\s*(${numberPattern})|(${numberPattern})\\s*(?:€|euro|eur))`, "i"));
    if (withCurrency) {
      const amount = normalizeAmount(withCurrency[1] || withCurrency[2]);
      if (!amount || !withCurrency[2]) return amount;
      const cents = spokenCentsAfterCurrency(text);
      return cents === null ? amount : amount + cents / 100;
    }
    const spokenAmount = parseGermanAmount(text);
    if (spokenAmount) return spokenAmount;
    const numericMatches = [...text.matchAll(new RegExp(numberPattern, "g"))];
    const match = numericMatches.find((candidate) => {
      const before = text.slice(Math.max(0, candidate.index - 16), candidate.index);
      const after = text.slice(candidate.index + candidate[0].length);
      return !/\b(?:am|jeden|jedem|den)\s*$/i.test(before) &&
        !/^\s*\.?\s*(?:(?:des|im)\s*)?monats?\b/i.test(after);
    });
    return match ? normalizeAmount(match[0]) : null;
  }

  function normalizeAmount(value) {
    const raw = value.replace(/\s/g, "");
    let normalized;
    if (raw.includes(",") && raw.includes(".")) normalized = raw.replace(/\./g, "").replace(",", ".");
    else if (raw.includes(",")) normalized = raw.replace(",", ".");
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, "");
    else normalized = raw;
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function parseGermanAmount(text) {
    const euroIndex = text.search(/\b(?:euro|eur)\b/i);
    if (euroIndex >= 0) {
      const whole = parseGermanWordNumber(text.slice(0, euroIndex));
      if (!whole) return null;
      const suffix = text.slice(euroIndex).replace(/^\s*(?:euro|eur)\b/i, "");
      const cents = spokenCentsFromText(suffix);
      return cents === null ? whole : whole + cents / 100;
    }
    return parseGermanWordNumber(text);
  }

  function spokenCentsAfterCurrency(text) {
    const euroMatch = text.match(/\b(?:euro|eur)\b/i);
    if (!euroMatch) return null;
    return spokenCentsFromText(text.slice(euroMatch.index + euroMatch[0].length));
  }

  function spokenCentsFromText(text) {
    const match = text.match(/^\s*(?:und\s+)?(\d{1,2}|[a-zäöüß]+)(?:\s*(?:cent|cents))?\b/i);
    if (!match) return null;
    const cents = /^\d+$/.test(match[1]) ? Number(match[1]) : parseGermanWordNumber(match[1]);
    return Number.isFinite(cents) && cents > 0 && cents < 100 ? cents : null;
  }

  function parseGermanWordNumber(text) {
    const numberWords = {
      null: 0, ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6,
      sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14,
      fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
      dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80,
      neunzig: 90, hundert: 100, tausend: 1000
    };
    const unitWords = [["ein", 1], ["zwei", 2], ["drei", 3], ["vier", 4], ["fünf", 5], ["sechs", 6], ["sieben", 7], ["acht", 8], ["neun", 9]];
    const tensWords = [["zwanzig", 20], ["dreißig", 30], ["dreissig", 30], ["vierzig", 40], ["fünfzig", 50], ["sechzig", 60], ["siebzig", 70], ["achtzig", 80], ["neunzig", 90]];
    for (const [unitWord, unit] of unitWords) {
      for (const [tenWord, ten] of tensWords) numberWords[`${unitWord}und${tenWord}`] = ten + unit;
      numberWords[`${unitWord}hundert`] = unit * 100;
      numberWords[`${unitWord}tausend`] = unit * 1000;
    }
    const words = text.toLocaleLowerCase("de-DE").match(/\b[a-zäöüß]+\b/g) || [];
    const units = words.map((word) => numberWords[word]).filter((value) => Number.isFinite(value));
    if (!units.length) return null;
    let total = 0;
    let current = 0;
    for (const value of units) {
      if (value === 100 || value === 1000) {
        current = Math.max(1, current) * value;
        if (value === 1000) {
          total += current;
          current = 0;
        }
      } else if (value >= 20 && value < 100 && current > 0 && current < 10) current += value;
      else current += value;
    }
    total += current;
    if (/\b(komma|und)\b/.test(text.toLocaleLowerCase("de-DE"))) {
      const decimals = text.toLocaleLowerCase("de-DE").split(/\b(?:komma|und)\b/)[1];
      if (decimals && /\b(cents?|cent|pfennig)\b/.test(decimals)) {
        const decimalUnits = (decimals.match(/\b[a-zäöüß]+\b/g) || [])
          .map((word) => numberWords[word]).filter((value) => Number.isFinite(value));
        const decimal = decimalUnits.reduce((sum, value) => sum + value, 0);
        return total + decimal / 100;
      }
    }
    return total > 0 && total <= 10000000 ? total : null;
  }

  function splitVoiceStatements(text) {
    return text
      .replace(/\r/g, "\n")
      .replace(/(\d)\.(?=\d)/g, "$1§MONETA_DOT§")
      .replace(/\b(\d{1,2})\.(?=\s*(?:des|im|jeden|monat|als|kriege|bekomme|erhalte)\b)/gi, "$1 ")
      .split(/\n+|[.!?;]+/g)
      .map((statement) => statement.replace(/§MONETA_DOT§/g, "."))
      .flatMap((statement) => statement.split(/\s+(?:und dann|außerdem|zusätzlich|danach)\s+/i))
      .map((statement) => statement.trim())
      .filter(Boolean);
  }

  function voiceKind(statement) {
    return /\b(einnahme|einnahmen|gehalt|lohn|bekomme|bekommst|erhalte|erhält|verdiene|verdienst|rückerstattung|erstattung)\b/i.test(statement)
      ? "income" : "expense";
  }

  function voiceFrequency(statement) {
    if (/\b(jährlich|jährliche|jedes jahr|pro jahr|jährlich wiederkehrend)\b/i.test(statement)) return "yearly";
    if (/\b(monatlich|monatliche|jeden monat|jedes monat|pro monat|(?:jeden|am)\s+\d{1,2}\.?\s*(?:(?:des|im)\s*)?monats?)\b/i.test(statement)) return "monthly";
    return "once";
  }

  function recurringDay(statement) {
    const match = statement.match(/\b(?:jeden\s+)?(\d{1,2})\.?\s*(?:tag\s+)?(?:des|im)?\s*monats\b|\bam\s+(\d{1,2})\.?/i);
    const day = match ? Number(match[1] || match[2]) : null;
    return day && day <= 31 ? day : null;
  }

  function nextOccurrenceForDay(day, frequency) {
    const now = new Date();
    const monthOffset = frequency === "monthly" && day < now.getDate() ? 1 : 0;
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = frequency === "yearly" ? now.getFullYear() : first.getFullYear();
    const month = frequency === "yearly" ? now.getMonth() : first.getMonth();
    const target = new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
    if (frequency === "yearly" && target < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      target.setFullYear(target.getFullYear() + 1);
    }
    return dateString(target);
  }

  function cleanVoiceDescription(statement) {
    const numberPattern = "\\d{1,3}(?:[.\\s]\\d{3})*(?:[,.]\\d{1,2})?|\\d+(?:[,.]\\d{1,2})?";
    const wordNumberPattern = "(?:null|ein|eine|einen|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|dreißig|dreissig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend|(?:ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)(?:und(?:zwanzig|dreißig|dreissig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)|hundert|tausend))";
    return statement
      .replace(new RegExp(`(?:${numberPattern})\\s*(?:€|euro|eur)\\s+(?:und\\s+)?(?:${numberPattern}|${wordNumberPattern})(?:\\s*cent)?\\b`, "gi"), " ")
      .replace(new RegExp(`\\b${wordNumberPattern}\\s+euro\\s+(?:und\\s+)?${wordNumberPattern}(?:\\s*cent)?\\b`, "gi"), " ")
      .replace(new RegExp(`(?:€\\s*(${numberPattern})|(${numberPattern})\\s*(?:€|euro|eur))`, "i"), " ")
      .replace(/\b(?:null|ein|eine|einen|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|dreißig|dreissig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend)\s+euro\b/gi, " ")
      .replace(/\b(?:ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)(?:und(?:zwanzig|dreißig|dreissig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)|hundert|tausend)\s+euro\b/gi, " ")
      .replace(/\b(?:jeden|jedes)\s+(?:monat|jahr)\b|\b(?:monatlich|jährlich|wöchentlich|täglich)\b/gi, " ")
      .replace(/\b(?:jeden\s+)?\d{1,2}\.?\s*(?:tag\s+)?(?:des|im)?\s*monats\b|\bam\s+\d{1,2}\.?(?:\s*(?:(?:des|im)\s*)?monats?)?/gi, " ")
      .replace(/\b(?:ich|habe|hab|als|ausgabe|ausgaben|einnahme|einnahmen|bekomme|kriege|erhalte|verdiene|kommt|kommt noch|geht|jeden|regelmäßig|regelmaessig|wiederkehrend|für|fuer|euro|eur)\b/gi, " ")
      .replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").trim();
  }

  function parseVoiceStatements(text) {
    const statements = splitVoiceStatements(text);
    const records = [];
    const rejected = [];
    for (const statement of statements) {
      const amount = parseSpokenAmount(statement);
      if (!amount) {
        rejected.push(statement);
        continue;
      }
      const kind = voiceKind(statement);
      const frequency = voiceFrequency(statement);
      const day = recurringDay(statement);
      const date = frequency === "once" ? today : nextOccurrenceForDay(day || new Date().getDate(), frequency);
      const category = suggestCategory(statement, kind);
      const description = cleanVoiceDescription(statement) || category;
      records.push({ id: crypto.randomUUID(), description, amount, kind, category, frequency, date });
    }
    return { records, rejected };
  }

  function activeDateInput(id) {
    const insightsActive = $('.page-view[data-page="insights"]')?.classList.contains("active");
    if (insightsActive && id === "date-from") return $("#insights-date-from");
    if (insightsActive && id === "date-to") return $("#insights-date-to");
    return $(`#${id}`);
  }

  function getRange() {
    const now = new Date();
    let start;
    let end;
    if (period === "custom") {
      const from = activeDateInput("date-from").value;
      const to = activeDateInput("date-to").value;
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
    $("#transactions-period-label").textContent = periodLabel();
    $("#insights-period-label").textContent = periodLabel();
    $("#transactions-income").textContent = euro(income);
    $("#transactions-expense").textContent = euro(expense);
    $("#insights-income").textContent = euro(income);
    $("#insights-expense").textContent = euro(expense);
    $("#insights-balance").textContent = euro(income - expense);
    $("#balance-value").classList.toggle("negative-value", income < expense);
    $("#insights-balance").classList.toggle("negative-value", income < expense);
    renderChart(start, end, rangeTransactions);
    renderCategories(rangeTransactions);
    renderTransactions(start, end);
    renderRecurring(start, end);
    renderRecurringSummary();
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
    const chartBottom = 148;
    const chartHeight = chartBottom - chartTop;
    const groupWidth = (width - left - right) / buckets.length;
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><title>Einnahmen und Ausgaben im Zeitraum</title>`;
    for (let i = 0; i < 4; i++) {
      const y = chartTop + i * chartHeight / 3;
      svg += `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="#edf1ee" stroke-dasharray="3 5"/>`;
    }
    const line = (kind, color) => {
      const points = buckets.map((bucket, index) => {
        const x = left + groupWidth * (index + .5);
        const y = chartBottom - bucket[kind] / max * chartHeight;
        return `${x},${y}`;
      }).join(" ");
      let output = `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      buckets.forEach((bucket, index) => {
        const x = left + groupWidth * (index + .5);
        const y = chartBottom - bucket[kind] / max * chartHeight;
        output += `<circle cx="${x}" cy="${y}" r="4" fill="white" stroke="${color}" stroke-width="2"><title>${escapeHtml(bucket.label)} ${kind === "income" ? "Einnahmen" : "Ausgaben"}: ${euro(bucket[kind])}</title></circle>`;
        output += `<text x="${x}" y="178" text-anchor="middle" font-size="10" fill="#9aa49e" font-family="sans-serif">${escapeHtml(bucket.label)}</text>`;
      });
      return output;
    };
    svg += line("income", "#54ad7d");
    svg += line("expense", "#e48d7d");
    svg += "</svg>";
    wrapper.innerHTML = svg;
  }

  function renderCategories(items) {
    const expenses = items.filter((item) => item.kind === "expense");
    const totals = new Map();
    for (const item of expenses) totals.set(item.category, (totals.get(item.category) || 0) + item.amount);
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const target = $("#category-list");
    const donut = $("#category-donut");
    if (!sorted.length) {
      target.innerHTML = '<div class="empty-state">Noch keine Ausgaben in diesem Zeitraum.</div>';
      donut.innerHTML = "";
      return;
    }
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    const circumference = 2 * Math.PI * 49;
    let offset = 0;
    const circles = sorted.map(([category, total]) => {
      const [icon, color] = categoryMeta[category] || categoryMeta.Sonstiges;
      const length = total / totalExpenses * circumference;
      const circle = `<circle cx="62" cy="62" r="49" fill="none" stroke="${color}" stroke-width="15" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 62 62)"><title>${category}: ${euro(total)}</title></circle>`;
      offset += length;
      return circle;
    }).join("");
    donut.innerHTML = `<svg viewBox="0 0 124 124" role="img" aria-label="Ausgaben gesamt ${euro(totalExpenses)}"><circle cx="62" cy="62" r="49" fill="none" stroke="#edf2ee" stroke-width="15"/>${circles}<text x="62" y="59" text-anchor="middle" fill="#819087" font-size="8" font-family="sans-serif">GESAMT</text><text x="62" y="73" text-anchor="middle" fill="#23342b" font-size="11" font-weight="700" font-family="sans-serif">${escapeHtml(euro(totalExpenses))}</text></svg>`;
    target.innerHTML = sorted.slice(0, 5).map(([category, total]) => {
      const [icon, color] = categoryMeta[category] || categoryMeta.Sonstiges;
      return `<div class="category-row"><span class="category-icon" style="color:${color}">${icon}</span><div><div class="category-name"><span>${category}</span><span>${Math.round(total / totalExpenses * 100)}%</span></div><div class="category-track"><div class="category-fill" style="width:${total / sorted[0][1] * 100}%;background:${color}"></div></div></div><span class="category-amount">${euro(total)}</span></div>`;
    }).join("");
  }

  function renderTransactions(start, end) {
    const filter = $("#transaction-filter").value;
    const list = state.transactions
      .filter((item) => item.date >= start && item.date <= end && (filter === "all" || item.kind === filter))
      .sort((a, b) => b.date.localeCompare(a.date));
    const row = (item) => {
      const [icon] = categoryMeta[item.category] || categoryMeta.Sonstiges;
      return `<div class="transaction-row"><span class="transaction-icon">${icon}</span><div class="transaction-details"><div class="transaction-name">${escapeHtml(item.description)}</div><div class="transaction-meta"><span>${item.category}</span><span>·</span><span>${formatDate(item.date)}</span></div></div><div class="transaction-amount ${item.kind}">${item.kind === "income" ? "+" : "−"}${euro(item.amount)}</div><button class="delete-action" type="button" data-delete-transaction="${item.id}" aria-label="Buchung ${escapeHtml(item.description)} löschen"><span class="delete-icon" aria-hidden="true">⌫</span><span>Löschen</span></button></div>`;
    };
    const empty = filter === "all" ? "In diesem Zeitraum gibt es noch keine Buchungen." : `Keine ${filter === "income" ? "Einnahmen" : "Ausgaben"} in diesem Zeitraum.`;
    $("#transaction-list").innerHTML = list.length ? list.map(row).join("") : `<div class="empty-state">${empty}</div>`;
    const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    $("#recent-transactions").innerHTML = recent.length
      ? recent.map(row).join("")
      : '<div class="empty-state">Noch keine Buchungen. Füge deine erste hinzu.</div>';
    $("#transactions-count").textContent = new Intl.NumberFormat("de-DE").format(list.length);
    $("#transactions-list-title").textContent = `${filter === "all" ? "Alle Buchungen" : filter === "income" ? "Einnahmen" : "Ausgaben"} · ${list.length}`;
  }

  function renderRecurring(start, end) {
    const upcoming = state.recurring.map((item) => ({ ...item, next: occurrences(item, today, item.end || "9999-12-31")[0]?.date })).filter((item) => item.next).sort((a, b) => a.next.localeCompare(b.next));
    const list = $("#recurring-list");
    list.innerHTML = upcoming.length ? upcoming.map((item) => {
      const [icon] = categoryMeta[item.category] || categoryMeta.Sonstiges;
      return `<div class="recurring-row"><span class="recurring-item-icon">${icon}</span><div class="recurring-details"><div class="recurring-name">${escapeHtml(item.description)}</div><div class="recurring-meta">${item.kind === "income" ? "Einnahme" : "Ausgabe"} · ${item.category} · ${item.frequency === "monthly" ? "monatlich" : "jährlich"} · nächste Zahlung ${formatDate(item.next)}</div></div><div class="recurring-amount ${item.kind}">${item.kind === "income" ? "+" : "−"}${euro(item.amount)}</div><button class="delete-action" type="button" data-delete-recurring="${item.id}" aria-label="Regel ${escapeHtml(item.description)} löschen"><span class="delete-icon" aria-hidden="true">⌫</span><span>Entfernen</span></button></div>`;
    }).join("") : '<div class="empty-state">Füge Abos, Versicherungen oder regelmäßige Einnahmen hinzu.</div>';
    const inPeriod = state.recurring.flatMap((rule) => occurrences(rule, start, end));
    const recurringIncome = inPeriod.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const recurringExpense = inPeriod.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const total = $("#recurring-total");
    total.hidden = !inPeriod.length;
    total.innerHTML = `<span>Im Zeitraum: Einnahmen ${euro(recurringIncome)} · Ausgaben ${euro(recurringExpense)}</span><strong>${state.recurring.length} ${state.recurring.length === 1 ? "Regel" : "Regeln"}</strong>`;
  }

  function renderRecurringSummary() {
    const monthlyIncome = state.recurring.reduce((sum, item) => {
      if (item.kind !== "income") return sum;
      return sum + item.amount / (item.frequency === "yearly" ? 12 : 1);
    }, 0);
    const monthlyExpense = state.recurring.reduce((sum, item) => {
      if (item.kind !== "expense") return sum;
      return sum + item.amount / (item.frequency === "yearly" ? 12 : 1);
    }, 0);
    $("#recurring-monthly-income").textContent = euro(monthlyIncome);
    $("#recurring-monthly-expense").textContent = euro(monthlyExpense);
    $("#recurring-count").textContent = new Intl.NumberFormat("de-DE").format(state.recurring.length);
  }

  function switchPage(pageId, updateHash = true) {
    const page = $(`.page-view[data-page="${pageId}"]`) || $('.page-view[data-page="dashboard"]');
    $$(".page-view").forEach((view) => {
      const active = view === page;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });
    $$("[data-page-link]").forEach((link) => {
      const active = link.getAttribute("href") === `#${page.id}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (updateHash && location.hash !== `#${page.id}`) history.replaceState(null, "", `#${page.id}`);
    window.scrollTo(0, 0);
    render();
  }

  function onCustomDateChange(event) {
    const date = event.currentTarget;
    if (date.id === "date-from") $("#insights-date-from").value = date.value;
    else if (date.id === "date-to") $("#insights-date-to").value = date.value;
    else if (date.id === "insights-date-from") $("#date-from").value = date.value;
    else $("#date-to").value = date.value;
    render();
  }

  function navigatePeriod(direction) {
    if (period === "custom") return;
    periodOffset += direction;
    render();
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function openTransactionDialog(kind = "expense") {
    $("#transaction-form").reset();
    transactionKind = kind;
    $$(".entry-tab").forEach((tab) => tab.classList.toggle("selected", tab.dataset.kind === transactionKind));
    setCategories($("#category"), transactionKind);
    $("#transaction-date").value = today;
    $("#transaction-repeat-options").hidden = true;
    $("#transaction-date-label").textContent = "Datum";
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

  function renderVoiceDrafts() {
    const preview = $("#voice-preview");
    const list = $("#voice-draft-list");
    preview.hidden = !voiceDrafts.length;
    $("#preview-count").textContent = `${voiceDrafts.length} ${voiceDrafts.length === 1 ? "Buchung erkannt" : "Buchungen erkannt"}`;
    list.innerHTML = voiceDrafts.map((draft) => `
      <article class="voice-draft" data-draft-id="${draft.id}">
        <div class="voice-draft-heading">
          <strong>${draft.frequency === "once" ? "Einmalig" : draft.frequency === "monthly" ? "Jeden Monat" : "Jedes Jahr"}</strong>
          <button class="delete-draft" type="button" data-remove-draft="${draft.id}" aria-label="Erkannte Buchung entfernen">×</button>
        </div>
        <label class="field-label">Beschreibung<input data-draft-field="description" value="${escapeHtml(draft.description)}" maxlength="100"></label>
        <div class="field-row">
          <label class="field-label">Betrag (€)<input data-draft-field="amount" type="number" min="0.01" step="0.01" value="${draft.amount.toFixed(2)}"></label>
          <label class="field-label">Art<select data-draft-field="kind"><option value="expense" ${draft.kind === "expense" ? "selected" : ""}>Ausgabe</option><option value="income" ${draft.kind === "income" ? "selected" : ""}>Einnahme</option></select></label>
        </div>
        <div class="field-row">
          <label class="field-label">Kategorie<select data-draft-field="category">${categories[draft.kind].map((category) => `<option value="${category}" ${category === draft.category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
          <label class="field-label">Wiederholung<select data-draft-field="frequency"><option value="once" ${draft.frequency === "once" ? "selected" : ""}>Einmalig</option><option value="monthly" ${draft.frequency === "monthly" ? "selected" : ""}>Monatlich</option><option value="yearly" ${draft.frequency === "yearly" ? "selected" : ""}>Jährlich</option></select></label>
        </div>
        <label class="field-label">Nächstes Datum<input data-draft-field="date" type="date" value="${draft.date}"></label>
      </article>`).join("");
  }

  function updateDraftField(target) {
    const card = target.closest("[data-draft-id]");
    const draft = voiceDrafts.find((item) => item.id === card?.dataset.draftId);
    if (!draft) return;
    const field = target.dataset.draftField;
    draft[field] = field === "amount" ? Number(target.value) : target.value;
    if (field === "kind") {
      const categorySelect = card.querySelector('[data-draft-field="category"]');
      const suggested = suggestCategory(draft.description, draft.kind);
      categorySelect.innerHTML = categories[draft.kind].map((category) => `<option value="${category}">${category}</option>`).join("");
      categorySelect.value = suggested;
      draft.category = suggested;
    }
  }

  function analyzeVoiceInput() {
    const { records, rejected } = parseVoiceStatements($("#voice-transcript").value);
    voiceDrafts = records;
    renderVoiceDrafts();
    if (!records.length) {
      $("#bulk-voice-hint").textContent = "Ich habe keine Beträge erkannt. Sprich Betrag und Anlass, z. B. „12,99 Euro Netflix jeden Monat“.";
    } else {
      const note = rejected.length ? ` ${rejected.length} Ansage(n) ohne erkennbaren Betrag bitte ergänzen.` : "";
      $("#bulk-voice-hint").textContent = `${records.length} Buchung(en) erkannt. Die Vorschau ist noch nicht gespeichert.${note}`;
    }
  }

  function saveVoiceDrafts() {
    for (const draft of voiceDrafts) {
      if (!draft.description.trim() || !Number.isFinite(draft.amount) || draft.amount <= 0 ||
          !isDateValue(draft.date) || !categories[draft.kind]?.includes(draft.category)) {
        showToast("Bitte prüfe Beschreibung, Betrag, Datum und Kategorie in jeder Zeile.");
        return;
      }
    }
    if (!voiceDrafts.length) {
      showToast("Erst Ansagen erfassen und erkennen lassen.");
      return;
    }
    const previousState = state;
    state = {
      transactions: [...state.transactions],
      recurring: [...state.recurring]
    };
    for (const draft of voiceDrafts) {
      if (draft.frequency === "once") {
        state.transactions.push({
          id: draft.id, description: draft.description.trim(), amount: draft.amount,
          date: draft.date, category: draft.category, kind: draft.kind
        });
      } else {
        state.recurring.push({
          id: draft.id, description: draft.description.trim(), amount: draft.amount,
          start: draft.date, end: "", category: draft.category, kind: draft.kind,
          frequency: draft.frequency
        });
      }
    }
    if (!saveState()) {
      state = previousState;
      render();
      return;
    }
    $("#voice-dialog").close();
    voiceDrafts = [];
    $("#voice-transcript").value = "";
    renderVoiceDrafts();
    showToast("Die erkannten Buchungen wurden gespeichert.");
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      $("#voice-hint").textContent = "Dieser Browser unterstützt keine Spracheingabe. Du kannst die Buchung manuell eingeben.";
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
      transactionKind = voiceKind(text);
      $$(".entry-tab").forEach((tab) => tab.classList.toggle("selected", tab.dataset.kind === transactionKind));
      const category = suggestCategory(text, transactionKind);
      setCategories($("#category"), transactionKind, category);
      const frequency = voiceFrequency(text);
      $("#transaction-recurring").checked = frequency !== "once";
      $("#transaction-repeat-options").hidden = frequency === "once";
      $("#transaction-date-label").textContent = frequency === "once" ? "Datum" : "Nächster Zahlungstag";
      if (frequency !== "once") {
        $("#transaction-frequency").value = frequency;
        $("#transaction-date").value = nextOccurrenceForDay(recurringDay(text) || new Date().getDate(), frequency);
      }
      hint.textContent = `Erkannt: ${text}${amount ? ` · ${euro(amount)}` : ""} · ${transactionKind === "income" ? "Einnahme" : "Ausgabe"} · ${category}${frequency !== "once" ? ` · ${frequency === "monthly" ? "monatlich" : "jährlich"}` : ""}`;
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

  function startBulkVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const button = $("#bulk-voice-button");
    const hint = $("#bulk-voice-hint");
    if (!SpeechRecognition) {
      bulkVoiceActive = false;
      hint.textContent = "Dieser Browser unterstützt keine Spracheingabe. Tippe deine Ansagen einfach in das Textfeld.";
      $("#voice-transcript").focus();
      return;
    }
    if (speechRecognition) {
      bulkVoiceActive = false;
      speechRecognition.stop();
      return;
    }
    bulkVoiceActive = true;
    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = "de-DE";
    speechRecognition.continuous = true;
    speechRecognition.interimResults = false;
    speechRecognition.maxAlternatives = 1;
    button.textContent = "■ Aufnahme beenden";
    button.classList.add("listening");
    hint.textContent = "Ich höre zu. Sprich mehrere Buchungen nacheinander; tippe zum Beenden erneut.";
    speechRecognition.onresult = (event) => {
      const finalParts = [];
      for (let index = event.resultIndex; index < event.results.length; index++) {
        if (event.results[index].isFinal) finalParts.push(event.results[index][0].transcript.trim());
      }
      if (finalParts.length) {
        const transcript = $("#voice-transcript");
        transcript.value = [transcript.value.trim(), ...finalParts].filter(Boolean).join("\n");
        transcript.scrollTop = transcript.scrollHeight;
      }
    };
    speechRecognition.onerror = (event) => {
      const message = event.error === "not-allowed"
        ? "Mikrofonzugriff verweigert. Erlaube Mikrofonzugriff in den Browser-Einstellungen."
        : event.error === "network"
          ? "Spracherkennung benötigt eine Netzwerkverbindung. Du kannst den Text stattdessen eingeben."
          : `Spracheingabe fehlgeschlagen (${event.error}). Tippe den Text stattdessen ein.`;
      hint.textContent = message;
      if (["not-allowed", "service-not-allowed", "audio-capture", "network"].includes(event.error)) bulkVoiceActive = false;
    };
    speechRecognition.onend = () => {
      speechRecognition = null;
      button.classList.remove("listening");
      if (bulkVoiceActive && $("#voice-dialog").open) {
        hint.textContent = "Kurze Pause erkannt – Aufnahme wird fortgesetzt …";
        setTimeout(() => {
          if (bulkVoiceActive && $("#voice-dialog").open && !speechRecognition) startBulkVoiceInput();
        }, 250);
        return;
      }
      button.textContent = "♩ Aufnahme fortsetzen";
      if (hint.textContent.startsWith("Ich höre zu")) hint.textContent = "Aufnahme beendet. Ergänze weitere Ansagen oder wähle „Ansagen erkennen“.";
    };
    try {
      speechRecognition.start();
    } catch (error) {
      bulkVoiceActive = false;
      speechRecognition = null;
      button.textContent = "♩ Aufnahme starten";
      button.classList.remove("listening");
      hint.textContent = "Aufnahme konnte nicht gestartet werden. Prüfe die Mikrofonfreigabe.";
      console.error("Mehrfach-Spracherkennung konnte nicht gestartet werden.", error);
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
    $(".insights-custom-dates").hidden = period !== "custom";
    if (period === "custom") {
      const firstDay = dateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      $("#date-from").value ||= firstDay;
      $("#insights-date-from").value ||= $("#date-from").value;
      $("#date-to").value ||= today;
      $("#insights-date-to").value ||= $("#date-to").value;
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
    $("#open-transaction").addEventListener("click", () => openTransactionDialog());
    $("#transactions-add").addEventListener("click", () => openTransactionDialog());
    $("#transactions-voice").addEventListener("click", () => $("#open-voice-entry").click());
    $("#add-recurring").addEventListener("click", openRecurringDialog);
    $("#quick-add-expense").addEventListener("click", () => openTransactionDialog("expense"));
    $("#quick-add-income").addEventListener("click", () => openTransactionDialog("income"));
    $("#quick-recurring").addEventListener("click", () => switchPage("recurring"));
    $("#open-voice-entry").addEventListener("click", () => {
      bulkVoiceActive = false;
      voiceDrafts = [];
      $("#voice-transcript").value = "";
      $("#voice-preview").hidden = true;
      $("#bulk-voice-hint").textContent = "Erkanntes bitte vor dem Speichern prüfen. Spracheingabe hängt von Browser und Mikrofonfreigabe ab.";
      $("#voice-dialog").showModal();
    });
    $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
    $("#voice-dialog").addEventListener("close", () => {
      bulkVoiceActive = false;
      if (speechRecognition) speechRecognition.stop();
      $("#bulk-voice-button").classList.remove("listening");
      $("#bulk-voice-button").textContent = "♩ Aufnahme starten";
    });
    $("#entry-dialog").addEventListener("close", () => {
      if (speechRecognition) speechRecognition.stop();
      $("#voice-button").classList.remove("listening");
    });
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
    $("#transaction-recurring").addEventListener("change", (event) => {
      $("#transaction-repeat-options").hidden = !event.currentTarget.checked;
      $("#transaction-date-label").textContent = event.currentTarget.checked ? "Erster Zahlungstag" : "Datum";
    });
    $("#bulk-voice-button").addEventListener("click", startBulkVoiceInput);
    $("#analyze-voice-button").addEventListener("click", analyzeVoiceInput);
    $("#save-voice-drafts").addEventListener("click", saveVoiceDrafts);
    $("#clear-voice-drafts").addEventListener("click", () => {
      voiceDrafts = [];
      renderVoiceDrafts();
      $("#voice-preview").hidden = true;
    });
    $("#voice-draft-list").addEventListener("input", (event) => updateDraftField(event.target));
    $("#voice-draft-list").addEventListener("change", (event) => updateDraftField(event.target));
    $("#voice-draft-list").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-draft]");
      if (!remove) return;
      voiceDrafts = voiceDrafts.filter((draft) => draft.id !== remove.dataset.removeDraft);
      renderVoiceDrafts();
    });
    $("#transaction-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast("Bitte gib einen gültigen Betrag ein.");
        return;
      }
      const description = String(form.get("description")).trim();
      if ($("#transaction-recurring").checked) {
        state.recurring.push({
          id: crypto.randomUUID(),
          description,
          amount,
          start: String(form.get("date")),
          end: "",
          category: String(form.get("category")),
          kind: transactionKind,
          frequency: $("#transaction-frequency").value
        });
      } else {
        state.transactions.push({
          id: crypto.randomUUID(),
          description,
          amount,
          date: String(form.get("date")),
          category: String(form.get("category")),
          kind: transactionKind
        });
      }
      if (!saveState()) {
        if ($("#transaction-recurring").checked) state.recurring.pop();
        else state.transactions.pop();
        return;
      }
      event.currentTarget.closest("dialog").close();
      showToast($("#transaction-recurring").checked ? "Wiederkehrende Buchung gespeichert." : "Buchung gespeichert.");
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
    ["#period-prev", "#transactions-period-prev", "#insights-period-prev"].forEach((selector) => $(selector).addEventListener("click", () => navigatePeriod(-1)));
    ["#period-next", "#transactions-period-next", "#insights-period-next"].forEach((selector) => $(selector).addEventListener("click", () => navigatePeriod(1)));
    $$(".period-option").forEach((button) => button.addEventListener("click", () => updatePeriod(button.dataset.period)));
    ["#date-from", "#date-to", "#insights-date-from", "#insights-date-to"].forEach((selector) => $(selector).addEventListener("change", onCustomDateChange));
    $("#transaction-filter").addEventListener("change", render);
    $("#export-button").addEventListener("click", exportData);
    $("#import-button").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", (event) => {
      const [file] = event.currentTarget.files;
      if (file) importData(file);
      event.currentTarget.value = "";
    });
    document.addEventListener("click", (event) => {
      const transactionButton = event.target.closest("[data-delete-transaction]");
      const recurringButton = event.target.closest("[data-delete-recurring]");
      if (transactionButton) {
        const index = state.transactions.findIndex((item) => item.id === transactionButton.dataset.deleteTransaction);
        if (index < 0) return;
        if (!window.confirm(`Buchung „${state.transactions[index].description}“ löschen?`)) return;
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
        if (!window.confirm(`Wiederholung „${state.recurring[index].description}“ löschen?`)) return;
        const [removed] = state.recurring.splice(index, 1);
        if (!saveState()) {
          state.recurring.splice(index, 0, removed);
          render();
          return;
        }
        showToast("Wiederholung gelöscht.");
      }
    });
    $$("[data-page-link]").forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      switchPage(link.hash.slice(1));
    }));
    $$("[data-go-page]").forEach((button) => button.addEventListener("click", () => switchPage(button.dataset.goPage)));
    window.addEventListener("hashchange", () => switchPage(location.hash.slice(1) || "dashboard", false));
  }

  function init() {
    const hour = new Date().getHours();
    $("#greeting").textContent = hour < 11 ? "GUTEN MORGEN" : hour < 18 ? "GUTEN TAG" : "GUTEN ABEND";
    setCategories($("#category"), "expense");
    setCategories($("#recurring-category"), "expense");
    $("#transaction-date").value = today;
    $("#recurring-start").value = today;
    bindEvents();
    switchPage(location.hash.slice(1) || "dashboard", false);
    render();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Offline-Modus konnte nicht eingerichtet werden.", error));
    }
  }

  init();
})();
