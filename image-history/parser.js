// Finds lead image (infobox image or first file link)
// in article wikitext.

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.ImageHistoryParser = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const IMAGE_EXTENSIONS = "jpe?g|png|gif|svg|tiff?|webp|jp2|bmp|xcf|pdf|djvu";
  const RASTER_EXTENSIONS = /\.(jpe?g|png|gif|tiff?|webp|jp2|bmp)$/i;

  // Check filename characters ending in an image extension
  const FILENAME_RE = new RegExp(
    `([^|\\[\\]{}<>=\\n]*?\\.(?:${IMAGE_EXTENSIONS}))(?![\\p{L}\\p{N}.])`,
    "iu",
  );
  const FILE_LINK_RE = new RegExp(
    `\\[\\[\\s*([^\\[\\]|:]{1,40})\\s*:\\s*([^|\\[\\]{}<>\\n]*?\\.(?:${IMAGE_EXTENSIONS}))\\s*(?=\\||\\]\\])`,
    "giu",
  );

  const INCLUDE_STEMS = [
    "image",
    "img",
    "photo",
    "pic",
    "foto",
    "bild",
    "immagine",
    "imatge",
    "imagin",
    "afbeelding",
    "grafik",
    "kuva",
    "kép",
    "resim",
    "gambar",
    "portrait",
    "portret",
    "slika",
    "obráz",
    "obraz",
    "zdjęcie",
    "billede",
    "bilde",
    "изображ",
    "зображ",
    "фото",
    "снимка",
    "画像",
    "图",
    "圖",
    "사진",
    "그림",
    "صورة",
    "تصویر",
    "תמונה",
    "चित्र",
    "hình",
    "ảnh",
    "εικόνα",
    "poza",
    "imagem",
    "nuotrauka",
    "attēls",
    "pilt",
  ];
  const EXCLUDE_STEMS = [
    "signature",
    "signatur",
    "firma",
    "faksymile",
    "handtekening",
    "podpis",
    "署名",
    "подпись",
    "logo",
    "flag",
    "map",
    "karte",
    "seal",
    "emblem",
    "emblème",
    "coat",
    "escudo",
    "stemma",
    "wappen",
    "arms",
    "caption",
    "size",
    "alt",
    "upright",
    "width",
    "height",
    "scale",
    "link",
    "border",
    "class",
    "style",
    "align",
    "position",
    "skin",
    "background",
    "icon",
    "symbol",
    "badge",
    "comment",
    "légende",
    "legende",
    "legenda",
    "didascalia",
    "beschreibung",
    "beschrijving",
    "описание",
    "опис",
    "pie de",
    "tamaño",
    "taille",
    "text",
    "storlek",
    "størrelse",
    "koko",
    "aláírás",
    "méret",
    "boyut",
    "açıklama",
    "サイズ",
    "コメント",
    "説明",
    "大小",
    "说明",
    "說明",
    "크기",
    "설명",
    "تعليق",
    "حجم",
    "توضیح",
    "اندازه",
    "כיתוב",
    "גודל",
    "chú thích",
    "cỡ",
    "keterangan",
    "ukuran",
    "größe",
    "groesse",
    "bildtext",
    "grafiki",
    "unterschrift",
    "autograph",
    "autógrafo",
    "crest",
    "shield",
    "banner",
    "cover",
    "poster",
    "thumb",
    "gallery",
    "montage",
    "sound",
    "audio",
    "video",
    "orig",
    "model",
    "sig",
  ];

  const DEFAULT_FILE_NAMESPACES = ["file", "image", "media"];

  const stripMarkup = (text) =>
    text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<nowiki>[\s\S]*?<\/nowiki>/gi, "")
      .replace(/<ref[^>]*\/>/gi, "")
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");

  const decodeEntities = (text) =>
    text
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (m, code) => String.fromCodePoint(Number(code)));

  // Index just past the "}}" that closes the template opening at `start`.
  const findTemplateEnd = (text, start) => {
    let depth = 0;
    let i = start;
    while (i < text.length) {
      if (text.startsWith("{{", i)) {
        depth += 1;
        i += 2;
      } else if (text.startsWith("}}", i)) {
        depth -= 1;
        i += 2;
        if (depth === 0) return i;
      } else {
        i += 1;
      }
    }
    return -1;
  };

  const topLevelTemplates = (text) => {
    const templates = [];
    let i = 0;
    while (i < text.length) {
      if (text.startsWith("{{", i)) {
        const end = findTemplateEnd(text, i);
        if (end < 0) break;
        templates.push(text.slice(i + 2, end - 2));
        i = end;
      } else {
        i += 1;
      }
    }
    return templates;
  };

  // Split template contents on pipes when not inside nested templates or links.
  const splitParams = (inner) => {
    const parts = [];
    let depthTemplate = 0;
    let depthLink = 0;
    let current = "";
    let i = 0;
    while (i < inner.length) {
      const pair = inner.slice(i, i + 2);
      if (pair === "{{") {
        depthTemplate += 1;
        current += pair;
        i += 2;
        continue;
      }
      if (pair === "}}") {
        depthTemplate -= 1;
        current += pair;
        i += 2;
        continue;
      }
      if (pair === "[[") {
        depthLink += 1;
        current += pair;
        i += 2;
        continue;
      }
      if (pair === "]]") {
        depthLink -= 1;
        current += pair;
        i += 2;
        continue;
      }
      const ch = inner[i];
      if (ch === "|" && depthTemplate <= 0 && depthLink <= 0) {
        parts.push(current);
        current = "";
      } else {
        current += ch;
      }
      i += 1;
    }
    parts.push(current);
    return parts;
  };

  const topLevelEqualsIndex = (part) => {
    let depthTemplate = 0;
    let depthLink = 0;
    for (let i = 0; i < part.length; i += 1) {
      const pair = part.slice(i, i + 2);
      if (pair === "{{") {
        depthTemplate += 1;
        i += 1;
        continue;
      }
      if (pair === "}}") {
        depthTemplate -= 1;
        i += 1;
        continue;
      }
      if (pair === "[[") {
        depthLink += 1;
        i += 1;
        continue;
      }
      if (pair === "]]") {
        depthLink -= 1;
        i += 1;
        continue;
      }
      if (part[i] === "=" && depthTemplate <= 0 && depthLink <= 0) return i;
    }
    return -1;
  };

  const namedParams = (inner) => {
    const [, ...parts] = splitParams(inner);
    const params = [];
    for (const part of parts) {
      const eq = topLevelEqualsIndex(part);
      if (eq < 0) continue;
      const key = part
        .slice(0, eq)
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, " ");
      params.push({ key, value: part.slice(eq + 1) });
    }
    return params;
  };

  const looksLikeImageParam = (key) =>
    INCLUDE_STEMS.some((stem) => key.includes(stem)) &&
    !EXCLUDE_STEMS.some((stem) => key.includes(stem));

  const stripNamespace = (name, fileNamespaces) => {
    const colon = name.indexOf(":");
    if (colon <= 0) return name;
    const prefix = name.slice(0, colon).trim().toLowerCase();
    if (!fileNamespaces.includes(prefix)) return name;
    return name.slice(colon + 1);
  };

  const normalizeFilename = (raw, fileNamespaces = DEFAULT_FILE_NAMESPACES) => {
    let name = decodeEntities(raw).trim();
    name = stripNamespace(name, fileNamespaces);
    if (name.includes("%")) {
      try {
        name = decodeURIComponent(name);
      } catch (e) {
        /* keep as is */
      }
    }
    name = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!name) return null;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const firstFilename = (value, fileNamespaces) => {
    const match = FILENAME_RE.exec(value);
    if (!match) return null;
    const candidate = match[1].trim();
    if (/^(https?:)?\/\//i.test(candidate)) return null;
    return normalizeFilename(candidate, fileNamespaces);
  };

  // Lead image filename without namespace, or null.
  const extractLeadImage = (wikitext, options = {}) => {
    const fileNamespaces = (
      options.fileNamespaces || DEFAULT_FILE_NAMESPACES
    ).map((ns) => ns.toLowerCase());
    const text = stripMarkup(wikitext || "");

    for (const inner of topLevelTemplates(text)) {
      for (const { key, value } of namedParams(inner)) {
        if (!looksLikeImageParam(key)) continue;
        const file = firstFilename(value, fileNamespaces);
        if (file) return file;
      }
    }

    const links = [];
    FILE_LINK_RE.lastIndex = 0;
    let match;
    while ((match = FILE_LINK_RE.exec(text)) !== null) {
      if (!fileNamespaces.includes(match[1].trim().toLowerCase())) continue;
      const file = normalizeFilename(match[2], fileNamespaces);
      if (file) links.push(file);
    }
    if (links.length === 0) return null;
    return links.find((file) => RASTER_EXTENSIONS.test(file)) || links[0];
  };

  return {
    extractLeadImage,
    normalizeFilename,
    DEFAULT_FILE_NAMESPACES,
  };
});
