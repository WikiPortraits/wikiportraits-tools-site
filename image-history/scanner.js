// Finds when an article's lead image changed
// Starts with most recent revisions
// Queries older ones more sparsely
// Bisects between reads that disagree to find the exact revision of each change

(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const parser = isNode ? require("./parser.js") : root.ImageHistoryParser;
  const api = factory(parser);
  if (isNode) {
    module.exports = api;
  }
  root.ImageHistoryScanner = api;
})(typeof window !== "undefined" ? window : globalThis, function (parser) {
  "use strict";

  const BATCH_SIZE = 50;
  const MAX_REVISIONS = 200000;
  const BLIP_MS = 24 * 60 * 60 * 1000;
  const LANG_RE = /^[a-z]{2,12}(-[a-z0-9]{1,12})*$/i;

  const namespaceCache = new Map();

  const apiUrl = (lang, params) => {
    const search = new URLSearchParams({
      ...params,
      format: "json",
      formatversion: "2",
      origin: "*",
    });
    return `https://${lang}.wikipedia.org/w/api.php?${search}`;
  };

  // API allows ~8 section fetches per min
  const MIN_SPACING_MS = 2500;
  const WINDOW_MS = 65000; // margin for refusals at the boundary
  const DEFAULT_WINDOW_MAX = 8;
  let windowMax = DEFAULT_WINDOW_MAX;
  const contentRequestTimes = [];

  const RETRY_ATTEMPTS = 4;
  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            const err = new Error("Scan cancelled");
            err.name = "AbortError";
            reject(err);
          },
          { once: true },
        );
      }
    });

  // Retries on HTTP 429 and 5xx
  const defaultFetchJson = async (
    url,
    { signal, headers, onRateLimited } = {},
  ) => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(url, { signal, headers });
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_ATTEMPTS) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay =
          retryAfter > 0 ? retryAfter * 1000 : 1500 * Math.pow(2, attempt);
        if (response.status === 429 && onRateLimited) onRateLimited(delay);
        await sleep(Math.min(delay, 60000), signal);
        continue;
      }
      if (!response.ok) {
        throw new Error(
          `The Wikipedia API answered with HTTP ${response.status}.`,
        );
      }
      const data = await response.json();
      if (data && data.error) {
        throw new Error(
          data.error.info || data.error.code || "Unknown API error",
        );
      }
      return data;
    }
  };

  const makeContext = ({ fetchJson, signal }) => ({
    fetchJson: fetchJson || defaultFetchJson,
    signal,
  });

  // Waits until one more section fetch fits inside the rate-limit window.
  const paceContentRequest = async (ctx) => {
    const now = Date.now();
    while (
      contentRequestTimes.length &&
      contentRequestTimes[0] < now - WINDOW_MS
    ) {
      contentRequestTimes.shift();
    }
    const waits = [];
    const last = contentRequestTimes[contentRequestTimes.length - 1];
    if (last) waits.push(last + MIN_SPACING_MS - now);
    if (contentRequestTimes.length >= windowMax) {
      waits.push(
        contentRequestTimes[contentRequestTimes.length - windowMax] +
          WINDOW_MS -
          now,
      );
    }
    const wait = Math.max(0, ...waits);
    if (wait > 0) await sleep(wait, ctx.signal);
    contentRequestTimes.push(Date.now());
  };

  // If API refuses request, allow one fewer than it had just accepted.
  const tightenWindow = () => {
    const now = Date.now();
    const accepted =
      contentRequestTimes.filter((time) => time >= now - WINDOW_MS).length - 1;
    windowMax = Math.max(3, Math.min(windowMax, accepted - 1));
  };

  const checkAborted = (ctx) => {
    if (ctx.signal && ctx.signal.aborted) {
      const err = new Error("Scan cancelled");
      err.name = "AbortError";
      throw err;
    }
  };

  const isValidLang = (lang) => LANG_RE.test(lang || "");

  const stripHtml = (html) =>
    (html || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();

  // Accepts a page title or a full Wikipedia URL.
  // Returns { lang, title }
  const parseArticleInput = (input, fallbackLang) => {
    const text = (input || "").trim();
    const urlMatch = text.match(
      /^(?:https?:)?\/\/([a-z0-9-]+)\.(?:m\.)?wikipedia\.org\/(?:wiki\/|w\/index\.php\?(?:.*&)?title=)([^?#&]+)/i,
    );
    if (urlMatch) {
      let title = urlMatch[2];
      try {
        title = decodeURIComponent(title);
      } catch (e) {
        /* keep raw */
      }
      return {
        lang: urlMatch[1].toLowerCase(),
        title: title.replace(/_/g, " ").trim(),
      };
    }
    return {
      lang: (fallbackLang || "en").trim().toLowerCase(),
      title: text.replace(/_/g, " "),
    };
  };

  const resolveArticle = async ({ lang, title, fetchJson, signal }) => {
    const ctx = makeContext({ fetchJson, signal });
    const data = await ctx.fetchJson(
      apiUrl(lang, {
        action: "query",
        titles: title,
        redirects: "1",
        prop: "info|pageimages",
        inprop: "url",
        piprop: "thumbnail|name",
        pithumbsize: "300",
      }),
      { signal: ctx.signal },
    );

    const page = data.query && data.query.pages && data.query.pages[0];
    if (!page || page.missing || page.invalid) {
      return {
        found: false,
        reason: (page && page.invalidreason) || "No article with that title",
      };
    }
    const redirects = (data.query.redirects || []).map((r) => r.from);
    return {
      found: true,
      lang,
      title: page.title,
      pageid: page.pageid,
      namespace: page.ns,
      url: page.fullurl,
      lastrevid: page.lastrevid,
      thumbnail: page.thumbnail || null,
      pageimage: page.pageimage ? page.pageimage.replace(/_/g, " ") : null,
      redirectedFrom: redirects.length ? redirects[0] : null,
    };
  };

  const searchTitles = async ({
    lang,
    query,
    limit = 8,
    fetchJson,
    signal,
  }) => {
    const ctx = makeContext({ fetchJson, signal });
    const data = await ctx.fetchJson(
      apiUrl(lang, {
        action: "opensearch",
        search: query,
        limit: String(limit),
        namespace: "0",
      }),
      { signal: ctx.signal },
    );
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  };

  // Local names for the File namespace
  const fetchFileNamespaces = async (lang, ctx) => {
    if (namespaceCache.has(lang)) return namespaceCache.get(lang);
    const names = new Set(parser.DEFAULT_FILE_NAMESPACES);
    try {
      const data = await ctx.fetchJson(
        apiUrl(lang, {
          action: "query",
          meta: "siteinfo",
          siprop: "namespaces|namespacealiases",
        }),
        { signal: ctx.signal },
      );
      const namespaces = data.query.namespaces || {};
      const fileNs = namespaces[6];
      if (fileNs) {
        if (fileNs.name) names.add(fileNs.name.toLowerCase());
        if (fileNs.canonical) names.add(fileNs.canonical.toLowerCase());
      }
      (data.query.namespacealiases || []).forEach((alias) => {
        if (alias.id === 6 && alias.alias) names.add(alias.alias.toLowerCase());
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
    }
    const list = Array.from(names);
    namespaceCache.set(lang, list);
    return list;
  };

  // Parsed lead images keyed by "lang|revid", kept across scans for "show more".
  const contentCache = new Map();
  const CONTENT_CACHE_LIMIT = 20000;

  const rememberContent = (key, value) => {
    if (contentCache.size >= CONTENT_CACHE_LIMIT) contentCache.clear();
    contentCache.set(key, value);
  };

  // Section-0 content of the given revisions, parsed for the lead image.
  const fetchRevisionContents = async ({
    lang,
    revids,
    ctx,
    fileNamespaces,
  }) => {
    const result = new Map();
    const missing = [];
    revids.forEach((revid) => {
      const cached = contentCache.get(`${lang}|${revid}`);
      if (cached) result.set(revid, cached);
      else missing.push(revid);
    });
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      checkAborted(ctx);
      const batch = missing.slice(i, i + BATCH_SIZE);
      await paceContentRequest(ctx);
      const data = await ctx.fetchJson(
        apiUrl(lang, {
          action: "query",
          revids: batch.join("|"),
          prop: "revisions",
          rvprop: "ids|timestamp|user|comment|content",
          rvslots: "main",
          rvsection: "0",
        }),
        {
          signal: ctx.signal,
          onRateLimited: () => {
            tightenWindow();
            if (ctx.onRateLimited) ctx.onRateLimited();
          },
        },
      );
      const pages = (data.query && data.query.pages) || [];
      pages.forEach((page) => {
        (page.revisions || []).forEach((rev) => {
          const slot = (rev.slots && rev.slots.main) || {};
          const hidden = Boolean(slot.texthidden);
          const content = typeof slot.content === "string" ? slot.content : "";
          const entry = {
            revid: rev.revid,
            timestamp: rev.timestamp,
            user: rev.user || (rev.userhidden ? "(username hidden)" : ""),
            comment: rev.comment || "",
            hidden,
            file: hidden
              ? null
              : parser.extractLeadImage(content, { fileNamespaces }),
          };
          rememberContent(`${lang}|${rev.revid}`, entry);
          result.set(rev.revid, entry);
        });
      });
    }
    return result;
  };

  // Loads revisions newest-first, a page at a time, as far back as needed
  const createRevisionWalker = ({
    lang,
    title,
    ctx,
    rangeStart,
    rangeEnd,
    onProgress,
  }) => {
    const revisions = [];
    let cont = null;
    let started = false;
    let exhausted = false;
    let anchored = false;
    let truncated = false;

    const appendAnchor = async () => {
      if (!rangeStart) return;
      const data = await ctx.fetchJson(
        apiUrl(lang, {
          action: "query",
          titles: title,
          redirects: "1",
          prop: "revisions",
          rvprop: "ids|timestamp",
          rvlimit: "1",
          rvdir: "older",
          rvstart: rangeStart,
        }),
        { signal: ctx.signal },
      );
      const page = data.query && data.query.pages && data.query.pages[0];
      const anchor = page && page.revisions && page.revisions[0];
      if (anchor && !revisions.some((rev) => rev.revid === anchor.revid)) {
        revisions.push({ revid: anchor.revid, timestamp: anchor.timestamp });
        anchored = true;
      }
    };

    const loadMore = async () => {
      if (exhausted) return;
      checkAborted(ctx);
      const data = await ctx.fetchJson(
        apiUrl(lang, {
          action: "query",
          titles: title,
          redirects: "1",
          prop: "revisions",
          rvprop: "ids|timestamp",
          rvlimit: "max",
          rvdir: "older",
          ...(rangeEnd ? { rvstart: rangeEnd } : {}),
          ...(rangeStart ? { rvend: rangeStart } : {}),
          ...(cont || {}),
        }),
        { signal: ctx.signal },
      );
      started = true;
      const page = data.query && data.query.pages && data.query.pages[0];
      (page && page.revisions ? page.revisions : []).forEach((rev) => {
        revisions.push({ revid: rev.revid, timestamp: rev.timestamp });
      });
      cont = data.continue || null;
      if (revisions.length >= MAX_REVISIONS) {
        truncated = true;
        cont = null;
      }
      if (!cont) {
        exhausted = true;
        await appendAnchor();
      }
      onProgress({ stage: "revisions", count: revisions.length });
    };

    // Loads the revision at this age (0 = newest) if it exists.
    const ensure = async (age) => {
      while (revisions.length <= age && !exhausted) await loadMore();
      return age < revisions.length;
    };

    return {
      revisions,
      ensure,
      isExhausted: () => exhausted,
      isAnchored: () => anchored,
      isTruncated: () => truncated,
      hasStarted: () => started,
    };
  };

  const TIERS = [
    { upTo: 100, stride: 1 },
    { upTo: 500, stride: 4 },
    { upTo: 2100, stride: 16 },
    { upTo: 8500, stride: 64 },
    { upTo: Infinity, stride: 256 },
  ];

  const strideForAge = (age, thorough) => {
    const tier = TIERS.find((candidate) => age < candidate.upTo);
    return thorough ? Math.max(1, Math.round(tier.stride / 4)) : tier.stride;
  };

  // Drops changes undone within a day.
  // keyOf identifies a period's image.
  const collapseBlips = (
    rawPeriods,
    { keyOf = (period) => period.file || "", hideBlips = true } = {},
  ) => {
    const keyed = rawPeriods.map((period) => ({
      ...period,
      key: keyOf(period),
    }));
    const joinInto = (target, source) => {
      target.endRevid = source.endRevid;
      target.endTimestamp = source.endTimestamp;
    };
    const periods = [];
    keyed.forEach((period) => {
      const last = periods[periods.length - 1];
      if (last && last.key === period.key) joinInto(last, period);
      else periods.push(period);
    });

    let hidden = 0;
    if (hideBlips) {
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 1; i < periods.length - 1; i += 1) {
          const duration =
            new Date(periods[i].endTimestamp) - new Date(periods[i].timestamp);
          if (duration < BLIP_MS && periods[i - 1].key === periods[i + 1].key) {
            joinInto(periods[i - 1], periods[i + 1]);
            periods.splice(i, 2);
            hidden += 1;
            changed = true;
            break;
          }
        }
      }
    }
    return { periods, hidden };
  };

  // Walks back until `versions` distinct lead images have exact
  // start dates.
  // Each request is filled to the API's 50-revision limit.
  const scanArticle = async ({
    lang,
    title,
    versions = 2,
    thorough = false,
    rangeStart = null,
    rangeEnd = null,
    fetchJson,
    signal,
    onProgress,
  }) => {
    const ctx = makeContext({ fetchJson, signal });
    const progress = onProgress || (() => {});
    ctx.onRateLimited = () => progress({ stage: "ratelimited" });

    const walker = createRevisionWalker({
      lang,
      title,
      ctx,
      rangeStart,
      rangeEnd,
      onProgress: progress,
    });
    const { revisions } = walker;
    const [fileNamespaces] = await Promise.all([
      fetchFileNamespaces(lang, ctx),
      walker.ensure(0),
    ]);
    if (revisions.length === 0) {
      throw new Error("This article has no revisions in that time range.");
    }

    const images = new Map(); // age -> content entry
    const abandoned = new Set(); // gaps whose unread revisions are all hidden
    let fetched = 0;
    let sampled = false;
    let nextAge = 0; // sampling frontier
    const known = (age) => images.has(age) && !images.get(age).hidden;

    const fetchAges = async (ages) => {
      const pending = ages.filter((age) => !images.has(age));
      if (pending.length === 0) return;
      const contents = await fetchRevisionContents({
        lang,
        revids: pending.map((age) => revisions[age].revid),
        ctx,
        fileNamespaces,
      });
      pending.forEach((age) => {
        images.set(
          age,
          contents.get(revisions[age].revid) || { hidden: true, file: null },
        );
      });
      fetched += pending.length;
    };

    // Gaps between neighboring read revisions whose images differ (newest first).
    const openGaps = () => {
      const ages = Array.from(images.keys())
        .filter(known)
        .sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < ages.length; i += 1) {
        const newer = ages[i - 1];
        const older = ages[i];
        if (
          older - newer > 1 &&
          images.get(older).file !== images.get(newer).file &&
          !abandoned.has(`${newer}-${older}`)
        ) {
          gaps.push([newer, older]);
        }
      }
      return gaps;
    };

    // Up to `count` unread ages spread evenly inside the gap.
    const pointsInGap = (newer, older, count) => {
      const span = older - newer;
      const wanted = Math.min(count, span - 1);
      const points = new Set();
      for (let i = 1; i <= wanted; i += 1) {
        let age = newer + Math.round((span * i) / (wanted + 1));
        // Slide to the nearest unread age if this one was read (and hidden).
        for (let offset = 0; offset < span; offset += 1) {
          const lower = age - offset;
          const upper = age + offset;
          if (lower > newer && !images.has(lower)) {
            age = lower;
            break;
          }
          if (upper < older && !images.has(upper)) {
            age = upper;
            break;
          }
        }
        if (!images.has(age) && age > newer && age < older) points.add(age);
      }
      if (points.size === 0) abandoned.add(`${newer}-${older}`);
      return Array.from(points);
    };

    // Periods in chronological order
    const buildPeriods = () => {
      const ages = Array.from(images.keys())
        .filter(known)
        .sort((a, b) => b - a); // oldest first
      const oldestAge = revisions.length - 1;
      const periods = [];
      let current = null;
      let previousAge = null;
      ages.forEach((age) => {
        const entry = images.get(age);
        if (current && entry.file === current.file) {
          previousAge = age;
          return;
        }
        if (current) {
          current.endRevid = revisions[age].revid;
          current.endTimestamp = revisions[age].timestamp;
        }
        const atOldest = age === oldestAge && walker.isExhausted();
        const adjacent = previousAge !== null && previousAge - age === 1;
        const onlyHiddenBetween =
          previousAge !== null && abandoned.has(`${age}-${previousAge}`);
        current = {
          file: entry.file,
          revid: revisions[age].revid,
          timestamp: revisions[age].timestamp,
          user: entry.user || "",
          comment: entry.comment || "",
          endRevid: null,
          endTimestamp: null,
          anchor: atOldest && walker.isAnchored(),
          first: atOldest && !walker.isAnchored(),
          startKnown: atOldest || adjacent || onlyHiddenBetween,
        };
        periods.push(current);
        previousAge = age;
      });
      return periods;
    };

    // Number of newest periods with exact start dates.
    const exactNewest = (periods) => {
      const collapsed = collapseBlips(periods).periods;
      let count = 0;
      for (let i = collapsed.length - 1; i >= 0; i -= 1) {
        if (!collapsed[i].startKnown) break;
        count += 1;
      }
      return count;
    };

    let periods = [];
    for (;;) {
      checkAborted(ctx);
      const picks = new Set();

      const gaps = openGaps();
      if (gaps.length) {
        const perGap = Math.max(1, Math.floor(BATCH_SIZE / gaps.length));
        gaps.forEach(([newer, older]) => {
          if (picks.size >= BATCH_SIZE) return;
          pointsInGap(newer, older, perGap).forEach((age) => picks.add(age));
        });
      }

      while (picks.size < BATCH_SIZE && (await walker.ensure(nextAge))) {
        const stride = strideForAge(nextAge, thorough);
        if (stride > 1) sampled = true;
        if (!images.has(nextAge)) picks.add(nextAge);
        nextAge += stride;
      }
      // Always read oldest revision when list is complete.
      const oldest = revisions.length - 1;
      const sampledPastOldest = walker.isExhausted() && nextAge > oldest;
      if (sampledPastOldest && !images.has(oldest) && picks.size < BATCH_SIZE) {
        picks.add(oldest);
      }

      if (picks.size === 0) break;
      progress({
        stage: gaps.length ? "bisect" : "samples",
        fetched,
        total: revisions.length,
        pending: gaps.length,
        round: 1,
      });
      await fetchAges(Array.from(picks));
      periods = buildPeriods();
      if (versions && exactNewest(periods) >= versions) break;
    }

    // Keep up to `versions` of the newest periods with exact starts.
    const collapsed = collapseBlips(periods).periods;
    const exact = exactNewest(periods);
    const usable = collapsed.slice(collapsed.length - exact);
    const keep = versions ? usable.slice(-versions) : usable;
    const olderHistory =
      keep.length < collapsed.length || !walker.isExhausted();
    const cutoff = keep.length ? keep[0].timestamp : null;
    const shown = cutoff
      ? periods.filter((period) => period.timestamp >= cutoff)
      : [];

    return {
      lang,
      title,
      revisionCount: walker.isAnchored()
        ? revisions.length - 1
        : revisions.length,
      truncated: walker.isTruncated(),
      olderHistory,
      exhausted: walker.isExhausted(),
      rangeStart,
      rangeEnd,
      sampled,
      fetched,
      lastTimestamp: revisions[0].timestamp,
      lastRevid: revisions[0].revid,
      periods: shown,
    };
  };

  const emptyImageInfo = (name) => ({
    name,
    exists: false,
    repository: "",
    url: null,
    thumburl: null,
    thumbwidth: 0,
    thumbheight: 0,
    width: 0,
    height: 0,
    mime: "",
    descriptionurl: null,
    artist: "",
    license: "",
    attribution: "",
    dateOriginal: "",
    attributionRequired: true,
  });

  // Thumbnail URLs, sizes and credit lines for a list of filenames.
  const fetchImageInfo = async ({
    lang,
    files,
    width = 240,
    fetchJson,
    signal,
  }) => {
    const ctx = makeContext({ fetchJson, signal });
    const result = new Map();
    const unique = Array.from(new Set(files.filter(Boolean)));

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      checkAborted(ctx);
      const batch = unique.slice(i, i + BATCH_SIZE);
      const requestedTitles = batch.map((name) => `File:${name}`);
      const pagesByTitle = new Map();
      const titleMap = new Map();
      let cont = null;
      do {
        const data = await ctx.fetchJson(
          apiUrl(lang, {
            action: "query",
            titles: requestedTitles.join("|"),
            redirects: "1",
            prop: "imageinfo",
            iiprop: "url|size|mime|extmetadata",
            iiurlwidth: String(width),
            iiextmetadatafilter:
              "Artist|LicenseShortName|Credit|Attribution|AttributionRequired|DateTimeOriginal",
            ...(cont || {}),
          }),
          { signal: ctx.signal },
        );
        const query = data.query || {};
        (query.normalized || []).forEach((n) => titleMap.set(n.from, n.to));
        (query.redirects || []).forEach((r) => titleMap.set(r.from, r.to));
        (query.pages || []).forEach((page) => {
          const existing = pagesByTitle.get(page.title);
          if (!existing || (!existing.imageinfo && page.imageinfo)) {
            pagesByTitle.set(page.title, page);
          }
        });
        cont = data.continue || null;
      } while (cont);

      batch.forEach((name, j) => {
        let title = requestedTitles[j];
        for (let hops = 0; hops < 3 && titleMap.has(title); hops += 1) {
          title = titleMap.get(title);
        }
        const page = pagesByTitle.get(title);
        const info =
          page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
        if (!info) {
          result.set(name, emptyImageInfo(name));
          return;
        }
        const ext = info.extmetadata || {};
        const value = (key) => (ext[key] && ext[key].value) || "";
        result.set(name, {
          name,
          exists: true,
          repository: page.imagerepository || "",
          canonicalTitle: page.title,
          url: info.url || null,
          thumburl: info.thumburl || info.url || null,
          thumbwidth: info.thumbwidth || info.width || 0,
          thumbheight: info.thumbheight || info.height || 0,
          width: info.width || 0,
          height: info.height || 0,
          mime: info.mime || "",
          descriptionurl: info.descriptionurl || null,
          artist: stripHtml(value("Artist")),
          license: stripHtml(value("LicenseShortName")),
          attribution: stripHtml(value("Attribution")),
          credit: stripHtml(value("Credit")),
          dateOriginal: stripHtml(value("DateTimeOriginal")),
          attributionRequired: value("AttributionRequired") !== "false",
        });
      });
    }
    return result;
  };

  return {
    isValidLang,
    parseArticleInput,
    resolveArticle,
    searchTitles,
    scanArticle,
    collapseBlips,
    fetchImageInfo,
    defaultFetchJson,
  };
});
