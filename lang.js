// RobotATC site: EN / KO switch shared by every page.
// Each page defines window.I18N = { ko: {key: text}, en: {key: text} } (en only for strings written by scripts);
// static text carries data-i18n="key" (textContent) or data-i18n-html="key" (innerHTML).
// The choice follows the reader across pages (localStorage) and can be forced with ?lang=ko|en.
(() => {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  let saved = null; try { saved = localStorage.getItem("robotatc-lang"); } catch (e) {}
  let lang = fromUrl || saved || "en"; if (lang !== "ko") lang = "en";
  if (fromUrl && fromUrl === lang) { try { localStorage.setItem("robotatc-lang", lang); } catch (e) {} }

  const dict = (l) => (window.I18N && window.I18N[l]) || {};
  function apply() {
    document.documentElement.lang = lang;
    document.body.classList.toggle("ko", lang === "ko");
    const ko = dict("ko");
    document.querySelectorAll("[data-i18n]").forEach((e) => {
      const k = e.dataset.i18n;
      if (lang === "ko" && ko[k] !== undefined) { if (e.dataset.en === undefined) e.dataset.en = e.textContent; e.textContent = ko[k]; }
      else if (e.dataset.en !== undefined) e.textContent = e.dataset.en;
    });
    document.querySelectorAll("[data-i18n-html]").forEach((e) => {
      const k = e.dataset.i18nHtml;
      if (lang === "ko" && ko[k] !== undefined) { if (e.dataset.en === undefined) e.dataset.en = e.innerHTML; e.innerHTML = ko[k]; }
      else if (e.dataset.en !== undefined) e.innerHTML = e.dataset.en;
    });
    document.querySelectorAll("[data-i18n-attr]").forEach((e) => {   // data-i18n-attr="placeholder:key" or "title:key"
      const [attr, k] = e.dataset.i18nAttr.split(":");
      const enKey = "en" + attr;
      if (lang === "ko" && ko[k] !== undefined) { if (e.dataset[enKey] === undefined) e.dataset[enKey] = e.getAttribute(attr) || ""; e.setAttribute(attr, ko[k]); }
      else if (e.dataset[enKey] !== undefined) e.setAttribute(attr, e.dataset[enKey]);
    });
    document.querySelectorAll(".lang button").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
  }

  window.LANG = {
    get: () => lang,
    tr: (k) => { const v = dict(lang)[k]; return v !== undefined ? v : (dict("en")[k] !== undefined ? dict("en")[k] : k); },
    fld: (o, k) => (lang === "ko" && o[k + "_ko"]) || o[k],
    set(l) {
      if (l !== "ko") l = "en";
      if (l === lang) return;
      lang = l; try { localStorage.setItem("robotatc-lang", lang); } catch (e) {}
      const u = new URL(location.href); u.searchParams.set("lang", lang); history.replaceState(null, "", u);
      apply(); window.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
    },
    apply,
  };
  document.addEventListener("click", (e) => { const b = e.target.closest(".lang button[data-lang]"); if (b) { e.preventDefault(); window.LANG.set(b.dataset.lang); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply();
})();
