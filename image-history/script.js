(() => {
  "use strict";

  const scanner = window.ImageHistoryScanner;

  // Constants
  const SEARCH_DEBOUNCE_MS = 250;
  const THUMB_WIDTH = 320;
  const COMPOSITE_IMAGE_WIDTH = 960;
  const COPY_SUCCESS_DURATION = 2000;
  const SOFT_UPSCALE = 1.25;
  const DEFAULT_FOCUS = { x: 0.5, y: 0.3 };
  const LOGO_SRC = "../img/wikiportraits-logo-wordmark.png";
  const SANS =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const SERIF = '"Linux Libertine", Georgia, "Times New Roman", Times, serif';

  // Colors from Wikipedia's infobox styling.
  const WIKI = {
    text: "#202122",
    muted: "#54595d",
    border: "#a2a9b1",
    box: "#f8f9fa",
    head: "#eaecf0",
    imageBorder: "#c8ccd1",
    white: "#ffffff",
  };

  const PRESETS = {
    landscape: { width: 1200, height: 900 },
    square: { width: 1080, height: 1080 },
  };

  const RANGE_MONTHS = {
    "1m": 1,
    "6m": 6,
    "1y": 12,
    "2y": 24,
    "5y": 60,
    "10y": 120,
  };

  // DOM elements
  const DOM = {
    form: document.getElementById("lookupForm"),
    articleInput: document.getElementById("articleInput"),
    articleSuggestions: document.getElementById("articleSuggestions"),
    langInput: document.getElementById("langInput"),
    langSuggestions: document.getElementById("langSuggestions"),
    versionsSelect: document.getElementById("versionsSelect"),
    rangeSelect: document.getElementById("rangeSelect"),
    customRange: document.getElementById("customRange"),
    customRangeTo: document.getElementById("customRangeTo"),
    fromInput: document.getElementById("fromInput"),
    toInput: document.getElementById("toInput"),
    thoroughInput: document.getElementById("thoroughInput"),
    scanButton: document.getElementById("scanButton"),
    cancelButton: document.getElementById("cancelButton"),
    scanStatus: document.getElementById("scanStatus"),
    scanStatusText: document.getElementById("scanStatusText"),
    scanProgressBar: document.getElementById("scanProgressBar"),
    scanError: document.getElementById("scanError"),
    resultsSection: document.getElementById("resultsSection"),
    articleThumb: document.getElementById("articleThumb"),
    articleLink: document.getElementById("articleLink"),
    articleStats: document.getElementById("articleStats"),
    scanNotice: document.getElementById("scanNotice"),
    timelineNote: document.getElementById("timelineNote"),
    timelineFootnote: document.getElementById("timelineFootnote"),
    olderNote: document.getElementById("olderNote"),
    blipItem: document.getElementById("blipItem"),
    blipNote: document.getElementById("blipNote"),
    blipToggle: document.getElementById("blipToggle"),
    sampleNote: document.getElementById("sampleNote"),
    timeline: document.getElementById("timeline"),
    rangeHint: document.getElementById("rangeHint"),
    graphicToggle: document.getElementById("graphicToggle"),
    composePanel: document.getElementById("composePanel"),
    canvas: document.getElementById("previewCanvas"),
    previewHint: document.getElementById("previewHint"),
    downloadButton: document.getElementById("downloadButton"),
    copyButton: document.getElementById("copyButton"),
    licenseWarning: document.getElementById("licenseWarning"),
    beforeSelect: document.getElementById("beforeSelect"),
    afterSelect: document.getElementById("afterSelect"),
    beforeThumb: document.getElementById("beforeThumb"),
    afterThumb: document.getElementById("afterThumb"),
    presetButtons: document.getElementById("presetButtons"),
    titleInput: document.getElementById("titleInput"),
    beforeLabelInput: document.getElementById("beforeLabelInput"),
    afterLabelInput: document.getElementById("afterLabelInput"),
    fitInput: document.getElementById("fitInput"),
    focusControls: document.getElementById("focusControls"),
    beforeFocusX: document.getElementById("beforeFocusX"),
    beforeFocusY: document.getElementById("beforeFocusY"),
    afterFocusX: document.getElementById("afterFocusX"),
    afterFocusY: document.getElementById("afterFocusY"),
    attributionInput: document.getElementById("attributionInput"),
    attributionText: document.getElementById("attributionText"),
    copyAttributionButton: document.getElementById("copyAttributionButton"),
    logoInput: document.getElementById("logoInput"),
  };

  const freshEdits = () => ({
    title: false,
    beforeLabel: false,
    afterLabel: false,
  });

  const state = {
    article: null,
    scan: null,
    imageInfo: new Map(),
    periods: [],
    beforeRevid: null,
    afterRevid: null,
    showBlips: false,
    versions: null,
    picking: false,
    largeInfo: new Map(),
    focus: new Map(),
    images: new Map(),
    logo: null,
    abort: null,
    renderToken: 0,
    edited: freshEdits(),
  };

  // Helpers
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const link = (href, text, className) => {
    const node = el("a", className, text);
    node.href = href;
    node.target = "_blank";
    node.rel = "noopener";
    return node;
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrollToSection = (element) =>
    element.scrollIntoView({
      behavior: reducedMotion.matches ? "auto" : "smooth",
      block: "start",
    });

  // Dates in UTC.
  const dateFormat = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const monthFormat = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const formatDate = (iso) =>
    dateFormat.format(new Date(iso)).replace(/ /g, "\u00a0");
  const formatMonth = (iso) => monthFormat.format(new Date(iso));
  const isoNoMillis = (date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  const formatDuration = (ms) => {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (days < 1) {
      const hours = Math.floor(ms / (60 * 60 * 1000));
      return hours < 1 ? "under an hour" : plural(hours, "hour");
    }
    if (days < 60) return plural(days, "day");
    const months = Math.floor(days / 30.44);
    if (months < 24) return plural(months, "month");
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest
      ? `${plural(years, "year")}, ${plural(rest, "month")}`
      : plural(years, "year");
  };

  const truncate = (text, max) =>
    text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;

  const wikiUrl = (lang, path) => `https://${lang}.wikipedia.org/${path}`;

  const commonsFileUrl = (info, file) =>
    (info && info.descriptionurl) ||
    `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;

  const infoFor = (file) => (file ? state.imageInfo.get(file) : null);
  const isUsable = (period) => {
    const info = infoFor(period.file);
    return Boolean(info && info.exists);
  };
  const isLocalFile = (info) => Boolean(info && info.repository === "local");
  const looksNonFree = (info) =>
    Boolean(info && /fair use|non-free|copyright/i.test(info.license || ""));
  const isAnchor = (period) => Boolean(period.anchor);

  const periodEnd = (period) => {
    if (period.endTimestamp) return period.endTimestamp;
    if (state.scan && state.scan.rangeEnd) return state.scan.rangeEnd;
    return null;
  };

  const showError = (message, field) => {
    DOM.scanError.textContent = message;
    DOM.scanError.hidden = false;
    if (field) field.focus();
  };

  // Carries offending field for focusing.
  const inputError = (message, field) => {
    const err = new Error(message);
    err.field = field;
    return err;
  };

  const hideError = () => {
    DOM.scanError.hidden = true;
  };

  const setProgress = (percent, text) => {
    DOM.scanStatus.hidden = false;
    if (percent !== null) {
      DOM.scanProgressBar.style.width = `${Math.max(2, Math.min(100, percent))}%`;
      DOM.scanProgressBar.parentElement.setAttribute(
        "aria-valuenow",
        String(Math.round(percent)),
      );
    }
    DOM.scanStatusText.textContent = text;
  };

  const setScanning = (scanning) => {
    DOM.scanButton.disabled = scanning;
    DOM.scanButton.textContent = scanning ? "Scanning…" : "Show image history";
    DOM.cancelButton.hidden = !scanning;
  };

  // Time range
  const updateRangeInputs = () => {
    const custom = DOM.rangeSelect.value === "custom";
    DOM.customRange.hidden = !custom;
    DOM.customRangeTo.hidden = !custom;
  };

  DOM.rangeSelect.addEventListener("change", updateRangeInputs);

  const rangeFromForm = () => {
    const value = DOM.rangeSelect.value;
    if (value === "all") return { key: "all", start: null, end: null };
    if (value === "custom") {
      const from = DOM.fromInput.value;
      const to = DOM.toInput.value;
      if (!from)
        throw inputError(
          "Choose a start date for the custom time range.",
          DOM.fromInput,
        );
      const start = new Date(`${from}T00:00:00Z`);
      const end = to ? new Date(`${to}T23:59:59Z`) : null;
      if (
        Number.isNaN(start.getTime()) ||
        (end && Number.isNaN(end.getTime()))
      ) {
        throw inputError("The custom dates are not valid.", DOM.fromInput);
      }
      if (end && end < start)
        throw inputError("The end date is before the start date.", DOM.toInput);
      return {
        key: "custom",
        from,
        to,
        start: isoNoMillis(start),
        end: end ? isoNoMillis(end) : null,
      };
    }
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - (RANGE_MONTHS[value] || 12));
    return { key: value, start: isoNoMillis(start), end: null };
  };

  // Article lookup
  let searchTimer = null;
  let searchAbort = null;

  const updateSuggestions = async () => {
    const raw = DOM.articleInput.value.trim();
    if (raw.length < 2 || /^(https?:)?\/\//i.test(raw)) return;
    const lang = DOM.langInput.value.trim().toLowerCase();
    if (!scanner.isValidLang(lang)) return;
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    try {
      const titles = await scanner.searchTitles({
        lang,
        query: raw,
        signal: searchAbort.signal,
      });
      DOM.articleSuggestions.innerHTML = "";
      titles.forEach((title) => {
        const option = document.createElement("option");
        option.value = title;
        DOM.articleSuggestions.appendChild(option);
      });
    } catch (err) {
      if (err.name !== "AbortError")
        console.error("Suggestion lookup failed:", err);
    }
  };

  DOM.articleInput.addEventListener("input", () => {
    const parsed = scanner.parseArticleInput(
      DOM.articleInput.value,
      DOM.langInput.value,
    );
    const isUrl = /^(https?:)?\/\//i.test(DOM.articleInput.value.trim());
    if (isUrl && parsed.title) DOM.langInput.value = parsed.lang;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateSuggestions, SEARCH_DEBOUNCE_MS);
  });

  // Scanning
  const progressText = (progress) => {
    switch (progress.stage) {
      case "revisions":
        return [
          8 + Math.min(20, progress.count / 500),
          `Listing revisions… ${progress.count.toLocaleString()} so far`,
        ];
      case "samples": {
        const read = progress.fetched || 0;
        return [
          30 + Math.min(40, read / 10),
          read
            ? `Reading revisions… ${read.toLocaleString()} read so far`
            : "Reading revisions…",
        ];
      }
      case "bisect":
        return [
          70 + Math.min(25, (progress.fetched || 0) / 20),
          `Pinpointing changes (${plural(progress.pending, "gap")} left)…`,
        ];
      case "ratelimited":
        return [
          null,
          "Wikipedia asked us to slow down. Waiting before continuing…",
        ];
      default:
        return [95, "Loading image details…"];
    }
  };

  const versionsFromForm = () => Number(DOM.versionsSelect.value) || 2;

  const updateUrl = (article, range, versions) => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("lang", article.lang);
    url.searchParams.set("title", article.title);
    url.searchParams.set("versions", String(versions));
    url.searchParams.set("range", range.key);
    if (range.key === "custom") {
      url.searchParams.set("from", range.from);
      if (range.to) url.searchParams.set("to", range.to);
    }
    window.history.replaceState(null, "", url);
  };

  const runScan = async (versions = versionsFromForm()) => {
    hideError();
    const parsed = scanner.parseArticleInput(
      DOM.articleInput.value,
      DOM.langInput.value,
    );
    if (!parsed.title) {
      showError(
        "Enter an article title or a Wikipedia link.",
        DOM.articleInput,
      );
      return;
    }
    if (!scanner.isValidLang(parsed.lang)) {
      showError(
        `"${parsed.lang}" does not look like a Wikipedia language code. Try something like "en" or "de".`,
        DOM.langInput,
      );
      return;
    }
    let range;
    try {
      range = rangeFromForm();
    } catch (err) {
      showError(err.message, err.field);
      return;
    }
    DOM.langInput.value = parsed.lang;

    const abort = new AbortController();
    state.abort = abort;
    setScanning(true);
    setProgress(
      4,
      `Looking up "${parsed.title}" on ${parsed.lang}.wikipedia.org…`,
    );
    DOM.resultsSection.hidden = true;
    setPicking(false);
    clearPreview();

    try {
      const article = await scanner.resolveArticle({
        lang: parsed.lang,
        title: parsed.title,
        signal: abort.signal,
      });
      if (!article.found) {
        throw new Error(
          `No article called "${parsed.title}" on ${parsed.lang}.wikipedia.org. Check the spelling, or pick one of the suggestions.`,
        );
      }
      if (article.namespace !== 0) {
        throw new Error(
          "That page is not an article. Enter an article in the main namespace.",
        );
      }
      state.article = article;
      state.versions = versions;
      DOM.articleInput.value = article.title;
      updateUrl(article, range, versions);

      const scan = await scanner.scanArticle({
        lang: article.lang,
        title: article.title,
        versions,
        thorough: DOM.thoroughInput.checked,
        rangeStart: range.start,
        rangeEnd: range.end,
        signal: abort.signal,
        onProgress: (progress) => setProgress(...progressText(progress)),
      });

      setProgress(95, "Loading image details…");
      const files = scan.periods.map((period) => period.file).filter(Boolean);
      state.imageInfo = await scanner.fetchImageInfo({
        lang: article.lang,
        files,
        width: THUMB_WIDTH,
        signal: abort.signal,
      });
      state.scan = scan;
      state.largeInfo = new Map();
      state.focus = new Map();
      state.beforeRevid = null;
      state.afterRevid = null;
      state.showBlips = false;
      state.edited = freshEdits();

      DOM.scanStatus.hidden = true;
      // Swap buttons back before scrolling;
      // on narrow screens Cancel is a full row,
      // and hiding it afterward would shift the results up
      setScanning(false);
      renderResults();
      largeInfoFor(state.periods.filter(isUsable)).catch(() => {});
    } catch (err) {
      if (err.name === "AbortError") {
        DOM.scanStatusText.textContent = "Scan cancelled.";
      } else {
        console.error(err);
        let message = err.message;
        if (/failed to fetch|networkerror|load failed/i.test(err.message)) {
          message = `Could not reach ${parsed.lang}.wikipedia.org. Check the language code and your connection.`;
        }
        showError(message);
        DOM.scanStatus.hidden = true;
      }
    } finally {
      state.abort = null;
      setScanning(false);
    }
  };

  DOM.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.abort) runScan();
  });

  DOM.cancelButton.addEventListener("click", () => {
    if (state.abort) state.abort.abort();
  });

  // Timeline
  // Same image under a renamed file counts as one period.
  // Short-lived reverted changes are hidden unless asked for.
  const mergePeriods = (rawPeriods, showBlips) =>
    scanner.collapseBlips(rawPeriods, {
      hideBlips: !showBlips,
      keyOf: (period) => {
        if (!period.file) return "";
        const info = infoFor(period.file);
        return (info && info.url) || period.file;
      },
    });

  const buildThumb = (period, className) => {
    const info = infoFor(period.file);
    const exists = Boolean(info && info.exists);
    const thumb = exists
      ? link(commonsFileUrl(info, period.file), "", className)
      : el("div", className);
    if (!period.file) {
      thumb.textContent = "No image";
    } else if (!exists) {
      thumb.textContent = "File no longer exists";
    } else {
      const img = document.createElement("img");
      img.crossOrigin = "anonymous";
      img.src = info.thumburl;
      img.alt = period.file;
      img.loading = "lazy";
      thumb.appendChild(img);
    }
    return thumb;
  };

  const buildTimelineItem = (period, index, total) => {
    const lang = state.article.lang;
    const scan = state.scan;
    const info = infoFor(period.file);
    const isLast = index === total - 1;
    const isCurrent = isLast && !scan.rangeEnd;
    const anchor = isAnchor(period);
    const item = el("li", "timeline-item");
    if (isCurrent) item.classList.add("timeline-item--current");
    if (
      period.revid === state.beforeRevid ||
      period.revid === state.afterRevid
    ) {
      item.classList.add("timeline-item--selected");
    }

    item.appendChild(buildThumb(period, "timeline-item__thumb"));

    const body = el("div", "timeline-item__body");
    const head = el("div", "timeline-item__head");
    const start = anchor ? scan.rangeStart : period.timestamp;
    const end = periodEnd(period);
    const endDate = end ? new Date(end) : new Date();
    head.appendChild(
      el(
        "h4",
        "timeline-item__dates",
        `${formatDate(start)} – ${end ? formatDate(end) : "today"}`,
      ),
    );
    head.appendChild(
      el(
        "span",
        "timeline-item__duration",
        formatDuration(endDate - new Date(start)),
      ),
    );
    if (isCurrent)
      head.appendChild(el("span", "badge badge--current", "Current"));
    if (anchor)
      head.appendChild(el("span", "badge", "In place at range start"));
    if (isLocalFile(info))
      head.appendChild(el("span", "badge badge--warning", "Not on Commons"));
    body.appendChild(head);

    const fileLine = el("div", "timeline-item__file");
    if (period.file) {
      fileLine.appendChild(
        link(commonsFileUrl(info, period.file), period.file),
      );
    } else {
      fileLine.textContent = "No lead image in the article text";
    }
    body.appendChild(fileLine);

    if (info && info.exists && (info.artist || info.license)) {
      const creditParts = [];
      if (info.artist) creditParts.push(truncate(info.artist, 60));
      if (info.license) creditParts.push(info.license);
      const credit = el("p", "timeline-item__meta");
      credit.textContent = `Photo: ${creditParts.join(" · ")}`;
      body.appendChild(credit);
    }

    const change = el("p", "timeline-item__meta");
    if (anchor) {
      change.appendChild(
        document.createTextNode("In the article before this range · "),
      );
      change.appendChild(
        link(
          wikiUrl(lang, `w/index.php?oldid=${period.revid}`),
          "view revision",
        ),
      );
    } else {
      change.appendChild(
        document.createTextNode(
          period.first ? "In the first revision, by " : "Changed by ",
        ),
      );
      change.appendChild(
        link(
          wikiUrl(
            lang,
            `wiki/Special:Contributions/${encodeURIComponent(period.user || "")}`,
          ),
          period.user || "unknown",
        ),
      );
      change.appendChild(document.createTextNode(" · "));
      change.appendChild(
        link(
          wikiUrl(lang, `w/index.php?diff=prev&oldid=${period.revid}`),
          "view edit",
        ),
      );
      if (period.comment) {
        change.appendChild(document.createTextNode(" · "));
        change.appendChild(
          el("em", null, `“${truncate(period.comment, 120)}”`),
        );
      }
    }
    body.appendChild(change);
    item.appendChild(body);

    const pick = el("div", "timeline-item__pick");
    [
      ["before", "Before", state.beforeRevid],
      ["after", "After", state.afterRevid],
    ].forEach(([side, label, selectedRevid]) => {
      const wrapper = el("label", "pick");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = side;
      radio.value = String(period.revid);
      radio.disabled = !isUsable(period);
      radio.checked = selectedRevid === period.revid;
      radio.addEventListener("change", () => selectPeriod(side, period.revid));
      wrapper.appendChild(radio);
      wrapper.appendChild(document.createTextNode(label));
      pick.appendChild(wrapper);
    });
    item.appendChild(pick);
    return item;
  };

  const renderTimeline = () => {
    const scan = state.scan;
    const { periods, hidden } = mergePeriods(scan.periods, state.showBlips);
    state.periods = periods;

    const versionCount = periods.filter((period) => period.file).length;
    DOM.timelineNote.textContent = scan.olderHistory
      ? `Last ${plural(versionCount, "image")}`
      : plural(versionCount, "image");

    DOM.olderNote.textContent =
      "Older history not scanned. Raise the number of images above to see more.";
    DOM.olderNote.hidden = !scan.olderHistory;

    const blipCount = state.showBlips ? countBlips(scan.periods) : hidden;
    DOM.blipNote.textContent = `${plural(blipCount, "short-lived change")} undone within a day ${state.showBlips ? "shown" : "hidden"}.`;
    DOM.blipToggle.textContent = state.showBlips ? "Hide them" : "Show them";
    DOM.blipItem.hidden = blipCount === 0;

    DOM.sampleNote.textContent =
      "Older revisions were sampled, so a change there that lasted only a few edits can be missed.";
    DOM.sampleNote.hidden = !scan.sampled;
    DOM.timelineFootnote.hidden =
      !blipCount && !scan.sampled && !scan.olderHistory;

    const usable = periods.filter(isUsable);
    const revids = new Set(periods.map((period) => period.revid));
    if (!revids.has(state.beforeRevid))
      state.beforeRevid = usable.length ? usable[0].revid : null;
    if (!revids.has(state.afterRevid))
      state.afterRevid = usable.length ? usable[usable.length - 1].revid : null;

    DOM.timeline.innerHTML = "";
    periods.forEach((period, index) =>
      DOM.timeline.appendChild(
        buildTimelineItem(period, index, periods.length),
      ),
    );

    if (periods.length === 1 && scan.rangeStart && !scan.olderHistory) {
      DOM.rangeHint.textContent =
        "The lead image did not change in this time range. Pick a longer range above to see earlier changes.";
      DOM.rangeHint.hidden = false;
    } else {
      DOM.rangeHint.hidden = true;
    }

    fillPickSelects();
    if (state.picking) updateComposite();
  };

  const renderResults = () => {
    const { article, scan } = state;

    DOM.articleThumb.innerHTML = "";
    if (article.thumbnail) {
      const img = document.createElement("img");
      img.src = article.thumbnail.source;
      img.alt = "";
      DOM.articleThumb.appendChild(img);
    }
    DOM.articleLink.textContent = article.title;
    DOM.articleLink.href = article.url;

    const oldest = scan.periods.length
      ? scan.periods[0].timestamp
      : scan.lastTimestamp;
    const parts = [
      `${scan.fetched.toLocaleString()} of ${scan.revisionCount.toLocaleString()} ${scan.revisionCount === 1 ? "revision" : "revisions"} read`,
      `${formatDate(oldest)}\u00a0–\u00a0${scan.rangeEnd ? formatDate(scan.rangeEnd) : "today"}`,
    ];
    DOM.articleStats.textContent = parts.join(" · ");

    const lastPeriod = scan.periods[scan.periods.length - 1];
    const notices = [];
    if (lastPeriod && !lastPeriod.file && article.pageimage && !scan.rangeEnd) {
      notices.push(
        `The article currently shows an image, but that image is not in the article's own text. On this Wikipedia the infobox probably pulls it from Wikidata, whose history this tool does not scan.`,
      );
    }
    if (scan.periods.every((period) => !period.file)) {
      notices.push(
        scan.olderHistory
          ? "No lead image was found in the revisions checked so far."
          : "No lead image was found in any revision in this range.",
      );
    }
    DOM.scanNotice.textContent = notices.join(" ");
    DOM.scanNotice.hidden = notices.length === 0;

    DOM.resultsSection.hidden = false;
    renderTimeline();
    scrollToSection(DOM.resultsSection);
  };

  const countBlips = (rawPeriods) => mergePeriods(rawPeriods, false).hidden;

  DOM.blipToggle.addEventListener("click", () => {
    state.showBlips = !state.showBlips;
    renderTimeline();
  });

  // Picking a before and an after
  const periodByRevid = (revid) =>
    state.periods.find((period) => period.revid === revid) || null;

  const periodOptionText = (period) => {
    const start = formatMonth(
      isAnchor(period) ? state.scan.rangeStart : period.timestamp,
    );
    const end = periodEnd(period);
    return `${start} – ${end ? formatMonth(end) : "today"}`;
  };

  const fillPickSelects = () => {
    [
      ["before", DOM.beforeSelect, DOM.beforeThumb, state.beforeRevid],
      ["after", DOM.afterSelect, DOM.afterThumb, state.afterRevid],
    ].forEach(([side, select, thumb, revid]) => {
      select.innerHTML = "";
      state.periods.filter(isUsable).forEach((period) => {
        const option = document.createElement("option");
        option.value = String(period.revid);
        option.textContent = periodOptionText(period);
        option.selected = period.revid === revid;
        select.appendChild(option);
      });
      thumb.innerHTML = "";
      const period = periodByRevid(revid);
      const info = period ? infoFor(period.file) : null;
      if (info && info.exists) {
        const img = document.createElement("img");
        img.crossOrigin = "anonymous";
        img.src = info.thumburl;
        img.alt = "";
        thumb.appendChild(img);
      }
    });
  };

  const selectPeriod = (side, revid) => {
    if (side === "before") state.beforeRevid = revid;
    else state.afterRevid = revid;
    DOM.timeline.querySelectorAll(".timeline-item").forEach((item) => {
      const radio = item.querySelector(`input[name="${side}"]`);
      const itemRevid = Number(radio.value);
      radio.checked = itemRevid === revid;
      item.classList.toggle(
        "timeline-item--selected",
        itemRevid === state.beforeRevid || itemRevid === state.afterRevid,
      );
    });
    fillPickSelects();
    updateComposite();
  };

  DOM.beforeSelect.addEventListener("change", () =>
    selectPeriod("before", Number(DOM.beforeSelect.value)),
  );
  DOM.afterSelect.addEventListener("change", () =>
    selectPeriod("after", Number(DOM.afterSelect.value)),
  );

  const setPicking = (on) => {
    state.picking = on;
    DOM.resultsSection.classList.toggle("results--picking", on);
    DOM.composePanel.hidden = !on;
    DOM.graphicToggle.textContent = on ? "Hide graphic" : "Make a graphic";
    DOM.graphicToggle.setAttribute("aria-expanded", String(on));
    if (on) {
      updateComposite();
      scrollToSection(DOM.composePanel);
    }
  };

  DOM.graphicToggle.addEventListener("click", () => setPicking(!state.picking));

  // Composite image
  const loadImage = (src, crossOrigin) => {
    if (state.images.has(src)) return state.images.get(src);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load ${src}`));
      img.src = src;
    });
    state.images.set(src, promise);
    promise.catch(() => state.images.delete(src));
    return promise;
  };

  // 960px thumbnail details for the composite
  const largeInfoFor = (periods) => {
    const files = [...new Set(periods.map((period) => period.file))];
    const missing = files.filter((file) => !state.largeInfo.has(file));
    if (missing.length) {
      const request = scanner.fetchImageInfo({
        lang: state.article.lang,
        files: missing,
        width: COMPOSITE_IMAGE_WIDTH,
      });
      missing.forEach((file) =>
        state.largeInfo.set(
          file,
          request.then((result) => result.get(file)),
        ),
      );
      request.catch(() =>
        missing.forEach((file) => state.largeInfo.delete(file)),
      );
    }
    return Promise.all(
      periods.map((period) => state.largeInfo.get(period.file)),
    );
  };

  const loadLargeImages = async (periods) => {
    const infos = await largeInfoFor(periods);
    if (infos.some((info) => !info || !info.exists))
      throw new Error("Image unavailable");
    return Promise.all(
      infos.map((info) => loadImage(info.thumburl || info.url, true)),
    );
  };

  // Cached timeline thumbnails stand in for the 960px photos while they load
  const loadThumbImages = (periods) =>
    Promise.all(
      periods.map((period) => loadImage(infoFor(period.file).thumburl, true)),
    );

  const ensureLogo = async () => {
    if (!state.logo)
      state.logo = await loadImage(LOGO_SRC, false).catch(() => null);
  };

  const creditFor = (period) => {
    const info = infoFor(period.file);
    if (!info || !info.exists) return "";
    const artist = truncate(
      info.artist || info.attribution || "Unknown photographer",
      120,
    );
    return info.license ? `${artist} (${info.license})` : artist;
  };

  const uniqueCredits = (before, after) => {
    const credits = [creditFor(before), creditFor(after)].filter(Boolean);
    return credits.filter((credit, index) => credits.indexOf(credit) === index);
  };

  const attributionFor = (before, after) => {
    const credits = uniqueCredits(before, after);
    return `${credits.length > 1 ? "Photos" : "Photo"}: ${credits.join(" · ")} · via Wikimedia Commons`;
  };

  // One credit per line to avoid overflow / cutoff
  const attributionLines = (before, after) => {
    const credits = uniqueCredits(before, after);
    if (credits.length === 0) return [];
    const label = credits.length > 1 ? "Photos" : "Photo";
    return [
      `${label}: ${credits[0]}`,
      ...credits.slice(1),
      "via Wikimedia Commons",
    ];
  };

  const fillDefaults = (before, after) => {
    if (!state.edited.title) DOM.titleInput.value = state.article.title;
    if (!state.edited.beforeLabel) DOM.beforeLabelInput.value = "Before";
    if (!state.edited.afterLabel) DOM.afterLabelInput.value = "After";
    DOM.attributionText.textContent = attributionFor(before, after);
  };

  const updateLicenseWarning = (before, after) => {
    const warnings = [];
    [before, after].forEach((period) => {
      const info = infoFor(period.file);
      if (isLocalFile(info) || looksNonFree(info)) {
        warnings.push(
          `"${period.file}" is hosted on ${state.article.lang}.wikipedia.org rather than Wikimedia Commons, so it may be a non-free file. Check its license before sharing.`,
        );
      }
    });
    DOM.licenseWarning.textContent = warnings.join(" ");
    DOM.licenseWarning.hidden = warnings.length === 0;
  };

  const currentPreset = () => {
    const checked = DOM.presetButtons.querySelector(
      'input[name="preset"]:checked',
    );
    const key = checked ? checked.value : "landscape";
    return { key, ...PRESETS[key] };
  };

  let lastImages = null;

  const focusSliders = {
    before: { x: DOM.beforeFocusX, y: DOM.beforeFocusY },
    after: { x: DOM.afterFocusX, y: DOM.afterFocusY },
  };

  const focusFor = (period) => state.focus.get(period.file) || DEFAULT_FOCUS;

  const syncFocusSliders = (before, after) => {
    [
      [before, focusSliders.before],
      [after, focusSliders.after],
    ].forEach(([period, sliders]) => {
      const focus = focusFor(period);
      sliders.x.value = Math.round(focus.x * 100);
      sliders.y.value = Math.round(focus.y * 100);
    });
  };

  // Clears preview and stops any photo loads still in flight.
  const clearPreview = () => {
    state.renderToken += 1;
    lastImages = null;
    DOM.canvas
      .getContext("2d")
      .clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);
  };

  const updateComposite = async () => {
    if (!state.picking) return;
    const before = periodByRevid(state.beforeRevid);
    const after = periodByRevid(state.afterRevid);
    if (!before || !after) {
      clearPreview();
      DOM.previewHint.textContent =
        "This range has no usable images to build a graphic from.";
      DOM.downloadButton.disabled = true;
      DOM.copyButton.disabled = true;
      return;
    }
    fillDefaults(before, after);
    updateLicenseWarning(before, after);
    syncFocusSliders(before, after);

    const token = state.renderToken + 1;
    state.renderToken = token;
    DOM.previewHint.textContent = "Loading photos…";
    DOM.downloadButton.disabled = true;
    DOM.copyButton.disabled = true;

    if (!lastImages) {
      lastImages = {
        before,
        after,
        beforeImg: null,
        afterImg: null,
        loading: true,
      };
      draw();
    }
    let finalDrawn = false;
    loadThumbImages([before, after])
      .then(([beforeImg, afterImg]) => {
        if (token !== state.renderToken || finalDrawn) return;
        lastImages = { before, after, beforeImg, afterImg, loading: true };
        draw();
      })
      .catch(() => {});

    try {
      const [[beforeImg, afterImg]] = await Promise.all([
        loadLargeImages([before, after]),
        ensureLogo(),
      ]);
      if (token !== state.renderToken) return;
      finalDrawn = true;
      lastImages = { before, after, beforeImg, afterImg, loading: false };
      draw();
      DOM.downloadButton.disabled = false;
      DOM.copyButton.disabled = false;
    } catch (err) {
      if (token !== state.renderToken) return;
      console.error(err);
      DOM.previewHint.textContent = "One of the photos could not be loaded.";
    }
  };

  const draw = () => {
    if (!lastImages) return;
    const { before, after, beforeImg, afterImg, loading } = lastImages;
    const preset = currentPreset();
    const fitted = drawComposite(DOM.canvas, {
      width: preset.width,
      height: preset.height,
      title: DOM.titleInput.value.trim(),
      tagline: "From Wikipedia, the free encyclopedia",
      footerLines: DOM.attributionInput.checked
        ? attributionLines(before, after)
        : [],
      fit: DOM.fitInput.value,
      logo: DOM.logoInput.checked ? state.logo : null,
      left: {
        heading: DOM.beforeLabelInput.value.trim(),
        img: beforeImg,
        focus: focusFor(before),
      },
      right: {
        heading: DOM.afterLabelInput.value.trim(),
        img: afterImg,
        focus: focusFor(after),
      },
    });

    DOM.focusControls.hidden = DOM.fitInput.value !== "cover";
    [
      [focusSliders.before, fitted.left],
      [focusSliders.after, fitted.right],
    ].forEach(([sliders, result]) => {
      sliders.x.disabled = !result.cropX;
      sliders.y.disabled = !result.cropY;
    });

    if (loading) return;
    const notes = [];
    [
      [before, beforeImg, fitted.left.scale],
      [after, afterImg, fitted.right.scale],
    ].forEach(([period, img, scale]) => {
      const { width, height } = infoFor(period.file);
      const sourceScale = (scale * img.naturalWidth) / width;
      const note = `"${period.file}" is only ${width} × ${height} px, so it will look blurry at this size.`;
      if (sourceScale > SOFT_UPSCALE && !notes.includes(note)) notes.push(note);
    });
    DOM.previewHint.textContent = notes.join(" ");
  };

  const redraw = () => {
    if (state.picking) draw();
  };

  // Canvas drawing
  const setFont = (ctx, weight, size, family) => {
    ctx.font = `${weight} ${size}px ${family}`;
  };

  // Shrinks font until the text fits
  const fitFontSize = (ctx, text, maxWidth, size, minSize, weight, family) => {
    let current = size;
    setFont(ctx, weight, current, family);
    while (current > minSize && ctx.measureText(text).width > maxWidth) {
      current -= 1;
      setFont(ctx, weight, current, family);
    }
    return current;
  };

  // Splits a token that is wider than the line into pieces that fit.
  const breakToken = (ctx, token, maxWidth) => {
    const pieces = [];
    let piece = "";
    Array.from(token).forEach((ch) => {
      if (piece && ctx.measureText(piece + ch).width > maxWidth) {
        pieces.push(piece);
        piece = ch;
      } else {
        piece += ch;
      }
    });
    if (piece) pieces.push(piece);
    return pieces;
  };

  // Greedy word wrap
  // The last allowed line gets an ellipsis if text remains
  const wrapLines = (ctx, text, maxWidth, maxLines) => {
    const words = text
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((word) =>
        ctx.measureText(word).width > maxWidth
          ? breakToken(ctx, word, maxWidth)
          : [word],
      );
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = ellipsize(
        ctx,
        lines.slice(maxLines - 1).join(" "),
        maxWidth,
      );
      return kept;
    }
    return lines.map((item) => ellipsize(ctx, item, maxWidth));
  };

  const ellipsize = (ctx, text, maxWidth) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return `${cut.trim()}…`;
  };

  const NO_FIT = { scale: 0, cropX: false, cropY: false };

  // Returns how much the photo was scaled and which axes were cropped.
  const drawImageFitted = (ctx, img, x, y, w, h, fit, focus) => {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return NO_FIT;
    if (fit === "contain") {
      const scale = Math.min(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      return { scale, cropX: false, cropY: false };
    }
    // Crop to fill
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (iw - sw) * focus.x;
    const sy = (ih - sh) * focus.y;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return { scale, cropX: iw - sw > 1, cropY: ih - sh > 1 };
  };

  const drawChevron = (ctx, cx, cy, size, color) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size / 4);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - size / 3, cy - size / 2);
    ctx.lineTo(cx + size / 3, cy);
    ctx.lineTo(cx - size / 3, cy + size / 2);
    ctx.stroke();
    ctx.restore();
  };

  const drawCard = (ctx, x, y, w, h, side, metrics) => {
    const { base, line, fit } = metrics;
    const inset = Math.round(base * 0.02);

    ctx.fillStyle = WIKI.box;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = WIKI.border;
    ctx.lineWidth = line;
    ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line);

    let cy = y + line;
    if (side.heading) {
      const size = Math.round(base * 0.034);
      const bandHeight = Math.round(size * 1.9);
      ctx.fillStyle = WIKI.head;
      ctx.fillRect(x + line, cy, w - line * 2, bandHeight);
      fitFontSize(
        ctx,
        side.heading,
        w - inset * 2,
        size,
        Math.round(size * 0.6),
        700,
        SANS,
      );
      ctx.fillStyle = WIKI.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        ellipsize(ctx, side.heading, w - inset * 2),
        x + w / 2,
        cy + bandHeight / 2,
      );
      cy += bandHeight;
    }
    cy += inset;

    const imageW = w - inset * 2;
    const imageH = Math.max(40, y + h - line - inset - cy);
    const imageX = x + inset;
    ctx.fillStyle = WIKI.white;
    ctx.fillRect(imageX, cy, imageW, imageH);
    let fitted = NO_FIT;
    if (side.img) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(imageX, cy, imageW, imageH);
      ctx.clip();
      fitted = drawImageFitted(
        ctx,
        side.img,
        imageX,
        cy,
        imageW,
        imageH,
        fit,
        side.focus,
      );
      ctx.restore();
    }
    ctx.strokeStyle = WIKI.imageBorder;
    ctx.lineWidth = line;
    ctx.strokeRect(
      imageX + line / 2,
      cy + line / 2,
      imageW - line,
      imageH - line,
    );
    return fitted;
  };

  const drawComposite = (canvas, options) => {
    const { width: W, height: H } = options;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    const base = Math.min(W, H);
    const pad = Math.round(base * 0.045);
    const line = Math.max(1, Math.round(base / 700));
    const fit = options.fit;

    ctx.fillStyle = WIKI.white;
    ctx.fillRect(0, 0, W, H);

    let y = pad;
    if (options.title) {
      const size = fitFontSize(
        ctx,
        options.title,
        W - pad * 2,
        Math.round(base * 0.06),
        Math.round(base * 0.03),
        400,
        SERIF,
      );
      ctx.fillStyle = WIKI.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(ellipsize(ctx, options.title, W - pad * 2), pad, y);
      y += Math.round(size * 1.15);
      ctx.fillStyle = WIKI.border;
      ctx.fillRect(pad, y, W - pad * 2, line);
      y += line + Math.round(base * 0.01);
      if (options.tagline) {
        const taglineSize = Math.round(base * 0.021);
        setFont(ctx, 400, taglineSize, SANS);
        ctx.fillStyle = WIKI.muted;
        ctx.fillText(options.tagline, pad, y);
        y += Math.round(taglineSize * 1.4);
      }
      y += Math.round(base * 0.03);
    }

    const footerSize = Math.round(base * 0.019);
    const footerLineHeight = Math.round(footerSize * 1.4);
    let logoHeight = 0;
    let logoWidth = 0;
    let footerWidth = W - pad * 2;
    if (options.logo) {
      logoHeight = Math.round(base * 0.055);
      logoWidth = Math.round(
        (logoHeight * options.logo.naturalWidth) / options.logo.naturalHeight,
      );
      // Leave a pad between the footer text and the wordmark.
      footerWidth -= logoWidth + pad;
    }
    setFont(ctx, 400, footerSize, SANS);
    const footerLines = options.footerLines.flatMap((line) =>
      wrapLines(ctx, line, footerWidth, 2),
    );
    const footerHeight = Math.max(
      footerLines.length * footerLineHeight,
      logoHeight,
    );
    const cardsBottom =
      H - pad - footerHeight - (footerHeight ? Math.round(base * 0.03) : 0);

    const arrowGap = Math.round(base * 0.065);
    const cardW = Math.floor((W - pad * 2 - arrowGap) / 2);
    const cardH = Math.max(60, cardsBottom - y);
    const metrics = { base, line, fit };
    const fitted = {
      left: drawCard(ctx, pad, y, cardW, cardH, options.left, metrics),
      right: drawCard(
        ctx,
        pad + cardW + arrowGap,
        y,
        cardW,
        cardH,
        options.right,
        metrics,
      ),
    };
    drawChevron(
      ctx,
      W / 2,
      y + cardH * 0.45,
      Math.round(arrowGap * 0.4),
      WIKI.border,
    );

    const footerTop = H - pad - footerHeight;
    const footerMid = footerTop + footerHeight / 2;
    if (footerLines.length) {
      setFont(ctx, 400, footerSize, SANS);
      ctx.fillStyle = WIKI.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const textTop =
        footerMid - ((footerLines.length - 1) * footerLineHeight) / 2;
      footerLines.forEach((text, index) =>
        ctx.fillText(text, pad, textTop + index * footerLineHeight),
      );
    }

    if (options.logo) {
      ctx.drawImage(
        options.logo,
        W - pad - logoWidth,
        Math.round(footerMid - logoHeight / 2),
        logoWidth,
        logoHeight,
      );
    }
    return fitted;
  };

  // Compose controls
  DOM.presetButtons.addEventListener("change", redraw);
  DOM.fitInput.addEventListener("change", redraw);
  DOM.attributionInput.addEventListener("change", redraw);
  DOM.logoInput.addEventListener("change", redraw);

  Object.entries(focusSliders).forEach(([side, sliders]) => {
    [sliders.x, sliders.y].forEach((slider) =>
      slider.addEventListener("input", () => {
        if (!lastImages) return;
        state.focus.set(lastImages[side].file, {
          x: sliders.x.value / 100,
          y: sliders.y.value / 100,
        });
        redraw();
      }),
    );
  });

  DOM.copyAttributionButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(DOM.attributionText.textContent);
      flashButton(DOM.copyAttributionButton, "✓ Copied!");
    } catch (err) {
      console.error(err);
      alert("Copying failed. Select the text and copy it by hand.");
    }
  });

  [
    ["titleInput", "title"],
    ["beforeLabelInput", "beforeLabel"],
    ["afterLabelInput", "afterLabel"],
  ].forEach(([id, key]) => {
    DOM[id].addEventListener("input", () => {
      state.edited[key] = true;
      redraw();
    });
  });

  const canvasBlob = () =>
    new Promise((resolve, reject) => {
      DOM.canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not export the image"));
      }, "image/png");
    });

  const exportFilename = () => {
    const slug = (state.article ? state.article.title : "article")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    return `${slug || "article"}-before-after-${currentPreset().key}.png`;
  };

  const flashButton = (button, text) => {
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => {
      button.textContent = original;
    }, COPY_SUCCESS_DURATION);
  };

  DOM.downloadButton.addEventListener("click", async () => {
    try {
      const blob = await canvasBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exportFilename();
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      alert(
        "The image could not be exported. One of the photos may have blocked cross-origin use.",
      );
    }
  });

  DOM.copyButton.addEventListener("click", async () => {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      alert(
        "Your browser cannot copy images to the clipboard. Use Download PNG instead.",
      );
      return;
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": canvasBlob() }),
      ]);
      flashButton(DOM.copyButton, "✓ Copied!");
    } catch (err) {
      console.error(err);
      alert("Copying failed. Use Download PNG instead.");
    }
  });

  // Language suggestions, largest editions first
  window.WIKIPEDIA_LANGUAGES.forEach(([subdomain, name]) => {
    const option = document.createElement("option");
    option.value = subdomain;
    option.textContent = name;
    DOM.langSuggestions.appendChild(option);
  });

  // Prefill from the URL
  // e.g. ?lang=de&title=Example&range=5y
  const hasOption = (select, value) =>
    [...select.options].some((option) => option.value === value);

  const params = new URLSearchParams(window.location.search);
  const versionsParam = params.get("versions");
  const rangeParam = params.get("range");
  if (versionsParam && hasOption(DOM.versionsSelect, versionsParam)) {
    DOM.versionsSelect.value = versionsParam;
  }
  if (rangeParam && hasOption(DOM.rangeSelect, rangeParam)) {
    DOM.rangeSelect.value = rangeParam;
    if (params.get("from")) DOM.fromInput.value = params.get("from");
    if (params.get("to")) DOM.toInput.value = params.get("to");
  }
  updateRangeInputs();
  if (params.get("title")) {
    DOM.articleInput.value = params.get("title").replace(/_/g, " ");
    if (params.get("lang")) DOM.langInput.value = params.get("lang");
    const requested = Number(versionsParam);
    runScan(requested > 0 ? requested : versionsFromForm());
  }
})();
